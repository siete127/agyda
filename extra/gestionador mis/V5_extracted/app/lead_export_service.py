# -*- coding: utf-8 -*-
import csv
import json
import logging
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from app import config
from app.dashboard_service import refresh_incremental
from app.import_service import now_local
from app.sql_loader import connection_scope, q


logger = logging.getLogger(__name__)


def _is_sql_deadlock(error: Exception) -> bool:
    text = " ".join(str(part) for part in getattr(error, "args", (error,))).lower()
    return "1205" in text or "deadlock" in text


def _is_sql_timeout(error: Exception) -> bool:
    text = " ".join(str(part) for part in getattr(error, "args", (error,))).lower()
    return "hyt00" in text or "query timeout expired" in text


class BatchReconcileCancelled(RuntimeError):
    """Cancelación solicitada antes de aplicar cambios al lote."""


class LeadPreviewTimeout(RuntimeError):
    """La vista previa excedió el tiempo interactivo permitido."""


def _noop_progress(percent: int, phase: str, can_cancel: bool = True) -> None:
    return None


def _qualified_table(name: str, default_database: Optional[str] = None) -> str:
    parts = [p for p in name.replace("[", "").replace("]", "").split(".") if p]
    if len(parts) == 1:
        parts = [default_database or config.SQL_DATABASE, "dbo", parts[0]]
    elif len(parts) == 2:
        parts = [default_database or config.SQL_DATABASE, parts[0], parts[1]]
    elif len(parts) != 3:
        raise RuntimeError("Nombre de tabla no valido: " + name)
    for part in parts:
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part):
            raise RuntimeError("Identificador SQL no valido: " + part)
    return ".".join(q(part) for part in parts)


def _master_table() -> str:
    return _qualified_table(config.SQL_MASTER_TABLE, config.SQL_DATABASE)


def _call_table() -> str:
    return _qualified_table(config.SQL_CALL_REPORT_TABLE, config.SQL_DATABASE)


def _azul_table() -> str:
    return _qualified_table(config.AZUL_SNAPSHOT_TABLE, config.SQL_DATABASE)


def _batch_table() -> str:
    return q(config.SQL_DATABASE) + "." + q("dbo") + "." + q("ControlLotesVicidial")


def _detail_table() -> str:
    return q(config.SQL_DATABASE) + "." + q("dbo") + "." + q("ControlLotesVicidialDetalle")


def _cohort_table() -> str:
    return q(config.SQL_DATABASE) + "." + q("dbo") + "." + q("Vicidial_Lead_MonthlyCohort")


def _sales_table() -> str:
    return _qualified_table(config.SQL_SALES_TABLE, config.SQL_SALES_DATABASE)


def _phone_expr(expression: str) -> str:
    cleaned = "COALESCE(CONVERT(varchar(80), " + expression + "), '')"
    for old in ["' '", "'-'", "'('", "')'", "'+'", "'.'", "'/'"]:
        cleaned = "REPLACE(" + cleaned + ", " + old + ", '')"
    return "RIGHT(" + cleaned + ", 10)"


def ensure_control_tables(connection) -> None:
    sql = f"""
IF OBJECT_ID(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidial', 'U') IS NULL
BEGIN
    CREATE TABLE {_batch_table()}(
        LoteID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LoteUUID UNIQUEIDENTIFIER NOT NULL,
        NombreLote NVARCHAR(150) NOT NULL,
        CampanaDestino NVARCHAR(80) NULL,
        ListaDestino NVARCHAR(100) NULL,
        TipoExportacion VARCHAR(20) NOT NULL,
        CantidadSolicitada INT NOT NULL,
        CantidadExportada INT NOT NULL,
        EstadoLote VARCHAR(20) NOT NULL,
        FechaGeneracion DATETIME2(0) NOT NULL,
        FechaRevision DATETIME2(0) NULL,
        RegistrosMarcados INT NOT NULL CONSTRAINT DF_ControlLotes_Marcados DEFAULT 0,
        RegistrosLiberados INT NOT NULL CONSTRAINT DF_ControlLotes_Liberados DEFAULT 0,
        ArchivoCSV NVARCHAR(260) NULL,
        Observaciones NVARCHAR(500) NULL
    );
    CREATE UNIQUE INDEX UX_ControlLotesVicidial_UUID
        ON {_batch_table()}(LoteUUID);
END;

IF OBJECT_ID(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidialDetalle', 'U') IS NULL
BEGIN
    CREATE TABLE {_detail_table()}(
        DetalleID BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        LoteID BIGINT NOT NULL,
        LeadID BIGINT NULL,
        TelefonoOriginal NVARCHAR(80) NULL,
        TelefonoNormalizado VARCHAR(20) NOT NULL,
        EstadoRegistro VARCHAR(20) NOT NULL,
        FechaDescarga DATETIME2(0) NOT NULL,
        FueMarcado BIT NOT NULL CONSTRAINT DF_ControlDetalle_Marcado DEFAULT 0,
        FechaPrimeraLlamada DATETIME2(0) NULL,
        FechaUltimaLlamada DATETIME2(0) NULL,
        TotalLlamadas INT NOT NULL CONSTRAINT DF_ControlDetalle_Total DEFAULT 0,
        UltimoStatus NVARCHAR(80) NULL,
        FechaLiberacion DATETIME2(0) NULL,
        CONSTRAINT FK_ControlDetalle_Lote FOREIGN KEY(LoteID)
            REFERENCES {_batch_table()}(LoteID)
    );
    CREATE INDEX IX_ControlDetalle_TelefonoEstado
        ON {_detail_table()}(TelefonoNormalizado, EstadoRegistro);
    CREATE UNIQUE INDEX UX_ControlDetalle_LoteTelefono
        ON {_detail_table()}(LoteID, TelefonoNormalizado);
END;

IF COL_LENGTH(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidial', 'FiltrosOrigenJSON') IS NULL
    ALTER TABLE {_batch_table()} ADD FiltrosOrigenJSON NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidial', 'ReglaElegibilidadVersion') IS NULL
    ALTER TABLE {_batch_table()} ADD ReglaElegibilidadVersion VARCHAR(30) NULL;
IF COL_LENGTH(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidial', 'FechaCorteFuentes') IS NULL
    ALTER TABLE {_batch_table()} ADD FechaCorteFuentes DATETIME2(0) NULL;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name='IX_ControlDetalle_KpiTelefonoFecha'
      AND object_id=OBJECT_ID(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidialDetalle')
)
    CREATE INDEX IX_ControlDetalle_KpiTelefonoFecha
    ON {_detail_table()}(TelefonoNormalizado,FechaUltimaLlamada DESC,DetalleID DESC)
    INCLUDE(LoteID,EstadoRegistro,TotalLlamadas,UltimoStatus);

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name='IX_ControlDetalle_KpiLoteEstado'
      AND object_id=OBJECT_ID(N'{config.SQL_DATABASE}.dbo.ControlLotesVicidialDetalle')
)
    CREATE INDEX IX_ControlDetalle_KpiLoteEstado
    ON {_detail_table()}(LoteID,EstadoRegistro)
    INCLUDE(TelefonoNormalizado,FechaUltimaLlamada,TotalLlamadas,UltimoStatus);
"""
    connection.cursor().execute(sql)
    connection.commit()


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        values = value
    else:
        values = [value]
    result: List[str] = []
    for item in values:
        text = str(item or "").strip()
        if text and text not in result:
            result.append(text)
    return result


def _as_month_list(value: Any) -> List[str]:
    months = _as_list(value)
    if any(not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month) for month in months):
        raise ValueError("Los periodos deben tener formato AAAA-MM.")
    return months


