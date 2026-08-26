# -*- coding: utf-8 -*-
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple
from uuid import uuid4

from app import config
from app.import_service import now_local, run_import
from app.sql_loader import get_connection, q, split_table_name


def _qualified_table(name: str, default_database: Optional[str] = None) -> str:
    parts = [p for p in name.replace("[", "").replace("]", "").split(".") if p]
    if len(parts) == 1:
        parts = [default_database or config.SQL_DATABASE, "dbo", parts[0]]
    elif len(parts) == 2:
        parts = [default_database or config.SQL_DATABASE, parts[0], parts[1]]
    elif len(parts) != 3:
        raise RuntimeError("Nombre de tabla no valido: " + name)
    return ".".join(q(part) for part in parts)


def _date_expr(alias: str, column: str) -> str:
    c = alias + "." + q(column)
    return (
        "COALESCE("
        "TRY_CONVERT(datetime2(0), " + c + ", 120),"
        "TRY_CONVERT(datetime2(0), " + c + ", 121),"
        "TRY_CONVERT(datetime2(0), " + c + ", 101),"
        "TRY_CONVERT(datetime2(0), " + c + ", 103),"
        "TRY_CONVERT(datetime2(0), " + c + ")"
        ")"
    )


def _phone_expr(expression: str) -> str:
    # Compara los ultimos 10 digitos para tolerar +52, 52, espacios, guiones y parentesis.
    cleaned = expression
    for old in ["' '", "'-'", "'('", "')'", "'+'", "'.'", "'/'"]:
        cleaned = "REPLACE(" + cleaned + ", " + old + ", '')"
    return "RIGHT(" + cleaned + ", 10)"


def _call_report_table() -> str:
    return _qualified_table(config.SQL_CALL_REPORT_TABLE, config.SQL_DATABASE)


def _sales_table() -> str:
    return _qualified_table(config.SQL_SALES_TABLE, config.SQL_SALES_DATABASE)


def _call_datetime(alias: str = "cr") -> str:
    return _date_expr(alias, "call_date")


def get_last_report_datetime(connection) -> Optional[datetime]:
    row = connection.cursor().execute(
        "SELECT MAX(" + _call_datetime("cr") + ") FROM " + _call_report_table() + " cr"
    ).fetchone()
    return row[0] if row else None


def incremental_window(connection) -> Tuple[datetime, datetime]:
    end_dt = now_local()
    last_dt = get_last_report_datetime(connection)
    if last_dt is None:
        # Primera sincronización: permite definir cuántos días históricos descargar.
        # Por defecto descarga 30 días para que el dashboard pueda consultar fechas anteriores.
        start_dt = end_dt - timedelta(days=config.REFRESH_INITIAL_DAYS)
        start_dt = start_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        # Continúa exactamente desde la última llamada almacenada, con un pequeño
        # traslape para evitar perder registros que Vicidial publicó con retraso.
        # No se limita al inicio del día actual: la última fecha puede ser de días anteriores.
        start_dt = last_dt.replace(minute=0, second=0, microsecond=0) - timedelta(
            hours=config.REFRESH_OVERLAP_HOURS
        )
    if start_dt > end_dt:
        start_dt = end_dt.replace(minute=0, second=0, microsecond=0)
    return start_dt, end_dt


def refresh_incremental() -> Dict[str, object]:
    with get_connection() as connection:
        start_dt, end_dt = incremental_window(connection)
    return run_import(start_dt, end_dt, config.VICIDIAL_CAMPAIGNS)


