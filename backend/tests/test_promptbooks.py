import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.exceptions import ServiceUnavailableError
from app.promptbooks import publish as publisher
from app.promptbooks import resolve, store
from app.promptbooks import router as promptbook_router


@pytest.fixture
def promptbook_document():
    path = Path(__file__).parents[1] / "app" / "promptbooks" / "seeds" / "plan_benefit_issues_v2.json"
    return json.loads(path.read_text(encoding="utf-8"))


@pytest.fixture
def promptbook_db(tmp_path, promptbook_document):
    path = tmp_path / "promptbooks.sqlite3"
    store.initialize_store(path)
    version = store.create_version(path, promptbook_document, "seed", "initial")
    return path, version


@pytest.fixture
def client(promptbook_db, monkeypatch):
    monkeypatch.setattr(promptbook_router.settings, "report_workflow_db_path", promptbook_db[0])
    app = FastAPI()
    app.include_router(promptbook_router.router, prefix="/api/v1/promptbooks")
    return TestClient(app)


def test_draft_save_appends_revisions_and_activation_freezes_document(promptbook_db, promptbook_document):
    path, version = promptbook_db
    edited = json.loads(json.dumps(promptbook_document))
    edited["style"]["tone"] = "Short and direct."
    assert store.save_draft(path, "PLAN_BENEFIT_ISSUES", version, edited, "editor", "wording") == 2
    revisions = store.list_revisions(path, "PLAN_BENEFIT_ISSUES", version)
    assert [row["revision"] for row in revisions] == [1, 2]
    assert revisions[1]["saved_by"] == "editor"
    store.activate(path, "PLAN_BENEFIT_ISSUES", version)
    with pytest.raises(PermissionError, match="only DRAFT"):
        store.save_draft(path, "PLAN_BENEFIT_ISSUES", version, promptbook_document, "editor")
    with pytest.raises(Exception, match="immutable"):
        import sqlite3
        with sqlite3.connect(path) as connection:
            connection.execute("UPDATE promptbook_version SET document_json='{}' WHERE promptbook_id=? AND version=?",
                               ("PLAN_BENEFIT_ISSUES", version))


def test_validation_reports_all_field_paths(promptbook_document):
    bad = json.loads(json.dumps(promptbook_document))
    bad["lens"] = [{"name": "category", "values": [], "definition": ""}]
    bad["grouping"]["group_by"] = ["unknown"]
    bad["report_template"]["sections"] = [{"id": "evidence", "kind": "evidence_query", "questions": [
        {"id": "q1", "question": "Count cases for this client"}]}]
    paths = {error["path"] for error in resolve.validate_all(bad)}
    assert {"lens.0.definition", "lens.0.values", "grouping.group_by.0",
            "report_template.sections.0.questions.0.question"} <= paths


