# -*- coding: utf-8 -*-
"""Priorización del universo por mes de EntryDate.

El desempeño se calcula por teléfono normalizado único dentro de la misma
ventana de Call Report y ventas. Los resultados pesados se persisten como JSON
y se sirven con estrategia stale-while-revalidate.
"""

import copy
import json
import logging
import threading
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from app import config
from app.kpi_refresh_coordinator import run_serialized_kpi
from app.lead_export_service import (
    _azul_table,
    _call_table,
    _detail_table,
    _master_table,
    _phone_expr,
    _qualified_table,
    _sales_table,
)
from app.sql_loader import connection_scope


logger = logging.getLogger(__name__)
_memory_lock = threading.Lock()
_memory_cache: Optional[Dict[str, Any]] = None
_memory_expires_at = 0.0
_refresh_lock = threading.Lock()
_refreshing = False
_refresh_pending = False
_MEMORY_SECONDS = 300
_MAX_AGE_MINUTES = 60
_CONTACT_STATUSES = (
    "CLIC",
    "NLISA",
    "NTINE",
    "VLL",
    "DUP",
    "CLIMO",
    "CNE",
    "NUMA",
    "NUMERQ",
    "AGEND",
    "NDE",
    "NCE",
    "REZDOM",
    "RERFC",
    "VESA",
)


def _snapshot_table() -> str:
    return _qualified_table(
        "dbo.KpiUniverseDecisionSnapshot", config.SQL_DATABASE
    )


def _ensure_snapshot_table(connection) -> None:
    connection.cursor().execute(
        f"""
IF OBJECT_ID(N'{config.SQL_DATABASE}.dbo.KpiUniverseDecisionSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE {_snapshot_table()}(
        SnapshotCode VARCHAR(30) NOT NULL
            CONSTRAINT PK_KpiUniverseDecisionSnapshot PRIMARY KEY,
        PayloadJSON NVARCHAR(MAX) NOT NULL,
        RefreshedAt DATETIME2(0) NOT NULL,
        CalculationMs INT NOT NULL
    );
END;
"""
    )
    connection.commit()


def _date_text(value: Any) -> Optional[str]:
    return value.strftime("%Y-%m-%d %H:%M:%S") if value else None


def _number(value: Any) -> int:
    return int(value or 0)


def _percentage(numerator: float, denominator: float) -> float:
    return (
        round(float(numerator) * 100.0 / float(denominator), 2)
        if denominator
        else 0.0
    )


def _entry_date_sql(alias: str = "m") -> str:
    """Conserva la cohorte original aunque la última gestión sea posterior."""
    return f"COALESCE({alias}.FirstSeenDate,{alias}.EntryDate)"


def _protected_sql(alias: str = "m") -> str:
    status = f"UPPER(COALESCE(CONVERT(nvarchar(80),{alias}.Status),''))"
    detail = (
        f"UPPER(COALESCE(CONVERT(nvarchar(500),{alias}.StatusDetalle),''))"
    )
    return f"""(
        {status} LIKE 'DNC%'
        OR {status} IN ('DNCC','DNCL','VE','EVE','EVESA','SALE','VENTA')
        OR {status} LIKE 'VESA%'
        OR {detail} LIKE '%DO NOT CALL%'
        OR {detail} LIKE '%NO LLAMAR%'
        OR {detail} LIKE '%VENTA EXITOSA%'
        OR {detail} LIKE '%APROBAD%'
    )"""