def _add_in_filter(clauses: List[str], params: List[Any], column: str, values: List[str]) -> None:
    if not values:
        return
    placeholders = ",".join("?" for _ in values)
    clauses.append(f"{column} IN ({placeholders})")
    params.extend(values)


def _entry_date_expression(alias: str) -> str:
    """Usa la primera alta conocida cuando una réplica movió EntryDate."""
    return f"COALESCE({alias}.FirstSeenDate,{alias}.EntryDate)"


def _filter_expressions(alias: str) -> Dict[str, str]:
    """Expresiones normalizadas compartidas por todos los filtros."""
    return {
        "campaign_id": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.CampaignID)))",
        "list_name": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.ListName)))",
        # FirstSeenDate reconstruye el EntryDate original en filas que una
        # réplica antigua había sustituido por la fecha de última gestión.
        "management_month": (
            f"CONVERT(char(7), {_entry_date_expression(alias)}, 120)"
        ),
        # Se materializa e indexa durante la consolidación del universo para
        # evitar convertir fechas sobre millones de filas en cada consulta.
        "last_management_month": f"{alias}.UltimoMesGestion",
        "status": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.Status)))",
        "state": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.State)))",
        "city": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.City)))",
    }


def _append_selected_filters(
    clauses: List[str],
    params: List[Any],
    filters: Dict[str, Any],
    alias: str,
    exclude_field: Optional[str] = None,
) -> None:
    for filter_name, expression in _filter_expressions(alias).items():
        if filter_name in ("management_month", "list_name") or filter_name == exclude_field:
            continue
        values = (
            _as_month_list(filters.get(filter_name))
            if filter_name == "last_management_month"
            else _as_list(filters.get(filter_name))
        )
        _add_in_filter(clauses, params, expression, values)

    months = [] if exclude_field == "management_month" else _as_month_list(
        filters.get("management_month")
    )
    lists = [] if exclude_field == "list_name" else _as_list(filters.get("list_name"))
    if not months and not lists:
        return

    fallback_parts: List[str] = []
    fallback_params: List[Any] = []
    cohort_parts = [f"c.PhoneNormalized={alias}.PhoneNormalized"]
    cohort_params: List[Any] = []
    if months:
        placeholders = ",".join("?" for _ in months)
        fallback_parts.append(
            f"CONVERT(char(7), {_entry_date_expression(alias)}, 120) "
            f"IN ({placeholders})"
        )
        fallback_params.extend(months)
        cohort_parts.append(f"c.EntryMonth IN ({placeholders})")
        cohort_params.extend(months)
    if lists:
        placeholders = ",".join("?" for _ in lists)
        fallback_parts.append(
            f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.ListName))) IN ({placeholders})"
        )
        fallback_params.extend(lists)
        cohort_parts.append(
            f"LTRIM(RTRIM(CONVERT(nvarchar(250),c.ListID))) IN ({placeholders})"
        )
        cohort_params.extend(lists)

    fallback = " AND ".join(fallback_parts)
    cohort = " AND ".join(cohort_parts)
    clauses.append(
        f"(({fallback}) OR EXISTS (SELECT 1 FROM {_cohort_table()} c WHERE {cohort}))"
    )
    params.extend(fallback_params)
    params.extend(cohort_params)


def _where_filters(filters: Dict[str, Any], params: List[Any], alias: str = "m") -> str:
    """Filtra los registros originales antes de elegir uno por teléfono."""
    clauses: List[str] = []
    _append_selected_filters(clauses, params, filters, alias)
    return " AND ".join(clauses) if clauses else "1 = 1"


FILTER_COLUMNS = {
    "campaign_id": "CampaignID",
    "list_name": "ListName",
    "management_month": "__ENTRY_MONTH__",
    "last_management_month": "UltimoMesGestion",
    "status": "Status",
    "state": "State",
    "city": "City",
}


def get_filter_options(
    field: str,
    search: str = "",
    limit: int = 100,
    filters: Optional[Dict[str, Any]] = None,
) -> List[str]:
    field = str(field or "").strip().lower()
    column = FILTER_COLUMNS.get(field)
    if not column:
        raise ValueError("Filtro no válido")

    limit = max(1, min(int(limit or 100), 300))
    search = str(search or "").strip()
    filters = filters or {}
    if field in ("management_month", "list_name"):
        params_master: List[Any] = []
        master_clauses: List[str] = []
        _append_selected_filters(
            master_clauses,
            params_master,
            filters,
            "m",
            exclude_field=field,
        )
        master_value = (
            f"CONVERT(char(7),{_entry_date_expression('m')},120)"
            if field == "management_month"
            else "LTRIM(RTRIM(CONVERT(nvarchar(250),m.ListName)))"
        )

        params_cohort: List[Any] = []
        cohort_clauses: List[str] = []
        for filter_name in (
            "campaign_id",
            "last_management_month",
            "status",
            "state",
            "city",
        ):
            values = (
                _as_month_list(filters.get(filter_name))
                if filter_name == "last_management_month"
                else _as_list(filters.get(filter_name))
            )
            _add_in_filter(
                cohort_clauses,
                params_cohort,
                _filter_expressions("m")[filter_name],
                values,
            )
        if field == "management_month":
            _add_in_filter(
                cohort_clauses,
                params_cohort,
                "LTRIM(RTRIM(CONVERT(nvarchar(250),c.ListID)))",
                _as_list(filters.get("list_name")),
            )
            cohort_value = "c.EntryMonth"
        else:
            _add_in_filter(
                cohort_clauses,
                params_cohort,
                "c.EntryMonth",
                _as_month_list(filters.get("management_month")),
            )
            cohort_value = "LTRIM(RTRIM(CONVERT(nvarchar(250),c.ListID)))"

        master_where = " AND ".join(master_clauses) if master_clauses else "1=1"
        cohort_where = " AND ".join(cohort_clauses) if cohort_clauses else "1=1"
        outer_search = ""
        outer_params: List[Any] = []
        if search:
            outer_search = " AND Valor LIKE ?"
            outer_params.append("%" + search + "%")
        order = (
            "Valor DESC"
            if field in ("management_month", "last_management_month")
            else "Valor"
        )
        sql = f"""
SELECT TOP ({limit}) Valor
FROM (
    SELECT DISTINCT {master_value} AS Valor
    FROM {_master_table()} m
    WHERE {master_where}
    UNION
    SELECT DISTINCT {cohort_value} AS Valor
    FROM {_cohort_table()} c
    INNER JOIN {_master_table()} m
      ON m.PhoneNormalized=c.PhoneNormalized
    WHERE {cohort_where}
) options
WHERE NULLIF(Valor,'') IS NOT NULL
  {outer_search}
ORDER BY {order}
"""
        with connection_scope() as connection:
            rows = connection.cursor().execute(
                sql,
                params_master + params_cohort + outer_params,
            ).fetchall()
        return [str(row[0]) for row in rows if row[0] is not None]

    params: List[Any] = []
    clauses: List[str] = []

    value_expr = _filter_expressions("m")[field]
    clauses.append(f"NULLIF({value_expr}, '') IS NOT NULL")

    # Los catálogos en cascada solo muestran combinaciones compatibles de
    # campaña, lista y mes; se excluye únicamente el campo consultado.
    _append_selected_filters(clauses, params, filters, "m", exclude_field=field)

    if search:
        clauses.append(f"{value_expr} LIKE ?")
        params.append("%" + search + "%")

    where = " AND ".join(clauses)
    order = (
        "Valor DESC"
        if field in ("management_month", "last_management_month")
        else "Valor"
    )
    sql = f"""
SELECT TOP ({limit}) Valor
FROM (
    SELECT DISTINCT {value_expr} AS Valor
    FROM {_master_table()} m
    WHERE {where}
) x
ORDER BY {order}
"""
    with connection_scope() as connection:
        rows = connection.cursor().execute(sql, params).fetchall()
    return [str(row[0]) for row in rows if row[0] is not None]


