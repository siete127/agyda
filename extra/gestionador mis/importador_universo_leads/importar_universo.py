# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import csv
import hashlib
import logging
import os
import re
import sys
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple
import xml.etree.ElementTree as ET

import pyodbc
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = BASE_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_DIR / f"import_universo_{datetime.now():%Y%m%d_%H%M%S}.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("importador_universo")

STAGE_TABLE = "dbo.Stg_Vicidial_Leads_Archivos"
CONTROL_TABLE = "dbo.Control_Importacion_Vicidial_Leads"

STAGE_COLUMNS = [
    "SourceFile", "SourceRow", "SourceRowHash", "LeadID", "EntryDate", "ModifyDate",
    "Status", "StatusDetalle", "StatusFuente", "UserName", "VendorLeadCode", "SourceID",
    "ListID", "PhoneCode", "PhoneNumber", "FirstName", "LastName", "State", "AltPhone",
    "Email", "Comments", "CalledCount", "LastLocalCallTime", "CampaignID", "ListName",
    "PhoneNormalized", "UltimoMesGestion"
]


def clean_text(value) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def digits(value) -> str:
    return re.sub(r"\D", "", clean_text(value) or "")


def normalize_phone(value) -> Optional[str]:
    d = digits(value)
    if not d:
        return None
    if len(d) > 10:
        d = d[-10:]
    return d if len(d) >= 8 else None


def parse_int(value) -> Optional[int]:
    text = clean_text(value)
    if not text:
        return None
    try:
        return int(float(text.replace(",", "")))
    except (ValueError, TypeError):
        return None


def parse_date(value) -> Optional[str]:
    text = clean_text(value)
    if not text:
        return None
    formats = (
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d",
        "%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y",
    )
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
    return None


def status_code(disposition: Optional[str]) -> Optional[str]:
    text = clean_text(disposition)
    if not text:
        return None
    code = re.split(r"\s+-\s+|\s+", text, maxsplit=1)[0].strip()
    return code[:50] if code else None


def normalize_campaign(value: Optional[str]) -> str:
    """Agrupa campañas vacías y familias 1006/1009 dentro de 60035."""
    campaign = clean_text(value)
    if not campaign or campaign.upper().startswith(("1006", "1009")):
        return "60035"
    return campaign


def infer_metadata(filename: str, default_year: int) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    lower = filename.lower()
    # Regla de negocio: los archivos sin campaña identificable pertenecen a 60035.
    campaign = "60035"
    match = re.search(r"(?<!\d)(1006|1009)(?!\d)", lower)
    if match:
        campaign = normalize_campaign(match.group(1))

    months = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    }
    month = next((n for name, n in months.items() if name in lower), None)
    entry_date = f"{default_year:04d}-{month:02d}-01 00:00:00" if month else None
    ultimo_mes = f"{default_year:04d}-{month:02d}" if month else None
    return campaign, entry_date, ultimo_mes


def stable_negative_lead_id(source_file: str, source_row: int, phone: Optional[str]) -> int:
    raw = f"{source_file}|{source_row}|{phone or ''}".encode("utf-8")
    number = int.from_bytes(hashlib.sha256(raw).digest()[:8], "big") & ((1 << 63) - 1)
    return -max(1, number)


def row_hash(values: Sequence[object]) -> str:
    canonical = "\x1f".join("" if v is None else str(v).strip() for v in values)
    return hashlib.sha256(canonical.encode("utf-8", errors="replace")).hexdigest()


