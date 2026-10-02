"""RP3e review-blocking defects (reference/49 RP3e, reference/48 S21–S23)."""
import json

import pytest

from app.case_reports import review


def _items(db_path, version_id):
    return {item["item_key"]: item for item in review.get_version(db_path, version_id)["items"]}


def _block_item_ids(section):
    ids = []
    for block in section["blocks"]:
        if block["type"] == "theme_group":
            if block.get("theme_item_id"):
                ids.append(block["theme_item_id"])
            for case in block["cases"]:
                ids.extend(case["item_ids"])
        elif block.get("item_id"):
            ids.append(block["item_id"])
    return ids


def test_every_item_is_in_exactly_one_decision_capable_block(db_path, imported):
    version = review.get_version(db_path, imported)
    placed = [item_id for section in version["sections"] for item_id in _block_item_ids(section)]
    assert sorted(placed) == sorted(item["item_id"] for item in version["items"])
    assert len(placed) == len(set(placed))


def test_evidence_answers_refuse_revision_but_accept_validate_and_reject(db_path, imported):
    query = _items(db_path, imported)["query:Q1"]
    with pytest.raises(ValueError, match="Evidence answers can be validated or rejected"):
        review.record_decision(db_path, imported, query["item_id"], "r", "REVISED", revised_text="other")
    review.record_decision(db_path, imported, query["item_id"], "r", "REJECTED", comment="Wrong client scope")
    review.record_decision(db_path, imported, query["item_id"], "r", "VALIDATED")
    assert _items(db_path, imported)["query:Q1"]["current_status"] == "VALIDATED"


def test_field_only_save_on_a_decided_case(db_path, imported):
    review.decide_case(db_path, imported, "CASE001", "r", "VALIDATED")
    target = _items(db_path, imported)["finding:CASE001:what_happened"]
    result = review.decide_case(db_path, imported, "CASE001", "r", None, field_overrides=[
        {"item_id": target["item_id"], "disposition": "REVISED", "revised_text": "Configuration failed at setup"}])
    assert result["decided"] == 1
    items = _items(db_path, imported)
    assert items["finding:CASE001:what_happened"]["current_status"] == "REVISED"
    others = [item for key, item in items.items() if key.startswith("finding:CASE001:") and key != "finding:CASE001:what_happened"]
    assert all(item["current_status"] == "VALIDATED" and len(item["decisions"]) == 1 for item in others)
    assert len(items["finding:CASE001:what_happened"]["decisions"]) == 2


def test_field_only_save_refused_on_an_undecided_case(db_path, imported):
    target = _items(db_path, imported)["finding:CASE001:what_happened"]
    with pytest.raises(ValueError, match="Choose Validate or Reject"):
        review.decide_case(db_path, imported, "CASE001", "r", None, field_overrides=[
            {"item_id": target["item_id"], "disposition": "REJECTED", "comment": "Not supported"}])
    with pytest.raises(ValueError, match="Choose Validate or Reject"):
        review.decide_case(db_path, imported, "CASE001", "r", None, field_overrides=[])
    assert all(item["current_status"] == "UNVALIDATED" for key, item in _items(db_path, imported).items() if key.startswith("finding:"))


def test_section_review_counts_for_empty_partial_and_complete(db_path, imported):
    sections = {section["id"]: section["review"] for section in review.get_version(db_path, imported)["sections"]}
    assert sections["summary"] == {"decided": 0, "total": 0, "needs_review": False}
    review.decide_case(db_path, imported, "CASE001", "r", "VALIDATED")
    query = _items(db_path, imported)["query:Q1"]
    review.record_decision(db_path, imported, query["item_id"], "r", "VALIDATED")
    sections = {section["id"]: section["review"] for section in review.get_version(db_path, imported)["sections"]}
    assert sections["themes"] == {"decided": 7, "total": 8, "needs_review": True}
    assert sections["evidence"] == {"decided": 1, "total": 1, "needs_review": True}


def test_case_endpoint_accepts_overrides_without_disposition(db_path, imported, monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.case_reports import router as case_router

    monkeypatch.setattr(case_router.settings, "report_workflow_db_path", db_path)
    app = FastAPI()
    app.include_router(case_router.router, prefix="/api/v1/case-reports")
    client = TestClient(app)
    target = _items(db_path, imported)["finding:CASE001:resolution"]
    body = {"field_overrides": [{"item_id": target["item_id"], "disposition": "REJECTED", "comment": "Unsupported"}]}
    refused = client.post(f"/api/v1/case-reports/{imported}/cases/CASE001/decisions", json=body)
    assert refused.status_code == 422 and refused.json()["detail"]["errors"][0]["path"] == "disposition"
    assert client.post(f"/api/v1/case-reports/{imported}/cases/CASE001/decisions", json={"disposition": "VALIDATED"}).status_code == 200
    saved = client.post(f"/api/v1/case-reports/{imported}/cases/CASE001/decisions", json=body)
    assert saved.status_code == 200 and saved.json()["decided"] == 1
    query = _items(db_path, imported)["query:Q1"]
    revise = client.post(f"/api/v1/case-reports/{imported}/items/{query['item_id']}/decisions", json={"disposition": "REVISED", "revised_text": "x"})
    assert revise.status_code == 422 and revise.json()["detail"]["errors"][0]["path"] == "disposition"