def _candidate_cte(
    mode: str,
    source_where: str,
    effective_status_filter: str = "",
    include_pending_recycle: bool = False,
) -> str:
    master = _master_table()
    detail = _detail_table()
    sales = _sales_table()
    phone = _phone_expr("m.PhoneNormalized")
    phone_fallback = _phone_expr("m.PhoneNumber")
    sale_phone = _phone_expr("v.telefonoCliente")
    normalized = "CASE WHEN LEN(" + phone + ")=10 THEN " + phone + " ELSE " + phone_fallback + " END"
    eligibility = """
      AND p.TienePendiente = 0
      AND p.TieneMarcado = 0
"""
    if mode.upper() == "RECICLAJE":
        pending_filter = "" if include_pending_recycle else "AND p.TienePendiente = 0"
        eligibility = """
      {pending_filter}
      AND p.ExcluidoVentaDNC = 0
""".format(pending_filter=pending_filter)
    return f"""
WITH ApprovedSales AS (
    SELECT DISTINCT {sale_phone} AS TelefonoNormalizado
    FROM {sales} v WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'APROB%'
), ControlRanked AS (
    SELECT
        d.TelefonoNormalizado,
        d.UltimoStatus,
        d.FechaUltimaLlamada,
        MAX(CASE WHEN d.EstadoRegistro='PENDIENTE' THEN 1 ELSE 0 END)
            OVER (PARTITION BY d.TelefonoNormalizado) AS TienePendiente,
        MAX(CASE WHEN d.EstadoRegistro='MARCADO' THEN 1 ELSE 0 END)
            OVER (PARTITION BY d.TelefonoNormalizado) AS TieneMarcado,
        ROW_NUMBER() OVER (
            PARTITION BY d.TelefonoNormalizado
            ORDER BY
                CASE WHEN NULLIF(LTRIM(RTRIM(d.UltimoStatus)),'') IS NULL THEN 1 ELSE 0 END,
                d.FechaUltimaLlamada DESC,
                d.DetalleID DESC
        ) AS rn
    FROM {detail} d WITH (NOLOCK)
), ControlActual AS (
    SELECT TelefonoNormalizado,UltimoStatus,FechaUltimaLlamada,
           TienePendiente,TieneMarcado
    FROM ControlRanked
    WHERE rn=1
), FiltradaBase AS (
    SELECT
        m.*,
        {normalized} AS TelefonoNormalizado,
        (
            CASE WHEN ISNULL(m.CalledCount,0)=0 THEN 50 ELSE 0 END +
            CASE WHEN NULLIF(LTRIM(RTRIM(m.FirstName)),'') IS NOT NULL THEN 10 ELSE 0 END +
            CASE WHEN NULLIF(LTRIM(RTRIM(m.LastName)),'') IS NOT NULL THEN 10 ELSE 0 END +
            CASE WHEN NULLIF(LTRIM(RTRIM(m.Email)),'') IS NOT NULL THEN 5 ELSE 0 END +
            CASE WHEN NULLIF(LTRIM(RTRIM(m.City)),'') IS NOT NULL THEN 5 ELSE 0 END +
            CASE WHEN NULLIF(LTRIM(RTRIM(m.State)),'') IS NOT NULL THEN 5 ELSE 0 END +
            CASE WHEN NULLIF(LTRIM(RTRIM(m.PostalCode)),'') IS NOT NULL THEN 5 ELSE 0 END
        ) AS CalidadScore
    FROM {master} m
    WHERE {source_where}
), Filtrada AS (
    SELECT
        b.*,
        COALESCE(NULLIF(LTRIM(RTRIM(c.UltimoStatus)),''),
                 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),b.Status))),''),
                 'SIN STATUS') AS StatusEfectivo,
        COALESCE(c.FechaUltimaLlamada,b.LastInteractionDate,b.LastLocalCallTime,b.ModifyDate,b.EntryDate)
            AS FechaStatusEfectivo,
        ISNULL(c.TienePendiente,0) AS TienePendiente,
        ISNULL(c.TieneMarcado,0) AS TieneMarcado,
        CASE
            WHEN s.TelefonoNormalizado IS NOT NULL
              OR UPPER(COALESCE(NULLIF(LTRIM(RTRIM(c.UltimoStatus)),''),
                                NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),b.Status))),''),
                                '')) LIKE 'DNC%'
              OR UPPER(COALESCE(NULLIF(LTRIM(RTRIM(c.UltimoStatus)),''),
                                NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),b.Status))),''),
                                '')) IN ('VE','EVE','EVESA','SALE','VENTA')
              OR UPPER(COALESCE(NULLIF(LTRIM(RTRIM(c.UltimoStatus)),''),
                                NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),b.Status))),''),
                                '')) LIKE 'VESA%'
              OR (
                  NULLIF(LTRIM(RTRIM(c.UltimoStatus)),'') IS NULL
                  AND (
                      UPPER(COALESCE(CONVERT(nvarchar(500),b.StatusDetalle),'')) LIKE '%VENTA EXITOSA%'
                      OR UPPER(COALESCE(CONVERT(nvarchar(500),b.StatusDetalle),'')) LIKE '%APROBAD%'
                      OR UPPER(COALESCE(CONVERT(nvarchar(500),b.StatusDetalle),'')) LIKE '%DO NOT CALL%'
                      OR UPPER(COALESCE(CONVERT(nvarchar(500),b.StatusDetalle),'')) LIKE '%NO LLAMAR%'
                      OR UPPER(COALESCE(CONVERT(nvarchar(500),b.StatusDetalle),'')) LIKE '%DNC%'
                  )
              )
            THEN 1 ELSE 0
        END AS ExcluidoVentaDNC
    FROM FiltradaBase b
    LEFT JOIN ControlActual c
      ON c.TelefonoNormalizado=b.TelefonoNormalizado
    LEFT JOIN ApprovedSales s
      ON s.TelefonoNormalizado=b.TelefonoNormalizado
), FiltradaStatus AS (
    SELECT * FROM Filtrada p
    WHERE 1=1
      {effective_status_filter}
), Pool AS (
    SELECT * FROM FiltradaStatus p
    WHERE p.TelefonoNormalizado <> ''
      AND LEN(p.TelefonoNormalizado) = 10
      AND p.TelefonoNormalizado NOT LIKE '%[^0-9]%'
    {eligibility}
)
"""


