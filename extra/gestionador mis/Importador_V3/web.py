# -*- coding: utf-8 -*-
import asyncio
import threading
import zipfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from starlette.requests import Request

from app import config
from app.auto_refresh_service import AutoRefreshScheduler, RefreshAlreadyRunning
from app.dashboard_service import get_dashboard_data, refresh_incremental
from app.lead_export_service import (
    generate_batch,
    get_batch_file,
    list_batches,
    preview_candidates,
    reconcile_and_release,
    get_filter_options,
    get_list_status_summary,
)
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

app = FastAPI(title="Dashboard y lotes Vicidial", version="2.0.0")
app.mount("/static", StaticFiles(directory=str(config.BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(config.BASE_DIR / "templates"))
_batch_lock = threading.Lock()
_auto_refresh = AutoRefreshScheduler(
    refresh_incremental,
    interval_minutes=config.AUTO_REFRESH_MINUTES,
    enabled=config.AUTO_REFRESH_ENABLED,
    start_hour=config.AUTO_REFRESH_START_HOUR,
    end_hour=config.AUTO_REFRESH_END_HOUR,
)


class LeadBatchRequest(BaseModel):
    quantity: int = 5000
    mode: str = "NUEVOS"
    batch_name: Optional[str] = None
    destination_campaign: Optional[str] = None
    destination_list: Optional[str] = None
    campaign_id: Optional[List[str]] = None
    list_name: Optional[List[str]] = None
    management_month: Optional[List[str]] = None
    status: Optional[List[str]] = None
    state: Optional[List[str]] = None
    city: Optional[List[str]] = None

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
    status: Optional[List[str]] = None
    state: Optional[List[str]] = None
    city: Optional[List[str]] = None

    def as_dict(self) -> Dict[str, Any]:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()


class AutoRefreshToggleRequest(BaseModel):
    enabled: bool


@app.on_event("startup")
def start_auto_refresh() -> None:
    _auto_refresh.start()


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
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/refresh")
def refresh():
    try:
        return {"ok": True, "result": _auto_refresh.run_now("MANUAL")}
    except RefreshAlreadyRunning as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/auto-refresh")
def auto_refresh_status():
    return _auto_refresh.status()


@app.post("/api/auto-refresh/toggle")
def toggle_auto_refresh(payload: AutoRefreshToggleRequest):
    return _auto_refresh.set_enabled(payload.enabled)


@app.post("/api/universe-imports")
async def create_universe_import(
    file: UploadFile = File(...),
    year: int = Form(default=2026),
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

    try:
        job = reserve_job(filename, year)
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
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/lead-list-status-summary")
def lead_list_status_summary(payload: LeadBatchRequest):
    try:
        return get_list_status_summary(payload.as_dict())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/lead-batches/preview")
def lead_batch_preview(payload: LeadBatchRequest):
    try:
        return preview_candidates(payload.as_dict())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/lead-batches/generate")
def lead_batch_generate(payload: LeadBatchRequest):
    if not _batch_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una generacion o revision de lote en proceso")
    try:
        return generate_batch(payload.as_dict())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _batch_lock.release()


@app.get("/api/lead-batches")
def lead_batches(limit: int = Query(default=50, ge=1, le=200)):
    try:
        return {"items": list_batches(limit)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.get("/api/lead-batches/{batch_id}/download")
def lead_batch_download(batch_id: int):
    try:
        path = get_batch_file(batch_id)
        return FileResponse(path=str(path), media_type="text/csv", filename=path.name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/lead-batches/{batch_id}/reconcile-release")
def lead_batch_reconcile(batch_id: int):
    if not _batch_lock.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Ya hay una generacion o revision de lote en proceso")
    try:
        return reconcile_and_release(batch_id)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        _batch_lock.release()


if __name__ == "__main__":
    uvicorn.run("web:app", host=config.WEB_HOST, port=config.WEB_PORT, reload=False)
