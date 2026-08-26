# -*- coding: utf-8 -*-
from datetime import date
from pathlib import Path
from typing import List

import requests

from app import config


class NoCallData(RuntimeError):
    """Vicidial respondió correctamente, pero no encontró llamadas en el rango."""


NO_DATA_MARKERS = (
    "there are no outbound calls during this time period",
    "no outbound calls found",
    "no calls found for these parameters",
)


def _looks_like_html(content: bytes, content_type: str) -> bool:
    prefix = content[:300].lower()
    return "text/html" in content_type.lower() or b"<html" in prefix or b"<!doctype html" in prefix


def _html_reports_no_data(text: str) -> bool:
    normalized = " ".join(str(text or "").lower().split())
    return any(marker in normalized for marker in NO_DATA_MARKERS)


def download_call_report(
    start_date: date,
    end_date: date,
    start_hour: int,
    end_hour: int,
    campaigns: List[str],
    output_file: Path,
    timeout_seconds: int = 600,
) -> Path:
    url = config.VICIDIAL_BASE_URL.rstrip("/") + "/vicidial/call_report_export.php"

    params = [
        ("DB", "0"),
        ("run_export", "1"),
        ("ivr_export", ""),
        ("query_date", start_date.isoformat()),
        ("query_hour", str(start_hour).zfill(2)),
        ("end_date", end_date.isoformat()),
        ("end_hour", str(end_hour).zfill(2)),
        ("user", ""),
        ("date_field", "call_date"),
        ("sort_dir", "asc"),
        ("header_row", "YES"),
        ("rec_fields", "NONE"),
        ("call_notes", "NO"),
        ("export_fields", "EXTENDED"),
    ]

    for campaign in campaigns:
        params.append(("campaign[]", campaign))

    params.extend([
        ("list_id[]", "---ALL---"),
        ("status[]", "---ALL---"),
        ("user_group[]", "---ALL---"),
        ("SUBMIT", "SUBMIT"),
    ])

    headers = {
        "Accept": "text/csv,text/plain,application/octet-stream,text/html;q=0.8,*/*;q=0.5",
        "Referer": url,
        "User-Agent": "Mozilla/5.0 ImportadorVicidial/1.1",
    }

    response = requests.get(
        url,
        params=params,
        headers=headers,
        auth=(config.VICIDIAL_USER, config.VICIDIAL_PASSWORD),
        timeout=timeout_seconds,
    )
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "")
    if _looks_like_html(response.content, content_type):
        if _html_reports_no_data(response.text):
            raise NoCallData("Vicidial no encontró llamadas salientes en el periodo consultado.")
        sample = response.text[:800].replace("\n", " ")
        raise RuntimeError(
            "Vicidial devolvio HTML en lugar del CSV. "
            "Verifica credenciales y permisos. Inicio de respuesta: " + sample
        )

    if not response.content.strip():
        raise RuntimeError("Vicidial devolvio un archivo vacio.")

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_bytes(response.content)
    return output_file