def _candidate_query(
    mode: str,
    filters: Dict[str, Any],
    params: List[Any],
) -> str:
    normalized_mode = str(mode or "NUEVOS").upper()
    include_pending_recycle = bool(
        filters.get("include_pending_recycle", False)
    )
    source_filters = dict(filters or {})
    source_batch_ids: List[int] = []
    for raw_batch_id in _as_list(source_filters.pop("source_batch_ids", None)):
        try:
            batch_id = int(raw_batch_id)
        except (TypeError, ValueError):
            raise ValueError("El lote de origen seleccionado no es válido.")
        if batch_id > 0 and batch_id not in source_batch_ids:
            source_batch_ids.append(batch_id)
    source_batch_ids = source_batch_ids[:20]
    source_batch_policy = str(
        source_filters.pop("source_batch_policy", "POLITICA") or "POLITICA"
    ).strip().upper()
    if source_batch_policy not in {"LIBERADOS", "POLITICA"}:
        raise ValueError("La política del lote de origen no es válida.")
    effective_status_filter = ""
    if normalized_mode == "RECICLAJE":
        selected_statuses = _as_list(source_filters.pop("status", None))
        if selected_statuses:
            placeholders = ",".join("?" for _ in selected_statuses)
            effective_status_filter = (
                "AND LTRIM(RTRIM(CONVERT(nvarchar(250),p.StatusEfectivo))) "
                f"IN ({placeholders})"
            )
    else:
        selected_statuses = []

    source_where = _where_filters(source_filters, params, "m")
    if source_batch_ids:
        placeholders = ",".join("?" for _ in source_batch_ids)
        released_only = (
            "AND src.EstadoRegistro='LIBERADO'"
            if source_batch_policy == "LIBERADOS"
            else ""
        )
        source_where += (
            f" AND EXISTS (SELECT 1 FROM {_detail_table()} src WITH (NOLOCK) "
            f"WHERE src.TelefonoNormalizado=m.PhoneNormalized "
            f"AND src.LoteID IN ({placeholders}) {released_only})"
        )
        params.extend(source_batch_ids)
    params.extend(selected_statuses)
    return _candidate_cte(
        normalized_mode,
        source_where,
        effective_status_filter,
        include_pending_recycle=include_pending_recycle,
    )


def _preview_eligibility_predicate(
    mode: str,
    include_pending_recycle: bool,
    alias: str = "p",
) -> str:
    valid_phone = (
        f"{alias}.TelefonoNormalizado<>'' "
        f"AND LEN({alias}.TelefonoNormalizado)=10 "
        f"AND {alias}.TelefonoNormalizado NOT LIKE '%[^0-9]%'"
    )
    if str(mode or "").upper() == "RECICLAJE":
        pending = "" if include_pending_recycle else f" AND {alias}.TienePendiente=0"
        return (
            f"{valid_phone}{pending} "
            f"AND {alias}.ExcluidoVentaDNC=0"
        )
    return (
        f"{valid_phone} "
        f"AND {alias}.TienePendiente=0 "
        f"AND {alias}.TieneMarcado=0"
    )


def preview_candidates(filters: Dict[str, Any]) -> Dict[str, Any]:
    preview_started = time.monotonic()
    mode = str(filters.get("mode") or "NUEVOS").upper()
    selected_months = _as_list(filters.get("management_month"))
    selected_lists = _as_list(filters.get("list_name"))
    include_pending_recycle = bool(
        filters.get("include_pending_recycle", False)
    ) and mode == "RECICLAJE"
    params: List[Any] = []
    cte = _candidate_query(mode, filters, params)
    eligibility = _preview_eligibility_predicate(
        mode,
        include_pending_recycle,
    )
    materialize_sql = (
        """
IF OBJECT_ID('tempdb..#CandidateAudit') IS NOT NULL DROP TABLE #CandidateAudit;
"""
        + cte
        + """
SELECT
    LeadID,TelefonoNormalizado,FirstName,LastName,City,State,
    CampaignID,ListName,Status,CalledCount,CalidadScore,EntryDate,
    StatusEfectivo,FechaStatusEfectivo,TienePendiente,TieneMarcado,
    ExcluidoVentaDNC
INTO #CandidateAudit
FROM FiltradaStatus
OPTION (RECOMPILE);
"""
    )
    aggregate_sql = f"""
WITH Evaluated AS (
    SELECT
        p.*,
        CASE WHEN p.TelefonoNormalizado<>''
                   AND LEN(p.TelefonoNormalizado)=10
                   AND p.TelefonoNormalizado NOT LIKE '%[^0-9]%'
             THEN 1 ELSE 0 END AS TelefonoValido,
        CASE WHEN {eligibility} THEN 1 ELSE 0 END AS Elegible
    FROM #CandidateAudit p
)
SELECT
    SUM(CASE WHEN Elegible=1 THEN CONVERT(bigint,1) ELSE 0 END) Total,
    SUM(CASE WHEN Elegible=1 AND ISNULL(CalledCount,0)=0
             THEN CONVERT(bigint,1) ELSE 0 END) NuncaMarcados,
    AVG(CASE WHEN Elegible=1 THEN CONVERT(float,CalidadScore) END)
        PromedioCalidad,
    COUNT(DISTINCT CASE WHEN Elegible=1 THEN NULLIF(State,'') END) Estados,
    COUNT(DISTINCT CASE WHEN Elegible=1 THEN NULLIF(City,'') END) Ciudades,
    COUNT_BIG(*) TotalFiltrado,
    SUM(CASE WHEN TelefonoValido=1
             THEN CONVERT(bigint,TienePendiente) ELSE 0 END)
        PendientesValidos,
    SUM(CASE WHEN TelefonoValido=1
             THEN CONVERT(bigint,ExcluidoVentaDNC) ELSE 0 END)
        VentasDNCValidos,
    SUM(CASE WHEN TelefonoValido=1
                  AND TienePendiente=1 AND ExcluidoVentaDNC=1
             THEN CONVERT(bigint,1) ELSE 0 END)
        PendientesVentaDNC,
    SUM(CASE WHEN TelefonoValido=0 THEN CONVERT(bigint,1) ELSE 0 END)
        ExcluidosTelefonoInvalido,
    SUM(CONVERT(bigint,TienePendiente)) PendientesDetectados,
    (
        SELECT TOP (100)
            p.LeadID AS lead_id,
            p.TelefonoNormalizado AS phone,
            LTRIM(RTRIM(CONCAT(COALESCE(p.FirstName,''),' ',
                              COALESCE(p.LastName,'')))) AS name,
            p.City AS city,
            p.State AS state,
            p.CampaignID AS campaign,
            p.ListName AS list_name,
            CASE WHEN ?='RECICLAJE'
                 THEN p.StatusEfectivo
                 ELSE CONVERT(nvarchar(80),p.Status) END AS status,
            ISNULL(p.CalledCount,0) AS called_count,
            ISNULL(p.CalidadScore,0) AS quality,
            CONVERT(varchar(19),p.EntryDate,120) AS entry_date,
            CONVERT(char(7),p.EntryDate,120) AS management_month,
            p.StatusEfectivo AS effective_status,
            CONVERT(varchar(19),p.FechaStatusEfectivo,120)
                AS effective_status_date
        FROM #CandidateAudit p
        WHERE {eligibility}
        ORDER BY p.CalidadScore DESC,ISNULL(p.CalledCount,0),
                 p.EntryDate,p.LeadID
        FOR JSON PATH
    ) SampleJson
FROM Evaluated
"""
    try:
        with connection_scope() as connection:
            # Mantiene un límite interactivo sin repetir el recorrido de 3.7 M
            # de teléfonos para el resumen y la muestra.
            connection.timeout = 90
            ensure_control_tables(connection)
            cursor = connection.cursor()
            cursor.execute(
                materialize_sql + aggregate_sql,
                params + [mode],
            )
            while cursor.description is None:
                if not cursor.nextset():
                    raise RuntimeError(
                        "No se recibió el resumen de la vista previa."
                    )
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError(
                    "No se recibió el resumen de la vista previa."
                )
            sample = json.loads(str(row[11] or "[]"))
    except Exception as exc:
        if _is_sql_timeout(exc):
            logger.warning(
                "lead_preview_timeout mode=%s has_campaign=%s has_list=%s "
                "has_month=%s elapsed_ms=%s",
                mode,
                bool(_as_list(filters.get("campaign_id"))),
                bool(selected_lists),
                bool(selected_months),
                round((time.monotonic() - preview_started) * 1000),
            )
            raise LeadPreviewTimeout(
                "La vista previa excedió el tiempo de consulta. "
                "Selecciona al menos una campaña, lista o mes de EntryDate "
                "y vuelve a intentarlo."
            ) from exc
        raise
    result = {
        "available": int(row[0] or 0),
        "never_called": int(row[1] or 0),
        "average_quality": round(float(row[2] or 0), 1),
        "states": int(row[3] or 0),
        "cities": int(row[4] or 0),
        "filtered_total": int(row[5] or 0),
        "pending_detected": int(row[10] or 0),
        "excluded_pending": 0
        if include_pending_recycle
        else int(row[10] or 0),
        "included_pending": (
            int(row[6] or 0) - int(row[8] or 0)
            if include_pending_recycle
            else 0
        ),
        "excluded_sales_dnc": (
            int(row[7] or 0)
            if include_pending_recycle
            else int(row[7] or 0) - int(row[8] or 0)
        ),
        "excluded_invalid_phone": int(row[9] or 0),
        "include_pending_recycle": include_pending_recycle,
        "recycle_rule": (
            "EXCLUIR_VENTAS_DNC_INCLUIR_PENDIENTES"
            if mode == "RECICLAJE" and include_pending_recycle
            else "EXCLUIR_VENTAS_DNC_Y_PENDIENTES"
            if mode == "RECICLAJE"
            else "NUEVOS_DISPONIBLES"
        ),
        "items": [
            {
                "lead_id": int(item["lead_id"])
                if item.get("lead_id") is not None else None,
                "phone": str(item.get("phone") or ""),
                "name": str(item.get("name") or "").strip(),
                "city": str(item.get("city") or ""),
                "state": str(item.get("state") or ""),
                "campaign": str(item.get("campaign") or ""),
                "list_name": (
                    selected_lists[0]
                    if len(selected_lists) == 1
                    else str(item.get("list_name") or "")
                ),
                "status": str(item.get("status") or ""),
                "called_count": int(item.get("called_count") or 0),
                "quality": int(item.get("quality") or 0),
                "entry_date": str(item.get("entry_date") or ""),
                "management_month": (
                    selected_months[0]
                    if len(selected_months) == 1
                    else str(item.get("management_month") or "")
                ),
                "effective_status": str(item.get("effective_status") or ""),
                "effective_status_date": str(
                    item.get("effective_status_date") or ""
                ),
            } for item in sample
        ],
    }
    logger.info(
        "lead_preview_completed mode=%s available=%s filtered=%s items=%s "
        "elapsed_ms=%s",
        mode,
        result["available"],
        result["filtered_total"],
        len(result["items"]),
        round((time.monotonic() - preview_started) * 1000),
    )
    return result


