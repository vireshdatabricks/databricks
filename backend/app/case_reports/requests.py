"""Report request persistence and read-driven Databricks Jobs orchestration."""
from __future__ import annotations

import hashlib
import logging
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute
from pydantic import BaseModel, Field

from app.case_reports import review, selection
from app.core import databricks_jobs
from app.core.config import settings
from app.core.databricks_client import run_query
from app.core.exceptions import QueryFailedError, ServiceUnavailableError
from app.promptbooks import store as promptbook_store

class StructuredErrorRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                return await original(request)
            except RequestValidationError as exc:
                errors = [{"path": ".".join(str(part) for part in item.get("loc", ())[1:]),
                           "message": item.get("msg", "Invalid value")} for item in exc.errors()]
                return JSONResponse(status_code=422, content={"detail": {"code": "INVALID_INPUT",
                    "message": "Request validation failed", "errors": errors}})

        return handler


router = APIRouter(route_class=StructuredErrorRoute)
logger = logging.getLogger("app.case_reports.requests")
FILTER_COLUMNS = selection.FILTER_NAMES
TERMINAL = {"IMPORTED", "FAILED", "CANCELLED"}


class RequestBody(BaseModel):
    promptbook_id: str = Field(min_length=1, max_length=200)
    promptbook_version: int | None = Field(default=None, ge=1)
    client_accounts: list[str] = Field(min_length=1)
    date_from: date
    date_to: date
    model_id: str = Field(min_length=1)
    filters: dict[str, str] = Field(default_factory=dict)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def initialize(database_path: Path) -> None:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect(database_path) as con:
        con.execute("""CREATE TABLE IF NOT EXISTS report_request (
            request_id TEXT PRIMARY KEY, parameters_json TEXT NOT NULL, parameter_hash TEXT NOT NULL,
            requested_by TEXT NOT NULL, databricks_run_id TEXT, state TEXT NOT NULL,
            state_detail TEXT, analysis_run_id TEXT, report_version_id TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_polled_at TEXT
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS report_request_hash_state ON report_request(parameter_hash, state)")


@contextmanager
def _connect(database_path: Path):
    con = sqlite3.connect(database_path, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def _database() -> Path:
    review.initialize(settings.report_workflow_db_path)
    promptbook_store.initialize_store(settings.report_workflow_db_path)
    initialize(settings.report_workflow_db_path)
    return settings.report_workflow_db_path


def _actor(identity: str | None) -> str:
    return identity or "LOCAL_DEVELOPMENT_BUSINESS_REVIEWER"


def _request_record(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result["parameters"] = json.loads(result.pop("parameters_json"))
    return result


def _get(database: Path, request_id: str) -> dict[str, Any]:
    with _connect(database) as con:
        row = con.execute("SELECT * FROM report_request WHERE request_id=?", (request_id,)).fetchone()
    if row is None:
        raise HTTPException(404, detail={"code": "NOT_FOUND", "message": "Report request not found."})
    return _request_record(row)


def _published_promptbooks(database: Path) -> list[dict[str, Any]]:
    result = []
    for promptbook in promptbook_store.list_promptbooks(database):
        if promptbook["active_version"] is None or promptbook["published_at"] is None:
            continue
        result.append({"promptbook_id": promptbook["promptbook_id"], "version": promptbook["active_version"],
                       "name": promptbook.get("name"), "published_at": promptbook["published_at"]})
    return result


def _validate_body(database: Path, body: RequestBody) -> dict[str, Any]:
    if body.date_to < body.date_from:
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "date_to must be on or after date_from",
            "errors": [{"path": "date_to", "message": "Must be on or after date_from"}]})
    if body.model_id not in settings.report_run_model_allowlist:
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "Model is not allow-listed",
            "errors": [{"path": "model_id", "message": "Choose an allow-listed model"}]})
    if set(body.filters) - set(FILTER_COLUMNS):
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "Unsupported report filter",
            "errors": [{"path": "filters", "message": "One or more filter names are unsupported"}]})
    if any(not value.strip() for value in body.client_accounts):
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "Client accounts cannot be blank",
            "errors": [{"path": "client_accounts", "message": "Remove blank client accounts"}]})
    candidates = _published_promptbooks(database)
    selected = next((p for p in candidates if p["promptbook_id"] == body.promptbook_id and
                     (body.promptbook_version is None or p["version"] == body.promptbook_version)), None)
    if selected is None:
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "Promptbook must have an active, published version",
            "errors": [{"path": "promptbook_id", "message": "Choose an active, published promptbook version"}]})
    params = {"promptbook_id": body.promptbook_id, "promptbook_version": str(selected["version"]),
              "client_accounts": ",".join(sorted(set(body.client_accounts))), "date_from": body.date_from.isoformat(),
              "date_to": body.date_to.isoformat(), "model_id": body.model_id,
              **{key: value for key, value in body.filters.items()}}
    return params


def _state(run: dict[str, Any]) -> tuple[str, str | None]:
    state = run.get("state") or {}
    life = state.get("life_cycle_state", "")
    result = state.get("result_state", "")
    detail = state.get("state_message") or run.get("status") or None
    if life in ("PENDING", "QUEUED", "BLOCKED", "WAITING_FOR_RESOURCES"):
        return "QUEUED", detail
    if life in ("RUNNING", "TERMINATING"):
        return "RUNNING", detail
    if life == "TERMINATED" and result == "SUCCESS":
        return "PACKAGED", detail
    if life == "TERMINATED" and result in ("CANCELED", "CANCELLED"):
        return "CANCELLED", detail
    if life in ("INTERNAL_ERROR", "SKIPPED") or (life == "TERMINATED" and result in ("FAILED", "TIMEDOUT", "MAXIMUM_CONCURRENT_RUNS_REACHED")):
        return "FAILED", detail or result or life
    return "RUNNING", detail


def _task_run_id(run: dict[str, Any]) -> str:
    tasks = run.get("tasks") or []
    task = next((t for t in tasks if t.get("task_key") == "report_run"), tasks[0] if tasks else None)
    if not task or not task.get("run_id"):
        raise ValueError("Completed Databricks run did not include a report task run ID.")
    return str(task["run_id"])


def _analysis_id(output: dict[str, Any]) -> str:
    value = (output.get("notebook_output") or {}).get("result") or output.get("analysis_run_id")
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
            if isinstance(decoded, dict):
                value = decoded.get("analysis_run_id")
        except json.JSONDecodeError:
            pass
    if not value:
        raise ValueError("Completed notebook did not return analysis_run_id.")
    return str(value)


def refresh(database: Path, request_id: str, actor: str | None = None) -> dict[str, Any]:
    item = _get(database, request_id)
    if item["state"] in TERMINAL or not item["databricks_run_id"]:
        return item
    now = datetime.now(timezone.utc)
    last = datetime.fromisoformat(item["last_polled_at"]) if item["last_polled_at"] else None
    if item["state"] == "PACKAGED" or (last and (now - last).total_seconds() < settings.report_run_poll_seconds):
        if item["state"] == "PACKAGED":
            return _auto_import(database, item, actor or item["requested_by"])
        return item
    run = databricks_jobs.get_run(item["databricks_run_id"])
    state, detail = _state(run)
    updated = _now()
    analysis_id = None
    if state == "PACKAGED":
        output = databricks_jobs.get_run_output(_task_run_id(run))
        analysis_id = _analysis_id(output)
    with _connect(database) as con:
        con.execute("UPDATE report_request SET state=?, state_detail=?, analysis_run_id=COALESCE(?, analysis_run_id), "
                    "last_polled_at=?, updated_at=? WHERE request_id=?",
                    (state, detail, analysis_id, updated, updated, request_id))
    fresh = _get(database, request_id)
    return _auto_import(database, fresh, actor or fresh["requested_by"]) if state == "PACKAGED" else fresh


def _auto_import(database: Path, item: dict[str, Any], actor: str) -> dict[str, Any]:
    if item["state"] != "PACKAGED" or item.get("report_version_id"):
        return item
    rows = run_query(
        f"SELECT package_json, package_hash FROM {settings.databricks_catalog}.{settings.databricks_schema}.gold_report_snapshot_package "
        "WHERE analysis_run_id = :run_id ORDER BY package_version DESC LIMIT 1", {"run_id": item["analysis_run_id"]})
    if not rows:
        with _connect(database) as con:
            con.execute("UPDATE report_request SET state_detail=?, updated_at=? WHERE request_id=? AND state='PACKAGED'",
                        ("The run completed, but its report package is not available yet. Retry import.", _now(), item["request_id"]))
        return _get(database, item["request_id"])
    try:
        package = json.loads(rows[0]["package_json"])
        if str(package.get("run", {}).get("analysis_run_id")) != str(item["analysis_run_id"]):
            raise ValueError("package run ID does not match the completed request")
        imported = review.import_package(database, rows[0]["package_json"], rows[0]["package_hash"], actor)
    except Exception as exc:
        # Keep PACKAGED so an operator can retry after package repair. Avoid
        # returning raw upstream exception text, which could contain row data.
        with _connect(database) as con:
            con.execute("UPDATE report_request SET state_detail=?, updated_at=? WHERE request_id=? AND state='PACKAGED'",
                        (f"Report package import failed ({type(exc).__name__}). Retry import after the package is corrected.",
                         _now(), item["request_id"]))
        return _get(database, item["request_id"])
    with _connect(database) as con:
        con.execute("UPDATE report_request SET state='IMPORTED', state_detail=NULL, report_version_id=?, updated_at=? "
                    "WHERE request_id=? AND report_version_id IS NULL",
                    (imported["report_version_id"], _now(), item["request_id"]))
    return _get(database, item["request_id"])


def _table(name: str) -> str:
    return f"{settings.databricks_catalog}.{settings.databricks_schema}.{name}"


def _sorted(values) -> list[str]:
    return sorted({str(v) for v in values if v is not None and str(v).strip()}, key=lambda v: (v.casefold(), v))


def _case_columns() -> set[str]:
    rows = run_query(f"SHOW COLUMNS IN {_table('gold_case_fact')}")
    return {str(next(iter(row.values()))).lower() for row in rows}


def _ready_week() -> tuple[Any, str | None]:
    """Latest Gold week and, when a run could not use it, why (mirrors notebook 07 ``pin_ready_week``)."""
    rows = run_query(f"SELECT MAX(as_of_extract_week) AS week FROM {_table('gold_case_fact')}")
    week = rows[0]["week"] if rows else None
    if week is None:
        return None, "No Gold case data is published yet."
    try:
        attempt = run_query(f"SELECT status FROM {_table('gold_publication_registry')} WHERE extract_week = :week "
                            "ORDER BY started_at DESC LIMIT 1", {"week": week})
    except QueryFailedError:
        return week, "The publication registry could not be read; a report run may refuse to start."
    if not attempt or attempt[0]["status"] != "READY":
        return week, f"The latest data week ({week}) is not published as READY; a report run would not start."
    return week, None


@router.get("/request-options")
def request_options(client_accounts: list[str] = Query(default_factory=list)):
    """Clients and filter values from the latest Gold week in one query (G20).

    ``client_accounts`` narrows the filter values (not the client list) to the selected clients.
    Each entry in ``availability`` is ``{available, reason}``: ``service_unavailable`` when
    Databricks cannot be reached, ``query_failed`` when the query errors (logged), and
    ``column_missing`` when Gold lacks the filter column.
    """
    database = _database()
    narrowed = [c for c in client_accounts if c.strip()]
    names = ("client_accounts", *selection.FILTER_NAMES)
    availability: dict[str, dict[str, Any]] = {}
    values: dict[str, list[str]] = {name: [] for name in names}

    def mark(reason: str | None, only: tuple[str, ...] = names) -> None:
        for name in only:
            availability[name] = {"available": reason is None, "reason": reason}

    try:
        columns = _case_columns()
        params: dict[str, Any] = {}
        client_scope = ""
        if narrowed:
            client_scope = " AND " + selection.in_list("latest.client_account", narrowed, "client", params)
        case_columns = {**selection.CASE_FILTER_COLUMNS, selection.TEAM_FILTER: "case_assignment_group"}
        missing = tuple(name for name, column in case_columns.items() if column not in columns)
        parts = ["SELECT 'client_accounts' AS dim, client_account AS value FROM latest "
                 "WHERE client_account IS NOT NULL AND trim(client_account) <> '' GROUP BY client_account"]
        for name, column in case_columns.items():
            if name not in missing:
                parts.append(f"SELECT '{name}' AS dim, {column} AS value FROM latest "
                             f"WHERE {column} IS NOT NULL AND trim({column}) <> ''{client_scope} GROUP BY {column}")
        if selection.TEAM_FILTER not in missing:
            parts.append(f"SELECT '{selection.TEAM_FILTER}' AS dim, t.task_assignment_group AS value "
                         f"FROM {_table('gold_task_fact')} t JOIN latest "
                         "ON t.as_of_extract_week = latest.as_of_extract_week AND t.case_number = latest.case_number "
                         f"WHERE t.task_assignment_group IS NOT NULL AND trim(t.task_assignment_group) <> ''{client_scope} GROUP BY t.task_assignment_group")
        rows = run_query(f"WITH latest AS (SELECT * FROM {_table('gold_case_fact')} WHERE as_of_extract_week = "
                         f"(SELECT MAX(as_of_extract_week) FROM {_table('gold_case_fact')})) "
                         + " UNION ALL ".join(parts), params)
        for row in rows:
            values[row["dim"]].append(row["value"])
        mark(None)
        mark("column_missing", missing)
    except QueryFailedError:
        logger.exception("Report request option query failed")
        mark("query_failed")
    except ServiceUnavailableError:
        mark("service_unavailable")
    return {"data": {"models": settings.report_run_model_allowlist, "promptbooks": _published_promptbooks(database),
                     "client_accounts": _sorted(values["client_accounts"]),
                     "filter_values": {name: _sorted(values[name]) for name in selection.FILTER_NAMES},
                     "availability": availability}}


class PreviewBody(BaseModel):
    promptbook_id: str = Field(min_length=1, max_length=200)
    promptbook_version: int | None = Field(default=None, ge=1)
    client_accounts: list[str] = Field(min_length=1)
    date_from: date
    date_to: date
    filters: dict[str, str] = Field(default_factory=dict)


def _check_scope(date_from: date, date_to: date, filters: dict[str, str], client_accounts: list[str]) -> None:
    if date_to < date_from:
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "date_to must be on or after date_from",
            "errors": [{"path": "date_to", "message": "Must be on or after date_from"}]})
    if set(filters) - set(FILTER_COLUMNS):
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "Unsupported report filter",
            "errors": [{"path": "filters", "message": "One or more filter names are unsupported"}]})
    if any(not value.strip() for value in client_accounts):
        raise HTTPException(422, detail={"code": "INVALID_INPUT", "message": "Client accounts cannot be blank",
            "errors": [{"path": "client_accounts", "message": "Remove blank client accounts"}]})


@router.post("/request-preview")
def request_preview(body: PreviewBody):
    """Matching cases for a request, using the same selection rule as notebook 07 (G19)."""
    _check_scope(body.date_from, body.date_to, body.filters, body.client_accounts)
    clients = sorted(set(body.client_accounts))
    try:
        week, warning = _ready_week()
        by_client: dict[str, int] = {client: 0 for client in clients}
        if week is not None:
            where, params = selection.case_selection(_table("gold_case_fact"), _table("gold_task_fact"), clients,
                                                     body.date_from, body.date_to, body.filters)
            params["week"] = week
            rows = run_query(f"SELECT c.client_account, COUNT(DISTINCT c.case_number) AS cases "
                             f"FROM {_table('gold_case_fact')} c WHERE {where} GROUP BY c.client_account", params)
            for row in rows:
                by_client[row["client_account"]] = int(row["cases"])
    except ServiceUnavailableError as exc:
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE",
            "message": "Matching cases cannot be counted because Databricks is unavailable."}) from exc
    return {"data": {"matching_cases_total": sum(by_client.values()),
                     "by_client": [{"client_account": c, "cases": n} for c, n in by_client.items()],
                     "period": {"date_from": body.date_from.isoformat(), "date_to": body.date_to.isoformat()},
                     "as_of_extract_week": str(week) if week is not None else None,
                     "warnings": [warning] if warning else []}}


@router.post("/requests", status_code=201)
def start_request(body: RequestBody, x_report_reviewer: str | None = Header(default=None)):
    database = _database()
    params = _validate_body(database, body)
    if not settings.report_run_job_id:
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": "Report runs are unavailable until the Databricks job is configured."})
    actor = _actor(x_report_reviewer)
    canonical = json.dumps(params, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode()).hexdigest()
    request_id = str(uuid.uuid4())
    now = _now()
    with _connect(database) as con:
        con.execute("BEGIN IMMEDIATE")
        existing = con.execute("SELECT request_id FROM report_request WHERE parameter_hash=? AND state IN ('QUEUED','RUNNING') "
                                "ORDER BY created_at DESC LIMIT 1", (digest,)).fetchone()
        if existing:
            raise HTTPException(409, detail={"code": "STATE_CONFLICT", "message": "An identical report request is already queued or running.",
                                            "request_id": existing["request_id"]})
        # Reserve the exact parameter set before the external call so concurrent
        # POSTs cannot start two jobs with identical inputs.
        con.execute("INSERT INTO report_request (request_id, parameters_json, parameter_hash, requested_by, state, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, 'QUEUED', ?, ?)", (request_id, canonical, digest, actor, now, now))
    try:
        started = databricks_jobs.run_now(settings.report_run_job_id, {**params, "requested_by": actor})
    except ServiceUnavailableError as exc:
        with _connect(database) as con:
            con.execute("DELETE FROM report_request WHERE request_id=? AND databricks_run_id IS NULL", (request_id,))
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": str(exc)}) from exc
    run_id = started.get("run_id")
    if run_id is None:
        with _connect(database) as con:
            con.execute("DELETE FROM report_request WHERE request_id=? AND databricks_run_id IS NULL", (request_id,))
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": "Databricks did not return a run ID."})
    with _connect(database) as con:
        con.execute("UPDATE report_request SET databricks_run_id=?, updated_at=? WHERE request_id=?", (str(run_id), _now(), request_id))
    return {"data": _get(database, request_id)}


@router.get("/requests")
def list_requests():
    database = _database()
    with _connect(database) as con:
        ids = [r["request_id"] for r in con.execute("SELECT request_id FROM report_request ORDER BY created_at DESC")]
    data = []
    for request_id in ids:
        try:
            data.append(refresh(database, request_id))
        except ServiceUnavailableError as exc:
            raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": str(exc)}) from exc
    return {"data": data}


@router.get("/requests/{request_id}")
def get_request(request_id: str, x_report_reviewer: str | None = Header(default=None)):
    database = _database()
    try:
        return {"data": refresh(database, request_id, _actor(x_report_reviewer))}
    except ServiceUnavailableError as exc:
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": str(exc)}) from exc


@router.post("/requests/{request_id}/cancel")
def cancel_request(request_id: str):
    database = _database()
    item = _get(database, request_id)
    if item["state"] not in ("QUEUED", "RUNNING"):
        raise HTTPException(409, detail={"code": "STATE_CONFLICT", "message": f"Cannot cancel a request in {item['state']} state."})
    if not item["databricks_run_id"]:
        raise HTTPException(409, detail={"code": "STATE_CONFLICT", "message": "The Databricks run is still being started; retry cancellation shortly."})
    try:
        databricks_jobs.cancel_run(item["databricks_run_id"])
    except ServiceUnavailableError as exc:
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": str(exc)}) from exc
    with _connect(database) as con:
        con.execute("UPDATE report_request SET state='CANCELLED', updated_at=? WHERE request_id=?", (_now(), request_id))
    return {"data": _get(database, request_id)}


@router.post("/requests/{request_id}/import")
def import_request(request_id: str, x_report_reviewer: str | None = Header(default=None)):
    database = _database()
    item = _get(database, request_id)
    if item["state"] == "IMPORTED":
        return {"data": item}
    if item["state"] != "PACKAGED":
        raise HTTPException(409, detail={"code": "STATE_CONFLICT", "message": f"Cannot import a request in {item['state']} state."})
    try:
        return {"data": _auto_import(database, item, _actor(x_report_reviewer))}
    except ServiceUnavailableError as exc:
        raise HTTPException(503, detail={"code": "UPSTREAM_UNAVAILABLE", "message": str(exc)}) from exc
