"""Small Jobs API 2.1 client used by report requests."""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import settings
from app.core.databricks_client import _resolve_access_token
from app.core.exceptions import ServiceUnavailableError

logger = logging.getLogger("app.databricks.jobs")


def _request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    host = settings.resolved_databricks_hostname
    if not host:
        raise ServiceUnavailableError("Databricks Jobs is not configured.")
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        f"https://{host}/api/2.1/jobs/{path}", data=body, method=method,
        headers={"Authorization": f"Bearer {_resolve_access_token()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read() or b"{}")
    except ServiceUnavailableError:
        raise
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        logger.warning("Databricks Jobs request failed (%s)", path, exc_info=exc)
        raise ServiceUnavailableError("Databricks Jobs is unavailable. Retry the request shortly.") from exc


def run_now(job_id: str, job_parameters: dict[str, str]) -> dict[str, Any]:
    return _request("POST", "run-now", {"job_id": int(job_id), "job_parameters": job_parameters})


def get_run(run_id: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({"run_id": run_id})
    return _request("GET", f"runs/get?{query}")


def get_run_output(task_run_id: str) -> dict[str, Any]:
    query = urllib.parse.urlencode({"run_id": task_run_id})
    return _request("GET", f"runs/get-output?{query}")


def cancel_run(run_id: str) -> dict[str, Any]:
    return _request("POST", "runs/cancel", {"run_id": int(run_id)})
