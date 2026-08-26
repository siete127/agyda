# -*- coding: utf-8 -*-
"""Coordinación de cálculos KPI pesados sobre SQL Server."""

import logging
import threading
import time
from typing import Callable, TypeVar


logger = logging.getLogger(__name__)
_result_type = TypeVar("_result_type")
_heavy_query_lock = threading.Lock()


def is_query_timeout(error: Exception) -> bool:
    text = str(error).upper()
    return (
        "HYT00" in text
        or "QUERY TIMEOUT EXPIRED" in text
        or "SQLSTATE 0" in text and "TIMEOUT" in text
    )


def run_serialized_kpi(
    name: str,
    operation: Callable[[], _result_type],
    attempts: int = 2,
    retry_delay_seconds: float = 3.0,
) -> _result_type:
    """Evita cálculos KPI concurrentes y reintenta timeouts transitorios."""
    attempts = max(1, int(attempts))
    for attempt in range(1, attempts + 1):
        try:
            with _heavy_query_lock:
                return operation()
        except Exception as exc:
            if not is_query_timeout(exc) or attempt >= attempts:
                raise
            delay = max(0.0, float(retry_delay_seconds)) * attempt
            logger.warning(
                "kpi_query_timeout name=%s attempt=%s/%s retry_in=%.1fs",
                name,
                attempt,
                attempts,
                delay,
            )
            if delay:
                time.sleep(delay)
    raise RuntimeError("No fue posible completar el cálculo KPI.")
