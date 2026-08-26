# -*- coding: utf-8 -*-
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=True)


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
        value = value[1:-1]
    return value.strip()


def _csv_list(name: str, default: str):
    raw = _clean(os.getenv(name)) or default
    return [item.strip() for item in raw.split(",") if item.strip()]


VICIDIAL_BASE_URL = _clean(os.getenv("VICIDIAL_BASE_URL")) or "https://web21.rc9.com.mx"
VICIDIAL_USER = _clean(os.getenv("VICIDIAL_USER"))
VICIDIAL_PASSWORD = _clean(os.getenv("VICIDIAL_PASSWORD"))
VICIDIAL_CAMPAIGN = _clean(os.getenv("VICIDIAL_CAMPAIGN")) or "ARDABYTE"
VICIDIAL_CAMPAIGNS = _csv_list("VICIDIAL_CAMPAIGNS", VICIDIAL_CAMPAIGN)

SQL_SERVER = _clean(os.getenv("SQL_SERVER"))
SQL_DATABASE = _clean(os.getenv("SQL_DATABASE")) or "MIS_Ardaby"
SQL_USER = _clean(os.getenv("SQL_USER"))
SQL_PASSWORD = _clean(os.getenv("SQL_PASSWORD"))
SQL_DRIVER = _clean(os.getenv("SQL_DRIVER")) or "ODBC Driver 18 for SQL Server"
SQL_TRUST_CERTIFICATE = (_clean(os.getenv("SQL_TRUST_CERTIFICATE")) or "yes").lower()
SQL_MASTER_TABLE = _clean(os.getenv("SQL_MASTER_TABLE")) or "dbo.Vicidial_Leads_Completo"
SQL_CALL_REPORT_TABLE = _clean(os.getenv("SQL_CALL_REPORT_TABLE")) or "dbo.Vicidial_Call_Report"
DOWNLOAD_CHUNK_DAYS = int(_clean(os.getenv("DOWNLOAD_CHUNK_DAYS")) or "1")

SQL_SALES_DATABASE = _clean(os.getenv("SQL_SALES_DATABASE")) or "plata_prospectPRO"
SQL_SALES_TABLE = _clean(os.getenv("SQL_SALES_TABLE")) or "plata_prospectPRO.dbo.Ventas"
PHONE_MATCH_DAYS = max(0, int(_clean(os.getenv("PHONE_MATCH_DAYS")) or "7"))
APP_TIMEZONE = _clean(os.getenv("APP_TIMEZONE")) or "America/Mexico_City"
WEB_HOST = _clean(os.getenv("WEB_HOST")) or "0.0.0.0"
WEB_PORT = int(_clean(os.getenv("WEB_PORT")) or "8020")
REFRESH_OVERLAP_HOURS = max(0, int(_clean(os.getenv("REFRESH_OVERLAP_HOURS")) or "1"))
REFRESH_INITIAL_DAYS = max(0, int(_clean(os.getenv("REFRESH_INITIAL_DAYS")) or "30"))
AUTO_REFRESH_ENABLED = (_clean(os.getenv("AUTO_REFRESH_ENABLED")) or "true").lower() in {
    "1", "true", "yes", "on", "si", "sí",
}
AUTO_REFRESH_MINUTES = max(1, int(_clean(os.getenv("AUTO_REFRESH_MINUTES")) or "15"))
AUTO_REFRESH_START_HOUR = max(0, min(23, int(_clean(os.getenv("AUTO_REFRESH_START_HOUR")) or "10")))
AUTO_REFRESH_END_HOUR = max(
    AUTO_REFRESH_START_HOUR,
    min(23, int(_clean(os.getenv("AUTO_REFRESH_END_HOUR")) or "19")),
)
AZUL_SNAPSHOT_TABLE = _clean(os.getenv("AZUL_SNAPSHOT_TABLE")) or "AzulCC.vicidial_snapshot.vicidial_list"
AZUL_LISTS_TABLE = _clean(os.getenv("AZUL_LISTS_TABLE")) or "AzulCC.vicidial_snapshot.vicidial_lists"
AZUL_LINKED_SERVER = _clean(os.getenv("AZUL_LINKED_SERVER")) or "AZULCCSERVER"
AZUL_CAMPAIGN_ID = _clean(os.getenv("AZUL_CAMPAIGN_ID")) or "60035"
AZUL_LOOKBACK_DAYS = max(1, int(_clean(os.getenv("AZUL_LOOKBACK_DAYS")) or "31"))
LEGACY_REPORT_AUTO_ENABLED = (_clean(os.getenv("LEGACY_REPORT_AUTO_ENABLED")) or "false").lower() in {
    "1", "true", "yes", "on", "si", "sí",
}

DOWNLOAD_DIR = BASE_DIR / "downloads"
LOG_DIR = BASE_DIR / "logs"
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)


def validate_config() -> None:
    required = {
        "VICIDIAL_USER": VICIDIAL_USER,
        "VICIDIAL_PASSWORD": VICIDIAL_PASSWORD,
        "SQL_SERVER": SQL_SERVER,
        "SQL_USER": SQL_USER,
        "SQL_PASSWORD": SQL_PASSWORD,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise RuntimeError("Faltan variables en .env: " + ", ".join(missing))

# Control de lotes para carga manual en Vicidial
LEAD_EXPORT_MAX = max(1, int(_clean(os.getenv("LEAD_EXPORT_MAX")) or "50000"))
