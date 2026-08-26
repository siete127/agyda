# -*- coding: utf-8 -*-
import csv
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app import config
from app.dashboard_service import refresh_incremental
from app.import_service import now_local
from app.sql_loader import get_connection, q


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


def _batch_table() -> str:
    return q(config.SQL_DATABASE) + "." + q("dbo") + "." + q("ControlLotesVicidial")


def _detail_table() -> str:
    return q(config.SQL_DATABASE) + "." + q("dbo") + "." + q("ControlLotesVicidialDetalle")


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


def _add_in_filter(clauses: List[str], params: List[Any], column: str, values: List[str]) -> None:
    if not values:
        return
    placeholders = ",".join("?" for _ in values)
    clauses.append(f"{column} IN ({placeholders})")
    params.extend(values)


def _filter_expressions(alias: str) -> Dict[str, str]:
    """Expresiones normalizadas compartidas por todos los filtros."""
    return {
        "campaign_id": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.CampaignID)))",
        "list_name": f"LTRIM(RTRIM(CONVERT(nvarchar(250), {alias}.ListName)))",
        # El mes se obtiene exclusivamente de EntryDate. UltimoMesGestion puede
        # contener el mes de una gestión distinta al alta del registro.
        "management_month": f"CONVERT(char(7), {alias}.EntryDate, 120)",
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
        if filter_name == exclude_field:
            continue
        _add_in_filter(clauses, params, expression, _as_list(filters.get(filter_name)))


def _where_filters(filters: Dict[str, Any], params: List[Any], alias: str = "m") -> str:
    """Filtra los registros originales antes de elegir uno por teléfono."""
    clauses: List[str] = []
    _append_selected_filters(clauses, params, filters, alias)
    return " AND ".join(clauses) if clauses else "1 = 1"


