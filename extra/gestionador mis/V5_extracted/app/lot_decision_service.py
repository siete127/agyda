# -*- coding: utf-8 -*-
"""Dashboard de decisión para reutilizar lotes Vicidial.

Las métricas se calculan por teléfono normalizado único dentro de cada lote.
La consulta materializa una sola base temporal y evita el patrón N+1.
"""

import copy
import json
import logging
import re
import threading
import time
from datetime import datetime
from statistics import median
from typing import Any, Dict, List, Optional, Sequence

from app import config
from app.kpi_refresh_coordinator import run_serialized_kpi
from app.sql_loader import connection_scope, q


logger = logging.getLogger(__name__)
_cache_lock = threading.Lock()
_cache: Dict[str, Any] = {}
_CACHE_SECONDS = 30
_SNAPSHOT_MEMORY_SECONDS = 300
_snapshot_memory: Dict[str, Any] = {}
_SNAPSHOT_MAX_AGE_MINUTES = 20
_snapshot_refresh_lock = threading.Lock()
_snapshot_refreshing: set[str] = set()


def _qualified_table(name: str, default_database: Optional[str] = None) -> str:
    parts = [
        part
        for part in str(name or "").replace("[", "").replace("]", "").split(".")
        if part
    ]
    if len(parts) == 1:
        parts = [default_database or config.SQL_DATABASE, "dbo", parts[0]]
    elif len(parts) == 2:
        parts = [default_database or config.SQL_DATABASE, parts[0], parts[1]]
    if len(parts) != 3 or any(
        not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part) for part in parts
    ):
        raise RuntimeError("Nombre de tabla SQL no válido: " + str(name))
    return ".".join(q(part) for part in parts)


def _batch_table() -> str:
    return _qualified_table("dbo.ControlLotesVicidial", config.SQL_DATABASE)


def _detail_table() -> str:
    return _qualified_table("dbo.ControlLotesVicidialDetalle", config.SQL_DATABASE)


def _master_table() -> str:
    return _qualified_table(config.SQL_MASTER_TABLE, config.SQL_DATABASE)


def _call_table() -> str:
    return _qualified_table(config.SQL_CALL_REPORT_TABLE, config.SQL_DATABASE)


def _azul_table() -> str:
    return _qualified_table(config.AZUL_SNAPSHOT_TABLE, config.SQL_DATABASE)


def _sales_table() -> str:
    return _qualified_table(config.SQL_SALES_TABLE, config.SQL_SALES_DATABASE)


def _phone_expr(expression: str) -> str:
    cleaned = "COALESCE(CONVERT(varchar(80)," + expression + "),'')"
    for old in ["' '", "'-'", "'('", "')'", "'+'", "'.'", "'/'"]:
        cleaned = f"REPLACE({cleaned},{old},'')"
    return f"RIGHT({cleaned},10)"


def _date_text(value: Any) -> Optional[str]:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


def _number(value: Any) -> int:
    return int(value or 0)


def _percentage(numerator: float, denominator: float) -> float:
    return round((float(numerator) * 100.0 / float(denominator)), 2) if denominator else 0.0


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, float(value)))


def _percentile_values(items: Sequence[Dict[str, Any]], key: str) -> Dict[int, float]:
    ordered = sorted(
        ((float(item.get(key) or 0), int(item["batch_id"])) for item in items),
        key=lambda pair: (pair[0], pair[1]),
    )
    if not ordered:
        return {}
    if len(ordered) == 1:
        return {ordered[0][1]: 50.0}
    return {
        batch_id: round(index * 100.0 / (len(ordered) - 1), 2)
        for index, (_, batch_id) in enumerate(ordered)
    }


