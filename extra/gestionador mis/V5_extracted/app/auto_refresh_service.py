# -*- coding: utf-8 -*-
import threading
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional


class RefreshAlreadyRunning(RuntimeError):
    pass


class AutoRefreshScheduler:
    def __init__(
        self,
        task: Callable[[], Dict[str, Any]],
        interval_minutes: int = 15,
        enabled: bool = True,
        start_hour: int = 10,
        end_hour: int = 19,
    ) -> None:
        self.task = task
        self.interval_minutes = max(1, int(interval_minutes))
        self.start_hour = max(0, min(23, int(start_hour)))
        self.end_hour = max(self.start_hour, min(23, int(end_hour)))
        self._state_lock = threading.Lock()
        self._execution_lock = threading.Lock()
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._state: Dict[str, Any] = {
            "enabled": bool(enabled),
            "running": False,
            "source": None,
            "interval_minutes": self.interval_minutes,
            "schedule_start": f"{self.start_hour:02d}:00",
            "schedule_end": f"{self.end_hour:02d}:00",
            "next_run": self._next_time() if enabled else None,
            "last_started": None,
            "last_finished": None,
            "last_source": None,
            "last_status": None,
            "last_error": None,
            "last_result": None,
        }

    @staticmethod
    def _format(value: Optional[datetime]) -> Optional[str]:
        return value.strftime("%Y-%m-%d %H:%M:%S") if value else None

    def _is_in_schedule(self, value: Optional[datetime] = None) -> bool:
        current = value or datetime.now()
        start = current.replace(hour=self.start_hour, minute=0, second=0, microsecond=0)
        end = current.replace(hour=self.end_hour, minute=0, second=0, microsecond=0)
        return start <= current <= end

    def _next_time(
        self,
        delay_minutes: Optional[int] = None,
        current: Optional[datetime] = None,
    ) -> datetime:
        current = current or datetime.now()
        start = current.replace(hour=self.start_hour, minute=0, second=0, microsecond=0)
        end = current.replace(hour=self.end_hour, minute=0, second=0, microsecond=0)
        if current < start:
            return start
        if current > end:
            return start + timedelta(days=1)
        candidate = current + timedelta(minutes=delay_minutes or self.interval_minutes)
        return candidate if candidate <= end else start + timedelta(days=1)

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="vicidial-auto-refresh")
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

    def set_enabled(self, enabled: bool) -> Dict[str, Any]:
        with self._state_lock:
            self._state["enabled"] = bool(enabled)
            self._state["next_run"] = self._next_time() if enabled else None
        self._wake.set()
        return self.status()

    def status(self) -> Dict[str, Any]:
        with self._state_lock:
            data = dict(self._state)
        data["next_run"] = self._format(data["next_run"])
        data["in_schedule"] = self._is_in_schedule()
        return data

    def run_now(
        self,
        source: str = "MANUAL",
        task: Optional[Callable[[], Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        if not self._execution_lock.acquire(blocking=False):
            raise RefreshAlreadyRunning("Ya hay una actualización desde Vicidial en proceso.")
        try:
            with self._state_lock:
                self._state.update({
                    "running": True,
                    "source": source,
                    "last_started": self._format(datetime.now()),
                    "last_status": "PROCESANDO",
                    "last_error": None,
                })
            try:
                result = (task or self.task)()
            except Exception as exc:
                with self._state_lock:
                    self._state.update({
                        "last_status": "ERROR",
                        "last_error": str(exc),
                        "last_result": None,
                    })
                raise
            with self._state_lock:
                self._state.update({
                    "last_status": "COMPLETADO",
                    "last_result": result,
                })
            return result
        finally:
            with self._state_lock:
                self._state["last_source"] = self._state["source"]
                self._state["running"] = False
                self._state["source"] = None
                self._state["last_finished"] = self._format(datetime.now())
                self._state["next_run"] = self._next_time() if self._state["enabled"] else None
            self._execution_lock.release()
            self._wake.set()

    def _loop(self) -> None:
        while not self._stop.is_set():
            with self._state_lock:
                enabled = bool(self._state["enabled"])
                next_run = self._state["next_run"]
            if not enabled or next_run is None:
                self._wake.wait(30)
                self._wake.clear()
                continue
            delay = max(0.0, (next_run - datetime.now()).total_seconds())
            if delay > 0:
                self._wake.wait(min(delay, 30))
                self._wake.clear()
                continue
            if not self._is_in_schedule():
                with self._state_lock:
                    self._state["next_run"] = self._next_time()
                continue
            try:
                self.run_now("AUTOMATICO")
            except RefreshAlreadyRunning:
                with self._state_lock:
                    self._state["next_run"] = self._next_time(delay_minutes=1)
            except Exception:
                # El estado conserva el error y el siguiente intento queda programado.
                pass