def _universe_rows(cursor) -> List[Any]:
    protected = _protected_sql("m")
    entry_date = _entry_date_sql("m")
    return cursor.execute(
        f"""
;WITH Base AS (
    SELECT
        CONVERT(char(7),{entry_date},120) EntryMonth,
        ISNULL(m.CalledCount,0) CalledCount,
        CASE WHEN {protected} THEN 1 ELSE 0 END Protected,
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(m.FirstName,''))),'') IS NOT NULL
             THEN 1 ELSE 0 END HasFirstName,
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(m.LastName,''))),'') IS NOT NULL
             THEN 1 ELSE 0 END HasLastName,
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(m.State,''))),'') IS NOT NULL
             THEN 1 ELSE 0 END HasState,
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(m.City,''))),'') IS NOT NULL
             THEN 1 ELSE 0 END HasCity,
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(m.PostalCode,''))),'') IS NOT NULL
             THEN 1 ELSE 0 END HasPostalCode,
        CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(m.Email,''))),'') IS NOT NULL
             THEN 1 ELSE 0 END HasEmail,
        COALESCE(m.LastInteractionDate,m.LastLocalCallTime,m.ModifyDate,m.EntryDate)
            LastActivity
    FROM {_master_table()} m WITH (NOLOCK)
    WHERE {entry_date} IS NOT NULL
      AND LEN(m.PhoneNormalized)=10
      AND m.PhoneNormalized NOT LIKE '%[^0-9]%'
)
SELECT EntryMonth,COUNT_BIG(*) Total,
       SUM(CASE WHEN CalledCount>0 THEN CONVERT(bigint,1) ELSE 0 END)
           HistoricalDialed,
       SUM(CASE WHEN Protected=0 THEN CONVERT(bigint,1) ELSE 0 END)
           EligibleByStatus,
       SUM(CASE WHEN Protected=0 AND CalledCount=0
                THEN CONVERT(bigint,1) ELSE 0 END) NeverDialedEligible,
       SUM(CONVERT(bigint,Protected)) Protected,
       SUM(CONVERT(bigint,HasFirstName+HasLastName+HasState+HasCity+
                          HasPostalCode+HasEmail)) CompletenessPoints,
       MAX(LastActivity) LastActivity
FROM Base
GROUP BY EntryMonth
ORDER BY EntryMonth DESC;
"""
    ).fetchall()


def _external_exclusions(cursor) -> List[Any]:
    sale_phone = _phone_expr("v.telefonoCliente")
    protected = _protected_sql("m")
    entry_date = _entry_date_sql("m")
    return cursor.execute(
        f"""
;WITH ExternalProtected AS (
    SELECT d.TelefonoNormalizado
    FROM {_detail_table()} d WITH (NOLOCK)
    WHERE d.EstadoRegistro='PENDIENTE'
    UNION
    SELECT DISTINCT {sale_phone}
    FROM {_sales_table()} v WITH (NOLOCK)
    WHERE UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'APROB%'
)
SELECT CONVERT(char(7),{entry_date},120) EntryMonth,
       COUNT_BIG(*) ExtraProtected,
       SUM(CASE WHEN ISNULL(m.CalledCount,0)=0
                THEN CONVERT(bigint,1) ELSE 0 END) ExtraProtectedNever
FROM ExternalProtected x
INNER JOIN {_master_table()} m WITH (NOLOCK)
    ON m.PhoneNormalized=x.TelefonoNormalizado
WHERE {entry_date} IS NOT NULL
  AND LEN(m.PhoneNormalized)=10
  AND m.PhoneNormalized NOT LIKE '%[^0-9]%'
  AND NOT {protected}
GROUP BY CONVERT(char(7),{entry_date},120);
"""
    ).fetchall()


def _call_source_cte() -> str:
    call_phone = _phone_expr(
        "COALESCE(NULLIF(cr.phone_number,''),cr.phone_number_dialed)"
    )
    call_dt = (
        "COALESCE(TRY_CONVERT(datetime2(0),cr.call_date,120),"
        "TRY_CONVERT(datetime2(0),cr.call_date,121),"
        "TRY_CONVERT(datetime2(0),cr.call_date))"
    )
    azul_phone = _phone_expr("az.phone_number")
    azul_dt = (
        "TRY_CONVERT(datetime2(0),CASE "
        "WHEN az.last_local_call_time>DATEADD(hour,2,az.fecha_replica) "
        "THEN az.fecha_replica ELSE az.last_local_call_time END)"
    )
    list_catalog = _qualified_table(
        config.AZUL_LISTS_TABLE, config.SQL_DATABASE
    )
    campaign = str(config.AZUL_CAMPAIGN_ID).replace("'", "''")
    lookback = int(config.AZUL_LOOKBACK_DAYS)
    return f"""
CallSource AS (
    SELECT {call_phone} PhoneNormalized,
           UPPER(LTRIM(RTRIM(COALESCE(cr.status,'')))) StatusCode,
           {call_dt} CallDateTime,
           LTRIM(RTRIM(CONVERT(nvarchar(80),cr.list_id))) ListID,
           NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255),cr.list_name))),'')
               ObservedListName,
           CONVERT(bigint,1) Dials
    FROM {_call_table()} cr WITH (NOLOCK)
    WHERE {call_dt} IS NOT NULL
      AND {call_dt}>=DATEADD(day,-{lookback},SYSDATETIME())

    UNION ALL

    SELECT {azul_phone},
           UPPER(LTRIM(RTRIM(COALESCE(az.status,'')))),
           {azul_dt},
           LTRIM(RTRIM(CONVERT(nvarchar(80),az.list_id))),
           COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255),vl.list_name))),''),
                    LTRIM(RTRIM(CONVERT(nvarchar(80),az.list_id)))),
           CONVERT(bigint,CASE
               WHEN ISNULL(TRY_CONVERT(int,az.called_count),0)>0
               THEN TRY_CONVERT(int,az.called_count) ELSE 1 END)
    FROM {_azul_table()} az WITH (NOLOCK)
    LEFT JOIN {list_catalog} vl WITH (NOLOCK)
      ON TRY_CONVERT(bigint,vl.list_id)=TRY_CONVERT(bigint,az.list_id)
    WHERE {azul_dt} IS NOT NULL
      AND (ISNULL(TRY_CONVERT(int,az.called_count),0)>0
           OR az.last_local_call_time IS NOT NULL)
      AND {azul_dt}>=DATEADD(day,-{lookback},SYSDATETIME())
      AND (vl.list_id IS NULL
           OR CONVERT(nvarchar(80),vl.campaign_id)='{campaign}')
)
"""