def score_rankings(
    rankings: List[Dict[str, Any]],
    target_quantity: int,
    cooldown_days: int,
    sources_stale: bool = False,
) -> List[Dict[str, Any]]:
    """Añade puntuación, riesgo y recomendación a métricas ya agregadas."""
    eligible_for_benchmark = [
        item for item in rankings if int(item.get("marked") or 0) >= 100
    ]
    conversion_percentiles = _percentile_values(
        eligible_for_benchmark or rankings, "conversion_pct"
    )
    contact_percentiles = _percentile_values(
        eligible_for_benchmark or rankings, "contact_pct"
    )
    median_conversion = (
        round(median([float(item["conversion_pct"]) for item in eligible_for_benchmark]), 2)
        if eligible_for_benchmark
        else 0.0
    )

    for item in rankings:
        coverage_pct = _percentage(item["eligible"], target_quantity)
        coverage_score = _clamp(coverage_pct)
        conversion_score = conversion_percentiles.get(int(item["batch_id"]), 35.0)
        contact_score = contact_percentiles.get(int(item["batch_id"]), 35.0)
        cooldown_score = _clamp(100.0 - float(item["recent_pct"]))
        saturation_score = _clamp(100.0 - float(item["three_plus_pct"]))
        overlap_penalty = min(20.0, float(item["overlap_pct"]) * 0.20)
        freshness_penalty = 10.0 if sources_stale else 0.0
        score = _clamp(
            coverage_score * 0.30
            + conversion_score * 0.25
            + contact_score * 0.20
            + cooldown_score * 0.15
            + saturation_score * 0.10
            - overlap_penalty
            - freshness_penalty
        )

        marked = int(item["marked"])
        if marked >= 1000 and not sources_stale:
            confidence = "ALTA"
        elif marked >= 500:
            confidence = "MEDIA"
        else:
            confidence = "BAJA"

        if item["eligible"] < target_quantity * 0.25:
            level = "NO_TOCAR"
            action = "Capacidad insuficiente"
        elif float(item["recent_pct"]) >= 70:
            level = "ESPERAR"
            action = f"Esperar el enfriamiento de {cooldown_days} días"
        elif score >= 75 and coverage_pct >= 100 and confidence != "BAJA":
            level = "ALTA"
            action = "Tocar ahora"
        elif score >= 50 or coverage_pct >= 50:
            level = "REVISAR"
            action = "Revisar antes de usar"
        else:
            level = "NO_TOCAR"
            action = "No tocar ahora"

        reasons = [
            f"Aporta {int(item['eligible']):,} teléfonos elegibles ({coverage_pct:.0f}% del objetivo).",
            f"{float(item['conversion_pct']):.2f}% de venta única frente a una mediana de {median_conversion:.2f}%.",
            f"{float(item['contact_pct']):.2f}% de contactabilidad y {float(item['overlap_pct']):.2f}% de solapamiento.",
        ]
        if float(item["recent_pct"]) > 0:
            reasons.append(
                f"{float(item['recent_pct']):.2f}% tuvo gestión dentro del enfriamiento configurado."
            )
        if sources_stale:
            reasons.append("Una o más fuentes están fuera del SLA de frescura.")

        item.update(
            {
                "coverage_pct": coverage_pct,
                "score": round(score, 1),
                "level": level,
                "action": action,
                "confidence": confidence,
                "reasons": reasons,
                "score_components": {
                    "coverage": round(coverage_score, 1),
                    "conversion": round(conversion_score, 1),
                    "contact": round(contact_score, 1),
                    "cooldown": round(cooldown_score, 1),
                    "low_saturation": round(saturation_score, 1),
                    "overlap_penalty": round(overlap_penalty, 1),
                    "freshness_penalty": round(freshness_penalty, 1),
                },
            }
        )

    return sorted(
        rankings,
        key=lambda item: (
            -float(item["score"]),
            -int(item["eligible"]),
            int(item["batch_id"]),
        ),
    )


def clear_lot_decision_cache() -> None:
    with _cache_lock:
        _cache.clear()
        _snapshot_memory.clear()


def invalidate_lot_decision_snapshots() -> None:
    """Marca las fotografías como vencidas después de modificar lotes."""
    clear_lot_decision_cache()
    with connection_scope() as connection:
        _ensure_snapshot_table(connection)
        connection.cursor().execute(
            f"""
UPDATE {_snapshot_table()}
SET RefreshedAt=DATEADD(day,-1,RefreshedAt);
"""
        )
        connection.commit()


def _cache_key(policy: str, target_quantity: int, cooldown_days: int, limit: int) -> str:
    return f"{policy}:{target_quantity}:{cooldown_days}:{limit}"