EXPORT_COLUMNS: List[Tuple[str, str]] = [
    ("vendor_lead_code", "VendorLeadCode"),
    ("source_id", "SourceID"),
    ("list_id", "ListID"),
    ("phone_code", "PhoneCode"),
    ("phone_number", "PhoneNumber"),
    ("title", "Title"),
    ("first_name", "FirstName"),
    ("middle_initial", "MiddleInitial"),
    ("last_name", "LastName"),
    ("address1", "Address1"),
    ("address2", "Address2"),
    ("address3", "Address3"),
    ("city", "City"),
    ("state", "State"),
    ("province", "Province"),
    ("postal_code", "PostalCode"),
    ("country_code", "CountryCode"),
    ("gender", "Gender"),
    ("date_of_birth", "DateOfBirth"),
    ("alt_phone", "AltPhone"),
    ("email", "Email"),
    ("security_phrase", "SecurityPhrase"),
    ("comments", "Comments"),
]


def _resolve_batch_export_name(
    batch_name: Any,
    destination_list: Any,
    generated_at: datetime,
) -> Tuple[str, str]:
    """Define el nombre visible y el archivo sin permitir sobrescrituras."""
    destination = str(destination_list or "").strip()
    requested_name = str(batch_name or "").strip()
    visible_name = (
        destination
        or requested_name
        or ("LOTE_" + generated_at.strftime("%Y%m%d_%H%M%S"))
    )
    if len(destination) > 100:
        raise ValueError("Lista destino admite un máximo de 100 caracteres.")
    if len(visible_name) > 150:
        raise ValueError("El nombre del lote admite un máximo de 150 caracteres.")

    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", visible_name).strip("_") or "LOTE"
    file_name = (
        safe_name
        + "_"
        + generated_at.strftime("%Y%m%d_%H%M%S")
        + ".csv"
    )
    return visible_name, file_name