def _prepare_phone_performance(cursor) -> None:
    """Materializa una sola vez las llamadas usadas por meses y listas."""
    contacts = ",".join("'" + value + "'" for value in _CONTACT_STATUSES)
    cursor.execute(
        f"""
IF OBJECT_ID('tempdb..#UniversePhonePerformance') IS NOT NULL
    DROP TABLE #UniversePhonePerformance;

;WITH {_call_source_cte()}
SELECT PhoneNormalized,SUM(Dials) Dials,
       MAX(CASE WHEN StatusCode IN ({contacts}) THEN 1 ELSE 0 END)
           HasHumanContact,
       MAX(CASE WHEN StatusCode IN ('VLL','AGEND') THEN 1 ELSE 0 END)
           HasCallback,
       MIN(CallDateTime) FirstCall,
       MAX(CallDateTime) LastCall
INTO #UniversePhonePerformance
FROM CallSource
WHERE LEN(PhoneNormalized)=10
  AND PhoneNormalized NOT LIKE '%[^0-9]%'
GROUP BY PhoneNormalized;

CREATE UNIQUE CLUSTERED INDEX IX_UniversePhonePerformance_Phone
    ON #UniversePhonePerformance(PhoneNormalized);
"""
    )


def _call_rows(cursor) -> List[Any]:
    protected = _protected_sql("m")
    entry_date = _entry_date_sql("m")
    return cursor.execute(
        f"""
SELECT CONVERT(char(7),{entry_date},120) EntryMonth,
       COUNT_BIG(*) DialedPhones,
       SUM(CONVERT(bigint,p.HasHumanContact)) ContactedPhones,
       SUM(CONVERT(bigint,p.HasCallback)) CallbackPhones,
       SUM(p.Dials) TotalDials,
       SUM(CASE WHEN ISNULL(m.CalledCount,0)=0 AND NOT {protected}
                THEN CONVERT(bigint,1) ELSE 0 END) MissingFromMasterCount,
       MIN(p.FirstCall) WindowFrom,
       MAX(p.LastCall) WindowTo
FROM #UniversePhonePerformance p
INNER JOIN {_master_table()} m WITH (NOLOCK)
    ON m.PhoneNormalized=p.PhoneNormalized
WHERE {entry_date} IS NOT NULL
GROUP BY CONVERT(char(7),{entry_date},120)
ORDER BY EntryMonth DESC;
"""
    ).fetchall()