def _calculate_live_lot_decision_dashboard(
    policy: str = "LIBERADOS",
    target_quantity: int = 5000,
    cooldown_days: int = 15,
    limit: int = 65,
) -> Dict[str, Any]:
    policy = str(policy or "LIBERADOS").strip().upper()
    if policy not in {"LIBERADOS", "POLITICA"}:
        raise ValueError("La política debe ser LIBERADOS o POLITICA.")
    target_quantity = max(1, min(int(target_quantity or 5000), 50000))
    cooldown_days = max(1, min(int(cooldown_days or 15), 120))
    limit = max(1, min(int(limit or 65), 200))
    key = _cache_key(policy, target_quantity, cooldown_days, limit)

    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached["expires_at"] > time.monotonic():
            result = copy.deepcopy(cached["value"])
            result["cache_hit"] = True
            return result

    started = time.monotonic()
    batch_table = _batch_table()
    detail_table = _detail_table()
    master_table = _master_table()
    sales_table = _sales_table()
    call_table = _call_table()
    azul_table = _azul_table()
    sale_phone = _phone_expr("v.telefonoCliente")
    eligible_state = "p.EstadoRegistro='LIBERADO'" if policy == "LIBERADOS" else "1=1"
    eligible = (
        f"({eligible_state} AND p.EsValido=1 AND p.TienePendiente=0 "
        "AND p.EsVenta=0 AND p.EsDNC=0)"
    )

    with connection_scope() as connection:
        connection.timeout = 180
        cursor = connection.cursor()
        cursor.execute(
            f"""
SET NOCOUNT ON;
IF OBJECT_ID('tempdb..#DecisionPhone') IS NOT NULL DROP TABLE #DecisionPhone;

;WITH ControlRanked AS (
    SELECT d.TelefonoNormalizado,d.UltimoStatus,d.FechaUltimaLlamada,
           MAX(CASE WHEN d.EstadoRegistro='PENDIENTE' THEN 1 ELSE 0 END)
             OVER (PARTITION BY d.TelefonoNormalizado) TienePendiente,
           ROW_NUMBER() OVER (
             PARTITION BY d.TelefonoNormalizado
             ORDER BY d.FechaUltimaLlamada DESC,d.DetalleID DESC
           ) rn
    FROM {detail_table} d WITH (NOLOCK)
), ControlActual AS (
    SELECT TelefonoNormalizado,UltimoStatus,FechaUltimaLlamada,TienePendiente
    FROM ControlRanked WHERE rn=1
), PhoneLotCount AS (
    SELECT TelefonoNormalizado,COUNT(DISTINCT LoteID) LotCount
    FROM {detail_table} WITH (NOLOCK)
    GROUP BY TelefonoNormalizado
), ApprovedSales AS (
    SELECT {sale_phone} PhoneNormalized,TRY_CONVERT(datetime2(0),v.fecha) FechaVenta
    FROM {sales_table} v WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'APROB%'
)
SELECT
    b.LoteID,b.NombreLote,b.CampanaDestino,b.TipoExportacion,b.EstadoLote,
    b.FechaGeneracion,b.FechaRevision,b.CantidadExportada,
    d.DetalleID,d.TelefonoNormalizado,d.EstadoRegistro,
    ISNULL(d.TotalLlamadas,0) TotalLlamadas,d.UltimoStatus,
    d.FechaUltimaLlamada,
    ISNULL(pl.LotCount,1) LotCount,
    ISNULL(ca.TienePendiente,0) TienePendiente,
    CASE WHEN LEN(d.TelefonoNormalizado)=10
               AND d.TelefonoNormalizado NOT LIKE '%[^0-9]%'
         THEN 1 ELSE 0 END EsValido,
    MAX(CASE
        WHEN s.PhoneNormalized IS NOT NULL
          OR UPPER(COALESCE(NULLIF(LTRIM(RTRIM(ca.UltimoStatus)),''),
                            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),m.Status))),''),
                            '')) LIKE 'VESA%'
          OR UPPER(COALESCE(NULLIF(LTRIM(RTRIM(ca.UltimoStatus)),''),
                            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),m.Status))),''),
                            '')) IN ('VE','EVE','EVESA','SALE','VENTA')
        THEN 1 ELSE 0 END) EsVenta,
    MAX(CASE
        WHEN UPPER(COALESCE(NULLIF(LTRIM(RTRIM(ca.UltimoStatus)),''),
                            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),m.Status))),''),
                            '')) LIKE 'DNC%'
          OR UPPER(COALESCE(NULLIF(LTRIM(RTRIM(ca.UltimoStatus)),''),
                            NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),m.Status))),''),
                            '')) IN ('DNCC','DNCL')
          OR UPPER(COALESCE(CONVERT(nvarchar(500),m.StatusDetalle),'')) LIKE '%DO NOT CALL%'
          OR UPPER(COALESCE(CONVERT(nvarchar(500),m.StatusDetalle),'')) LIKE '%NO LLAMAR%'
        THEN 1 ELSE 0 END) EsDNC,
    CASE WHEN d.EstadoRegistro='MARCADO'
              AND NULLIF(LTRIM(RTRIM(COALESCE(d.UltimoStatus,''))),'') IS NOT NULL
              AND UPPER(COALESCE(d.UltimoStatus,'')) NOT IN
                  ('NA','AA','AB','ADC','DROP','PDROP','BDV','BZ','VM',
                   'VOICEMAIL','QUEUE','INCALL')
         THEN 1 ELSE 0 END EsContacto,
    CASE WHEN UPPER(COALESCE(d.UltimoStatus,'')) IN ('VLL','AGEND','VEPEND')
         THEN 1 ELSE 0 END EsOportunidad,
    CASE WHEN UPPER(COALESCE(d.UltimoStatus,'')) IN
                  ('AA','BDV','BZ','VM','VOICEMAIL')
         THEN 1 ELSE 0 END EsBuzon,
    MAX(COALESCE(d.FechaUltimaLlamada,ca.FechaUltimaLlamada,
                 m.LastInteractionDate,m.LastLocalCallTime,m.ModifyDate,m.EntryDate))
         FechaGestion
INTO #DecisionPhone
FROM {batch_table} b WITH (NOLOCK)
INNER JOIN {detail_table} d WITH (NOLOCK) ON d.LoteID=b.LoteID
LEFT JOIN PhoneLotCount pl ON pl.TelefonoNormalizado=d.TelefonoNormalizado
LEFT JOIN ControlActual ca ON ca.TelefonoNormalizado=d.TelefonoNormalizado
LEFT JOIN {master_table} m WITH (NOLOCK)
       ON m.PhoneNormalized=d.TelefonoNormalizado
LEFT JOIN ApprovedSales s
       ON s.PhoneNormalized=d.TelefonoNormalizado
GROUP BY
    b.LoteID,b.NombreLote,b.CampanaDestino,b.TipoExportacion,b.EstadoLote,
    b.FechaGeneracion,b.FechaRevision,b.CantidadExportada,
    d.DetalleID,d.TelefonoNormalizado,d.EstadoRegistro,
    d.TotalLlamadas,d.UltimoStatus,d.FechaUltimaLlamada,
    pl.LotCount,ca.TienePendiente;

CREATE CLUSTERED INDEX IX_DecisionPhone_LotPhone
ON #DecisionPhone(LoteID,TelefonoNormalizado);
CREATE INDEX IX_DecisionPhone_Phone ON #DecisionPhone(TelefonoNormalizado);
"""
        )

        ranking_rows = cursor.execute(
            f"""
;WITH WithMedian AS (
    SELECT p.*,
           PERCENTILE_CONT(0.5) WITHIN GROUP (
               ORDER BY DATEDIFF(day,p.FechaGestion,SYSDATETIME())
           ) OVER (PARTITION BY p.LoteID) MedianDays
    FROM #DecisionPhone p
)
SELECT TOP ({limit})
    p.LoteID,MAX(p.NombreLote),MAX(p.CampanaDestino),MAX(p.TipoExportacion),
    MAX(p.EstadoLote),MAX(p.FechaGeneracion),MAX(p.FechaRevision),
    MAX(p.CantidadExportada),COUNT_BIG(*),
    SUM(CASE WHEN p.EstadoRegistro='MARCADO' THEN CONVERT(bigint,1) ELSE 0 END),
    SUM(CASE WHEN p.EstadoRegistro='LIBERADO' THEN CONVERT(bigint,1) ELSE 0 END),
    SUM(CASE WHEN {eligible} THEN CONVERT(bigint,1) ELSE 0 END),
    SUM(CASE WHEN {eligible} AND p.LotCount=1 THEN CONVERT(bigint,1) ELSE 0 END),
    SUM(CASE WHEN {eligible} AND p.LotCount>1 THEN CONVERT(bigint,1) ELSE 0 END),
    SUM(CONVERT(bigint,p.EsVenta)),SUM(CONVERT(bigint,p.EsDNC)),
    SUM(CONVERT(bigint,p.EsContacto)),SUM(CONVERT(bigint,p.EsOportunidad)),
    SUM(CONVERT(bigint,p.EsBuzon)),SUM(CONVERT(bigint,p.TotalLlamadas)),
    SUM(CASE WHEN p.EstadoRegistro='MARCADO' AND p.TotalLlamadas>=3
             THEN CONVERT(bigint,1) ELSE 0 END),
    SUM(CASE WHEN {eligible} AND p.FechaGestion>=DATEADD(day,-?,SYSDATETIME())
             THEN CONVERT(bigint,1) ELSE 0 END),
    MAX(p.FechaGestion),MAX(p.MedianDays),
    SUM(CASE WHEN p.FechaGestion IS NOT NULL THEN CONVERT(bigint,1) ELSE 0 END)
FROM WithMedian p
GROUP BY p.LoteID
ORDER BY SUM(CASE WHEN {eligible} THEN CONVERT(bigint,1) ELSE 0 END) DESC;
""",
            cooldown_days,
        ).fetchall()

        portfolio = cursor.execute(
            f"""
SELECT
    COUNT(DISTINCT p.LoteID),
    COUNT(DISTINCT p.TelefonoNormalizado),
    COUNT(DISTINCT CASE WHEN {eligible} THEN p.TelefonoNormalizado END),
    COUNT(DISTINCT CASE WHEN {eligible} AND p.LotCount=1
                        THEN p.TelefonoNormalizado END),
    COUNT(DISTINCT CASE WHEN {eligible} AND p.LotCount>1
                        THEN p.TelefonoNormalizado END),
    COUNT(DISTINCT CASE WHEN p.EsVenta=1 THEN p.TelefonoNormalizado END),
    COUNT(DISTINCT CASE WHEN p.EsDNC=1 THEN p.TelefonoNormalizado END),
    COUNT(DISTINCT CASE WHEN p.EsOportunidad=1 AND {eligible}
                        THEN p.TelefonoNormalizado END)
FROM #DecisionPhone p;
"""
        ).fetchone()

        freshness = cursor.execute(
            f"""
SELECT
  (SELECT MAX(FechaRevision) FROM {batch_table} WITH (NOLOCK)),
  (SELECT MAX(COALESCE(TRY_CONVERT(datetime2(0),call_date,120),
                       TRY_CONVERT(datetime2(0),call_date)))
   FROM {call_table} WITH (NOLOCK)),
  (SELECT MAX(FechaImportacion) FROM {call_table} WITH (NOLOCK)),
  (SELECT MAX(fecha_replica) FROM {azul_table} WITH (NOLOCK)),
  (SELECT MAX(TRY_CONVERT(datetime2(0),fecha)) FROM {sales_table} WITH (NOLOCK));
"""
        ).fetchone()

    rankings: List[Dict[str, Any]] = []
    for row in ranking_rows:
        exported = _number(row[7])
        total = _number(row[8])
        marked = _number(row[9])
        released = _number(row[10])
        eligible_count = _number(row[11])
        exclusive = _number(row[12])
        shared = _number(row[13])
        sales = _number(row[14])
        dnc = _number(row[15])
        contacts = _number(row[16])
        opportunities = _number(row[17])
        voicemails = _number(row[18])
        interactions = _number(row[19])
        three_plus = _number(row[20])
        recent = _number(row[21])
        rankings.append(
            {
                "batch_id": _number(row[0]),
                "name": str(row[1] or f"Lote {row[0]}"),
                "campaign": str(row[2] or ""),
                "mode": str(row[3] or ""),
                "status": str(row[4] or ""),
                "generated_at": _date_text(row[5]),
                "reviewed_at": _date_text(row[6]),
                "exported": exported,
                "total": total,
                "marked": marked,
                "released": released,
                "eligible": eligible_count,
                "exclusive": exclusive,
                "shared": shared,
                "sales": sales,
                "dnc": dnc,
                "contacts": contacts,
                "opportunities": opportunities,
                "voicemails": voicemails,
                "interactions": interactions,
                "three_plus": three_plus,
                "recent": recent,
                "last_call_at": _date_text(row[22]),
                "median_days_since_call": round(float(row[23] or 0), 1),
                "records_with_activity": _number(row[24]),
                "activation_pct": _percentage(marked, total),
                "conversion_pct": _percentage(sales, marked),
                "contact_pct": _percentage(contacts, marked),
                "opportunity_pct": _percentage(opportunities, marked),
                "voicemail_pct": _percentage(voicemails, marked),
                "average_attempts": round(interactions / marked, 2) if marked else 0.0,
                "three_plus_pct": _percentage(three_plus, marked),
                "recent_pct": _percentage(recent, eligible_count),
                "overlap_pct": _percentage(shared, eligible_count),
                "activity_coverage_pct": _percentage(_number(row[24]), total),
            }
        )

    now = datetime.now()
    azul_replica = freshness[3] if freshness else None
    source_age_minutes = (
        max(0.0, (now - azul_replica).total_seconds() / 60.0)
        if azul_replica
        else None
    )
    sources_stale = source_age_minutes is None or source_age_minutes > 35
    rankings = score_rankings(
        rankings,
        target_quantity=target_quantity,
        cooldown_days=cooldown_days,
        sources_stale=sources_stale,
    )

    recommendation = rankings[0] if rankings else None
    result = {
        "updated_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "calculation_ms": round((time.monotonic() - started) * 1000),
        "cache_hit": False,
        "policy": policy,
        "target_quantity": target_quantity,
        "cooldown_days": cooldown_days,
        "summary": {
            "batches": _number(portfolio[0]) if portfolio else 0,
            "unique_phones": _number(portfolio[1]) if portfolio else 0,
            "eligible_unique": _number(portfolio[2]) if portfolio else 0,
            "exclusive_unique": _number(portfolio[3]) if portfolio else 0,
            "shared_unique": _number(portfolio[4]) if portfolio else 0,
            "sales_unique": _number(portfolio[5]) if portfolio else 0,
            "dnc_unique": _number(portfolio[6]) if portfolio else 0,
            "opportunities_unique": _number(portfolio[7]) if portfolio else 0,
            "high_priority": sum(1 for item in rankings if item["level"] == "ALTA"),
        },
        "source_freshness": {
            "last_batch_review": _date_text(freshness[0]) if freshness else None,
            "last_call_report": _date_text(freshness[1]) if freshness else None,
            "last_call_import": _date_text(freshness[2]) if freshness else None,
            "last_azul_replica": _date_text(freshness[3]) if freshness else None,
            "last_sale": _date_text(freshness[4]) if freshness else None,
            "azul_age_minutes": round(source_age_minutes, 1)
            if source_age_minutes is not None
            else None,
            "stale": sources_stale,
        },
        "recommendation": recommendation,
        "rankings": rankings,
        "methodology": {
            "unit": "TELEFONO_NORMALIZADO_UNICO",
            "score": {
                "coverage": 30,
                "relative_conversion": 25,
                "contactability": 20,
                "cooldown": 15,
                "low_saturation": 10,
            },
            "policy_description": (
                "Solo registros liberados, excluyendo ventas, DNC y pendientes."
                if policy == "LIBERADOS"
                else "Todo teléfono reciclable por política, excluyendo ventas, DNC y pendientes."
            ),
        },
    }
    with _cache_lock:
        _cache[key] = {
            "expires_at": time.monotonic() + _CACHE_SECONDS,
            "value": copy.deepcopy(result),
        }
    logger.info(
        "lot_decision_dashboard policy=%s target=%s lots=%s eligible=%s ms=%s",
        policy,
        target_quantity,
        len(rankings),
        result["summary"]["eligible_unique"],
        result["calculation_ms"],
    )
    return result


