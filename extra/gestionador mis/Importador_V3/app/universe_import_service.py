# -*- coding: utf-8 -*-
import logging
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

import pyodbc

import importar_universo as importer
from app import config


UPLOAD_DIR = config.DOWNLOAD_DIR / "universo_temporal"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = threading.Lock()
_run_lock = threading.Lock()
_latest_job_id: Optional[str] = None


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _public_job(job: Dict[str, Any]) -> Dict[str, Any]:
    return {
        key: value
        for key, value in job.items()
        if key not in {"file_path", "started_monotonic"}
    }


def reserve_job(filename: str, year: int, size: int = 0) -> Dict[str, Any]:
    global _latest_job_id
    if not _run_lock.acquire(blocking=False):
        raise RuntimeError("Ya hay una importación de universo en proceso.")

    job_id = str(uuid.uuid4())
    job = {
        "job_id": job_id,
        "filename": filename,
        "year": year,
        "size": size,
        "status": "SUBIENDO",
        "phase": "Recibiendo archivo",
        "created_at": _now(),
        "started_at": None,
        "finished_at": None,
        "read": 0,
        "total_rows": None,
        "staged": 0,
        "inserted": 0,
        "updated": 0,
        "progress_percent": 0,
        "rows_per_second": 0,
        "eta_seconds": None,
        "cancel_requested": False,
        "can_cancel": True,
        "logs": [],
        "error": None,
        "file_path": None,
    }
    with _jobs_lock:
        _jobs[job_id] = job
        _latest_job_id = job_id
    return _public_job(job)


def update_upload(job_id: str, file_path: Path, size: int) -> None:
    with _jobs_lock:
        job = _jobs[job_id]
        job["file_path"] = str(file_path)
        job["size"] = size
        job["phase"] = "Archivo recibido; preparando importación"


def fail_reserved_job(job_id: str, message: str) -> None:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job:
            job["status"] = "ERROR"
            job["phase"] = "No se pudo iniciar"
            job["error"] = message
            job["finished_at"] = _now()
    if _run_lock.locked():
        _run_lock.release()


class _JobLogHandler(logging.Handler):
    def __init__(self, job_id: str):
        super().__init__(logging.INFO)
        self.job_id = job_id

    def emit(self, record: logging.LogRecord) -> None:
        message = self.format(record)
        with _jobs_lock:
            job = _jobs.get(self.job_id)
            if not job:
                return
            job["logs"].append(message)
            job["logs"] = job["logs"][-120:]
            if "Procesando:" in message:
                job["phase"] = message.split("Procesando:", 1)[-1].strip()
            elif "Fuente consolidada" in message:
                job["phase"] = "Actualizando universo en SQL Server"


def start_job(job_id: str) -> None:
    thread = threading.Thread(target=_run_job, args=(job_id,), daemon=True)
    thread.start()


def request_cancel(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if not job:
            return None
        if job["status"] not in ("SUBIENDO", "PROCESANDO", "DETENIENDO"):
            return _public_job(job)
        if not job.get("can_cancel", True):
            return _public_job(job)
        job["cancel_requested"] = True
        job["status"] = "DETENIENDO"
        job["phase"] = "Deteniendo al terminar el bloque SQL actual"
        job["logs"].append(f"{datetime.now():%H:%M:%S} | Cancelación solicitada por el usuario")
        return _public_job(job)


def _cancel_requested(job_id: str) -> bool:
    with _jobs_lock:
        return bool(_jobs.get(job_id, {}).get("cancel_requested"))


def _run_job(job_id: str) -> None:
    handler = _JobLogHandler(job_id)
    handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s", "%H:%M:%S"))
    importer.logger.addHandler(handler)
    file_path: Optional[Path] = None
    try:
        with _jobs_lock:
            job = _jobs[job_id]
            file_path = Path(str(job["file_path"]))
            year = int(job["year"])
            job["status"] = "PROCESANDO"
            job["phase"] = "Procesando archivo de origen"
            job["started_at"] = _now()
            job["started_monotonic"] = time.monotonic()
            job["total_rows"] = importer.estimate_input_rows(file_path)
            job["progress_percent"] = 5
            source_files = importer.input_source_files(file_path)

        def progress(read: int, staged: int) -> None:
            with _jobs_lock:
                current = _jobs[job_id]
                elapsed = max(0.001, time.monotonic() - current["started_monotonic"])
                total_rows = current.get("total_rows")
                current["read"] = read
                current["staged"] = staged
                current["rows_per_second"] = round(read / elapsed, 1)
                if total_rows:
                    ratio = min(1.0, read / total_rows)
                    current["progress_percent"] = round(5 + ratio * 70, 1)
                    remaining = max(0, total_rows - read)
                    current["eta_seconds"] = round(remaining / current["rows_per_second"]) if current["rows_per_second"] else None
                else:
                    current["progress_percent"] = None

        connection = pyodbc.connect(importer.connection_string(), autocommit=False)
        try:
            importer.ensure_tables(connection)
            if _cancel_requested(job_id):
                raise importer.ImportCancelled("Importación detenida por el usuario.")
            read, staged = importer.process_input(
                connection,
                file_path,
                year,
                1000,
                progress_callback=progress,
                cancel_check=lambda: _cancel_requested(job_id),
            )
            with _jobs_lock:
                _jobs[job_id]["read"] = read
                _jobs[job_id]["staged"] = staged
                _jobs[job_id]["phase"] = "Consolidando y actualizando universo"
                _jobs[job_id]["progress_percent"] = 82
                _jobs[job_id]["eta_seconds"] = None
                _jobs[job_id]["can_cancel"] = False
            if _cancel_requested(job_id):
                raise importer.ImportCancelled("Importación detenida por el usuario.")
            inserted, updated = importer.update_insert_target(
                connection, "dbo.Vicidial_Leads_Completo", source_files
            )
        finally:
            connection.close()

        with _jobs_lock:
            job = _jobs[job_id]
            job["inserted"] = inserted
            job["updated"] = updated
            job["status"] = "COMPLETADO"
            job["phase"] = "Importación terminada"
            job["progress_percent"] = 100
            job["eta_seconds"] = 0
            job["can_cancel"] = False
            job["finished_at"] = _now()
    except importer.ImportCancelled as exc:
        with _jobs_lock:
            job = _jobs[job_id]
            job["status"] = "CANCELADO"
            job["phase"] = "Importación detenida de forma segura"
            job["error"] = None
            job["can_cancel"] = False
            job["logs"].append(f"{datetime.now():%H:%M:%S} | {exc}")
            job["finished_at"] = _now()
    except Exception as exc:
        with _jobs_lock:
            job = _jobs[job_id]
            job["status"] = "ERROR"
            job["phase"] = "La importación falló"
            job["error"] = str(exc)
            job["can_cancel"] = False
            job["finished_at"] = _now()
    finally:
        importer.logger.removeHandler(handler)
        if file_path and file_path.exists():
            file_path.unlink()
        if file_path and file_path.parent.parent == UPLOAD_DIR and file_path.parent.exists():
            file_path.parent.rmdir()
        if _run_lock.locked():
            _run_lock.release()


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        return _public_job(job) if job else None


def get_latest_job() -> Optional[Dict[str, Any]]:
    with _jobs_lock:
        job = _jobs.get(_latest_job_id or "")
        return _public_job(job) if job else None