def generate_batch(filters: Dict[str, Any]) -> Dict[str, Any]:
    quantity = max(1, min(int(filters.get("quantity") or 5000), 50000))
    mode = str(filters.get("mode") or "NUEVOS").upper()
    include_pending_recycle = bool(
        filters.get("include_pending_recycle", False)
    ) and mode == "RECICLAJE"
    campaign = str(filters.get("destination_campaign") or "").strip()
    destination_list = str(filters.get("destination_list") or "").strip()
    file_timestamp = now_local().replace(tzinfo=None)
    name, file_name = _resolve_batch_export_name(
        filters.get("batch_name"),
        destination_list,
        file_timestamp,
    )
    source_batch_ids = [
        int(value)
        for value in _as_list(filters.get("source_batch_ids"))
        if str(value).isdigit() and int(value) > 0
    ][:20]
    source_batch_policy = str(
        filters.get("source_batch_policy") or "POLITICA"
    ).strip().upper()
    params: List[Any] = []
    cte = _candidate_query(mode, filters, params)
    select_columns = ["LeadID", "TelefonoNormalizado", "PhoneNumber"] + [source for _, source in EXPORT_COLUMNS]
    select_sql = cte + f"SELECT TOP ({quantity}) " + ",".join(q(c) for c in select_columns) + " FROM Pool ORDER BY CalidadScore DESC, ISNULL(CalledCount,0), EntryDate, LeadID"

    export_dir = config.DOWNLOAD_DIR / "lotes_vicidial"
    export_dir.mkdir(parents=True, exist_ok=True)
    batch_uuid = str(uuid.uuid4())
    file_path = export_dir / file_name

    with connection_scope() as connection:
        ensure_control_tables(connection)
        cursor = connection.cursor()
        # Bloqueo transaccional: evita que dos generaciones simultáneas reusen teléfonos.
        cursor.execute("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        rows = cursor.execute(select_sql, params).fetchall()
        if not rows:
            raise RuntimeError("No hay registros disponibles con los filtros seleccionados.")

        selected_phones = [str(r[1] or "") for r in rows]
        already_blocked = set()

        # SQL Server admite como máximo 2,100 parámetros por sentencia.
        # Cuando se generan lotes grandes (por ejemplo 25,000 registros),
        # consultar todos los teléfonos en un solo IN (...) provoca el error
        # ODBC 07002. Se consulta en bloques seguros y se acumulan resultados.
        blocked_states = (
            None
            if include_pending_recycle
            else "'PENDIENTE'"
            if mode == "RECICLAJE"
            else "'PENDIENTE','MARCADO'"
        )
        chunk_size = 1000
        if blocked_states:
            for start in range(0, len(selected_phones), chunk_size):
                phone_chunk = selected_phones[start:start + chunk_size]
                placeholders = ",".join("?" for _ in phone_chunk)
                blocked_rows = cursor.execute(
                    f"SELECT DISTINCT TelefonoNormalizado FROM {_detail_table()} "
                    f"WHERE EstadoRegistro IN ({blocked_states}) "
                    f"AND TelefonoNormalizado IN ({placeholders})",
                    *phone_chunk,
                ).fetchall()
                already_blocked.update(str(r[0]) for r in blocked_rows)
        if already_blocked:
            rows = [r for r in rows if str(r[1] or "") not in already_blocked]
        if not rows:
            raise RuntimeError("Los registros seleccionados ya quedaron bloqueados por otro lote. Actualiza la vista previa e intenta nuevamente.")
        now = now_local().replace(tzinfo=None)
        cursor.execute(
            f"""INSERT INTO {_batch_table()}
            (LoteUUID,NombreLote,CampanaDestino,ListaDestino,TipoExportacion,
             CantidadSolicitada,CantidadExportada,EstadoLote,FechaGeneracion,
             ArchivoCSV,FiltrosOrigenJSON,ReglaElegibilidadVersion,FechaCorteFuentes)
            OUTPUT INSERTED.LoteID
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            batch_uuid, name, campaign or None, destination_list or None, mode,
            quantity, len(rows), "GENERADO", now, file_path.name,
            json.dumps(
                {
                    "campaign_id": _as_list(filters.get("campaign_id")),
                    "list_name": _as_list(filters.get("list_name")),
                    "management_month": _as_list(filters.get("management_month")),
                    "last_management_month": _as_list(
                        filters.get("last_management_month")
                    ),
                    "status": _as_list(filters.get("status")),
                    "state": _as_list(filters.get("state")),
                    "city": _as_list(filters.get("city")),
                    "source_batch_ids": source_batch_ids,
                    "source_batch_policy": source_batch_policy,
                },
                ensure_ascii=False,
                separators=(",", ":"),
            ),
            "RECICLAJE_V2",
            now,
        )
        lote_id = int(cursor.fetchone()[0])
        detail_rows = [(lote_id, int(r[0]) if r[0] is not None else None, str(r[2] or ""), str(r[1]), "PENDIENTE", now) for r in rows]
        cursor.fast_executemany = True
        cursor.executemany(
            f"INSERT INTO {_detail_table()} (LoteID,LeadID,TelefonoOriginal,TelefonoNormalizado,EstadoRegistro,FechaDescarga) VALUES (?,?,?,?,?,?)",
            detail_rows,
        )
        connection.commit()

    with file_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.writer(handle)
        writer.writerow([header for header, _ in EXPORT_COLUMNS])
        # rows: LeadID, normalizado, PhoneNumber, then export source fields
        for row in rows:
            values = list(row[3:])
            # Forzar teléfono a 10 dígitos normalizados en la columna phone_number.
            phone_index = [h for h, _ in EXPORT_COLUMNS].index("phone_number")
            values[phone_index] = row[1]
            writer.writerow(["" if value is None else value for value in values])

    logger.info(
        "lead_batch_generated batch_id=%s name=%s file=%s exported=%s naming_source=%s",
        lote_id,
        name,
        file_path.name,
        len(rows),
        "destination_list" if destination_list else "legacy",
    )
    return {
        "batch_id": lote_id,
        "batch_uuid": batch_uuid,
        "name": name,
        "exported": len(rows),
        "file": file_path.name,
        "download_url": "/api/lead-batches/%s/download" % lote_id,
        "blocked_for_future_batches": len(rows),
        "duplicate_control": (
            "PENDIENTES_PERMITIDOS_POR_EXCEPCION"
            if include_pending_recycle
            else "SOLO_PENDIENTES"
            if mode == "RECICLAJE"
            else "PENDIENTE_MARCADO"
        ),
        "included_pending_recycle": include_pending_recycle,
        "source_batch_ids": source_batch_ids,
        "source_batch_policy": source_batch_policy,
    }


def list_batches(limit: int = 50) -> List[Dict[str, Any]]:
    limit = max(1, min(limit, 200))
    with connection_scope() as connection:
        ensure_control_tables(connection)
        rows = connection.cursor().execute(
            f"""SELECT TOP ({limit}) LoteID,NombreLote,CampanaDestino,ListaDestino,TipoExportacion,
            CantidadExportada,EstadoLote,FechaGeneracion,FechaRevision,RegistrosMarcados,
            RegistrosLiberados,ArchivoCSV
            FROM {_batch_table()} ORDER BY LoteID DESC"""
        ).fetchall()
    result = []
    for r in rows:
        result.append({
            "batch_id": int(r[0]), "name": str(r[1]), "campaign": str(r[2] or ""),
            "destination_list": str(r[3] or ""), "mode": str(r[4]), "exported": int(r[5] or 0),
            "status": str(r[6]), "generated_at": r[7].strftime("%Y-%m-%d %H:%M:%S") if r[7] else "",
            "reviewed_at": r[8].strftime("%Y-%m-%d %H:%M:%S") if r[8] else "",
            "marked": int(r[9] or 0), "released": int(r[10] or 0), "file": str(r[11] or ""),
        })
    return result


def get_batch_file(batch_id: int) -> Path:
    with connection_scope() as connection:
        ensure_control_tables(connection)
        row = connection.cursor().execute(
            f"SELECT ArchivoCSV FROM {_batch_table()} WHERE LoteID=?", batch_id
        ).fetchone()
    if not row or not row[0]:
        raise FileNotFoundError("No se encontro el archivo del lote.")
    path = config.DOWNLOAD_DIR / "lotes_vicidial" / str(row[0])
    if not path.exists():
        raise FileNotFoundError("El archivo CSV ya no existe en el servidor.")
    return path


def reconcile_and_release(
    batch_id: int,
    refresh_task: Callable[[], Dict[str, Any]] = refresh_incremental,
    progress_callback: Optional[Callable[[int, str, bool], None]] = None,
    cancel_checker: Optional[Callable[[], bool]] = None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    progress = progress_callback or _noop_progress

    def check_cancel() -> None:
        if cancel_checker and cancel_checker():
            raise BatchReconcileCancelled(
                "La revisión fue detenida antes de modificar el lote."
            )

    progress(5, "Validando el lote", True)
    with connection_scope() as validation_connection:
        ensure_control_tables(validation_connection)
        validation = validation_connection.cursor().execute(
            f"SELECT EstadoLote FROM {_batch_table()} WHERE LoteID=?", batch_id
        ).fetchone()
        if not validation:
            raise RuntimeError("El lote no existe.")
        if str(validation[0]) in ("ANULADO", "PARCIAL", "TRABAJADO"):
            raise RuntimeError("Este lote ya fue revisado. Estado actual: " + str(validation[0]))

    check_cancel()
    progress(10, "Preparando fuentes de llamadas", True)
    # En la aplicación web esta tarea es inmediata: AzulCC se consulta
    # directamente más abajo y el reporte anterior se usa desde su tabla local.
    # Se conserva el callback por compatibilidad con ejecuciones manuales.
    refresh_result = refresh_task()
    call_phone = _phone_expr("COALESCE(NULLIF(cr.phone_number,''), cr.phone_number_dialed)")
    call_dt = "COALESCE(TRY_CONVERT(datetime2(0),cr.call_date,120),TRY_CONVERT(datetime2(0),cr.call_date,121),TRY_CONVERT(datetime2(0),cr.call_date))"
    azul_phone = _phone_expr("az.phone_number")
    azul_dt = "TRY_CONVERT(datetime2(0),CASE WHEN az.last_local_call_time>DATEADD(hour,2,az.fecha_replica) THEN az.fecha_replica ELSE az.last_local_call_time END)"

    with connection_scope() as connection:
        connection.timeout = 180
        ensure_control_tables(connection)
        cursor = connection.cursor()
        cursor.execute("SET NOCOUNT ON; SET XACT_ABORT ON; SET LOCK_TIMEOUT 20000;")
        batch = cursor.execute(
            f"SELECT FechaGeneracion,EstadoLote FROM {_batch_table()} WHERE LoteID=?", batch_id
        ).fetchone()
        if not batch:
            raise RuntimeError("El lote no existe.")
        if str(batch[1]) in ("ANULADO", "PARCIAL", "TRABAJADO"):
            raise RuntimeError("Este lote ya fue revisado. Estado actual: " + str(batch[1]))

        progress(18, "Preparando teléfonos del lote", True)
        # Las tablas temporales se crean en un lote sin parámetros para que
        # pyodbc no las limite al alcance interno de sp_prepexec.
        cursor.execute(
            """
IF OBJECT_ID('tempdb..#BatchPhones') IS NOT NULL DROP TABLE #BatchPhones;
IF OBJECT_ID('tempdb..#CallMatches') IS NOT NULL DROP TABLE #CallMatches;
IF OBJECT_ID('tempdb..#CallSummary') IS NOT NULL DROP TABLE #CallSummary;

CREATE TABLE #BatchPhones(
    DetalleID BIGINT NOT NULL PRIMARY KEY,
    TelefonoNormalizado VARCHAR(20) NOT NULL,
    FechaGeneracion DATETIME2(0) NOT NULL
);

CREATE TABLE #CallMatches(
    DetalleID BIGINT NOT NULL,
    FechaLlamada DATETIME2(0) NOT NULL,
    StatusLlamada NVARCHAR(80) NULL,
    Orden BIGINT NOT NULL,
    Fuente TINYINT NOT NULL
);
"""
        )
        cursor.execute(
            f"""
