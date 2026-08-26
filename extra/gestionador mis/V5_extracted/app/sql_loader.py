# -*- coding: utf-8 -*-
import csv
import hashlib
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, Iterator, List, Optional, Tuple

import pandas as pd
import pyodbc

from app import config


def get_connection() -> pyodbc.Connection:
    trust = "yes" if config.SQL_TRUST_CERTIFICATE in ("yes", "true", "1", "si") else "no"
    connection_string = (
        "DRIVER={" + config.SQL_DRIVER + "};"
        "SERVER=" + str(config.SQL_SERVER) + ";"
        "DATABASE=" + str(config.SQL_DATABASE) + ";"
        "UID=" + str(config.SQL_USER) + ";"
        "PWD=" + str(config.SQL_PASSWORD) + ";"
        "Encrypt=yes;"
        "TrustServerCertificate=" + trust + ";"
    )
    return pyodbc.connect(connection_string, timeout=30)


@contextmanager
def connection_scope() -> Iterator[pyodbc.Connection]:
    """Entrega una conexión transaccional y garantiza su cierre físico.

    El context manager nativo de ``pyodbc`` confirma o revierte la
    transacción, pero no cierra la conexión. Esta envoltura evita sesiones
    dormidas que conserven bloqueos después de terminar una petición web.
    """
    connection = get_connection()
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def split_table_name(table_name: str) -> Tuple[str, str]:
    parts = table_name.replace("[", "").replace("]", "").split(".")
    if len(parts) == 1:
        return "dbo", parts[0]
    return parts[-2], parts[-1]


def q(identifier: str) -> str:
    return "[" + identifier.replace("]", "]]" ) + "]"


def sanitize_column(name: str, used: Dict[str, int]) -> str:
    clean = str(name).strip().replace("\ufeff", "")
    clean = re.sub(r"[^A-Za-z0-9_]+", "_", clean)
    clean = re.sub(r"_+", "_", clean).strip("_")
    if not clean:
        clean = "Columna"
    if clean[0].isdigit():
        clean = "C_" + clean
    clean = clean[:110]

    base = clean
    counter = used.get(base.lower(), 0)
    while clean.lower() in used:
        counter += 1
        clean = (base[:100] + "_" + str(counter))[:110]
    used[clean.lower()] = counter
    return clean


def detect_delimiter(file_path: Path) -> str:
    sample = file_path.read_text(encoding="utf-8-sig", errors="replace")[:10000]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
        return dialect.delimiter
    except csv.Error:
        return ","


def read_report(file_path: Path) -> pd.DataFrame:
    delimiter = detect_delimiter(file_path)
    frame = pd.read_csv(
        file_path,
        sep=delimiter,
        dtype=str,
        encoding="utf-8-sig",
        keep_default_na=False,
        na_filter=False,
        engine="python",
        on_bad_lines="warn",
    )

    if frame.empty and len(frame.columns) == 0:
        raise RuntimeError("El CSV no contiene columnas ni registros.")

    used: Dict[str, int] = {}
    frame.columns = [sanitize_column(column, used) for column in frame.columns]
    return frame


def ensure_tables(connection: pyodbc.Connection, frame: pd.DataFrame) -> None:
    schema, table = split_table_name(config.SQL_CALL_REPORT_TABLE)
    cursor = connection.cursor()

    # Los nombres de esquema no pueden enviarse como parametros ODBC.
    # Se validan como identificadores y luego se delimitan con corchetes.
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema):
        raise RuntimeError("Nombre de esquema SQL no valido: " + schema)

    cursor.execute(
        "IF SCHEMA_ID(?) IS NULL EXEC(N'CREATE SCHEMA " + q(schema) + "')",
        schema,
    )

    full_name = schema + "." + table
    create_sql = """
IF OBJECT_ID(?, 'U') IS NULL
BEGIN
    CREATE TABLE {schema_table} (
        [ImportID] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ImportBatchID] UNIQUEIDENTIFIER NOT NULL,
        [SourceFile] NVARCHAR(260) NOT NULL,
        [SourceRowHash] CHAR(64) NOT NULL,
        [FechaImportacion] DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()
    );
    CREATE UNIQUE INDEX {index_name}
        ON {schema_table}([SourceRowHash]);
END
""".format(
        schema_table=q(schema) + "." + q(table),
        index_name=q("UX_" + table + "_SourceRowHash"),
    )
    cursor.execute(create_sql, full_name)

    cursor.execute(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=?",
        schema,
        table,
    )
    existing = {row[0].lower() for row in cursor.fetchall()}

    for column in frame.columns:
        if column.lower() not in existing:
            cursor.execute(
                "ALTER TABLE " + q(schema) + "." + q(table) + " ADD " + q(column) + " NVARCHAR(MAX) NULL"
            )

    connection.commit()