def _snapshot_table() -> str:
    return _qualified_table("dbo.KpiLoteDecisionSnapshot", config.SQL_DATABASE)


def _ensure_snapshot_table(connection) -> None:
    table = _snapshot_table()
    connection.cursor().execute(
        f"""
IF OBJECT_ID(N'{config.SQL_DATABASE}.dbo.KpiLoteDecisionSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE {table}(
        PolicyCode VARCHAR(20) NOT NULL,
        CooldownDays INT NOT NULL,
        PayloadJSON NVARCHAR(MAX) NOT NULL,
        RefreshedAt DATETIME2(0) NOT NULL,
        CalculationMs INT NOT NULL,
        CONSTRAINT PK_KpiLoteDecisionSnapshot
            PRIMARY KEY(PolicyCode, CooldownDays)
    );
END;
"""
    )
    connection.commit()


def _load_persistent_snapshot(policy: str, cooldown_days: int) -> Optional[Dict[str, Any]]:
    memory_key = f"{policy}:{cooldown_days}"
    with _cache_lock:
        cached = _snapshot_memory.get(memory_key)
        if cached and cached["expires_at"] > time.monotonic():
            payload = copy.deepcopy(cached["value"])
            snapshot_meta = payload.setdefault("snapshot", {})
            refreshed_text = snapshot_meta.get("refreshed_at")
            if refreshed_text:
                refreshed_at = datetime.strptime(
                    refreshed_text, "%Y-%m-%d %H:%M:%S"
                )
                age_minutes = max(
                    0.0,
                    (datetime.now() - refreshed_at).total_seconds() / 60.0,
                )
                snapshot_meta["age_minutes"] = round(age_minutes, 1)
                snapshot_meta["stale"] = (
                    age_minutes > _SNAPSHOT_MAX_AGE_MINUTES
                )
            snapshot_meta["memory_cache_hit"] = True
            return payload

    with connection_scope() as connection:
        _ensure_snapshot_table(connection)
        row = connection.cursor().execute(
            f"""
SELECT PayloadJSON,RefreshedAt,CalculationMs
FROM {_snapshot_table()} WITH (NOLOCK)
WHERE PolicyCode=? AND CooldownDays=?;
""",
            policy,
            cooldown_days,
        ).fetchone()
    if not row:
        return None
    payload = json.loads(str(row[0]))
    refreshed_at = row[1]
    age_minutes = max(
        0.0, (datetime.now() - refreshed_at).total_seconds() / 60.0
    )
    payload["snapshot"] = {
        "refreshed_at": _date_text(refreshed_at),
        "age_minutes": round(age_minutes, 1),
        "stale": age_minutes > _SNAPSHOT_MAX_AGE_MINUTES,
        "calculation_ms": _number(row[2]),
        "memory_cache_hit": False,
    }
    with _cache_lock:
        _snapshot_memory[memory_key] = {
            "expires_at": time.monotonic() + _SNAPSHOT_MEMORY_SECONDS,
            "value": copy.deepcopy(payload),
        }
    return payload