def csv_rows(path: Path, default_year: int) -> Iterator[Dict[str, object]]:
    campaign_hint, entry_hint, month_hint = infer_metadata(path.name, default_year)
    with path.open("rb") as bf:
        sample = bf.read(65536)
    encoding = "utf-8-sig"
    try:
        sample.decode(encoding)
    except UnicodeDecodeError:
        encoding = "latin-1"
    text = sample.decode(encoding, errors="replace")
    try:
        dialect = csv.Sniffer().sniff(text[:5000], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    with path.open("r", encoding=encoding, errors="replace", newline="") as f:
        reader = csv.DictReader(f, dialect=dialect)
        for row_num, raw in enumerate(reader, start=2):
            phone = clean_text(raw.get("Numero Marcado")) or clean_text(raw.get("TEL CASA"))
            phone_norm = normalize_phone(phone)
            lead_id = parse_int(raw.get("Lead"))
            if lead_id is None:
                lead_id = stable_negative_lead_id(path.name, row_num, phone_norm)
            call_date = parse_date(raw.get("Fecha"))
            disposition = clean_text(raw.get("Disposicion"))
            list_id = clean_text(raw.get("Lista"))
            campaign = normalize_campaign(clean_text(raw.get("Campana")) or campaign_hint)
            called_count = parse_int(raw.get("Conteo Llamadas"))
            month = call_date[:7] if call_date else month_hint
            entry_date = call_date or entry_hint
            comments_parts = []
            for key in ("CENTRAL DE CREDITO", "CUENTA", "SALDO ACTUAL", "REFERENCIA", "ADICIONAL CASA"):
                val = clean_text(raw.get(key))
                if val:
                    comments_parts.append(f"{key}: {val}")
            values = {
                "SourceFile": path.name,
                "SourceRow": row_num,
                "LeadID": lead_id,
                "EntryDate": entry_date,
                "ModifyDate": call_date,
                "Status": status_code(disposition),
                "StatusDetalle": disposition,
                "StatusFuente": "CALL_REPORT_ARCHIVO",
                "UserName": clean_text(raw.get("Agente")),
                "VendorLeadCode": clean_text(raw.get("CENTRAL DE CREDITO")),
                "SourceID": clean_text(raw.get("CUENTA")),
                "ListID": list_id,
                "PhoneCode": "1" if phone_norm else None,
                "PhoneNumber": phone,
                "FirstName": clean_text(raw.get("NOMBRE")),
                "LastName": None,
                "State": clean_text(raw.get("Estado")),
                "AltPhone": clean_text(raw.get("CELULAR")) or clean_text(raw.get("TEL CASA")),
                "Email": clean_text(raw.get("CORREO")),
                "Comments": " | ".join(comments_parts) if comments_parts else None,
                "CalledCount": called_count,
                "LastLocalCallTime": call_date,
                "CampaignID": campaign,
                "ListName": list_id,
                "PhoneNormalized": phone_norm,
                "UltimoMesGestion": month,
            }
            values["SourceRowHash"] = row_hash([path.name, row_num] + [values[c] for c in STAGE_COLUMNS if c not in ("SourceFile", "SourceRow", "SourceRowHash")])
            yield values


NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
SUPPORTED_SOURCE_SUFFIXES = (".csv", ".txt", ".xlsx", ".xlsm", ".xls", ".xlsb")


class ImportCancelled(RuntimeError):
    pass


def _xlsx_shared_strings(z: zipfile.ZipFile) -> List[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    strings: List[str] = []
    with z.open("xl/sharedStrings.xml") as fh:
        for event, elem in ET.iterparse(fh, events=("end",)):
            if elem.tag == f"{{{NS_MAIN}}}si":
                strings.append("".join(t.text or "" for t in elem.iter(f"{{{NS_MAIN}}}t")))
                elem.clear()
    return strings


def _column_index(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref.upper())
    value = 0
    for ch in letters.group(0) if letters else "A":
        value = value * 26 + ord(ch) - 64
    return value - 1


def _xlsx_first_sheet_path(z: zipfile.ZipFile) -> str:
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.attrib["Id"]: r.attrib["Target"] for r in rels}
    first_sheet = wb.find(f"{{{NS_MAIN}}}sheets")[0]
    rid = first_sheet.attrib[f"{{{NS_REL}}}id"]
    sheet_target = relmap[rid].replace("\\", "/")
    if sheet_target.startswith("/"):
        return sheet_target.lstrip("/")
    if sheet_target.startswith("xl/"):
        return sheet_target
    return "xl/" + sheet_target


def _universe_record(
    raw: Dict[str, object],
    path: Path,
    row_num: int,
    campaign_hint: Optional[str],
    entry_hint: Optional[str],
    month_hint: Optional[str],
) -> Optional[Dict[str, object]]:
    phone = clean_text(raw.get("Numero Marcado")) or clean_text(raw.get("TEL CASA"))
    phone_norm = normalize_phone(phone)
    if not phone_norm:
        return None
    lead_id = parse_int(raw.get("Lead"))
    if lead_id is None:
        lead_id = stable_negative_lead_id(path.name, row_num, phone_norm)
    comments_parts = []
    adicional = clean_text(raw.get("ADICIONAL CASA"))
    if adicional:
        comments_parts.append(f"ADICIONAL CASA: {adicional}")
    record = {
        "SourceFile": path.name,
        "SourceRow": row_num,
        "LeadID": lead_id,
        "EntryDate": entry_hint,
        "ModifyDate": entry_hint,
        "Status": "NEW",
        "StatusDetalle": "Importado desde universo histórico",
        "StatusFuente": "UNIVERSO_EXCEL",
        "UserName": None,
        "VendorLeadCode": None,
        "SourceID": None,
        "ListID": clean_text(raw.get("Lista")),
        "PhoneCode": "1",
        "PhoneNumber": phone,
        "FirstName": clean_text(raw.get("NOMBRE")),
        "LastName": None,
        "State": clean_text(raw.get("Estado")),
        "AltPhone": clean_text(raw.get("TEL CASA")) if normalize_phone(raw.get("TEL CASA")) != phone_norm else None,
        "Email": clean_text(raw.get("CORREO")),
        "Comments": " | ".join(comments_parts) if comments_parts else None,
        "CalledCount": 0,
        "LastLocalCallTime": None,
        "CampaignID": normalize_campaign(clean_text(raw.get("Campana")) or campaign_hint),
        "ListName": clean_text(raw.get("Lista")) or path.stem,
        "PhoneNormalized": phone_norm,
        "UltimoMesGestion": month_hint,
    }
    record["SourceRowHash"] = row_hash(
        [path.name, row_num]
        + [record[c] for c in STAGE_COLUMNS if c not in ("SourceFile", "SourceRow", "SourceRowHash")]
    )
    return record


def xlsx_rows(path: Path, default_year: int) -> Iterator[Dict[str, object]]:
    campaign_hint, entry_hint, month_hint = infer_metadata(path.name, default_year)
    with zipfile.ZipFile(path) as z:
        shared = _xlsx_shared_strings(z)
        target = _xlsx_first_sheet_path(z)
        headers: List[str] = []
        with z.open(target) as fh:
            for event, elem in ET.iterparse(fh, events=("end",)):
                if elem.tag != f"{{{NS_MAIN}}}row":
                    continue
                row_num = int(elem.attrib.get("r", "0"))
                cells: Dict[int, str] = {}
                for cell in elem.findall(f"{{{NS_MAIN}}}c"):
                    idx = _column_index(cell.attrib.get("r", "A1"))
                    t = cell.attrib.get("t")
                    value = ""
                    if t == "inlineStr":
                        isel = cell.find(f"{{{NS_MAIN}}}is")
                        if isel is not None:
                            value = "".join(tt.text or "" for tt in isel.iter(f"{{{NS_MAIN}}}t"))
                    else:
                        vnode = cell.find(f"{{{NS_MAIN}}}v")
                        if vnode is not None and vnode.text is not None:
                            value = shared[int(vnode.text)] if t == "s" else vnode.text
                    cells[idx] = value
                max_idx = max(cells.keys(), default=-1)
                values = [cells.get(i, "") for i in range(max_idx + 1)]
                if not headers:
                    headers = [str(v).strip() for v in values]
                    elem.clear()
                    continue
                raw = {headers[i]: values[i] if i < len(values) else "" for i in range(len(headers))}
                record = _universe_record(raw, path, row_num, campaign_hint, entry_hint, month_hint)
                if record:
                    yield record
                elem.clear()


def legacy_excel_rows(path: Path, default_year: int) -> Iterator[Dict[str, object]]:
    """Lee formatos binarios de Excel (.xls y .xlsb)."""
    import pandas as pd

    campaign_hint, entry_hint, month_hint = infer_metadata(path.name, default_year)
    engine = "xlrd" if path.suffix.lower() == ".xls" else "pyxlsb"
    frame = pd.read_excel(path, sheet_name=0, dtype=object, engine=engine)
    headers = [str(value).strip() for value in frame.columns]
    for row_num, values in enumerate(frame.itertuples(index=False, name=None), start=2):
        raw = {
            headers[index]: None if pd.isna(value) else value
            for index, value in enumerate(values)
        }
        record = _universe_record(raw, path, row_num, campaign_hint, entry_hint, month_hint)
        if record:
            yield record


def connection_string() -> str:
    load_dotenv(BASE_DIR / ".env", override=True)
    driver = os.getenv("SQL_DRIVER", "ODBC Driver 18 for SQL Server")
    server = os.getenv("SQL_SERVER")
    database = os.getenv("SQL_DATABASE", "MIS_Ardaby")
    user = os.getenv("SQL_USER")
    password = os.getenv("SQL_PASSWORD")
    if not server:
        raise RuntimeError("Falta SQL_SERVER en .env")
    parts = [
        f"DRIVER={{{driver}}}", f"SERVER={server}", f"DATABASE={database}",
        "Encrypt=yes", "TrustServerCertificate=yes",
    ]
    if user:
        parts += [f"UID={user}", f"PWD={password or ''}"]
    else:
        parts += ["Trusted_Connection=yes"]
    return ";".join(parts) + ";"


def ensure_tables(conn: pyodbc.Connection) -> None:
    sql = f"""
IF OBJECT_ID('{STAGE_TABLE}', 'U') IS NULL
BEGIN
    CREATE TABLE {STAGE_TABLE}(
        StageID BIGINT IDENTITY(1,1) PRIMARY KEY,
        SourceFile NVARCHAR(260) NOT NULL,
        SourceRow INT NOT NULL,
        SourceRowHash CHAR(64) NOT NULL,
        LeadID BIGINT NULL,
        EntryDate DATETIME2(0) NULL,
        ModifyDate DATETIME2(0) NULL,
        Status NVARCHAR(50) NULL,
        StatusDetalle NVARCHAR(500) NULL,
        StatusFuente NVARCHAR(100) NULL,
        UserName NVARCHAR(100) NULL,
        VendorLeadCode NVARCHAR(100) NULL,
        SourceID NVARCHAR(100) NULL,
        ListID NVARCHAR(100) NULL,
        PhoneCode NVARCHAR(20) NULL,
        PhoneNumber NVARCHAR(50) NULL,
        FirstName NVARCHAR(255) NULL,
        LastName NVARCHAR(255) NULL,
        State NVARCHAR(255) NULL,
        AltPhone NVARCHAR(50) NULL,
        Email NVARCHAR(255) NULL,
        Comments NVARCHAR(MAX) NULL,
        CalledCount INT NULL,
        LastLocalCallTime DATETIME2(0) NULL,
        CampaignID NVARCHAR(100) NULL,
        ListName NVARCHAR(255) NULL,
        PhoneNormalized VARCHAR(20) NULL,
        UltimoMesGestion CHAR(7) NULL,
        FechaStage DATETIME2(0) NOT NULL CONSTRAINT DF_Stg_Leads_Fecha DEFAULT SYSDATETIME()
    );
    CREATE UNIQUE INDEX UX_Stg_Leads_RowHash ON {STAGE_TABLE}(SourceRowHash);
    CREATE INDEX IX_Stg_Leads_LeadID ON {STAGE_TABLE}(LeadID);
    CREATE INDEX IX_Stg_Leads_Phone ON {STAGE_TABLE}(PhoneNormalized);
END;
IF OBJECT_ID('{CONTROL_TABLE}', 'U') IS NULL
BEGIN
    CREATE TABLE {CONTROL_TABLE}(
        ControlID BIGINT IDENTITY(1,1) PRIMARY KEY,
        SourceFile NVARCHAR(260) NOT NULL,
        FechaInicio DATETIME2(0) NOT NULL DEFAULT SYSDATETIME(),
        FechaFin DATETIME2(0) NULL,
        FilasLeidas BIGINT NOT NULL DEFAULT 0,
        FilasStage BIGINT NOT NULL DEFAULT 0,
        Insertados BIGINT NOT NULL DEFAULT 0,
        Actualizados BIGINT NOT NULL DEFAULT 0,
        Estado VARCHAR(20) NOT NULL DEFAULT 'INICIADO',
        Mensaje NVARCHAR(2000) NULL
    );
END;
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = 'IX_Stg_Leads_SourceFileRow'
      AND object_id = OBJECT_ID('{STAGE_TABLE}')
)
BEGIN
    CREATE INDEX IX_Stg_Leads_SourceFileRow
        ON {STAGE_TABLE}(SourceFile, SourceRow)
        INCLUDE (SourceRowHash);
END;
"""
    conn.cursor().execute(sql)
    conn.commit()


def insert_stage(
    conn: pyodbc.Connection,
    records: Iterable[Dict[str, object]],
    batch_size: int = 1000,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Tuple[int, int]:
    cols = STAGE_COLUMNS
    placeholders = ",".join("?" for _ in cols)
    sql = f"""
INSERT INTO {STAGE_TABLE} ({','.join('[' + c + ']' for c in cols)})
SELECT {placeholders}
WHERE NOT EXISTS (
    SELECT 1 FROM {STAGE_TABLE}
    WHERE SourceRowHash = ? OR (SourceFile = ? AND SourceRow = ?)
)
"""
    cursor = conn.cursor()
    cursor.fast_executemany = True
    batch: List[Tuple[object, ...]] = []
    read = inserted = 0
    source_file: Optional[str] = None
    before_source_total = 0

    def refresh_inserted() -> None:
        nonlocal inserted
        if source_file is None:
            inserted = 0
            return
        current = int(cursor.execute(
            f"SELECT COUNT_BIG(*) FROM {STAGE_TABLE} WHERE SourceFile=?", source_file
        ).fetchval() or 0)
        inserted = current - before_source_total

    def check_cancelled() -> None:
        if cancel_check and cancel_check():
            refresh_inserted()
            if progress_callback:
                progress_callback(read, inserted)
            raise ImportCancelled("Importación detenida por el usuario.")

    for rec in records:
        if source_file is None:
            source_file = str(rec.get("SourceFile") or "")
            before_source_total = int(cursor.execute(
                f"SELECT COUNT_BIG(*) FROM {STAGE_TABLE} WHERE SourceFile=?", source_file
            ).fetchval() or 0)
        read += 1
        values = tuple(rec.get(c) for c in cols)
        batch.append(values + (
            rec.get("SourceRowHash"), rec.get("SourceFile"), rec.get("SourceRow")
        ))
        if len(batch) >= batch_size:
            check_cancelled()
            cursor.executemany(sql, batch)
            conn.commit()
            batch.clear()
            refresh_inserted()
            if progress_callback:
                progress_callback(read, inserted)
            if read % 5000 == 0:
                logger.info("Filas procesadas: %s", f"{read:,}")
            check_cancelled()
    if batch:
        check_cancelled()
        cursor.executemany(sql, batch)
        conn.commit()
    refresh_inserted()
    if progress_callback:
        progress_callback(read, inserted)
    check_cancelled()
    return read, inserted


def validate_table_name(value: str) -> str:
    """Allow only schema.table or table identifiers."""
    if not re.fullmatch(r"(?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*", value or ""):
        raise ValueError(f"Nombre de tabla no valido: {value!r}")
    return value


def prepare_source_snapshot(
    conn: pyodbc.Connection,
    source_files: Optional[Sequence[str]] = None,
) -> int:
    """
    Create one latest source row per LeadID.

    Every row without a real Vicidial LeadID receives a stable negative LeadID
    while parsing, so phone numbers are allowed to repeat across campaigns,
    lists and source files without collapsing the historical universe.
    """
    cursor = conn.cursor()
    selected_files = [str(value) for value in (source_files or []) if str(value)]
    file_clause = ""
    cursor.execute("IF OBJECT_ID('tempdb..#SelectedSourceFiles') IS NOT NULL DROP TABLE #SelectedSourceFiles;")
    if selected_files:
        cursor.execute("CREATE TABLE #SelectedSourceFiles (SourceFile NVARCHAR(260) PRIMARY KEY);")
        cursor.fast_executemany = True
        cursor.executemany(
            "INSERT INTO #SelectedSourceFiles(SourceFile) VALUES (?)",
            [(value,) for value in selected_files],
        )
        file_clause = " AND EXISTS (SELECT 1 FROM #SelectedSourceFiles sf WHERE sf.SourceFile=s.SourceFile)"
    cursor.execute("IF OBJECT_ID('tempdb..#SrcLatest') IS NOT NULL DROP TABLE #SrcLatest;")
    cursor.execute(f"""
;WITH Ranked AS (
    SELECT
        s.*,
        ROW_NUMBER() OVER (
            PARTITION BY s.LeadID
            ORDER BY ISNULL(s.ModifyDate, s.EntryDate) DESC, s.StageID DESC
        ) AS rn,
        MAX(ISNULL(s.CalledCount, 0)) OVER (
            PARTITION BY s.LeadID
        ) AS CalledCountMax,
        MAX(s.LastLocalCallTime) OVER (
            PARTITION BY s.LeadID
        ) AS LastCallMax
    FROM {STAGE_TABLE} AS s
    WHERE s.LeadID IS NOT NULL
      AND s.PhoneNormalized IS NOT NULL
      {file_clause}
)
SELECT *
INTO #SrcLatest
FROM Ranked
WHERE rn = 1;
""")
    cursor.execute("CREATE UNIQUE CLUSTERED INDEX IX_SrcLatest_LeadID ON #SrcLatest(LeadID);")
    return int(cursor.execute("SELECT COUNT_BIG(*) FROM #SrcLatest;").fetchval() or 0)


def update_insert_target(
    conn: pyodbc.Connection,
    target: str,
    source_files: Optional[Sequence[str]] = None,
) -> Tuple[int, int]:
    """Update existing LeadIDs and insert only LeadIDs not present in target."""
    target = validate_table_name(target)
    cursor = conn.cursor()
    try:
        source_rows = prepare_source_snapshot(conn, source_files)
        logger.info("Fuente consolidada desde staging: %s registros", f"{source_rows:,}")

        update_count = int(cursor.execute(f"""
SELECT COUNT_BIG(*)
FROM #SrcLatest AS S
INNER JOIN {target} AS T ON T.LeadID = S.LeadID;
""").fetchval() or 0)

        insert_count = int(cursor.execute(f"""
SELECT COUNT_BIG(*)
FROM #SrcLatest AS S
WHERE NOT EXISTS (
    SELECT 1 FROM {target} AS T WHERE T.LeadID = S.LeadID
);
""").fetchval() or 0)

        logger.info(
            "Plan destino | actualizar: %s | insertar: %s",
            f"{update_count:,}", f"{insert_count:,}",
        )

        cursor.execute(f"""
UPDATE T
SET
    T.ModifyDate = COALESCE(S.ModifyDate, T.ModifyDate),
    T.Status = COALESCE(S.Status, T.Status),
    T.StatusDetalle = COALESCE(S.StatusDetalle, T.StatusDetalle),
    T.StatusFuente = COALESCE(S.StatusFuente, T.StatusFuente),
    T.UserName = COALESCE(S.UserName, T.UserName),
    T.VendorLeadCode = COALESCE(S.VendorLeadCode, T.VendorLeadCode),
    T.SourceID = COALESCE(S.SourceID, T.SourceID),
    T.ListID = COALESCE(TRY_CONVERT(BIGINT, S.ListID), T.ListID),
    T.PhoneCode = COALESCE(S.PhoneCode, T.PhoneCode),
    T.PhoneNumber = COALESCE(S.PhoneNumber, T.PhoneNumber),
    T.FirstName = COALESCE(NULLIF(S.FirstName, ''), T.FirstName),
    T.LastName = COALESCE(NULLIF(S.LastName, ''), T.LastName),
    T.State = COALESCE(NULLIF(S.State, ''), T.State),
    T.AltPhone = COALESCE(NULLIF(S.AltPhone, ''), T.AltPhone),
    T.Email = COALESCE(NULLIF(S.Email, ''), T.Email),
    T.Comments = COALESCE(NULLIF(S.Comments, ''), T.Comments),
    T.CalledCount = CASE
        WHEN S.CalledCountMax > ISNULL(T.CalledCount, 0) THEN S.CalledCountMax
        ELSE T.CalledCount
    END,
    T.LastLocalCallTime = CASE
        WHEN T.LastLocalCallTime IS NULL OR S.LastCallMax > T.LastLocalCallTime THEN S.LastCallMax
        ELSE T.LastLocalCallTime
    END,
    T.EntryListID = COALESCE(TRY_CONVERT(BIGINT, S.ListID), T.EntryListID),
    T.CampaignID = COALESCE(S.CampaignID, T.CampaignID),
    T.ListName = COALESCE(NULLIF(S.ListName, ''), T.ListName),
    T.PhoneNormalized = COALESCE(S.PhoneNormalized, T.PhoneNormalized),
    T.UltimoMesGestion = COALESCE(S.UltimoMesGestion, T.UltimoMesGestion),
    T.FechaCargaSQL = SYSDATETIME()
FROM {target} AS T
INNER JOIN #SrcLatest AS S ON S.LeadID = T.LeadID;
""")

        cursor.execute(f"""
INSERT INTO {target} (
    LeadID, EntryDate, ModifyDate, Status, StatusDetalle, StatusFuente, UserName,
    VendorLeadCode, SourceID, ListID, GMTOffsetNow, CalledSinceLastReset,
    PhoneCode, PhoneNumber, Title, FirstName, MiddleInitial, LastName,
    Address1, Address2, Address3, City, State, Province, PostalCode, CountryCode,
    Gender, DateOfBirth, AltPhone, Email, SecurityPhrase, Comments, CalledCount,
    LastLocalCallTime, RankLead, Owner, EntryListID, CampaignID, ListName,
    ListDescription, ActiveList, PhoneNormalized, UltimoMesGestion, FechaCargaSQL
)
SELECT
    S.LeadID, S.EntryDate, S.ModifyDate, COALESCE(S.Status, 'NEW'),
    S.StatusDetalle, S.StatusFuente, S.UserName,
    S.VendorLeadCode, S.SourceID, TRY_CONVERT(BIGINT, S.ListID), NULL, NULL,
    S.PhoneCode, S.PhoneNumber, NULL, S.FirstName, NULL, S.LastName,
    NULL, NULL, NULL, NULL, S.State, NULL, NULL, 'MX',
    NULL, NULL, S.AltPhone, S.Email, NULL, S.Comments, S.CalledCountMax,
    S.LastCallMax, NULL, NULL, TRY_CONVERT(BIGINT, S.ListID), S.CampaignID,
    S.ListName, NULL, 1, S.PhoneNormalized, S.UltimoMesGestion, SYSDATETIME()
FROM #SrcLatest AS S
WHERE NOT EXISTS (
    SELECT 1 FROM {target} AS T WHERE T.LeadID = S.LeadID
);
""")
        conn.commit()
        return insert_count, update_count
    except Exception:
        conn.rollback()
        raise


def stage_statistics(conn: pyodbc.Connection, target: str) -> None:
    target = validate_table_name(target)
    cursor = conn.cursor()
    stage_rows = int(cursor.execute(f"SELECT COUNT_BIG(*) FROM {STAGE_TABLE};").fetchval() or 0)
    universe_rows = int(cursor.execute(f"SELECT COUNT_BIG(*) FROM {target};").fetchval() or 0)
    source_rows = prepare_source_snapshot(conn)
    existing = int(cursor.execute(f"""
SELECT COUNT_BIG(*) FROM #SrcLatest S
WHERE EXISTS (SELECT 1 FROM {target} T WHERE T.LeadID = S.LeadID);
""").fetchval() or 0)
    pending = source_rows - existing
    logger.info("ESTADISTICAS")
    logger.info("  Staging total........: %s", f"{stage_rows:,}")
    logger.info("  Fuente consolidada...: %s", f"{source_rows:,}")
    logger.info("  Universo actual......: %s", f"{universe_rows:,}")
    logger.info("  Coinciden por LeadID..: %s", f"{existing:,}")
    logger.info("  Pendientes insertar...: %s", f"{pending:,}")


def clear_stage(conn: pyodbc.Connection) -> None:
    conn.cursor().execute(f"TRUNCATE TABLE {STAGE_TABLE};")
    conn.commit()
    logger.info("Staging limpiado correctamente.")


def process_file(
    conn: pyodbc.Connection,
    path: Path,
    year: int,
    batch_size: int,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Tuple[int, int]:
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_SOURCE_SUFFIXES:
        raise ValueError(f"Formato no compatible: {suffix or 'sin extensión'}")
    logger.info("Procesando: %s", path.name)
    if suffix in (".csv", ".txt"):
        records = csv_rows(path, year)
    elif suffix in (".xlsx", ".xlsm"):
        records = xlsx_rows(path, year)
    else:
        records = legacy_excel_rows(path, year)
    return insert_stage(conn, records, batch_size, progress_callback, cancel_check)


def process_zip(
    conn: pyodbc.Connection,
    zip_path: Path,
    year: int,
    batch_size: int,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Tuple[int, int]:
    if not zip_path.exists():
        raise FileNotFoundError(zip_path)

    total_read = total_stage = 0
    with tempfile.TemporaryDirectory(prefix="universo_leads_") as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(zip_path) as z:
            for member in z.infolist():
                if cancel_check and cancel_check():
                    raise ImportCancelled("Importación detenida por el usuario.")
                if member.is_dir() or member.filename.startswith("__MACOSX/") or Path(member.filename).name.startswith("._"):
                    continue
                suffix = Path(member.filename).suffix.lower()
                if suffix not in SUPPORTED_SOURCE_SUFFIXES:
                    continue
                output = tmp_path / Path(member.filename).name
                with z.open(member) as src, output.open("wb") as dst:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        dst.write(chunk)
                def file_progress(file_read: int, file_staged: int) -> None:
                    if progress_callback:
                        progress_callback(total_read + file_read, total_stage + file_staged)

                read, staged = process_file(
                    conn, output, year, batch_size, file_progress, cancel_check
                )
                total_read += read
                total_stage += staged
                logger.info(
                    "%s | leidas: %s | nuevas staging: %s",
                    output.name, f"{read:,}", f"{staged:,}",
                )
    logger.info("TOTAL | leidas: %s | nuevas staging: %s", f"{total_read:,}", f"{total_stage:,}")
    return total_read, total_stage


def process_input(
    conn: pyodbc.Connection,
    path: Path,
    year: int,
    batch_size: int,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
) -> Tuple[int, int]:
    """Procesa un ZIP o un archivo individual compatible."""
    if path.suffix.lower() == ".zip":
        return process_zip(conn, path, year, batch_size, progress_callback, cancel_check)
    read, staged = process_file(
        conn, path, year, batch_size, progress_callback, cancel_check
    )
    logger.info("TOTAL | leidas: %s | nuevas staging: %s", f"{read:,}", f"{staged:,}")
    return read, staged


def input_source_files(path: Path) -> List[str]:
    if path.suffix.lower() != ".zip":
        return [path.name]
    with zipfile.ZipFile(path) as archive:
        return list(dict.fromkeys(
            Path(item.filename).name
            for item in archive.infolist()
            if not item.is_dir()
            and not item.filename.startswith("__MACOSX/")
            and not Path(item.filename).name.startswith("._")
            and Path(item.filename).suffix.lower() in SUPPORTED_SOURCE_SUFFIXES
        ))


def estimate_input_rows(path: Path) -> Optional[int]:
    """Estima filas de un archivo individual sin cargarlo en memoria."""
    suffix = path.suffix.lower()
    if suffix in (".csv", ".txt"):
        with path.open("rb") as handle:
            lines = sum(1 for _ in handle)
        return max(0, lines - 1)
    if suffix in (".xlsx", ".xlsm"):
        with zipfile.ZipFile(path) as archive:
            target = _xlsx_first_sheet_path(archive)
            with archive.open(target) as sheet:
                head = sheet.read(65536)
        match = re.search(br'<dimension[^>]+ref="[A-Z]+\d+:?[A-Z]*(\d+)"', head)
        return max(0, int(match.group(1)) - 1) if match else None
    if suffix == ".xls":
        import xlrd
        book = xlrd.open_workbook(path, on_demand=True)
        try:
            return max(0, book.sheet_by_index(0).nrows - 1)
        finally:
            book.release_resources()
    return None


def interactive_mode() -> str:
    print("\n===========================================")
    print(" IMPORTADOR UNIVERSO VICIDIAL V2")
    print("===========================================")
    print("1) Procesar ZIP + actualizar universo")
    print("2) Solo actualizar universo desde staging")
    print("3) Solo procesar ZIP hacia staging")
    print("4) Ver estadisticas")
    print("5) Limpiar staging")
    print("6) Salir")
    choice = input("Opcion: ").strip()
    return {
        "1": "full", "2": "target", "3": "stage",
        "4": "stats", "5": "clear-stage", "6": "exit",
    }.get(choice, "")


def main() -> int:
    parser = argparse.ArgumentParser(description="Importa archivos historicos a Vicidial_Leads_Completo")
    parser.add_argument("--zip", dest="zip_path", help="Ruta del ZIP con CSV/XLSX")
    parser.add_argument("--target", default="dbo.Vicidial_Leads_Completo")
    parser.add_argument("--year", type=int, default=2026, help="Ano para archivos que solo indican mes")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument(
        "--mode",
        choices=("full", "stage", "target", "stats", "clear-stage"),
        help="full=ZIP+destino, stage=solo ZIP, target=solo staging a destino",
    )
    # Backward-compatible option from v1.
    parser.add_argument("--solo-stage", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--no-files", action="store_true", help="No releer archivos; equivale a --mode target")
    args = parser.parse_args()

    mode = args.mode
    if args.solo_stage:
        mode = "stage"
    if args.no_files:
        mode = "target"
    if not mode:
        mode = interactive_mode()
    if mode == "exit":
        return 0
    if not mode:
        logger.error("Opcion no valida.")
        return 2

    if mode in ("full", "stage") and not args.zip_path:
        parser.error("--zip es obligatorio para los modos full y stage")

    conn = pyodbc.connect(connection_string(), autocommit=False)
    try:
        ensure_tables(conn)
        if mode == "clear-stage":
            clear_stage(conn)
            return 0
        if mode == "stats":
            stage_statistics(conn, args.target)
            return 0
        if mode in ("full", "stage"):
            process_zip(conn, Path(args.zip_path).expanduser().resolve(), args.year, args.batch_size)
        if mode in ("full", "target"):
            inserted, updated = update_insert_target(conn, args.target)
            logger.info(
                "DESTINO terminado | insertados: %s | actualizados: %s",
                f"{inserted:,}", f"{updated:,}",
            )
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
