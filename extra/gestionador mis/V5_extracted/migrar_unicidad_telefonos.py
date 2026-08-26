# -*- coding: utf-8 -*-
"""Consolida el maestro Vicidial a una fila global por teléfono normalizado."""
import argparse
import time

from app.sql_loader import get_connection


SOURCE = "dbo.Vicidial_Leads_Completo"
WORK = "dbo.Vicidial_Leads_Completo_Unique_Work"


def scalar(cursor, sql: str) -> int:
    return int(cursor.execute(sql).fetchval() or 0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", required=True)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if not args.execute:
        raise SystemExit("Usa --execute después de verificar el respaldo.")
    if not args.backup.startswith("dbo.Vicidial_Leads_Completo_Bak_"):
        raise SystemExit("Nombre de respaldo no permitido.")

    conn = get_connection()
    conn.timeout = 0
    cursor = conn.cursor()
    backup = scalar(cursor, f"SELECT COUNT_BIG(*) FROM {args.backup}")
    if backup <= 0:
        raise RuntimeError("El respaldo está vacío.")
    work_exists = cursor.execute("SELECT OBJECT_ID(?)", WORK).fetchval() is not None

    print(f"Respaldo fuente verificado: {backup:,} filas", flush=True)
    if not work_exists:
        print("Construyendo maestro global por teléfono...", flush=True)
        started = time.time()
        cursor.execute(f"""
;WITH Prepared AS (
    SELECT m.*, clean.PhoneNormalizedClean,
           dates.InteractionDate
    FROM {args.backup} AS m
    CROSS APPLY (VALUES (
        RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(varchar(80),m.PhoneNormalized),''),' ',''),'-',''),'(',''),')',''),'+',''),'.',''),'/',''),10),
        RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(CONVERT(varchar(80),m.PhoneNumber),''),' ',''),'-',''),'(',''),')',''),'+',''),'.',''),'/',''),10)
    )) raw(NormalizedRaw, NumberRaw)
    CROSS APPLY (VALUES (
        CONVERT(varchar(20), CASE
            WHEN LEN(raw.NormalizedRaw)=10 AND raw.NormalizedRaw NOT LIKE '%[^0-9]%' THEN raw.NormalizedRaw
            WHEN LEN(raw.NumberRaw)=10 AND raw.NumberRaw NOT LIKE '%[^0-9]%' THEN raw.NumberRaw
            ELSE NULL END)
    )) clean(PhoneNormalizedClean)
    CROSS APPLY (
        SELECT COALESCE(MAX(value),m.FechaCargaSQL) AS InteractionDate
        FROM (VALUES (m.LastLocalCallTime),(m.ModifyDate),(m.EntryDate)) d(value)
    ) dates
), Ranked AS (
    SELECT p.*,
        ROW_NUMBER() OVER (
            PARTITION BY p.PhoneNormalizedClean,
                         CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
            ORDER BY p.InteractionDate DESC, p.FechaCargaSQL DESC, p.LeadID DESC
        ) AS rn,
        MIN(COALESCE(p.EntryDate,p.ModifyDate,p.LastLocalCallTime,p.FechaCargaSQL)) OVER (
            PARTITION BY p.PhoneNormalizedClean,
                         CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS FirstSeenMin,
        MAX(p.InteractionDate) OVER (
            PARTITION BY p.PhoneNormalizedClean,
                         CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS InteractionMax,
        MAX(ISNULL(p.CalledCount,0)) OVER (
            PARTITION BY p.PhoneNormalizedClean,
                         CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS CalledCountMax,
        MAX(NULLIF(p.FirstName,'')) OVER (
            PARTITION BY p.PhoneNormalizedClean, CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS FirstNameAny,
        MAX(NULLIF(p.LastName,'')) OVER (
            PARTITION BY p.PhoneNormalizedClean, CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS LastNameAny,
        MAX(NULLIF(p.State,'')) OVER (
            PARTITION BY p.PhoneNormalizedClean, CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS StateAny,
        MAX(NULLIF(p.Email,'')) OVER (
            PARTITION BY p.PhoneNormalizedClean, CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS EmailAny,
        MAX(NULLIF(p.AltPhone,'')) OVER (
            PARTITION BY p.PhoneNormalizedClean, CASE WHEN p.PhoneNormalizedClean IS NULL THEN p.LeadID ELSE 0 END
        ) AS AltPhoneAny
    FROM Prepared p
)
SELECT
    LeadID, InteractionMax AS EntryDate, ModifyDate, Status, StatusDetalle,
    StatusFuente, UserName, VendorLeadCode, SourceID, ListID, GMTOffsetNow,
    CalledSinceLastReset, PhoneCode, PhoneNumber, Title,
    COALESCE(NULLIF(FirstName,''),FirstNameAny) AS FirstName,
    MiddleInitial, COALESCE(NULLIF(LastName,''),LastNameAny) AS LastName,
    Address1, Address2, Address3, City,
    COALESCE(NULLIF(State,''),StateAny) AS State,
    Province, PostalCode, CountryCode, Gender, DateOfBirth,
    COALESCE(NULLIF(AltPhone,''),AltPhoneAny) AS AltPhone,
    COALESCE(NULLIF(Email,''),EmailAny) AS Email,
    SecurityPhrase, Comments, CalledCountMax AS CalledCount,
    LastLocalCallTime, RankLead, Owner, EntryListID, CampaignID, ListName,
    ListDescription, ActiveList,
    CONVERT(varchar(20),PhoneNormalizedClean) AS PhoneNormalized,
    CONVERT(char(7),InteractionMax,120) AS UltimoMesGestion,
    FechaCargaSQL, FirstSeenMin AS FirstSeenDate,
    InteractionMax AS LastInteractionDate
INTO {WORK}
FROM Ranked
WHERE rn=1;
""")
        conn.commit()
        print(f"Tabla consolidada en {time.time()-started:.1f} s", flush=True)
    else:
        print(f"Reanudando desde la tabla de trabajo existente: {WORK}", flush=True)

    work_total = scalar(cursor, f"SELECT COUNT_BIG(*) FROM {WORK}")
    work_phones = scalar(cursor, f"SELECT COUNT_BIG(DISTINCT PhoneNormalized) FROM {WORK} WHERE PhoneNormalized IS NOT NULL")
    work_without_phone = scalar(cursor, f"SELECT COUNT_BIG(*) FROM {WORK} WHERE PhoneNormalized IS NULL")
    duplicates = scalar(cursor, f"SELECT COUNT_BIG(*) FROM (SELECT PhoneNormalized FROM {WORK} WHERE PhoneNormalized IS NOT NULL GROUP BY PhoneNormalized HAVING COUNT_BIG(*)>1) d")
    if duplicates or work_total != work_phones + work_without_phone:
        raise RuntimeError("La tabla consolidada no superó la validación de unicidad.")
    print(f"Validación: {work_total:,} filas, {work_phones:,} teléfonos únicos, {work_without_phone:,} sin teléfono utilizable", flush=True)

    print("Creando índices del maestro...", flush=True)
    cursor.execute(f"""
ALTER TABLE {WORK} ADD PRIMARY KEY CLUSTERED (LeadID);
CREATE UNIQUE INDEX UX_Vicidial_Leads_Completo_PhoneGlobal ON {WORK}(PhoneNormalized) WHERE PhoneNormalized IS NOT NULL;
CREATE INDEX IX_Vicidial_Leads_Completo_ListID_Global ON {WORK}(ListID);
CREATE INDEX IX_Vicidial_Leads_Completo_CampaignID_Global ON {WORK}(CampaignID);
CREATE INDEX IX_Vicidial_Leads_Completo_Status_Global ON {WORK}(Status);
CREATE INDEX IX_Vicidial_Leads_Completo_UltimoMes_Global ON {WORK}(UltimoMesGestion);
CREATE INDEX IX_Vicidial_Leads_Completo_FiltrosGlobal ON {WORK}(CampaignID,ListName,EntryDate)
    INCLUDE (PhoneNormalized,Status,CalledCount,State,LastInteractionDate);
""")
    conn.commit()

    print("Intercambiando tabla validada con la tabla activa...", flush=True)
    cursor.execute("BEGIN TRANSACTION;")
    try:
        cursor.execute(f"DROP TABLE {SOURCE};")
        cursor.execute("EXEC sp_rename 'dbo.Vicidial_Leads_Completo_Unique_Work', 'Vicidial_Leads_Completo';")
        cursor.execute("COMMIT TRANSACTION;")
    except Exception:
        cursor.execute("ROLLBACK TRANSACTION;")
        raise
    conn.commit()

    final_total = scalar(cursor, f"SELECT COUNT_BIG(*) FROM {SOURCE}")
    final_duplicates = scalar(cursor, f"SELECT COUNT_BIG(*) FROM (SELECT PhoneNormalized FROM {SOURCE} WHERE PhoneNormalized IS NOT NULL GROUP BY PhoneNormalized HAVING COUNT_BIG(*)>1) d")
    if final_total != work_total or final_duplicates:
        raise RuntimeError("La validación final posterior al intercambio falló.")
    print(f"MIGRACIÓN COMPLETADA: {final_total:,} registros globales únicos", flush=True)
    conn.close()


if __name__ == "__main__":
    main()