def _save_persistent_snapshot(
    policy: str, cooldown_days: int, payload: Dict[str, Any]
) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    refreshed_at = datetime.now().replace(microsecond=0)
    with connection_scope() as connection:
        _ensure_snapshot_table(connection)
        cursor = connection.cursor()
        cursor.execute(
            f"""
UPDATE {_snapshot_table()} WITH (UPDLOCK,SERIALIZABLE)
SET PayloadJSON=?,RefreshedAt=?,CalculationMs=?
WHERE PolicyCode=? AND CooldownDays=?;
IF @@ROWCOUNT=0
    INSERT INTO {_snapshot_table()}
        (PolicyCode,CooldownDays,PayloadJSON,RefreshedAt,CalculationMs)
    VALUES (?,?,?,?,?);
""",
            serialized,
            refreshed_at,
            _number(payload.get("calculation_ms")),
            policy,
            cooldown_days,
            policy,
            cooldown_days,
            serialized,
            refreshed_at,
            _number(payload.get("calculation_ms")),
        )
        connection.commit()
    stored_payload = copy.deepcopy(payload)
    stored_payload["snapshot"] = {
        "refreshed_at": _date_text(refreshed_at),
        "age_minutes": 0.0,
        "stale": False,
        "calculation_ms": _number(payload.get("calculation_ms")),
        "memory_cache_hit": True,
    }
    with _cache_lock:
        _snapshot_memory[f"{policy}:{cooldown_days}"] = {
            "expires_at": time.monotonic() + _SNAPSHOT_MEMORY_SECONDS,
            "value": stored_payload,
        }