def _prepare_fusion(cursor, selected) -> Tuple[str, str, str]:
    """Materializa ventas y llamadas en tablas temporales globales unicas.

    pyodbc ejecuta los lotes parametrizados mediante procedimientos preparados.
    Una tabla temporal local (#Fusion) creada dentro de ese procedimiento puede
    desaparecer al terminar cursor.execute(). Por eso usamos nombres globales
    unicos (##...) mientras la conexion permanece abierta.
    """
    suffix = uuid4().hex[:12]
    ventas_tmp = "##VentasBase_" + suffix
    calls_tmp = "##CallsRelevant_" + suffix
    fusion_tmp = "##Fusion_" + suffix

    ventas_q = q(ventas_tmp)
    calls_q = q(calls_tmp)
    fusion_q = q(fusion_tmp)

    sales = _sales_table()
    calls = _call_report_table()
    venta_phone = _phone_expr("COALESCE(CONVERT(varchar(80), v.[telefonoCliente]), '')")
    call_phone = _phone_expr(
        "COALESCE(NULLIF(CONVERT(varchar(80), cr.[phone_number]), ''), "
        "NULLIF(CONVERT(varchar(80), cr.[phone_number_dialed]), ''), '')"
    )
    call_dt = _call_datetime("cr")

    sql = f"""
SET NOCOUNT ON;

SELECT
    v.[idVenta], v.[idUser], v.[nombreCliente], v.[telefonoCliente],
    TRY_CONVERT(datetime2(0), v.[fecha]) AS FechaVenta,
    v.[nombreAgente], LTRIM(RTRIM(COALESCE(v.[estatus], ''))) AS EstatusVenta,
    v.[fechaAgendada], v.[horaAgendada], v.[campaignId],
    {venta_phone} AS TelefonoNormalizado
INTO {ventas_q}
FROM {sales} v
WHERE TRY_CONVERT(datetime2(0), v.[fecha]) >= ?
  AND TRY_CONVERT(datetime2(0), v.[fecha]) < DATEADD(DAY, 1, ?)
  AND (
      UPPER(LTRIM(RTRIM(COALESCE(v.[estatus], '')))) LIKE 'APROB%'
      OR UPPER(LTRIM(RTRIM(COALESCE(v.[estatus], '')))) LIKE 'RECHAZ%'
  );

CREATE INDEX IX_VentasBase_Telefono ON {ventas_q}(TelefonoNormalizado, FechaVenta);

SELECT
    cr.[ImportID], cr.[call_date], cr.[status], cr.[user], cr.[full_name],
    cr.[campaign_id], cr.[list_id], cr.[list_name], cr.[list_description],
    cr.[lead_id], cr.[phone_number], cr.[phone_number_dialed],
    cr.[status_name], cr.[uniqueid],
    {call_dt} AS CallDateTime,
    {call_phone} AS TelefonoNormalizado
INTO {calls_q}
FROM {calls} cr
WHERE {call_dt} >= DATEADD(DAY, -{int(config.PHONE_MATCH_DAYS)}, CAST(? AS datetime2(0)))
  AND {call_dt} < DATEADD(DAY, {int(config.PHONE_MATCH_DAYS) + 1}, CAST(? AS datetime2(0)));

CREATE INDEX IX_CallsRelevant_TelefonoFecha
ON {calls_q}(TelefonoNormalizado, CallDateTime)
INCLUDE (ImportID, status, [user], full_name, campaign_id, list_id, list_name,
         list_description, lead_id, phone_number, phone_number_dialed, status_name, uniqueid, call_date);

SELECT
    v.*,
    crx.[ImportID], crx.[call_date], crx.[status] AS CallStatus,
    crx.[user] AS CallUser, crx.[full_name] AS CallFullName,
    crx.[campaign_id] AS CallCampaignID, crx.[list_id], crx.[list_name],
    crx.[list_description], crx.[lead_id], crx.[phone_number],
    crx.[phone_number_dialed], crx.[status_name], crx.[uniqueid],
    crx.CallDateTime,
    CASE WHEN crx.[ImportID] IS NULL THEN NULL
         ELSE DATEDIFF(MINUTE, crx.CallDateTime, v.FechaVenta) END AS DiferenciaMinutos,
    CASE WHEN UPPER(v.EstatusVenta) LIKE 'APROB%' THEN 'APROBADA'
         WHEN UPPER(v.EstatusVenta) LIKE 'RECHAZ%' THEN 'RECHAZADA'
         ELSE UPPER(v.EstatusVenta) END AS Resultado
INTO {fusion_q}
FROM {ventas_q} v
OUTER APPLY (
    SELECT TOP (1) c.*
    FROM {calls_q} c
    WHERE c.TelefonoNormalizado = v.TelefonoNormalizado
      AND c.TelefonoNormalizado <> ''
    ORDER BY
      CASE WHEN c.CallDateTime <= v.FechaVenta THEN 0 ELSE 1 END,
      ABS(DATEDIFF(SECOND, c.CallDateTime, v.FechaVenta)),
      c.ImportID DESC
) crx;

CREATE INDEX IX_Fusion_Resultado ON {fusion_q}(Resultado);
"""
    cursor.execute(sql, selected, selected, selected, selected)
    return ventas_tmp, calls_tmp, fusion_tmp