FILTER_COLUMNS = {
    "campaign_id": "CampaignID",
    "list_name": "ListName",
    "management_month": "__ENTRY_MONTH__",
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
    order = "Valor DESC" if field == "management_month" else "Valor"
    sql = f"""
SELECT TOP ({limit}) Valor
FROM (
    SELECT DISTINCT {value_expr} AS Valor
    FROM {_master_table()} m
    WHERE {where}
) x
ORDER BY {order}
"""
    with get_connection() as connection:
        rows = connection.cursor().execute(sql, params).fetchall()
    return [str(row[0]) for row in rows if row[0] is not None]


def _candidate_cte(mode: str, source_where: str) -> str:
    master = _master_table()
    phone = _phone_expr("m.PhoneNormalized")
    phone_fallback = _phone_expr("m.PhoneNumber")
    normalized = "CASE WHEN LEN(" + phone + ")=10 THEN " + phone + " ELSE " + phone_fallback + " END"
    eligibility = """
      AND NOT EXISTS (
          SELECT 1 FROM {detail} d
          WHERE d.TelefonoNormalizado = p.TelefonoNormalizado
            AND d.EstadoRegistro IN ('PENDIENTE','MARCADO')
      )
""".format(detail=_detail_table())
    if mode.upper() == "RECICLAJE":
        eligibility = """
      AND EXISTS (
          SELECT 1 FROM {detail} d
          WHERE d.TelefonoNormalizado = p.TelefonoNormalizado
            AND d.EstadoRegistro = 'MARCADO'
      )
      AND NOT EXISTS (
          SELECT 1 FROM {detail} d2
          WHERE d2.TelefonoNormalizado = p.TelefonoNormalizado
            AND d2.EstadoRegistro = 'PENDIENTE'
      )
""".format(detail=_detail_table())
    return f"""
WITH Filtrada AS (
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
), Base AS (
    SELECT
        f.*,
        ROW_NUMBER() OVER (
            PARTITION BY f.TelefonoNormalizado
            ORDER BY
                CASE WHEN ISNULL(f.CalledCount,0)=0 THEN 0 ELSE 1 END,
                ISNULL(f.CalledCount,0),
                CASE WHEN NULLIF(LTRIM(RTRIM(f.FirstName)),'') IS NOT NULL THEN 0 ELSE 1 END,
                f.EntryDate,
                f.LeadID
        ) AS rn
    FROM Filtrada f
    WHERE f.TelefonoNormalizado <> ''
      AND LEN(f.TelefonoNormalizado) = 10
), Pool AS (
    SELECT * FROM Base p
    WHERE p.rn = 1
    {eligibility}
)
"""


def preview_candidates(filters: Dict[str, Any]) -> Dict[str, Any]:
    mode = str(filters.get("mode") or "NUEVOS").upper()
    params: List[Any] = []
    source_where = _where_filters(filters, params, "m")
    cte = _candidate_cte(mode, source_where)
    with get_connection() as connection:
        ensure_control_tables(connection)
        cursor = connection.cursor()
        row = cursor.execute(
            cte + """
SELECT COUNT_BIG(*) Total,
       SUM(CASE WHEN ISNULL(CalledCount,0)=0 THEN 1 ELSE 0 END) NuncaMarcados,
       AVG(CONVERT(float, CalidadScore)) PromedioCalidad,
       COUNT(DISTINCT State) Estados,
       COUNT(DISTINCT City) Ciudades
FROM Pool
""",
            params,
        ).fetchone()
        sample = cursor.execute(
            cte + """
SELECT TOP (100)
       LeadID, TelefonoNormalizado, FirstName, LastName, City, State,
       CampaignID, ListName, Status, CalledCount, CalidadScore, EntryDate,
       CONVERT(char(7), EntryDate, 120) AS MesGestion
FROM Pool
ORDER BY CalidadScore DESC, ISNULL(CalledCount,0), EntryDate, LeadID
""",
            params,
        ).fetchall()
    return {
        "available": int(row[0] or 0),
        "never_called": int(row[1] or 0),
        "average_quality": round(float(row[2] or 0), 1),
        "states": int(row[3] or 0),
        "cities": int(row[4] or 0),
        "items": [
            {
                "lead_id": int(r[0]) if r[0] is not None else None,
                "phone": str(r[1] or ""),
                "name": (str(r[2] or "") + " " + str(r[3] or "")).strip(),
                "city": str(r[4] or ""),
                "state": str(r[5] or ""),
                "campaign": str(r[6] or ""),
                "list_name": str(r[7] or ""),
                "status": str(r[8] or ""),
                "called_count": int(r[9] or 0),
                "quality": int(r[10] or 0),
                "entry_date": r[11].strftime("%Y-%m-%d %H:%M:%S") if r[11] else "",
                "management_month": str(r[12] or ""),
            } for r in sample
        ],
    }


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


def generate_batch(filters: Dict[str, Any]) -> Dict[str, Any]:
    quantity = max(1, min(int(filters.get("quantity") or 5000), 50000))
    mode = str(filters.get("mode") or "NUEVOS").upper()
    name = str(filters.get("batch_name") or "").strip() or ("LOTE_" + now_local().strftime("%Y%m%d_%H%M%S"))
    campaign = str(filters.get("destination_campaign") or "").strip()
    destination_list = str(filters.get("destination_list") or "").strip()
    params: List[Any] = []
    source_where = _where_filters(filters, params, "m")
    cte = _candidate_cte(mode, source_where)
    select_columns = ["LeadID", "TelefonoNormalizado", "PhoneNumber"] + [source for _, source in EXPORT_COLUMNS]
    select_sql = cte + f"SELECT TOP ({quantity}) " + ",".join(q(c) for c in select_columns) + " FROM Pool ORDER BY CalidadScore DESC, ISNULL(CalledCount,0), EntryDate, LeadID"

    export_dir = config.DOWNLOAD_DIR / "lotes_vicidial"
    export_dir.mkdir(parents=True, exist_ok=True)
    batch_uuid = str(uuid.uuid4())
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", name).strip("_") or "LOTE"
    file_path = export_dir / (safe_name + "_" + now_local().strftime("%Y%m%d_%H%M%S") + ".csv")

    with get_connection() as connection:
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
        chunk_size = 1000
        for start in range(0, len(selected_phones), chunk_size):
            phone_chunk = selected_phones[start:start + chunk_size]
            placeholders = ",".join("?" for _ in phone_chunk)
            blocked_rows = cursor.execute(
                f"SELECT DISTINCT TelefonoNormalizado FROM {_detail_table()} "
                f"WHERE EstadoRegistro IN ('PENDIENTE','MARCADO') "
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
            (LoteUUID,NombreLote,CampanaDestino,ListaDestino,TipoExportacion,CantidadSolicitada,CantidadExportada,EstadoLote,FechaGeneracion,ArchivoCSV)
            OUTPUT INSERTED.LoteID
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            batch_uuid, name, campaign or None, destination_list or None, mode,
            quantity, len(rows), "GENERADO", now, file_path.name,
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

    return {
        "batch_id": lote_id,
        "batch_uuid": batch_uuid,
        "name": name,
        "exported": len(rows),
        "file": file_path.name,
        "download_url": "/api/lead-batches/%s/download" % lote_id,
        "blocked_for_future_batches": len(rows),
        "duplicate_control": "PENDIENTE_MARCADO",
    }


def list_batches(limit: int = 50) -> List[Dict[str, Any]]:
    limit = max(1, min(limit, 200))
    with get_connection() as connection:
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
    with get_connection() as connection:
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


def reconcile_and_release(batch_id: int) -> Dict[str, Any]:
    # Primero trae el Call Report más reciente, como medida de seguridad.
    refresh_result = refresh_incremental()
    call_phone = _phone_expr("COALESCE(NULLIF(cr.phone_number,''), cr.phone_number_dialed)")
    call_dt = "COALESCE(TRY_CONVERT(datetime2(0),cr.call_date,120),TRY_CONVERT(datetime2(0),cr.call_date,121),TRY_CONVERT(datetime2(0),cr.call_date))"

    with get_connection() as connection:
        ensure_control_tables(connection)
        cursor = connection.cursor()
        batch = cursor.execute(
            f"SELECT FechaGeneracion,EstadoLote FROM {_batch_table()} WHERE LoteID=?", batch_id
        ).fetchone()
        if not batch:
            raise RuntimeError("El lote no existe.")
        if str(batch[1]) in ("ANULADO", "PARCIAL", "TRABAJADO"):
            raise RuntimeError("Este lote ya fue revisado. Estado actual: " + str(batch[1]))

        sql = f"""
;WITH Llamadas AS (
    SELECT d.DetalleID,
           COUNT_BIG(cr.ImportID) TotalLlamadas,
           MIN({call_dt}) PrimeraLlamada,
           MAX({call_dt}) UltimaLlamada
    FROM {_detail_table()} d
    INNER JOIN {_batch_table()} b ON b.LoteID=d.LoteID
    LEFT JOIN {_call_table()} cr
      ON {call_phone}=d.TelefonoNormalizado
     AND {call_dt} >= b.FechaGeneracion
    WHERE d.LoteID=? AND d.EstadoRegistro='PENDIENTE'
    GROUP BY d.DetalleID
), Ultimo AS (
    SELECT d.DetalleID, x.status
    FROM {_detail_table()} d
    INNER JOIN {_batch_table()} b ON b.LoteID=d.LoteID
    OUTER APPLY (
        SELECT TOP(1) cr.status
        FROM {_call_table()} cr
        WHERE {call_phone}=d.TelefonoNormalizado
          AND {call_dt} >= b.FechaGeneracion
        ORDER BY {call_dt} DESC, cr.ImportID DESC
    ) x
    WHERE d.LoteID=? AND d.EstadoRegistro='PENDIENTE'
)
UPDATE d SET
    FueMarcado=CASE WHEN l.TotalLlamadas>0 THEN 1 ELSE 0 END,
    TotalLlamadas=CONVERT(int,l.TotalLlamadas),
    FechaPrimeraLlamada=l.PrimeraLlamada,
    FechaUltimaLlamada=l.UltimaLlamada,
    UltimoStatus=u.status,
    EstadoRegistro=CASE WHEN l.TotalLlamadas>0 THEN 'MARCADO' ELSE 'LIBERADO' END,
    FechaLiberacion=CASE WHEN l.TotalLlamadas=0 THEN SYSDATETIME() ELSE NULL END
FROM {_detail_table()} d
JOIN Llamadas l ON l.DetalleID=d.DetalleID
LEFT JOIN Ultimo u ON u.DetalleID=d.DetalleID;
"""
        cursor.execute(sql, batch_id, batch_id)
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
        connection.commit()
    return {
        "batch_id": batch_id,
        "status": status,
        "total": total,
        "marked": marked,
        "released": released,
        "refresh": refresh_result,
    }


def get_list_status_summary(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Devuelve el comportamiento histórico de las listas seleccionadas.

    Usa una sola consulta parametrizada para evitar desajustes entre los signos
    ``?`` y los parámetros enviados a pyodbc. El resumen respeta campaña, lista,
    mes de última gestión, estado y ciudad. El filtro de status se omite de
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
    expressions = _filter_expressions("m")
    for filter_name in ("campaign_id", "list_name", "management_month", "state", "city"):
        _add_in_filter(clauses, params, expressions[filter_name], _as_list(filters.get(filter_name)))

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

    with get_connection() as connection:
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