def _sale_rows(
    cursor, window_from: Optional[datetime], window_to: Optional[datetime]
) -> List[Any]:
    if not window_from or not window_to:
        return []
    sale_phone = _phone_expr("v.telefonoCliente")
    entry_date = _entry_date_sql("m")
    return cursor.execute(
        f"""
;WITH SalesRanked AS (
    SELECT {sale_phone} PhoneNormalized,
           UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) SaleStatus,
           ROW_NUMBER() OVER (
               PARTITION BY {sale_phone}
               ORDER BY TRY_CONVERT(datetime2(0),v.fecha) DESC,v.idVenta DESC
           ) rn
    FROM {_sales_table()} v WITH (NOLOCK)
    WHERE TRY_CONVERT(datetime2(0),v.fecha)>=?
      AND TRY_CONVERT(datetime2(0),v.fecha)<=?
      AND (
          UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'APROB%'
          OR UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'RECHAZ%'
      )
), LatestSale AS (
    SELECT PhoneNormalized,SaleStatus
    FROM SalesRanked WHERE rn=1
)
SELECT CONVERT(char(7),{entry_date},120) EntryMonth,
       SUM(CASE WHEN s.SaleStatus LIKE 'APROB%'
                THEN CONVERT(bigint,1) ELSE 0 END) ApprovedPhones,
       SUM(CASE WHEN s.SaleStatus LIKE 'RECHAZ%'
                THEN CONVERT(bigint,1) ELSE 0 END) RejectedPhones
FROM LatestSale s
INNER JOIN {_master_table()} m WITH (NOLOCK)
    ON m.PhoneNormalized=s.PhoneNormalized
WHERE {entry_date} IS NOT NULL
GROUP BY CONVERT(char(7),{entry_date},120);
""",
        window_from,
        window_to,
    ).fetchall()


def _list_rows(
    cursor, window_from: Optional[datetime], window_to: Optional[datetime]
) -> List[Any]:
    if not window_from or not window_to:
        return []
    list_catalog = _qualified_table(
        config.AZUL_LISTS_TABLE, config.SQL_DATABASE
    )
    sale_phone = _phone_expr("v.telefonoCliente")
    campaign = str(config.AZUL_CAMPAIGN_ID).replace("'", "''")
    entry_date = _entry_date_sql("m")
    return cursor.execute(
        f"""
;WITH CatalogRanked AS (
    SELECT CONVERT(nvarchar(80),vl.list_id) ListID,
           NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255),vl.list_name))),'')
               ListName,
           CONVERT(nvarchar(80),vl.campaign_id) CampaignID,
           ROW_NUMBER() OVER (
               PARTITION BY TRY_CONVERT(bigint,vl.list_id)
               ORDER BY TRY_CONVERT(datetime2(0),vl.list_changedate) DESC,
                        vl.list_id DESC
           ) rn
    FROM {list_catalog} vl WITH (NOLOCK)
    WHERE CONVERT(nvarchar(80),vl.campaign_id)='{campaign}'
), Catalog AS (
    SELECT ListID,ListName,CampaignID
    FROM CatalogRanked WHERE rn=1
), SalesRanked AS (
    SELECT {sale_phone} PhoneNormalized,
           UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) SaleStatus,
           ROW_NUMBER() OVER (
               PARTITION BY {sale_phone}
               ORDER BY TRY_CONVERT(datetime2(0),v.fecha) DESC,v.idVenta DESC
           ) rn
    FROM {_sales_table()} v WITH (NOLOCK)
    WHERE TRY_CONVERT(datetime2(0),v.fecha)>=?
      AND TRY_CONVERT(datetime2(0),v.fecha)<=?
      AND (
          UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'APROB%'
          OR UPPER(LTRIM(RTRIM(COALESCE(v.estatus,'')))) LIKE 'RECHAZ%'
      )
), LatestSale AS (
    SELECT PhoneNormalized,SaleStatus FROM SalesRanked WHERE rn=1
), PhoneFacts AS (
    SELECT CONVERT(char(7),{entry_date},120) EntryMonth,
           COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),m.ListID))),''),
                    'SIN LISTA') ListID,
           COALESCE(c.ListName,
                    NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255),m.ListName))),''),
                    CASE WHEN m.ListID IS NULL THEN 'Sin lista'
                         ELSE CONCAT('Lista ',CONVERT(nvarchar(80),m.ListID))
                    END) ListName,
           COALESCE(c.CampaignID,
                    NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80),m.CampaignID))),''),
                    '{campaign}') CampaignID,
           p.Dials,p.HasHumanContact,p.HasCallback,p.LastCall,
           s.SaleStatus
    FROM #UniversePhonePerformance p
    INNER JOIN {_master_table()} m WITH (NOLOCK)
      ON m.PhoneNormalized=p.PhoneNormalized
    LEFT JOIN Catalog c
      ON TRY_CONVERT(bigint,c.ListID)=TRY_CONVERT(bigint,m.ListID)
    LEFT JOIN LatestSale s ON s.PhoneNormalized=p.PhoneNormalized
    WHERE {entry_date} IS NOT NULL
      AND (
          CONVERT(nvarchar(80),m.CampaignID)='{campaign}'
          OR c.ListID IS NOT NULL
      )
)
SELECT EntryMonth,ListID,ListName,CampaignID,
       COUNT_BIG(*) DialedPhones,
       SUM(CONVERT(bigint,HasHumanContact)) ContactedPhones,
       SUM(CONVERT(bigint,HasCallback)) CallbackPhones,
       SUM(Dials) TotalDials,
       SUM(CASE WHEN SaleStatus LIKE 'APROB%'
                THEN CONVERT(bigint,1) ELSE 0 END) ApprovedPhones,
       SUM(CASE WHEN SaleStatus LIKE 'RECHAZ%'
                THEN CONVERT(bigint,1) ELSE 0 END) RejectedPhones,
       MAX(LastCall) LastCall
FROM PhoneFacts
GROUP BY EntryMonth,ListID,ListName,CampaignID
ORDER BY DialedPhones DESC;
""",
        window_from,
        window_to,
    ).fetchall()