INSERT INTO #BatchPhones(DetalleID,TelefonoNormalizado,FechaGeneracion)
SELECT d.DetalleID,d.TelefonoNormalizado,b.FechaGeneracion
FROM {_detail_table()} d WITH (NOLOCK)
INNER JOIN {_batch_table()} b WITH (NOLOCK) ON b.LoteID=d.LoteID
WHERE d.LoteID=? AND d.EstadoRegistro='PENDIENTE';
CREATE INDEX IX_BatchPhones_Phone ON #BatchPhones(TelefonoNormalizado);
""",
            batch_id,
        )
        pending_count = int(
            cursor.execute("SELECT COUNT_BIG(*) FROM #BatchPhones").fetchval() or 0
        )
        connection.commit()
        if not pending_count:
            raise RuntimeError("El lote no tiene teléfonos pendientes por revisar.")

        check_cancel()
        progress(30, "Revisando el reporte Vicidial disponible", True)
        cursor.execute(
            f"""
INSERT INTO #CallMatches(DetalleID,FechaLlamada,StatusLlamada,Orden,Fuente)
SELECT p.DetalleID,{call_dt},CONVERT(nvarchar(80),cr.status),
       COALESCE(TRY_CONVERT(bigint,cr.ImportID),0),1
FROM #BatchPhones p
INNER JOIN {_call_table()} cr WITH (NOLOCK)
    ON {call_phone}=p.TelefonoNormalizado
   AND {call_dt}>=p.FechaGeneracion
WHERE {call_dt}>=DATEADD(day,-{int(config.AZUL_LOOKBACK_DAYS)},SYSDATETIME());
"""
        )
        report_marked = int(
            cursor.execute(
                "SELECT COUNT_BIG(DISTINCT DetalleID) FROM #CallMatches WHERE Fuente=1"
            ).fetchval()
            or 0
        )
        connection.commit()

        check_cancel()
        progress(55, "Consultando llamadas recientes en AzulCC SQL", True)
        cursor.execute(
            f"""
INSERT INTO #CallMatches(DetalleID,FechaLlamada,StatusLlamada,Orden,Fuente)
SELECT p.DetalleID,{azul_dt},CONVERT(nvarchar(80),az.status),
       COALESCE(TRY_CONVERT(bigint,az.lead_id),0),2
FROM #BatchPhones p
INNER JOIN {_azul_table()} az WITH (NOLOCK)
    ON {azul_phone}=p.TelefonoNormalizado
   AND {azul_dt}>=p.FechaGeneracion
WHERE {azul_dt}>=DATEADD(day,-{int(config.AZUL_LOOKBACK_DAYS)},SYSDATETIME())
  AND (ISNULL(TRY_CONVERT(int,az.called_count),0)>0 OR az.last_local_call_time IS NOT NULL);
"""
        )
        azul_marked = int(
            cursor.execute(
                "SELECT COUNT_BIG(DISTINCT DetalleID) FROM #CallMatches WHERE Fuente=2"
            ).fetchval()
            or 0
        )
        connection.commit()

        check_cancel()
        progress(72, "Consolidando resultados de ambas fuentes", True)
        cursor.execute(
            """
CREATE INDEX IX_CallMatches_DetailDate
    ON #CallMatches(DetalleID,FechaLlamada DESC,Orden DESC);
;WITH Ranked AS (
    SELECT DetalleID,FechaLlamada,StatusLlamada,Orden,
           ROW_NUMBER() OVER (
               PARTITION BY DetalleID
               ORDER BY FechaLlamada DESC,Fuente DESC,Orden DESC
           ) AS rn
    FROM #CallMatches
)
SELECT DetalleID,COUNT_BIG(*) TotalLlamadas,
       MIN(FechaLlamada) PrimeraLlamada,
       MAX(FechaLlamada) UltimaLlamada,
       MAX(CASE WHEN rn=1 THEN StatusLlamada END) UltimoStatus
INTO #CallSummary
FROM Ranked
GROUP BY DetalleID;
CREATE UNIQUE CLUSTERED INDEX IX_CallSummary_Detail ON #CallSummary(DetalleID);
"""
        )
        matched_count = int(
            cursor.execute("SELECT COUNT_BIG(*) FROM #CallSummary").fetchval() or 0
        )
        connection.commit()

        check_cancel()
        progress(85, "Aplicando la anulación segura", False)
        # Las tablas temporales ya quedaron confirmadas. La fase de escritura
        # usa autocommit únicamente para controlar una transacción SQL
        # explícita. Combinar BEGIN TRANSACTION con autocommit=False puede
        # dejar @@TRANCOUNT=1 después de connection.commit(), conservando
        # bloqueos aunque la petición web ya haya terminado.
        connection.commit()
        connection.autocommit = True
        deadlock_retries = 0
        for attempt in range(4):
            try:
                cursor = connection.cursor()
                cursor.execute(
                    """
SET XACT_ABORT ON;
SET LOCK_TIMEOUT 20000;
BEGIN TRANSACTION;
DECLARE @AppLockResult int;
EXEC @AppLockResult=sys.sp_getapplock
    @Resource='VicidialBatchControl',
    @LockMode='Exclusive',
    @LockOwner='Transaction',
    @LockTimeout=20000;
IF @AppLockResult<0
    THROW 51001,'No se pudo obtener el bloqueo de control de lotes.',1;
"""
                )
                cursor.execute(
                    f"""
UPDATE d WITH (ROWLOCK) SET
    FueMarcado=CASE WHEN s.DetalleID IS NOT NULL THEN 1 ELSE 0 END,
    TotalLlamadas=CONVERT(int,ISNULL(s.TotalLlamadas,0)),
    FechaPrimeraLlamada=s.PrimeraLlamada,
    FechaUltimaLlamada=s.UltimaLlamada,
    UltimoStatus=s.UltimoStatus,
    EstadoRegistro=CASE WHEN s.DetalleID IS NOT NULL THEN 'MARCADO' ELSE 'LIBERADO' END,
    FechaLiberacion=CASE WHEN s.DetalleID IS NULL THEN SYSDATETIME() ELSE NULL END