def warm_lot_decision_cache() -> Dict[str, bool]:
    """Precarga las fotografías existentes sin ejecutar el cálculo pesado."""
    warmed: Dict[str, bool] = {}
    for policy in ("LIBERADOS", "POLITICA"):
        key = f"{policy}:15"
        try:
            warmed[key] = _load_persistent_snapshot(policy, 15) is not None
        except Exception:
            logger.exception("No se pudo precargar la fotografía KPI %s", key)
            warmed[key] = False
    return warmed


def _refresh_snapshot(policy: str, cooldown_days: int) -> Dict[str, Any]:
    refresh_key = f"{policy}:{cooldown_days}"
    try:
        def calculate() -> Dict[str, Any]:
            clear_lot_decision_cache()
            return _calculate_live_lot_decision_dashboard(
                policy=policy,
                target_quantity=5000,
                cooldown_days=cooldown_days,
                limit=200,
            )

        result = run_serialized_kpi(
            f"lot-decision:{policy}:{cooldown_days}",
            calculate,
            attempts=2,
        )
        result.pop("snapshot", None)
        _save_persistent_snapshot(policy, cooldown_days, result)
        return result
    finally:
        with _snapshot_refresh_lock:
            _snapshot_refreshing.discard(refresh_key)


def _background_refresh_snapshot(policy: str, cooldown_days: int) -> None:
    try:
        _refresh_snapshot(policy, cooldown_days)
    except Exception:
        logger.exception(
            "No se pudo actualizar la recomendación de lotes policy=%s",
            policy,
        )