def score_lists(lists: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    benchmark = [item for item in lists if item["dialed"] >= 100]
    max_contact = max(
        (float(item["contact_pct"]) for item in benchmark), default=1.0
    )
    max_sales = max(
        (float(item["approved_per_1000"]) for item in benchmark), default=1.0
    )
    for item in lists:
        dialed = int(item["dialed"])
        evidence = min(1.0, dialed / 1000.0)
        performance = (
            min(1.0, float(item["contact_pct"]) / max_contact) * 0.55
            + min(
                1.0, float(item["approved_per_1000"]) / max_sales
            )
            * 0.45
        )
        item["score"] = round(
            (performance * 0.80 + evidence * 0.20) * 100.0, 1
        )
        if dialed >= 1000:
            item["confidence"] = "ALTA"
        elif dialed >= 200:
            item["confidence"] = "MEDIA"
        else:
            item["confidence"] = "BAJA"
        item["level"] = (
            "ESCALAR"
            if item["score"] >= 75 and item["confidence"] != "BAJA"
            else "PILOTO"
            if item["confidence"] == "BAJA"
            else "REVISAR"
        )
    return sorted(
        lists,
        key=lambda item: (
            -float(item["score"]),
            -int(item["approved"]),
            -int(item["contacted"]),
            str(item["list_name"]),
        ),
    )


def score_entry_months(
    months: List[Dict[str, Any]], target_quantity: int = 5000
) -> List[Dict[str, Any]]:
    """Calcula un score explicable sin premiar muestras pequeñas."""
    target_quantity = max(100, min(int(target_quantity or 5000), 50000))
    benchmark = [item for item in months if item["dialed"] >= 200]
    max_contact = max(
        (float(item["contact_pct"]) for item in benchmark), default=1.0
    )
    max_sales = max(
        (float(item["approved_per_1000"]) for item in benchmark), default=1.0
    )

    for item in months:
        dialed = int(item["dialed"])
        coverage = float(item["sample_coverage_pct"])
        contact_signal = min(1.0, float(item["contact_pct"]) / max_contact)
        sale_signal = min(
            1.0, float(item["approved_per_1000"]) / max_sales
        )
        confidence_signal = min(1.0, dialed / 5000.0)
        coverage_signal = min(1.0, coverage / 5.0)
        evidence = confidence_signal * 0.60 + coverage_signal * 0.40
        capacity = min(1.0, int(item["eligible"]) / float(target_quantity))
        score = round(
            (
                (contact_signal * 0.50 + sale_signal * 0.50) * 0.65
                + evidence * 0.25
                + capacity * 0.10
            )
            * 100.0,
            1,
        )

        if dialed >= 5000:
            confidence = "ALTA"
        elif dialed >= 1000:
            confidence = "MEDIA"
        else:
            confidence = "BAJA"

        if dialed < 200 or coverage < 2.0:
            level = "PILOTO"
            action = "Probar con un lote pequeño"
        elif score >= 75 and confidence != "BAJA":
            level = "ESCALAR"
            action = "Prioridad alta para marcación"
        elif score >= 50:
            level = "RECICLAR"
            action = "Reciclar con control de saturación"
        else:
            level = "DEPRIORITAR"
            action = "Trabajar después de cohortes con mejor señal"

        reasons = [
            (
                f"{item['eligible']:,} teléfonos elegibles; "
                f"{item['never_dialed']:,} nunca marcados."
            ),
            (
                f"{item['contact_pct']:.2f}% de contacto y "
                f"{item['approved_per_1000']:.3f} aprobados por "
                "cada 1,000 teléfonos marcados."
            ),
            (
                f"La muestra cubre {coverage:.2f}% del universo del mes "
                f"con confianza {confidence.lower()}."
            ),
        ]
        if item["callbacks"]:
            reasons.append(
                f"Hay {item['callbacks']:,} callbacks que deben separarse "
                "antes de la marcación masiva."
            )
        item.update(
            {
                "score": score,
                "level": level,
                "action": action,
                "confidence": confidence,
                "coverage_target_pct": _percentage(
                    item["eligible"], target_quantity
                ),
                "reasons": reasons,
            }
        )

    return sorted(
        months,
        key=lambda item: (
            -float(item["score"]),
            -int(item["approved"]),
            -int(item["contacted"]),
            str(item["entry_month"]),
        ),
    )


def _calculate_snapshot() -> Dict[str, Any]:
    started = time.monotonic()
    with connection_scope() as connection:
        connection.timeout = 240
        cursor = connection.cursor()
        universe_rows = _universe_rows(cursor)
        exclusion_rows = _external_exclusions(cursor)
        _prepare_phone_performance(cursor)
        call_rows = _call_rows(cursor)
        window_from = min(
            (row[6] for row in call_rows if row[6] is not None), default=None
        )
        window_to = max(
            (row[7] for row in call_rows if row[7] is not None), default=None
        )
        sale_rows = _sale_rows(cursor, window_from, window_to)
        list_rows = _list_rows(cursor, window_from, window_to)

    months: Dict[str, Dict[str, Any]] = {}
    for row in universe_rows:
        total = _number(row[1])
        months[str(row[0])] = {
            "entry_month": str(row[0]),
            "universe": total,
            "historical_dialed": _number(row[2]),
            "eligible": _number(row[3]),
            "never_dialed": _number(row[4]),
            "protected": _number(row[5]),
            "data_completeness_pct": round(
                _number(row[6]) * 100.0 / (total * 6.0), 2
            )
            if total
            else 0.0,
            "last_activity": _date_text(row[7]),
            "dialed": 0,
            "contacted": 0,
            "callbacks": 0,
            "total_dials_window": 0,
            "approved": 0,
            "rejected": 0,
        }

    for row in exclusion_rows:
        item = months.get(str(row[0]))
        if item:
            extra = _number(row[1])
            extra_never = _number(row[2])
            item["eligible"] = max(0, item["eligible"] - extra)
            item["never_dialed"] = max(
                0, item["never_dialed"] - extra_never
            )
            item["protected"] += extra

    for row in call_rows:
        item = months.get(str(row[0]))
        if item:
            item.update(
                {
                    "dialed": _number(row[1]),
                    "contacted": _number(row[2]),
                    "callbacks": _number(row[3]),
                    "total_dials_window": _number(row[4]),
                }
            )
            item["never_dialed"] = max(
                0, item["never_dialed"] - _number(row[5])
            )

    for row in sale_rows:
        item = months.get(str(row[0]))
        if item:
            item["approved"] = _number(row[1])
            item["rejected"] = _number(row[2])

    month_items = list(months.values())
    for item in month_items:
        item.update(
            {
                "sample_coverage_pct": _percentage(
                    item["dialed"], item["universe"]
                ),
                "contact_pct": _percentage(
                    item["contacted"], item["dialed"]
                ),
                "approved_per_1000": round(
                    item["approved"] * 1000.0 / item["dialed"], 3
                )
                if item["dialed"]
                else 0.0,
                "approval_pct": _percentage(
                    item["approved"],
                    item["approved"] + item["rejected"],
                ),
                "attempts_per_dialed": round(
                    item["total_dials_window"] / item["dialed"], 2
                )
                if item["dialed"]
                else 0.0,
            }
        )

    ranked = score_entry_months(month_items, 5000)
    list_items: List[Dict[str, Any]] = []
    for row in list_rows:
        dialed = _number(row[4])
        contacted = _number(row[5])
        approved = _number(row[8])
        rejected = _number(row[9])
        list_items.append(
            {
                "entry_month": str(row[0] or ""),
                "list_id": str(row[1] or ""),
                "list_name": str(row[2] or row[1] or "SIN LISTA"),
                "campaign": str(row[3] or ""),
                "dialed": dialed,
                "contacted": contacted,
                "callbacks": _number(row[6]),
                "total_dials": _number(row[7]),
                "approved": approved,
                "rejected": rejected,
                "last_call": _date_text(row[10]),
                "contact_pct": _percentage(contacted, dialed),
                "approved_per_1000": round(
                    approved * 1000.0 / dialed, 3
                )
                if dialed
                else 0.0,
                "attempts_per_phone": round(
                    _number(row[7]) / dialed, 2
                )
                if dialed
                else 0.0,
            }
        )
    ranked_lists = score_lists(list_items)
    summary = {
        "universe": sum(item["universe"] for item in ranked),
        "eligible": sum(item["eligible"] for item in ranked),
        "never_dialed": sum(item["never_dialed"] for item in ranked),
        "dialed": sum(item["dialed"] for item in ranked),
        "contacted": sum(item["contacted"] for item in ranked),
        "approved": sum(item["approved"] for item in ranked),
        "callbacks": sum(item["callbacks"] for item in ranked),
    }
    summary["contact_pct"] = _percentage(
        summary["contacted"], summary["dialed"]
    )
    summary["approved_per_1000"] = (
        round(summary["approved"] * 1000.0 / summary["dialed"], 3)
        if summary["dialed"]
        else 0.0
    )
    return {
        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "calculation_ms": round((time.monotonic() - started) * 1000),
        "window": {
            "from": _date_text(window_from),
            "to": _date_text(window_to),
            "description": (
                "Call Report, AzulCC y ventas evaluados en la misma ventana."
            ),
        },
        "summary": summary,
        "recommendation": ranked[0] if ranked else None,
        "months": ranked,
        "list_recommendation": ranked_lists[0] if ranked_lists else None,
        "lists": ranked_lists[:100],
        "methodology": {
            "unit": "TELEFONO_NORMALIZADO_UNICO",
            "entry_month": "CONVERT(char(7),EntryDate,120)",
            "taxonomy_version": "CONTACTO_CONSERVADOR_V1",
            "contact_statuses": list(_CONTACT_STATUSES),
            "warning": (
                "Una tasa alta con baja cobertura se clasifica como piloto."
            ),
        },
    }


def _save_snapshot(payload: Dict[str, Any]) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    refreshed_at = datetime.now().replace(microsecond=0)
    with connection_scope() as connection:
        _ensure_snapshot_table(connection)
        connection.cursor().execute(
            f"""
UPDATE {_snapshot_table()} WITH (UPDLOCK,SERIALIZABLE)
SET PayloadJSON=?,RefreshedAt=?,CalculationMs=?
WHERE SnapshotCode='ENTRY_MONTH';
IF @@ROWCOUNT=0
    INSERT INTO {_snapshot_table()}
        (SnapshotCode,PayloadJSON,RefreshedAt,CalculationMs)
    VALUES ('ENTRY_MONTH',?,?,?);
""",
            serialized,
            refreshed_at,
            _number(payload.get("calculation_ms")),
            serialized,
            refreshed_at,
            _number(payload.get("calculation_ms")),
        )
        connection.commit()
    _store_memory(payload, refreshed_at, True)


def _store_memory(
    payload: Dict[str, Any], refreshed_at: datetime, cache_hit: bool
) -> Dict[str, Any]:
    global _memory_cache, _memory_expires_at
    value = copy.deepcopy(payload)
    age_minutes = max(
        0.0, (datetime.now() - refreshed_at).total_seconds() / 60.0
    )
    value["snapshot"] = {
        "refreshed_at": _date_text(refreshed_at),
        "age_minutes": round(age_minutes, 1),
        "stale": age_minutes > _MAX_AGE_MINUTES,
        "memory_cache_hit": cache_hit,
    }
    with _memory_lock:
        _memory_cache = copy.deepcopy(value)
        _memory_expires_at = time.monotonic() + _MEMORY_SECONDS
    return value


def _load_snapshot() -> Optional[Dict[str, Any]]:
    global _memory_cache
    with _memory_lock:
        if (
            _memory_cache is not None
            and _memory_expires_at > time.monotonic()
        ):
            value = copy.deepcopy(_memory_cache)
            refreshed_text = value.get("snapshot", {}).get("refreshed_at")
            if refreshed_text:
                refreshed_at = datetime.strptime(
                    refreshed_text, "%Y-%m-%d %H:%M:%S"
                )
                age_minutes = max(
                    0.0,
                    (datetime.now() - refreshed_at).total_seconds() / 60.0,
                )
                value["snapshot"]["age_minutes"] = round(age_minutes, 1)
                value["snapshot"]["stale"] = age_minutes > _MAX_AGE_MINUTES
                value["snapshot"]["memory_cache_hit"] = True
            return value

    with connection_scope() as connection:
        _ensure_snapshot_table(connection)
        row = connection.cursor().execute(
            f"""
SELECT PayloadJSON,RefreshedAt
FROM {_snapshot_table()} WITH (NOLOCK)
WHERE SnapshotCode='ENTRY_MONTH';
"""
        ).fetchone()
    if not row:
        return None
    return _store_memory(json.loads(str(row[0])), row[1], False)


def _refresh_worker() -> None:
    global _refreshing, _refresh_pending
    rerun = False
    try:
        payload = run_serialized_kpi(
            "universe-priority",
            _calculate_snapshot,
            attempts=2,
        )
        _save_snapshot(payload)
    except Exception:
        logger.exception("No se pudo actualizar el KPI del universo")
    finally:
        with _refresh_lock:
            _refreshing = False
            rerun = _refresh_pending
            _refresh_pending = False
    if rerun:
        _start_refresh()


def _start_refresh(queue_if_running: bool = False) -> bool:
    global _refreshing, _refresh_pending
    with _refresh_lock:
        if _refreshing:
            if queue_if_running:
                _refresh_pending = True
            return False
        _refreshing = True
    threading.Thread(
        target=_refresh_worker,
        name="kpi-universo-refresh",
        daemon=True,
    ).start()
    return True


def request_universe_priority_refresh() -> bool:
    """Invalida y programa una reconstrucción después de sincronizar fuentes."""
    invalidate_universe_priority_snapshot()
    return _start_refresh(queue_if_running=True)


def refresh_universe_priority_snapshot() -> Dict[str, Any]:
    """Actualización síncrona para tareas administrativas y primera semilla."""
    global _refreshing
    with _refresh_lock:
        if _refreshing:
            raise RuntimeError("El análisis del universo ya se está actualizando.")
        _refreshing = True
    try:
        payload = run_serialized_kpi(
            "universe-priority-admin",
            _calculate_snapshot,
            attempts=2,
        )
        _save_snapshot(payload)
        return payload
    finally:
        with _refresh_lock:
            _refreshing = False


def get_universe_priority_dashboard(
    target_quantity: int = 5000,
) -> Dict[str, Any]:
    target_quantity = max(100, min(int(target_quantity or 5000), 50000))
    started = time.monotonic()
    snapshot = _load_snapshot()
    if snapshot is None:
        _start_refresh()
        return {
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "preparing": True,
            "retry_after_seconds": 5,
            "target_quantity": target_quantity,
            "summary": {},
            "recommendation": None,
            "months": [],
            "list_recommendation": None,
            "lists": [],
            "snapshot": {
                "building": True,
                "stale": True,
                "refreshed_at": None,
            },
            "response_ms": round((time.monotonic() - started) * 1000),
        }
    elif snapshot.get("snapshot", {}).get("stale"):
        _start_refresh()

    months = score_entry_months(
        copy.deepcopy(snapshot.get("months") or []),
        target_quantity,
    )
    lists = score_lists(copy.deepcopy(snapshot.get("lists") or []))
    snapshot.update(
        {
            "target_quantity": target_quantity,
            "months": months,
            "recommendation": months[0] if months else None,
            "lists": lists,
            "list_recommendation": lists[0] if lists else None,
            "response_ms": round((time.monotonic() - started) * 1000),
        }
    )
    return snapshot


def warm_universe_priority_cache() -> bool:
    try:
        snapshot = _load_snapshot()
        if snapshot is None or snapshot.get("snapshot", {}).get("stale"):
            _start_refresh()
        return snapshot is not None
    except Exception:
        logger.exception("No se pudo precargar el KPI del universo")
        return False


def invalidate_universe_priority_snapshot() -> None:
    global _memory_cache, _memory_expires_at
    with _memory_lock:
        _memory_cache = None
        _memory_expires_at = 0.0
    with connection_scope() as connection:
        _ensure_snapshot_table(connection)
        connection.cursor().execute(
            f"""
UPDATE {_snapshot_table()}
SET RefreshedAt=DATEADD(day,-1,RefreshedAt)
WHERE SnapshotCode='ENTRY_MONTH';
"""
        )
        connection.commit()