def test_routes_cover_drafts_diff_impact_activate_and_version_list(client, promptbook_db, promptbook_document):
    path, initial = promptbook_db
    activate_response = client.post(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{initial}/activate")
    assert activate_response.status_code == 200

    created = client.post("/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/drafts", json={"change_note": "copy active"})
    assert created.status_code == 201
    draft = created.json()["data"]
    version = draft["version"]
    changed = json.loads(json.dumps(promptbook_document))
    changed["style"]["tone"] = "Plain and concise."
    saved = client.put(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}",
                       json={"document": changed, "change_note": "Clarify tone"})
    assert saved.status_code == 200
    assert saved.json()["data"]["revision"] == 2
    validation = client.post(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/validate")
    assert validation.json()["data"] == {"valid": True, "errors": []}
    impact = client.get(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/impact")
    assert impact.json()["data"] == {"impact": "WORDING_ONLY", "changed_sections": ["style"]}
    diff = client.get(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/diff?against=active")
    assert diff.json()["data"]["sections"]["style"]["after"]["tone"] == "Plain and concise."

    lens_change = json.loads(json.dumps(changed))
    lens_change["lens"][0]["definition"] += " Updated."
    assert client.put(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}",
                      json={"document": lens_change}).status_code == 200
    impact = client.get(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/impact")
    assert impact.json()["data"]["impact"] == "CLASSIFICATION_RERUN"
    assert client.post(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/activate").status_code == 200
    versions = client.get("/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions").json()["data"]
    assert [(row["version"], row["status"]) for row in versions] == [(1, "RETIRED"), (2, "ACTIVE")]
    locked = client.get("/api/v1/promptbooks/locked-rules")
    assert "untrusted input" in locked.json()["data"][0]


def test_invalid_activation_and_non_draft_save_return_structured_errors(client, promptbook_db, promptbook_document):
    path, initial = promptbook_db
    store.activate(path, "PLAN_BENEFIT_ISSUES", initial)
    draft = client.post("/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/drafts", json={}).json()["data"]
    invalid = json.loads(json.dumps(promptbook_document))
    invalid["report_template"]["sections"][0]["heading"] = 5
    client.put(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{draft['version']}", json={"document": invalid})
    response = client.post(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{draft['version']}/activate")
    assert response.status_code == 422
    assert response.json()["detail"]["errors"][0]["path"] == "report_template.sections.0.heading"
    store.activate(path, "PLAN_BENEFIT_ISSUES", draft["version"])
    rejected = client.put(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{initial}",
                          json={"document": promptbook_document})
    assert rejected.status_code == 409
    assert rejected.json()["detail"]["code"] == "STATE_CONFLICT"


def test_override_resolved_origin_and_base_diff(client, promptbook_db, promptbook_document):
    path, version = promptbook_db
    store.activate(path, "PLAN_BENEFIT_ISSUES", version)
    created = client.post("/api/v1/promptbooks/CLIENT_OVERRIDE/drafts", json={
        "as_override_of": {"promptbook_id": "PLAN_BENEFIT_ISSUES", "version": version}})
    assert created.status_code == 201
    version2 = created.json()["data"]["version"]
    override = {"meta": {"promptbook_id": "CLIENT_OVERRIDE", "base": {"promptbook_id": "PLAN_BENEFIT_ISSUES", "version": version}},
                "focus": "Client-specific focus."}
    assert client.put(f"/api/v1/promptbooks/CLIENT_OVERRIDE/versions/{version2}", json={"document": override}).status_code == 200
    assert client.post(f"/api/v1/promptbooks/CLIENT_OVERRIDE/versions/{version2}/validate").json()["data"]["valid"]
    diff = client.get(f"/api/v1/promptbooks/CLIENT_OVERRIDE/versions/{version2}/diff?against=base")
    assert diff.json()["data"]["changed_sections"] == ["focus"]
    resolved = client.get(f"/api/v1/promptbooks/CLIENT_OVERRIDE/versions/{version2}/resolved").json()["data"]
    assert resolved["document"]["scope"] == promptbook_document["scope"]
    assert resolved["section_origins"]["focus"] == "override"
    assert resolved["section_origins"]["scope"] == "base"


def test_publish_failure_keeps_active_version_unpublished(client, promptbook_db, monkeypatch):
    path, version = promptbook_db
    store.activate(path, "PLAN_BENEFIT_ISSUES", version)

    def unavailable(*_args, **_kwargs):
        raise ServiceUnavailableError("offline")

    monkeypatch.setattr(publisher, "run_query", unavailable)
    response = client.post(f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/publish")
    assert response.status_code == 503
    assert "retry" in response.json()["detail"]["message"].lower()
    row = store.get_version(path, "PLAN_BENEFIT_ISSUES", version)
    assert row["status"] == "ACTIVE"
    assert row["published_at"] is None


def test_publish_success_is_marked_locally_and_is_idempotent(client, promptbook_db, monkeypatch):
    path, version = promptbook_db
    store.activate(path, "PLAN_BENEFIT_ISSUES", version)
    calls = []
    monkeypatch.setattr(publisher, "run_query", lambda query, parameters=None: calls.append((query, parameters)) or [])
    endpoint = f"/api/v1/promptbooks/PLAN_BENEFIT_ISSUES/versions/{version}/publish"
    first = client.post(endpoint)
    assert first.status_code == 200
    assert len(calls) == 2
    assert store.get_version(path, "PLAN_BENEFIT_ISSUES", version)["published_at"]
    second = client.post(endpoint)
    assert second.status_code == 200
    assert len(calls) == 2