def normalize_value(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value)
    if text == "" or text.lower() == "nan":
        return None
    return text


def row_hash(values: List[Optional[str]]) -> str:
    joined = "\x1f".join("" if value is None else value for value in values)
    return hashlib.sha256(joined.encode("utf-8", errors="replace")).hexdigest()


def _chunks(values: List[str], size: int = 900):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def import_report(connection: pyodbc.Connection, frame: pd.DataFrame, source_file: Path, batch_id: str) -> Tuple[int, int]:
    """Omite duplicados en Python antes de ejecutar los INSERT.

    El hash se calcula con las 58 columnas del CSV. Primero se eliminan
    duplicados dentro del mismo archivo y despues se consultan en SQL los
    hashes que ya existen. Solo los registros realmente nuevos se insertan.
    """
    schema, table = split_table_name(config.SQL_CALL_REPORT_TABLE)
    columns = list(frame.columns)

    prepared = []
    seen_in_file = set()
    duplicates_in_file = 0

    for raw_row in frame.itertuples(index=False, name=None):
        values = [normalize_value(value) for value in raw_row]
        digest = row_hash(values)
        if digest in seen_in_file:
            duplicates_in_file += 1
            continue
        seen_in_file.add(digest)
        prepared.append((digest, values))

    existing_hashes = set()
    cursor = connection.cursor()
    all_hashes = [digest for digest, _ in prepared]

    for hash_group in _chunks(all_hashes, 900):
        placeholders = ",".join(["?"] * len(hash_group))
        cursor.execute(
            "SELECT SourceRowHash FROM " + q(schema) + "." + q(table) +
            " WHERE SourceRowHash IN (" + placeholders + ")",
            hash_group,
        )
        existing_hashes.update(row[0] for row in cursor.fetchall())

    new_rows = []
    for digest, values in prepared:
        if digest not in existing_hashes:
            new_rows.append([batch_id, source_file.name, digest] + values)

    duplicates_existing = len(prepared) - len(new_rows)
    duplicates = duplicates_in_file + duplicates_existing

    if not new_rows:
        return 0, duplicates

    insert_columns = ["ImportBatchID", "SourceFile", "SourceRowHash"] + columns
    placeholders = ",".join(["?"] * len(insert_columns))
    sql = (
        "INSERT INTO " + q(schema) + "." + q(table) + " (" +
        ",".join(q(column) for column in insert_columns) + ") VALUES (" +
        placeholders + ")"
    )

    cursor.fast_executemany = True
    cursor.executemany(sql, new_rows)
    connection.commit()
    return len(new_rows), duplicates


def create_comparison_view(connection: pyodbc.Connection, frame: pd.DataFrame) -> Optional[str]:
    lead_candidates = ["LeadID", "lead_id", "leadid"]
    report_lead_column = None
    lower_map = {column.lower(): column for column in frame.columns}
    for candidate in lead_candidates:
        if candidate.lower() in lower_map:
            report_lead_column = lower_map[candidate.lower()]
            break

    if report_lead_column is None:
        return None

    report_schema, report_table = split_table_name(config.SQL_CALL_REPORT_TABLE)
    master_schema, master_table = split_table_name(config.SQL_MASTER_TABLE)
    view_name = "vw_Vicidial_Call_Report_Comparacion"

    sql = (
        "CREATE OR ALTER VIEW dbo." + q(view_name) + " AS\n"
        "SELECT\n"
        "    cr.*,\n"
        "    CASE WHEN vl.LeadID IS NULL THEN 0 ELSE 1 END AS ExisteEnUniversoSQL,\n"
        "    vl.EntryDate AS LeadEntryDate,\n"
        "    vl.ModifyDate AS LeadModifyDate,\n"
        "    vl.Status AS LeadStatusActual,\n"
        "    vl.StatusDetalle AS LeadStatusDetalle,\n"
        "    vl.StatusFuente AS LeadStatusFuente,\n"
        "    vl.UserName AS LeadUsuarioActual,\n"
        "    vl.PhoneNumber AS LeadPhoneNumber,\n"
        "    vl.PhoneNormalized AS LeadPhoneNormalized,\n"
        "    vl.CampaignID AS LeadCampaignID,\n"
        "    vl.ListID AS LeadListID,\n"
        "    vl.ListName AS LeadListName\n"
        "FROM " + q(report_schema) + "." + q(report_table) + " cr\n"
        "LEFT JOIN " + q(master_schema) + "." + q(master_table) + " vl\n"
        "    ON TRY_CONVERT(BIGINT, cr." + q(report_lead_column) + ") = TRY_CONVERT(BIGINT, vl.LeadID);"
    )

    cursor = connection.cursor()
    cursor.execute(sql)
    connection.commit()
    return "dbo." + view_name