def get_dashboard_data(target_date: Optional[str] = None) -> Dict[str, object]:
    selected = datetime.strptime(target_date, "%Y-%m-%d").date() if target_date else now_local().date()
    with get_connection() as connection:
        # pyodbc no expone timeout en Cursor. Algunos drivers permiten
        # establecerlo en la conexion; si no, el timeout del frontend
        # seguira evitando que la pantalla quede bloqueada indefinidamente.
        try:
            connection.timeout = 180
        except (AttributeError, TypeError):
            pass

        cursor = connection.cursor()
        ventas_tmp, calls_tmp, fusion_tmp = _prepare_fusion(cursor, selected)
        fusion_q = q(fusion_tmp)

        row = cursor.execute(f"""
SELECT
    COUNT_BIG(*) AS Total,
    SUM(CASE WHEN Resultado='APROBADA' THEN 1 ELSE 0 END) AS Aprobadas,
    SUM(CASE WHEN Resultado='RECHAZADA' THEN 1 ELSE 0 END) AS Rechazadas,
    COUNT(DISTINCT COALESCE(NULLIF(nombreAgente,''),'SIN AGENTE')) AS Agentes,
    COUNT(DISTINCT CASE WHEN COALESCE(NULLIF(LTRIM(RTRIM(list_name)),''), NULLIF(LTRIM(RTRIM(list_id)),'')) IS NOT NULL THEN COALESCE(NULLIF(LTRIM(RTRIM(list_name)),''), NULLIF(LTRIM(RTRIM(list_id)),'')) END) AS Lotes,
    MAX(FechaVenta) AS UltimoRegistro,
    SUM(CASE WHEN ImportID IS NOT NULL THEN 1 ELSE 0 END) AS ConLlamada
FROM {fusion_q}
""").fetchone()

        total = int(row[0] or 0)
        summary = {
            "total": total,
            "aprobadas": int(row[1] or 0),
            "rechazadas": int(row[2] or 0),
            "agentes": int(row[3] or 0),
            "lotes": int(row[4] or 0),
            "ultima": row[5].strftime("%H:%M:%S") if row[5] else None,
            "con_llamada": int(row[6] or 0),
            "sin_llamada": total - int(row[6] or 0),
        }

        def grouped(expr: str, label: str, order: str = "Total DESC"):
            sql = f"""
SELECT {expr} AS Etiqueta,
       SUM(CASE WHEN Resultado='APROBADA' THEN 1 ELSE 0 END) AS Aprobadas,
       SUM(CASE WHEN Resultado='RECHAZADA' THEN 1 ELSE 0 END) AS Rechazadas,
       COUNT_BIG(*) AS Total
FROM {fusion_q}
GROUP BY {expr}
ORDER BY {order}
"""
            return [
                {
                    label: str(r[0] or "SIN DATO"),
                    "aprobadas": int(r[1] or 0),
                    "rechazadas": int(r[2] or 0),
                    "total": int(r[3] or 0),
                }
                for r in cursor.execute(sql).fetchall()
            ]

        by_agent = grouped("COALESCE(NULLIF(LTRIM(RTRIM(nombreAgente)),''),'SIN AGENTE')", "agente")
        by_lot = grouped(
            "COALESCE(NULLIF(LTRIM(RTRIM(list_name)),''), NULLIF(LTRIM(RTRIM(list_id)),''), 'SIN COINCIDENCIA')",
            "lote",
        )
        by_status = grouped("Resultado", "resultado")

        hour_rows = grouped("DATEPART(HOUR, FechaVenta)", "hora", "Etiqueta ASC")
        hour_map = {int(x["hora"]): x for x in hour_rows}
        by_hour = []
        for hour in range(24):
            values = hour_map.get(hour, {"aprobadas": 0, "rechazadas": 0, "total": 0})
            by_hour.append(
                {
                    "hora": hour,
                    "etiqueta": str(hour).zfill(2) + ":00",
                    "aprobadas": values["aprobadas"],
                    "rechazadas": values["rechazadas"],
                    "total": values["total"],
                }
            )

        detail_sql = f"""
SELECT TOP (500)
    idVenta, FechaVenta, nombreCliente, telefonoCliente, nombreAgente,
    Resultado, campaignId, list_id, list_name, list_description,
    lead_id, CallDateTime, CallUser, CallStatus, status_name,
    CallCampaignID, uniqueid, DiferenciaMinutos,
    CASE WHEN ImportID IS NULL THEN 'SIN COINCIDENCIA' ELSE 'COINCIDENCIA' END AS Coincidencia
FROM {fusion_q}
ORDER BY FechaVenta DESC, idVenta DESC
"""
        details = []
        for r in cursor.execute(detail_sql).fetchall():
            details.append(
                {
                    "id_venta": str(r[0] or ""),
                    "fecha_hora": r[1].strftime("%Y-%m-%d %H:%M:%S") if r[1] else "",
                    "cliente": str(r[2] or ""),
                    "telefono": str(r[3] or ""),
                    "agente": str(r[4] or ""),
                    "resultado": str(r[5] or ""),
                    "campana_venta": str(r[6] or ""),
                    "lote_id": str(r[7] or ""),
                    "lote": str(r[8] or r[7] or "SIN COINCIDENCIA"),
                    "lote_nombre": str(r[8] or r[7] or "SIN COINCIDENCIA"),
                    "lote_descripcion": str(r[9] or ""),
                    "lead_id": str(r[10] or ""),
                    "fecha_llamada": r[11].strftime("%Y-%m-%d %H:%M:%S") if r[11] else "",
                    "agente_llamada": str(r[12] or ""),
                    "status_llamada": str(r[13] or ""),
                    "status_nombre": str(r[14] or ""),
                    "campana_llamada": str(r[15] or ""),
                    "uniqueid": str(r[16] or ""),
                    "diferencia_minutos": "" if r[17] is None else str(r[17]),
                    "coincidencia": str(r[18] or ""),
                }
            )

        last_import = cursor.execute(
            "SELECT MAX([FechaImportacion]) FROM " + _call_report_table()
        ).fetchone()[0]
        last_report = get_last_report_datetime(connection)

        # Limpieza explicita de las tablas globales unicas.
        for temp_name in (fusion_tmp, calls_tmp, ventas_tmp):
            try:
                cursor.execute("DROP TABLE IF EXISTS " + q(temp_name))
            except Exception:
                pass

    return {
        "date": selected.isoformat(),
        "summary": summary,
        "by_agent": by_agent,
        "by_lot": by_lot,
        "by_status": by_status,
        "by_hour": by_hour,
        "details": details,
        "last_import": last_import.strftime("%Y-%m-%d %H:%M:%S") if last_import else None,
        "last_report": last_report.strftime("%Y-%m-%d %H:%M:%S") if last_report else None,
    }
