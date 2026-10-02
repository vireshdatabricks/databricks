import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.case_reports import requests as request_api
from app.case_reports import router as case_router
from app.case_reports import review
from app.core.exceptions import ServiceUnavailableError
from app.promptbooks import store


def _client(db_path, monkeypatch, *, job_id="123"):
    monkeypatch.setattr(case_router.settings, "report_workflow_db_path", db_path)
    monkeypatch.setattr(case_router.settings, "report_run_job_id", job_id)
    monkeypatch.setattr(case_router.settings, "report_run_model_allowlist", ["databricks-gpt-oss-20b"])
    monkeypatch.setattr(case_router.settings, "report_run_poll_seconds", 0)
    store.initialize_store(db_path)
    with __import__("sqlite3").connect(db_path) as con:
        con.execute("INSERT OR REPLACE INTO promptbook_version (promptbook_id, version, status, document_json, created_by, created_at, activated_at, published_at) "
                    "VALUES ('PBI', 1, 'ACTIVE', '{}', 'tester', '2026-10-01', '2026-10-01', '2026-10-01')")
    app = FastAPI()
    app.include_router(case_router.router, prefix="/api/v1/case-reports")
    return TestClient(app)


def _body():
    return {"promptbook_id": "PBI", "client_accounts": ["Health Alliance"], "date_from": "2026-01-01",
            "date_to": "2026-09-30", "model_id": "databricks-gpt-oss-20b"}


def test_request_lifecycle_and_auto_import_exactly_once(db_path, package, monkeypatch):
    client = _client(db_path, monkeypatch)
    monkeypatch.setattr(request_api.databricks_jobs, "run_now", lambda *_: {"run_id": 77})
    monkeypatch.setattr(request_api.databricks_jobs, "get_run", lambda *_: {
        "state": {"life_cycle_state": "TERMINATED", "result_state": "SUCCESS"}, "tasks": [{"task_key": "report_run", "run_id": 78}]})
    monkeypatch.setattr(request_api.databricks_jobs, "get_run_output", lambda *_: {"notebook_output": {"result": json.dumps({"analysis_run_id": "run-0001"})}})
    imported_package = dict(package)
    imported_package["run"] = dict(package["run"], analysis_run_id="run-0001")
    monkeypatch.setattr(request_api, "run_query", lambda *_args, **_kwargs: [{"package_json": json.dumps(imported_package), "package_hash": "unique-hash"}])

    created = client.post("/api/v1/case-reports/requests", json=_body())
    assert created.status_code == 201
    request_id = created.json()["data"]["request_id"]
    assert created.json()["data"]["state"] == "QUEUED"
    result = client.get(f"/api/v1/case-reports/requests/{request_id}")
    assert result.json()["data"]["state"] == "IMPORTED"
    version_id = result.json()["data"]["report_version_id"]
    again = client.get(f"/api/v1/case-reports/requests/{request_id}")
    assert again.json()["data"]["report_version_id"] == version_id
    assert len(review.list_versions(db_path)) == 1


def test_duplicate_active_request_returns_existing_id(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    monkeypatch.setattr(request_api.databricks_jobs, "run_now", lambda *_: {"run_id": 12})
    assert client.post("/api/v1/case-reports/requests", json=_body()).status_code == 201
    duplicate = client.post("/api/v1/case-reports/requests", json=_body())
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["request_id"]


def test_cancel_request(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    monkeypatch.setattr(request_api.databricks_jobs, "run_now", lambda *_: {"run_id": 12})
    cancelled = []
    monkeypatch.setattr(request_api.databricks_jobs, "cancel_run", lambda run_id: cancelled.append(run_id))
    request_id = client.post("/api/v1/case-reports/requests", json=_body()).json()["data"]["request_id"]
    result = client.post(f"/api/v1/case-reports/requests/{request_id}/cancel")
    assert result.status_code == 200
    assert result.json()["data"]["state"] == "CANCELLED"
    assert cancelled == ["12"]


def test_disallowed_model_is_422(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    body = _body()
    body["model_id"] = "not-allow-listed"
    result = client.post("/api/v1/case-reports/requests", json=body)
    assert result.status_code == 422
    assert result.json()["detail"]["errors"][0]["path"] == "model_id"


def test_jobs_unavailable_is_503(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    def fail(*_args, **_kwargs):
        raise ServiceUnavailableError("Jobs unavailable")
    monkeypatch.setattr(request_api.databricks_jobs, "run_now", fail)
    result = client.post("/api/v1/case-reports/requests", json=_body())
    assert result.status_code == 503
    assert result.json()["detail"]["code"] == "UPSTREAM_UNAVAILABLE"


@pytest.mark.parametrize(("life", "result", "expected"), [
    ("PENDING", None, "QUEUED"), ("QUEUED", None, "QUEUED"), ("BLOCKED", None, "QUEUED"),
    ("RUNNING", None, "RUNNING"), ("TERMINATING", None, "RUNNING"),
    ("TERMINATED", "SUCCESS", "PACKAGED"), ("TERMINATED", "FAILED", "FAILED"),
    ("TERMINATED", "TIMEDOUT", "FAILED"), ("TERMINATED", "CANCELED", "CANCELLED"),
    ("INTERNAL_ERROR", None, "FAILED"), ("SKIPPED", None, "FAILED"),
])
def test_databricks_lifecycle_mapping(life, result, expected):
    mapped, _detail = request_api._state({"state": {"life_cycle_state": life, "result_state": result}})
    assert mapped == expected


def test_unconfigured_job_returns_503(db_path, monkeypatch):
    client = _client(db_path, monkeypatch, job_id="")
    result = client.post("/api/v1/case-reports/requests", json=_body())
    assert result.status_code == 503
    assert result.json()["detail"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_option_query_failures_keep_configured_options_available(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    def fail(*_args, **_kwargs):
        raise ServiceUnavailableError("Analytics unavailable")
    monkeypatch.setattr(request_api, "run_query", fail)
    result = client.get("/api/v1/case-reports/request-options")
    assert result.status_code == 200
    data = result.json()["data"]
    assert data["models"] == ["databricks-gpt-oss-20b"]
    assert data["promptbooks"] == [{"promptbook_id": "PBI", "version": 1, "name": None, "published_at": "2026-10-01"}]
    assert data["availability"]["client_accounts"] == {"available": False, "reason": "service_unavailable"}
