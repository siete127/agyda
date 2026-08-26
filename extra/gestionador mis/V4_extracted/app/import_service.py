# -*- coding: utf-8 -*-
import uuid
from datetime import date, datetime, timedelta
from typing import Dict, Iterable, List
from zoneinfo import ZoneInfo

from app import config
from app.downloader import NoCallData, download_call_report
from app.logger import build_logger
from app.sql_loader import create_comparison_view, ensure_tables, get_connection, import_report, read_report


def date_chunks(start_date: date, end_date: date, chunk_days: int) -> Iterable:
    current = start_date
    while current <= end_date:
        chunk_end = min(current + timedelta(days=chunk_days - 1), end_date)
        yield current, chunk_end
        current = chunk_end + timedelta(days=1)


def run_import(start_dt: datetime, end_dt: datetime, campaigns: List[str]) -> Dict[str, object]:
    config.validate_config()
    if start_dt > end_dt:
        raise ValueError("La fecha inicial no puede ser mayor que la fecha final")

    log_file = config.LOG_DIR / ("importador_" + datetime.now().strftime("%Y%m%d_%H%M%S") + ".log")
    logger = build_logger(log_file)
    logger.info("Inicio del proceso incremental")
    logger.info("Rango: %s a %s", start_dt, end_dt)
    logger.info("Campanas: %s", ", ".join(campaigns))

    total_read = 0
    total_inserted = 0
    total_duplicates = 0
    files = []

    with get_connection() as connection:
        for chunk_start, chunk_end in date_chunks(start_dt.date(), end_dt.date(), max(1, config.DOWNLOAD_CHUNK_DAYS)):
            start_hour = start_dt.hour if chunk_start == start_dt.date() else 0
            end_hour = end_dt.hour if chunk_end == end_dt.date() else 23
            file_name = "CallReport_{0}_{1}_{2}_{3}.csv".format(
                chunk_start.strftime("%Y%m%d"), str(start_hour).zfill(2),
                chunk_end.strftime("%Y%m%d"), str(end_hour).zfill(2),
            )
            output_file = config.DOWNLOAD_DIR / file_name
            logger.info("Descargando %s %02d:00 a %s %02d:59", chunk_start, start_hour, chunk_end, end_hour)
            try:
                download_call_report(chunk_start, chunk_end, start_hour, end_hour, campaigns, output_file)
            except NoCallData:
                logger.info(
                    "Sin llamadas salientes para %s %02d:00 a %s %02d:59; se continúa sin cambios.",
                    chunk_start, start_hour, chunk_end, end_hour,
                )
                continue
            frame = read_report(output_file)
            total_read += len(frame)
            ensure_tables(connection, frame)
            inserted, duplicates = import_report(connection, frame, output_file, str(uuid.uuid4()))
            total_inserted += inserted
            total_duplicates += duplicates
            create_comparison_view(connection, frame)
            files.append(str(output_file))
            logger.info("Leidos: %s | Insertados: %s | Duplicados: %s", len(frame), inserted, duplicates)

    return {
        "start": start_dt.isoformat(sep=" ", timespec="minutes"),
        "end": end_dt.isoformat(sep=" ", timespec="minutes"),
        "read": total_read,
        "inserted": total_inserted,
        "duplicates": total_duplicates,
        "files": files,
        "log_file": str(log_file),
    }


def now_local() -> datetime:
    return datetime.now(ZoneInfo(config.APP_TIMEZONE)).replace(tzinfo=None, second=0, microsecond=0)