def _start_background_refresh(policy: str, cooldown_days: int) -> bool:
    refresh_key = f"{policy}:{cooldown_days}"
    with _snapshot_refresh_lock:
        if refresh_key in _snapshot_refreshing:
            return False
        _snapshot_refreshing.add(refresh_key)
    thread = threading.Thread(
        target=_background_refresh_snapshot,
        args=(policy, cooldown_days),
        name=f"kpi-lotes-{policy.lower()}-{cooldown_days}",
        daemon=True,
    )
    thread.start()
    return True


def _preparing_payload(
    policy: str,
    target_quantity: int,
    cooldown_days: int,
    started: float,
) -> Dict[str, Any]:
    return {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "preparing": True,
        "retry_after_seconds": 5,
        "policy": policy,
        "target_quantity": target_quantity,
        "cooldown_days": cooldown_days,
        "summary": {
            "batches": 0,
            "eligible_unique": 0,
            "high_priority": 0,
        },
        "source_freshness": {"stale": True},
        "recommendation": None,
        "rankings": [],
        "snapshot": {
            "building": True,
            "stale": True,
            "refreshed_at": None,
        },
        "response_ms": round((time.monotonic() - started) * 1000),
    }


def get_lot_decision_dashboard(
    policy: str = "LIBERADOS",
    target_quantity: int = 5000,
    cooldown_days: int = 15,
    limit: int = 65,
) -> Dict[str, Any]:
    """Lee una fotografía rápida y recalcula el score para el objetivo solicitado."""
    policy = str(policy or "LIBERADOS").strip().upper()
    if policy not in {"LIBERADOS", "POLITICA"}:
        raise ValueError("La política debe ser LIBERADOS o POLITICA.")
    target_quantity = max(1, min(int(target_quantity or 5000), 50000))
    cooldown_days = max(1, min(int(cooldown_days or 15), 120))
    limit = max(1, min(int(limit or 65), 200))
    started = time.monotonic()

    snapshot = _load_persistent_snapshot(policy, cooldown_days)
    if snapshot is None:
        _start_background_refresh(policy, cooldown_days)
        return _preparing_payload(
            policy,
            target_quantity,
            cooldown_days,
            started,
        )
    elif snapshot.get("snapshot", {}).get("stale"):
        _start_background_refresh(policy, cooldown_days)

    source_stale = bool(snapshot.get("source_freshness", {}).get("stale"))
    rankings = score_rankings(
        copy.deepcopy(snapshot.get("rankings") or []),
        target_quantity=target_quantity,
        cooldown_days=cooldown_days,
        sources_stale=source_stale,
    )[:limit]
    summary = copy.deepcopy(snapshot.get("summary") or {})
    summary["high_priority"] = sum(1 for item in rankings if item["level"] == "ALTA")
    snapshot.update(
        {
            "policy": policy,
            "target_quantity": target_quantity,
            "cooldown_days": cooldown_days,
            "summary": summary,
            "recommendation": rankings[0] if rankings else None,
            "rankings": rankings,
            "cache_hit": True,
            "response_ms": round((time.monotonic() - started) * 1000),
        }
    )
    return snapshot