FROM {_detail_table()} d
INNER JOIN #BatchPhones p ON p.DetalleID=d.DetalleID
LEFT JOIN #CallSummary s ON s.DetalleID=d.DetalleID
WHERE d.LoteID=? AND d.EstadoRegistro='PENDIENTE';
""",
                    batch_id,
                )
                counts = cursor.execute(
                    f"""SELECT
                      SUM(CASE WHEN EstadoRegistro='MARCADO' THEN 1 ELSE 0 END),
                      SUM(CASE WHEN EstadoRegistro='LIBERADO' THEN 1 ELSE 0 END),
                      COUNT_BIG(*)
                    FROM {_detail_table()} WHERE LoteID=?""",
                    batch_id,
                ).fetchone()
                marked, released, total = int(counts[0] or 0), int(counts[1] or 0), int(counts[2] or 0)
                status = "PARCIAL"
                if marked == total:
                    status = "TRABAJADO"
                elif released == total:
                    status = "ANULADO"
                cursor.execute(
                    f"""UPDATE {_batch_table()} SET EstadoLote=?,FechaRevision=SYSDATETIME(),
                    RegistrosMarcados=?,RegistrosLiberados=? WHERE LoteID=?""",
                    status, marked, released, batch_id,
                )
                if dry_run:
                    cursor.execute("ROLLBACK TRANSACTION;")
                else:
                    cursor.execute("COMMIT TRANSACTION;")
                break
            except Exception as exc:
                try:
                    connection.cursor().execute(
                        "IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;"
                    )
                except Exception:
                    pass
                if not _is_sql_deadlock(exc) or attempt == 3:
                    raise
                deadlock_retries += 1
                progress(
                    85,
                    f"SQL ocupado; reintentando de forma segura ({attempt + 1}/3)",
                    False,
                )
                time.sleep(1.5 * (attempt + 1))
    progress(
        100,
        "Simulación terminada sin modificar el lote"
        if dry_run
        else "Anulación segura terminada",
        False,
    )
    return {
        "batch_id": batch_id,
        "status": status,
        "total": total,
        "marked": marked,
        "released": released,
        "pending_reviewed": pending_count,
        "matched_unique": matched_count,
        "report_matched": report_marked,
        "azul_matched": azul_marked,
        "deadlock_retries": deadlock_retries,
        "dry_run": bool(dry_run),
        "refresh": refresh_result,
    }


def get_list_status_summary(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Devuelve el comportamiento histórico de las listas seleccionadas.

    Usa una sola consulta parametrizada para evitar desajustes entre los signos
    ``?`` y los parámetros enviados a pyodbc. El resumen respeta campaña, lista,
    mes de alta, mes de última gestión, estado y ciudad. El filtro de status se omite de
    forma intencional para mostrar la distribución completa de estatus de la
    lista antes de volver a trabajarla.
    """
    selected_lists = _as_list(filters.get("list_name"))
    empty_result = {
        "selected_lists": selected_lists,
        "total_records": 0,
        "unique_phones": 0,
        "sales": 0,
        "voicemails": 0,
        "contacted": 0,
        "conversion_rate": 0.0,
        "status_count": 0,
        "items": [],
    }
    if not selected_lists:
        return empty_result

    params: List[Any] = []
    clauses: List[str] = []
    summary_filters = {
        key: filters.get(key)
        for key in (
            "campaign_id",
            "list_name",
            "management_month",
            "last_management_month",
            "state",
            "city",
        )
    }
    _append_selected_filters(clauses, params, summary_filters, "m")

    phone = _phone_expr("m.PhoneNormalized")
    phone_fallback = _phone_expr("m.PhoneNumber")
    normalized = f"CASE WHEN LEN({phone}) = 10 THEN {phone} ELSE {phone_fallback} END"
    clauses.append(f"LEN({normalized}) = 10")
    where = " AND ".join(clauses)

    sql = f"""
WITH Base AS (
    SELECT
        {normalized} AS TelefonoNormalizado,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), m.Status))), ''), 'SIN STATUS') AS Status,
        COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(250), m.StatusDetalle))), ''), '') AS StatusDetalle
    FROM {_master_table()} AS m
    WHERE {where}
), Clasificada AS (
    SELECT
        TelefonoNormalizado,
        Status,
        StatusDetalle,
        CASE
            WHEN UPPER(Status) LIKE 'VESA%'
              OR UPPER(Status) IN ('VE', 'EVE', 'SALE', 'VENTA')
              OR UPPER(StatusDetalle) LIKE '%VENTA%'
              OR UPPER(StatusDetalle) LIKE '%APROBAD%'
            THEN 1 ELSE 0
        END AS EsVenta,
        CASE
            WHEN UPPER(Status) IN ('BZ', 'BUZON', 'VM', 'VOICEMAIL')
              OR UPPER(Status) LIKE 'BUZ%'
              OR UPPER(StatusDetalle) LIKE '%BUZON%'
              OR UPPER(StatusDetalle) LIKE '%BUZÓN%'
              OR UPPER(StatusDetalle) LIKE '%VOICEMAIL%'
            THEN 1 ELSE 0
        END AS EsBuzon,
        CASE
            WHEN UPPER(StatusDetalle) LIKE '%CONTACT%'
              OR UPPER(StatusDetalle) LIKE '%VENTA%'
              OR UPPER(StatusDetalle) LIKE '%APROBAD%'
              OR UPPER(Status) LIKE 'VESA%'
              OR UPPER(Status) IN ('VE', 'EVE', 'SALE', 'VENTA')
            THEN 1 ELSE 0
        END AS EsContacto
    FROM Base
)
SELECT
    CASE WHEN GROUPING(Status) = 1 THEN '__TOTAL__' ELSE Status END AS Status,
    CASE WHEN GROUPING(StatusDetalle) = 1 THEN '' ELSE StatusDetalle END AS StatusDetalle,
    COUNT_BIG(*) AS TotalRegistros,
    COUNT(DISTINCT TelefonoNormalizado) AS TelefonosUnicos,
    SUM(EsVenta) AS Ventas,
    SUM(EsBuzon) AS Buzones,
    SUM(EsContacto) AS Contactados,
    GROUPING(Status) AS EsTotal
FROM Clasificada
GROUP BY GROUPING SETS ((Status, StatusDetalle), ());
"""

    expected_params = sql.count("?")
    if expected_params != len(params):
        raise RuntimeError(
            f"Error interno al construir el resumen: {expected_params} marcadores y "
            f"{len(params)} parámetros."
        )

    with connection_scope() as connection:
        cursor = connection.cursor()
        rows = cursor.execute(sql, *params).fetchall()

    items: List[Dict[str, Any]] = []
    totals = None
    for row in rows:
        is_total = bool(row[7])
        data = {
            "status": str(row[0] or "SIN STATUS"),
            "status_detail": str(row[1] or ""),
            "total": int(row[2] or 0),
            "unique_phones": int(row[3] or 0),
            "sales": int(row[4] or 0),
            "voicemails": int(row[5] or 0),
            "contacted": int(row[6] or 0),
        }
        if is_total:
            totals = data
        else:
            items.append(data)

    if totals is None:
        return empty_result

    items.sort(key=lambda item: (-item["total"], item["status"], item["status_detail"]))
    total_records = totals["total"]
    sales = totals["sales"]
    conversion_rate = round((sales * 100.0 / total_records), 2) if total_records else 0.0

    return {
        "selected_lists": selected_lists,
        "total_records": total_records,
        "unique_phones": totals["unique_phones"],
        "sales": sales,
        "voicemails": totals["voicemails"],
        "contacted": totals["contacted"],
        "conversion_rate": conversion_rate,
        "status_count": len(items),
        "items": items,
    }
