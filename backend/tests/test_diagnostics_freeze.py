"""Case diagnostic review freeze (reference/52 §4 steps 2-3)."""
import sqlite3
from datetime import date

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.exceptions import register_exception_handlers
from app.diagnostics import router as diagnostics_router, service, workflow


@pytest.fixture
def client(tmp_path, monkeypatch):
    path = tmp_path / "diagnostics.sqlite3"
    workflow.initialize_diagnostic_workflow(path)
    monkeypatch.setattr(diagnostics_router.settings, "report_workflow_db_path", path)
    monkeypatch.setattr(service, "resolve_as_of_week", lambda requested: requested or date(2026, 9, 21))
    app = FastAPI()
    register_exception_handlers(app)
    app.include_router(diagnostics_router.router, prefix="/api/v1/diagnostics")
    return TestClient(app), path


@pytest.mark.parametrize("path", [
    "/api/v1/diagnostics/cases/CASE1/candidates/draft",
    "/api/v1/diagnostics/cases/CASE1/candidates",
    "/api/v1/diagnostics/some-id/reviews",
])
def test_write_paths_are_retired(client, path):
    api, db = client
    response = api.post(path, json={"observed_issue": "x", "evidence_segment_ids": ["s"], "disposition": "VALIDATED", "rationale": "r"})
    assert response.status_code == 410
    body = response.json()
    assert body["detail"]["code"] == "RETIRED" and body["detail"]["replacement"] == "/api/v1/case-reports"
    assert body["message"].startswith("Case diagnostic review is retired")
    with sqlite3.connect(db) as con:
        assert con.execute("SELECT COUNT(*) FROM case_diagnostic_candidate").fetchone()[0] == 0


def test_reads_stay_available(client):
    api, _ = client
    response = api.get("/api/v1/diagnostics/reports/summary", params={"client_account": "Quartz"})
    assert response.status_code == 200
    assert response.json()["validated"] == 0


def test_structured_http_errors_keep_their_detail():
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/structured")
    def structured():
        raise HTTPException(status_code=409, detail={"code": "STATE_CONFLICT", "message": "Already running.", "request_id": "r1"})

    @app.get("/plain")
    def plain():
        raise HTTPException(status_code=400, detail="Bad thing")

    api = TestClient(app)
    body = api.get("/structured").json()
    assert body["message"] == "Already running." and body["detail"]["request_id"] == "r1"
    assert api.get("/plain").json() == {"status_code": 400, "message": "Bad thing", "path": "/plain"}
