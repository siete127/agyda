# -*- coding: utf-8 -*-
import asyncio
import threading
import uuid
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from starlette.requests import Request

from app import config
from app.auto_refresh_service import AutoRefreshScheduler, RefreshAlreadyRunning
from app.azul_snapshot_service import SourceRefreshService, sync_azul_snapshot
from app.dashboard_service import get_dashboard_data, refresh_incremental
from app.lead_export_service import (
    BatchReconcileCancelled,
    LeadPreviewTimeout,
    generate_batch,
    get_batch_file,
    list_batches,
    preview_candidates,
    reconcile_and_release,
    get_filter_options,
    get_list_status_summary,
)
from app.lot_decision_service import (
    get_lot_decision_dashboard,
    invalidate_lot_decision_snapshots,
    warm_lot_decision_cache,
)
from app.kpi_refresh_coordinator import is_query_timeout
from app.universe_import_service import (
    UPLOAD_DIR,
    fail_reserved_job,
    get_job,
    get_latest_job,
    reserve_job,
    request_cancel,
    start_job,
    update_upload,
)
from app.universe_priority_service import (
    get_universe_priority_dashboard,
    request_universe_priority_refresh,
    warm_universe_priority_cache,
)

app = FastAPI(title="Dashboard y lotes Vicidial", version="2.2.0")
app.mount("/static", StaticFiles(directory=str(config.BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(config.BASE_DIR / "templates"))
_batch_lock = threading.Lock()
_batch_jobs_lock = threading.Lock()
_batch_jobs: Dict[str, Dict[str, Any]] = {}
_source_refresh = SourceRefreshService()


SQL_TIMEOUT_DETAIL = (
    "SQL Server tardó más de lo permitido en responder. "
    "La operación fue detenida para no dejar la pantalla bloqueada; "
    "aplica una campaña, lista o mes y vuelve a intentarlo."
)


def _friendly_service_error(error: Exception) -> str:
    return SQL_TIMEOUT_DETAIL if is_query_timeout(error) else str(error)


def _service_http_error(error: Exception) -> HTTPException:
    return HTTPException(
        status_code=504 if is_query_timeout(error) else 500,
        detail=_friendly_service_error(error),
    )


def _schedule_universe_kpi(result: Dict[str, Any]) -> Dict[str, Any]:
    result["universe_kpi_refresh_started"] = (
        request_universe_priority_refresh()
    )
    return result


def _automatic_refresh_with_kpis() -> Dict[str, Any]:
    return _schedule_universe_kpi(_source_refresh.refresh_automatic())


def _sql_refresh_with_kpis() -> Dict[str, Any]:
    return _schedule_universe_kpi(sync_azul_snapshot())


def _report_refresh_with_kpis() -> Dict[str, Any]:
    return _schedule_universe_kpi(refresh_incremental())


_auto_refresh = AutoRefreshScheduler(
    _automatic_refresh_with_kpis,
    interval_minutes=config.AUTO_REFRESH_MINUTES,
    enabled=config.AUTO_REFRESH_ENABLED,
    start_hour=config.AUTO_REFRESH_START_HOUR,
    end_hour=config.AUTO_REFRESH_END_HOUR,
)


class LeadBatchRequest(BaseModel):
    quantity: int = Field(default=5000, ge=1, le=50000)
    mode: str = "NUEVOS"
    include_pending_recycle: bool = False
    batch_name: Optional[str] = None
    destination_campaign: Optional[str] = None
    destination_list: Optional[str] = None
    campaign_id: Optional[List[str]] = None
    list_name: Optional[List[str]] = None
    management_month: Optional[List[str]] = None
    last_management_month: Optional[List[str]] = None
    status: Optional[List[str]] = None
    state: Optional[List[str]] = None
    city: Optional[List[str]] = None
    source_batch_ids: Optional[List[int]] = None
    source_batch_policy: Optional[str] = None

    def as_dict(self) -> Dict[str, Any]:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()


class LeadFilterOptionsRequest(BaseModel):
    field: str
    search: str = ""
    limit: int = 150
    campaign_id: Optional[List[str]] = None
    list_name: Optional[List[str]] = None
    management_month: Optional[List[str]] = None
    last_management_month: Optional[List[str]] = None
    status: Optional[List[str]] = None
    state: Optional[List[str]] = None
    city: Optional[List[str]] = None

    def as_dict(self) -> Dict[str, Any]:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()


class AutoRefreshToggleRequest(BaseModel):
    enabled: bool


class LotDecisionRequest(BaseModel):
    policy: str = "LIBERADOS"
    target_quantity: int = 5000
    cooldown_days: int = 15
    limit: int = 65


class UniversePriorityRequest(BaseModel):
    target_quantity: int = 5000


def _batch_job_snapshot(job_id: str) -> Optional[Dict[str, Any]]:
    with _batch_jobs_lock:
        job = _batch_jobs.get(job_id)
        return dict(job) if job else None


def _update_batch_job(job_id: str, **changes: Any) -> Dict[str, Any]:
    with _batch_jobs_lock:
        job = _batch_jobs[job_id]
        job.update(changes)
        job["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return dict(job)


def _batch_job_cancel_requested(job_id: str) -> bool:
    with _batch_jobs_lock:
        return bool(_batch_jobs.get(job_id, {}).get("cancel_requested"))


def _run_batch_reconcile_job(job_id: str, batch_id: int) -> None:
    try:
        _update_batch_job(
            job_id,
            status="PROCESANDO",
            phase="Iniciando revisión segura",
            progress_percent=2,
            can_cancel=True,
            started_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )

        def progress(percent: int, phase: str, can_cancel: bool = True) -> None:
            _update_batch_job(
                job_id,
                status="PROCESANDO",
                phase=phase,
                progress_percent=max(0, min(100, int(percent))),
                can_cancel=bool(can_cancel),
            )

        result = reconcile_and_release(
            batch_id,
            # La revisión consulta AzulCC directamente. El reporte anterior se
            # toma de la última descarga disponible y no se fuerza una descarga
            # HTTP que pueda dejar la pantalla esperando.
            refresh_task=lambda: {
                "sql_source": "DIRECTA",
                "legacy_report": "ULTIMA_DESCARGA_DISPONIBLE",
            },
            progress_callback=progress,
            cancel_checker=lambda: _batch_job_cancel_requested(job_id),
        )
        _update_batch_job(
            job_id,
            status="COMPLETADO",
            phase="Anulación segura terminada",
            progress_percent=100,
            can_cancel=False,
            result=result,
            finished_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
        invalidate_lot_decision_snapshots()
    except BatchReconcileCancelled as exc:
        _update_batch_job(
            job_id,
            status="CANCELADO",
            phase=str(exc),
            can_cancel=False,
            error=None,
            finished_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
    except Exception as exc:
        _update_batch_job(
            job_id,
            status="ERROR",
            phase="No se pudo terminar la anulación segura",
            can_cancel=False,
            error=_friendly_service_error(exc),
            finished_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )
    finally:
        _batch_lock.release()


@app.on_event("startup")
def start_auto_refresh() -> None:
    _auto_refresh.start()
    threading.Thread(
        target=warm_lot_decision_cache,
        name="kpi-lotes-warmup",
        daemon=True,
    ).start()
    threading.Thread(
        target=warm_universe_priority_cache,
        name="kpi-universo-warmup",
        daemon=True,
    ).start()


@app.on_event("shutdown")
def stop_auto_refresh() -> None:
    _auto_refresh.stop()


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/api/dashboard")
def dashboard(date: Optional[str] = Query(default=None)):
    try:
        return get_dashboard_data(date)
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/refresh")
def refresh():
    try:
        return {
            "ok": True,
            "result": _auto_refresh.run_now(
                "REPORTE_MANUAL", task=_report_refresh_with_kpis
            ),
        }
    except RefreshAlreadyRunning as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/refresh-sql")
def refresh_sql_source():
    try:
        return {
            "ok": True,
            "result": _auto_refresh.run_now(
                "SQL_MANUAL", task=_sql_refresh_with_kpis
            ),
        }
    except RefreshAlreadyRunning as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.get("/api/auto-refresh")
def auto_refresh_status():
    return {**_auto_refresh.status(), **_source_refresh.status()}


@app.post("/api/auto-refresh/toggle")
def toggle_auto_refresh(payload: AutoRefreshToggleRequest):
    return _auto_refresh.set_enabled(payload.enabled)


@app.post("/api/report-auto/toggle")
def toggle_report_auto(payload: AutoRefreshToggleRequest):
    return {**_auto_refresh.status(), **_source_refresh.set_legacy_report_enabled(payload.enabled)}


@app.post("/api/universe-imports")
async def create_universe_import(
    file: UploadFile = File(...),
    year: int = Form(default=2026),
    entry_month: str = Form(default=""),
):
    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()
    allowed_suffixes = {".zip", ".xlsx", ".xlsm", ".xls", ".xlsb", ".csv", ".txt"}
    if suffix not in allowed_suffixes:
        raise HTTPException(
            status_code=400,
            detail="Formato no compatible. Usa ZIP, XLSX, XLSM, XLS, XLSB, CSV o TXT.",
        )
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="El año debe estar entre 2000 y 2100.")
    entry_month = str(entry_month or "").strip()
    try:
        datetime.strptime(entry_month, "%Y-%m")
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Selecciona un mes de EntryDate válido.",
        )

    try:
        job = reserve_job(filename, year, entry_month=entry_month)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    job_id = str(job["job_id"])
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    file_path = job_dir / filename
    size = 0
    max_upload = 2 * 1024 * 1024 * 1024
    try:
        with file_path.open("wb") as output:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_upload:
                    raise ValueError("El ZIP excede el límite de 2 GB.")
                output.write(chunk)
        if size == 0:
            raise ValueError("El archivo recibido está vacío.")
        if suffix == ".zip":
            if not zipfile.is_zipfile(file_path):
                raise ValueError("El archivo recibido no es un ZIP válido.")
            with zipfile.ZipFile(file_path) as archive:
                uncompressed = sum(item.file_size for item in archive.infolist())
                if uncompressed > 10 * 1024 * 1024 * 1024:
                    raise ValueError("El contenido descomprimido excede el límite de 10 GB.")
        update_upload(job_id, file_path, size)
        start_job(job_id)
        return get_job(job_id)
    except asyncio.CancelledError:
        if file_path.exists():
            file_path.unlink()
        if job_dir.exists():
            job_dir.rmdir()
        fail_reserved_job(job_id, "La carga del archivo fue cancelada.")
        raise
    except Exception as exc:
        if file_path.exists():
            file_path.unlink()
        if job_dir.exists():
            job_dir.rmdir()
        fail_reserved_job(job_id, str(exc))
        raise HTTPException(status_code=400, detail=str(exc))
    finally:
        await file.close()


@app.get("/api/universe-imports/latest")
def latest_universe_import():
    return {"job": get_latest_job()}


@app.get("/api/universe-imports/{job_id}")
def universe_import_status(job_id: str):
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="La importación no existe.")
    return job


@app.post("/api/universe-imports/{job_id}/cancel")
def cancel_universe_import(job_id: str):
    job = request_cancel(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="La importación no existe.")
    return job




@app.post("/api/lead-filter-options")
def lead_filter_options(payload: LeadFilterOptionsRequest):
    try:
        data = payload.as_dict()
        field = data.pop("field")
        search = data.pop("search", "")
        limit = max(1, min(int(data.pop("limit", 150)), 300))
        return {"items": get_filter_options(field, search, limit, data)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/lead-list-status-summary")
def lead_list_status_summary(payload: LeadBatchRequest):
    try:
        return get_list_status_summary(payload.as_dict())
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/lead-batches/preview")
def lead_batch_preview(payload: LeadBatchRequest):
    try:
        return preview_candidates(payload.as_dict())
    except LeadPreviewTimeout as exc:
        raise HTTPException(status_code=504, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/lead-batches/decision-dashboard")
def lead_batch_decision_dashboard(payload: LotDecisionRequest):
    try:
        return get_lot_decision_dashboard(
            policy=payload.policy,
            target_quantity=payload.target_quantity,
            cooldown_days=payload.cooldown_days,
            limit=payload.limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/kpis/universe-priority")
def universe_priority_dashboard(payload: UniversePriorityRequest):
    try:
        return get_universe_priority_dashboard(payload.target_quantity)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/lead-batches/generate")
def lead_batch_generate(payload: LeadBatchRequest):
    if not _batch_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una generacion o revision de lote en proceso")
    try:
        result = generate_batch(payload.as_dict())
        invalidate_lot_decision_snapshots()
        return result
    except Exception as exc:
        raise _service_http_error(exc)
    finally:
        _batch_lock.release()


@app.get("/api/lead-batches")
def lead_batches(limit: int = Query(default=50, ge=1, le=200)):
    try:
        return {"items": list_batches(limit)}
    except Exception as exc:
        raise _service_http_error(exc)


@app.get("/api/lead-batches/{batch_id}/download")
def lead_batch_download(batch_id: int):
    try:
        path = get_batch_file(batch_id)
        return FileResponse(path=str(path), media_type="text/csv", filename=path.name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise _service_http_error(exc)


@app.post("/api/lead-batches/{batch_id}/reconcile-release")
def lead_batch_reconcile(batch_id: int):
    if not _batch_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una generacion o revision de lote en proceso")
    try:
        job_id = str(uuid.uuid4())
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with _batch_jobs_lock:
            _batch_jobs[job_id] = {
                "job_id": job_id,
                "batch_id": batch_id,
                "status": "EN_COLA",
                "phase": "Preparando revisión segura",
                "progress_percent": 0,
                "can_cancel": True,
                "cancel_requested": False,
                "error": None,
                "result": None,
                "created_at": now,
                "updated_at": now,
                "started_at": None,
                "finished_at": None,
            }
        worker = threading.Thread(
            target=_run_batch_reconcile_job,
            args=(job_id, batch_id),
            daemon=True,
            name=f"batch-reconcile-{batch_id}",
        )
        worker.start()
        return _batch_job_snapshot(job_id)
    except Exception as exc:
        _batch_lock.release()
        raise _service_http_error(exc)


@app.get("/api/lead-batch-jobs/{job_id}")
def lead_batch_job(job_id: str):
    job = _batch_job_snapshot(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="El proceso de revisión ya no existe.")
    return job


@app.post("/api/lead-batch-jobs/{job_id}/cancel")
def cancel_lead_batch_job(job_id: str):
    with _batch_jobs_lock:
        job = _batch_jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="El proceso de revisión ya no existe.")
        if job["status"] not in ("EN_COLA", "PROCESANDO"):
            return dict(job)
        if not job.get("can_cancel", False):
            raise HTTPException(
                status_code=409,
                detail="Los cambios ya se están aplicando y no es seguro detenerlos.",
            )
        job["cancel_requested"] = True
        job["phase"] = "Deteniendo antes de modificar el lote..."
        job["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        return dict(job)


if __name__ == "__main__":
    uvicorn.run("web:app", host=config.WEB_HOST, port=config.WEB_PORT, reload=False)
