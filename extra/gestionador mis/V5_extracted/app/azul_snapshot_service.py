# -*- coding: utf-8 -*-
import logging
import re
import threading
from typing import Any, Dict

from app import config
from app.dashboard_service import refresh_incremental
from app.sql_loader import connection_scope, q


logger = logging.getLogger(__name__)


def _qualified(name: str) -> str:
    parts = [part for part in str(name or "").replace("[", "").replace("]", "").split(".") if part]
    if len(parts) == 1:
        parts = [config.SQL_DATABASE, "dbo", parts[0]]
    elif len(parts) == 2:
        parts = [config.SQL_DATABASE, parts[0], parts[1]]
    if len(parts) != 3 or any(not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", part) for part in parts):
        raise RuntimeError("Nombre de tabla SQL no válido: " + str(name))
    return ".".join(q(part) for part in parts)


def _linked_server(name: str) -> str:
    value = str(name or "").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise RuntimeError("Nombre de Linked Server no válido: " + value)
    return q(value)


def _sync_azul_list_catalog(cursor) -> Dict[str, Any]:
    """Actualiza el catálogo local desde Vicidial sin borrar listas históricas."""
    target = _qualified(config.AZUL_LISTS_TABLE)
    linked_server = _linked_server(config.AZUL_LINKED_SERVER)
    cursor.execute(f"""
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF OBJECT_ID('tempdb..#AzulListCatalog') IS NOT NULL
    DROP TABLE #AzulListCatalog;

SELECT
    TRY_CONVERT(numeric(20,0),src.list_id) AS list_id,
    CONVERT(nvarchar(255),src.list_name) AS list_name,
    CONVERT(nvarchar(80),src.campaign_id) AS campaign_id,
    CONVERT(nvarchar(10),src.active) AS active,
    CONVERT(nvarchar(500),src.list_description) AS list_description,
    TRY_CONVERT(datetime2(0),src.list_changedate) AS list_changedate,
    TRY_CONVERT(datetime2(0),src.list_lastcalldate) AS list_lastcalldate,
    COALESCE(NULLIF(CONVERT(varchar(20),src.local_call_time),''),'campaign')
        AS local_call_time
INTO #AzulListCatalog
FROM OPENQUERY(
    {linked_server},
    'SELECT list_id,list_name,campaign_id,active,list_description,
            list_changedate,list_lastcalldate,local_call_time
     FROM asterisk.vicidial_lists'
) src
WHERE TRY_CONVERT(numeric(20,0),src.list_id) IS NOT NULL;

CREATE UNIQUE CLUSTERED INDEX IX_AzulListCatalog_ListID
ON #AzulListCatalog(list_id);

DECLARE @Updated int=0,@Inserted int=0;
UPDATE target
SET target.list_name=source.list_name,
    target.campaign_id=source.campaign_id,
    target.active=source.active,
    target.list_description=source.list_description,
    target.list_changedate=source.list_changedate,
    target.list_lastcalldate=source.list_lastcalldate,
    target.local_call_time=source.local_call_time
FROM {target} target
INNER JOIN #AzulListCatalog source ON source.list_id=target.list_id;
SET @Updated=@@ROWCOUNT;

INSERT INTO {target}(
    list_id,list_name,campaign_id,active,list_description,
    list_changedate,list_lastcalldate,local_call_time
)
SELECT
    source.list_id,source.list_name,source.campaign_id,source.active,
    source.list_description,source.list_changedate,source.list_lastcalldate,
    source.local_call_time
FROM #AzulListCatalog source
WHERE NOT EXISTS (
    SELECT 1 FROM {target} target WHERE target.list_id=source.list_id
);
SET @Inserted=@@ROWCOUNT;

SELECT
    CONVERT(bigint,COUNT_BIG(*)) AS SourceRows,
    @Updated AS UpdatedRows,
    @Inserted AS InsertedRows,
    MAX(list_changedate) AS LastChanged
FROM #AzulListCatalog;
""")
    row = cursor.fetchone()
    return {
        "status": "ACTUALIZADO",
        "source_rows": int(row[0] or 0),
        "updated": int(row[1] or 0),
        "inserted": int(row[2] or 0),
        "last_changed": (
            row[3].strftime("%Y-%m-%d %H:%M:%S")
            if row and row[3]
            else None
        ),
    }


def sync_azul_list_catalog() -> Dict[str, Any]:
    with connection_scope() as connection:
        connection.timeout = 60
        result = _sync_azul_list_catalog(connection.cursor())
        connection.commit()
        return result


def sync_azul_snapshot() -> Dict[str, Any]:
    source = _qualified(config.AZUL_SNAPSHOT_TABLE)
    list_catalog = _qualified(config.AZUL_LISTS_TABLE)
    target = _qualified(config.SQL_MASTER_TABLE)
    campaign = str(config.AZUL_CAMPAIGN_ID)
    campaign_literal = campaign.replace("'", "''")
    lookback = int(config.AZUL_LOOKBACK_DAYS)
    phone_expr = "RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(varchar(80),s.phone_number),''),' ',''),'-',''),'(',''),')',''),'+',''),'.',''),'/',''),10)"

    with connection_scope() as connection:
        connection.timeout = 300
        cursor = connection.cursor()
        try:
            catalog_result = _sync_azul_list_catalog(cursor)
        except Exception as exc:
            connection.rollback()
            logger.exception("azul_list_catalog_sync_failed")
            catalog_result = {
                "status": "CATALOGO_ANTERIOR",
                "error": str(exc)[:500],
            }
        cursor.execute(f"""
IF COL_LENGTH('{config.SQL_MASTER_TABLE}', 'FirstSeenDate') IS NULL
    ALTER TABLE {target} ADD FirstSeenDate DATETIME NULL;
IF COL_LENGTH('{config.SQL_MASTER_TABLE}', 'LastInteractionDate') IS NULL
    ALTER TABLE {target} ADD LastInteractionDate DATETIME NULL;
IF OBJECT_ID('tempdb..#AzulLatest') IS NOT NULL DROP TABLE #AzulLatest;

;WITH Base AS (
    SELECT s.*,vl.list_name AS SnapshotListName,
           vl.list_description AS SnapshotListDescription,
           vl.active AS SnapshotListActive,
           CONVERT(varchar(20),{phone_expr}) AS PhoneClean,
           adjusted.EffectiveLastCall,adjusted.EffectiveModifyDate,adjusted.EffectiveEntryDate,
           dates.InteractionDate
    FROM {source} s
    LEFT JOIN {list_catalog} vl WITH (NOLOCK)
      ON TRY_CONVERT(bigint,vl.list_id)=TRY_CONVERT(bigint,s.list_id)
    CROSS APPLY (VALUES (
        CASE WHEN s.last_local_call_time>DATEADD(hour,2,s.fecha_replica) THEN CONVERT(datetime2(0),s.fecha_replica) ELSE s.last_local_call_time END,
        CASE WHEN s.modify_date>DATEADD(hour,2,s.fecha_replica) THEN CONVERT(datetime2(0),s.fecha_replica) ELSE s.modify_date END,
        CASE WHEN s.entry_date>DATEADD(hour,2,s.fecha_replica) THEN CONVERT(datetime2(0),s.fecha_replica) ELSE s.entry_date END
    )) adjusted(EffectiveLastCall,EffectiveModifyDate,EffectiveEntryDate)
    CROSS APPLY (
        SELECT MAX(value) AS InteractionDate
        FROM (VALUES(adjusted.EffectiveLastCall),(adjusted.EffectiveModifyDate),(adjusted.EffectiveEntryDate)) d(value)
    ) dates
    WHERE (ISNULL(TRY_CONVERT(int,s.called_count),0)>0 OR s.last_local_call_time IS NOT NULL)
      AND dates.InteractionDate>=DATEADD(day,-{lookback},SYSDATETIME())
      AND (vl.list_id IS NULL OR CONVERT(nvarchar(80),vl.campaign_id)='{campaign_literal}')
), Ranked AS (
    SELECT b.*,
           ROW_NUMBER() OVER (PARTITION BY b.PhoneClean ORDER BY b.InteractionDate DESC,b.fecha_replica DESC,b.lead_id DESC) rn,
           MIN(COALESCE(b.EffectiveEntryDate,b.EffectiveModifyDate,b.EffectiveLastCall)) OVER (PARTITION BY b.PhoneClean) FirstSeenMin,
           MAX(ISNULL(TRY_CONVERT(int,b.called_count),0)) OVER (PARTITION BY b.PhoneClean) CalledCountMax,
           MAX(b.EffectiveLastCall) OVER (PARTITION BY b.PhoneClean) LastCallMax
    FROM Base b
    WHERE LEN(b.PhoneClean)=10 AND b.PhoneClean NOT LIKE '%[^0-9]%'
)
SELECT * INTO #AzulLatest FROM Ranked WHERE rn=1;
CREATE UNIQUE CLUSTERED INDEX IX_AzulLatest_Phone ON #AzulLatest(PhoneClean);
""")

        source_rows = int(cursor.execute("SELECT COUNT_BIG(*) FROM #AzulLatest").fetchval() or 0)
        update_count = int(cursor.execute(f"SELECT COUNT_BIG(*) FROM #AzulLatest s JOIN {target} t ON t.PhoneNormalized=s.PhoneClean").fetchval() or 0)
        insert_count = source_rows - update_count

        # Corrige registros sincronizados anteriormente con un ID de campaña
        # genérico. Cuando el catálogo ya conoce la lista, su nombre y campaña
        # son la fuente autoritativa.
        cursor.execute(f"""
UPDATE t SET
    CampaignID=CONVERT(nvarchar(80),vl.campaign_id),
    ListName=COALESCE(NULLIF(LTRIM(RTRIM(vl.list_name)),''),t.ListName),
    ListDescription=COALESCE(vl.list_description,t.ListDescription),
    ActiveList=COALESCE(NULLIF(vl.active,''),t.ActiveList)
FROM {target} t
INNER JOIN {list_catalog} vl WITH (NOLOCK)
  ON TRY_CONVERT(bigint,vl.list_id)=TRY_CONVERT(bigint,t.ListID)
WHERE t.StatusFuente='AZULCC_SQL';
""")

        cursor.execute(f"""
UPDATE t SET
    EntryDate=COALESCE(
        CASE WHEN t.StatusFuente='AZULCC_SQL'
                  AND s.FirstSeenMin IS NOT NULL
                  AND (t.EntryDate IS NULL OR s.FirstSeenMin<t.EntryDate)
             THEN s.FirstSeenMin END,
        t.EntryDate,s.EffectiveEntryDate,s.FirstSeenMin,s.InteractionDate
    ),
    ModifyDate=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(s.modify_date,s.InteractionDate) ELSE t.ModifyDate END,
    Status=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(s.status,t.Status) ELSE t.Status END,
    StatusDetalle=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN CONCAT('AzulCC SQL: ',COALESCE(s.status,'')) ELSE t.StatusDetalle END,
    StatusFuente=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN 'AZULCC_SQL' ELSE t.StatusFuente END,
    UserName=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(NULLIF(s.[user],''),t.UserName) ELSE t.UserName END,
    ListID=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(TRY_CONVERT(bigint,s.list_id),t.ListID) ELSE t.ListID END,
    EntryListID=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(TRY_CONVERT(bigint,s.entry_list_id),TRY_CONVERT(bigint,s.list_id),t.EntryListID) ELSE t.EntryListID END,
    CampaignID=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN ? ELSE t.CampaignID END,
    ListName=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(NULLIF(LTRIM(RTRIM(s.SnapshotListName)),''),CONVERT(nvarchar(255),s.list_id)) ELSE t.ListName END,
    ListDescription=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(s.SnapshotListDescription,t.ListDescription) ELSE t.ListDescription END,
    ActiveList=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(NULLIF(s.SnapshotListActive,''),t.ActiveList) ELSE t.ActiveList END,
    PhoneNumber=CASE WHEN s.InteractionDate>=COALESCE(t.LastInteractionDate,t.LastLocalCallTime,t.ModifyDate,t.EntryDate,'19000101') THEN COALESCE(s.phone_number,t.PhoneNumber) ELSE t.PhoneNumber END,
    FirstName=COALESCE(NULLIF(t.FirstName,''),NULLIF(s.first_name,'')),
    LastName=COALESCE(NULLIF(t.LastName,''),NULLIF(s.last_name,'')),
    State=COALESCE(NULLIF(t.State,''),NULLIF(s.state,'')),
    Email=COALESCE(NULLIF(t.Email,''),NULLIF(s.email,'')),
    AltPhone=COALESCE(NULLIF(t.AltPhone,''),NULLIF(s.alt_phone,'')),
    CalledCount=CASE WHEN s.CalledCountMax>ISNULL(t.CalledCount,0) THEN s.CalledCountMax ELSE t.CalledCount END,
    LastLocalCallTime=CASE WHEN t.LastLocalCallTime IS NULL OR s.LastCallMax>t.LastLocalCallTime THEN s.LastCallMax ELSE t.LastLocalCallTime END,
    UltimoMesGestion=CONVERT(char(7),CASE WHEN s.InteractionDate>COALESCE(t.LastInteractionDate,'19000101') THEN s.InteractionDate ELSE t.LastInteractionDate END,120),
    FirstSeenDate=CASE WHEN t.FirstSeenDate IS NULL OR s.FirstSeenMin<t.FirstSeenDate THEN s.FirstSeenMin ELSE t.FirstSeenDate END,
    LastInteractionDate=CASE WHEN t.LastInteractionDate IS NULL OR s.InteractionDate>t.LastInteractionDate THEN s.InteractionDate ELSE t.LastInteractionDate END,
    FechaCargaSQL=SYSDATETIME()
FROM {target} t JOIN #AzulLatest s ON t.PhoneNormalized=s.PhoneClean;
""", campaign)

        cursor.execute(f"""
INSERT INTO {target} (
    LeadID,EntryDate,ModifyDate,Status,StatusDetalle,StatusFuente,UserName,
    VendorLeadCode,SourceID,ListID,GMTOffsetNow,CalledSinceLastReset,PhoneCode,
    PhoneNumber,Title,FirstName,MiddleInitial,LastName,Address1,Address2,Address3,
    City,State,Province,PostalCode,CountryCode,Gender,DateOfBirth,AltPhone,Email,
    SecurityPhrase,Comments,CalledCount,LastLocalCallTime,RankLead,Owner,EntryListID,
    CampaignID,ListName,ListDescription,ActiveList,PhoneNormalized,UltimoMesGestion,
    FechaCargaSQL,FirstSeenDate,LastInteractionDate
)
SELECT
    -6003500000000000000-ABS(COALESCE(TRY_CONVERT(bigint,s.lead_id),CONVERT(bigint,CHECKSUM(s.PhoneClean)))),
    COALESCE(s.EffectiveEntryDate,s.FirstSeenMin,s.InteractionDate),
    COALESCE(s.modify_date,s.InteractionDate),COALESCE(s.status,'NEW'),
    CONCAT('AzulCC SQL: ',COALESCE(s.status,'')),'AZULCC_SQL',s.[user],
    s.vendor_lead_code,s.source_id,TRY_CONVERT(bigint,s.list_id),s.gmt_offset_now,
    s.called_since_last_reset,s.phone_code,s.phone_number,s.title,s.first_name,
    s.middle_initial,s.last_name,s.address1,s.address2,s.address3,s.city,s.state,
    s.province,s.postal_code,s.country_code,s.gender,s.date_of_birth,s.alt_phone,
    s.email,s.security_phrase,s.comments,s.CalledCountMax,s.LastCallMax,s.[rank],
    s.[owner],COALESCE(TRY_CONVERT(bigint,s.entry_list_id),TRY_CONVERT(bigint,s.list_id)),
    ?,COALESCE(NULLIF(LTRIM(RTRIM(s.SnapshotListName)),''),CONVERT(nvarchar(255),s.list_id)),
    s.SnapshotListDescription,COALESCE(NULLIF(s.SnapshotListActive,''),'N'),s.PhoneClean,
    CONVERT(char(7),s.InteractionDate,120),SYSDATETIME(),s.FirstSeenMin,s.InteractionDate
FROM #AzulLatest s
WHERE NOT EXISTS (SELECT 1 FROM {target} t WHERE t.PhoneNormalized=s.PhoneClean);
""", campaign)
        connection.commit()

        freshness = cursor.execute(
            "SELECT MAX(fecha_replica),MAX(LastCallMax) FROM #AzulLatest"
        ).fetchone()
        return {
            "source": "AZULCC_SQL",
            "campaign": campaign,
            "lookback_days": lookback,
            "source_phones": source_rows,
            "inserted": insert_count,
            "updated": update_count,
            "last_replica": freshness[0].strftime("%Y-%m-%d %H:%M:%S") if freshness and freshness[0] else None,
            "last_call": freshness[1].strftime("%Y-%m-%d %H:%M:%S") if freshness and freshness[1] else None,
            "list_catalog": catalog_result,
        }


class SourceRefreshService:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._legacy_report_enabled = bool(config.LEGACY_REPORT_AUTO_ENABLED)

    def status(self) -> Dict[str, Any]:
        with self._lock:
            enabled = self._legacy_report_enabled
        return {
            "sql_source": config.AZUL_SNAPSHOT_TABLE,
            "sql_campaign": config.AZUL_CAMPAIGN_ID,
            "legacy_report_auto_enabled": enabled,
        }

    def set_legacy_report_enabled(self, enabled: bool) -> Dict[str, Any]:
        with self._lock:
            self._legacy_report_enabled = bool(enabled)
        return self.status()

    def refresh_automatic(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"sql": sync_azul_snapshot(), "legacy_report": None}
        with self._lock:
            report_enabled = self._legacy_report_enabled
        if report_enabled:
            result["legacy_report"] = refresh_incremental()
        result["legacy_report_auto_enabled"] = report_enabled
        return result
