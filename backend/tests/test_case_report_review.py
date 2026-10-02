import json
import sqlite3
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.case_reports import review
from app.case_reports import router as review_router


def test_sanitized_package_preserves_real_citation_shape_and_omits_theme_associations(db_path):
    fixture_path = Path(__file__).parent / "fixtures" / "citation_package_sanitized.json"
    package = json.loads(fixture_path.read_text(encoding="utf-8"))
    version_id = review.import_package(db_path, json.dumps(package), "hash-citation-shape", "reviewer")["report_version_id"]
    items = {item["item_key"]: item for item in review.get_version(db_path, version_id)["items"]}

    # Theme membership is not a source citation; the panel should not claim that it
    # verified a quote-less CASE source.
    assert items["theme:THEME-SAMPLE"]["citations"] == []

    scope_citation = items["scope:CASE-SAMPLE-1"]["citations"][0]
    assert scope_citation["source_type"] == "FINDING_FIELD"
    assert scope_citation["record"] == "CASE-SAMPLE-1"
    assert scope_citation["quote"] == "SANITIZED QUOTE A"
    assert scope_citation["extract_week"] == "2026-09-21"

    finding_citations = items["finding:CASE-SAMPLE-1:what_happened"]["citations"]
    assert finding_citations[0] == {
        "source_type": "CASE_FIELD", "record": "CASE-SAMPLE-1", "field": "case_description",
        "file": None, "sheet": None, "quote": "SANITIZED QUOTE B", "extract_week": "2026-09-21", "children": [],
    }
    summary = finding_citations[1]
    assert summary["source_type"] == "CHILD_SUMMARY"
    assert summary["record"] == "TASK-SAMPLE-1"
    assert summary["field"] == "task_summary"
    assert summary["quote"] == "SANITIZED SUMMARY QUOTE"
    assert summary["extract_week"] == "2026-09-21"
    assert summary["children"] == [{
        "source_type": "ATTACHMENT_CHUNK", "record": "TASK-SAMPLE-1", "field": None,
        "file": "attachment-sample.xlsx", "sheet": "Sheet-Sample", "quote": "SANITIZED ATTACHMENT QUOTE",
        "extract_week": "2026-09-21", "children": [],
    }]


def test_import_populates_sections_origins_structured_query_and_nested_citations(db_path, package):
    version_id = review.import_package(db_path, json.dumps(package), "hash-import", "reviewer")["report_version_id"]
    result = review.get_version(db_path, version_id)
    assert [section["id"] for section in result["sections"]] == ["summary", "themes", "evidence", "scope_appendix"]
    items = {item["item_key"]: item for item in result["items"]}
    assert items["theme:T1"]["section_id"] == "themes"
    assert items["theme:T1"]["origin"] == "MODEL"
    assert items["finding:CASE001:what_happened"]["origin"] == "MODEL"
    assert items["scope:CASE001"]["section_id"] == "scope_appendix"
    answer = items["query:Q1"]
    assert answer["origin"] == "COMPUTED"
    assert answer["body_text"] == "1 rows returned."
    assert answer["detail"] == {"question": "How many tasks?", "generated_sql": "select 1", "check_status": "ACCEPTED",
                                 "check_detail": "Client scoped", "result_columns": ["count"], "rows": [[1]],
                                 "row_count": 1, "section_id": "evidence"}
    cite = items["finding:CASE001:what_happened"]["citations"][0]
    assert cite == {"source_type": "CASE_FIELD", "record": "CASE001", "field": "description", "file": None,
                    "sheet": None, "quote": "Observed text", "extract_week": "2026-09-27", "children": []}
    child = items["scope:CASE001"]["citations"][0]
    assert child["children"][0]["file"] == "evidence.xlsx"
    assert child["children"][0]["sheet"] == "Sheet1"
    assert child["children"][0]["quote"] == "Exact quote"
    assert result["sections"][1]["item_counts"]["UNVALIDATED"] == 8


def test_additive_backfill_keeps_frozen_package_unchanged(db_path, package):
    version_id = review.import_package(db_path, json.dumps(package), "hash-backfill", "reviewer")["report_version_id"]
    with sqlite3.connect(db_path) as connection:
        frozen = connection.execute("SELECT package_json FROM case_report_version WHERE report_version_id=?", (version_id,)).fetchone()[0]
        for column in ("section_id", "origin", "detail_json"):
            connection.execute(f"ALTER TABLE case_report_item DROP COLUMN {column}")
        connection.commit()
    review.initialize(db_path)
    result = review.get_version(db_path, version_id)
    assert next(i for i in result["items"] if i["item_key"] == "query:Q1")["detail"]["generated_sql"] == "select 1"
    with sqlite3.connect(db_path) as connection:
        after = connection.execute("SELECT package_json FROM case_report_version WHERE report_version_id=?", (version_id,)).fetchone()[0]
    assert after == frozen


def test_bulk_validate_is_atomic_and_reports_excluded_and_already_decided(db_path, package):
    package["cases"]["CASE002"] = {"case_number": "CASE002", "lens": {"in_scope": True},
                                   "finding": {"what_happened": "Different", "citations": []}}
    package["themes"][0]["case_numbers"].append("CASE002")
    version_id = review.import_package(db_path, json.dumps(package), "hash-bulk", "reviewer")["report_version_id"]
    items = review.get_version(db_path, version_id)["items"]
    first = next(i for i in items if i["item_key"] == "finding:CASE001:what_happened")
    second = next(i for i in items if i["item_key"] == "finding:CASE002:what_happened")
    review.record_decision(db_path, version_id, first["item_id"], "reviewer", "VALIDATED")
    result = review.validate_theme(db_path, version_id, "T1", "reviewer", "Looks good", [second["item_id"]])
    assert result == {"validated": 12, "skipped_decided": 1, "excluded": 1, "report_status": "IN_REVIEW",
                      "cases": ["CASE001", "CASE002"]}
    assert next(i for i in review.get_version(db_path, version_id)["items"] if i["item_id"] == second["item_id"])["current_status"] == "UNVALIDATED"
    with pytest.raises(ValueError):
        review.validate_theme(db_path, version_id, "T1", "reviewer", exclude_item_ids=["other"])


def test_prefill_preview_matches_actual_copy(db_path, package):
    source = review.import_package(db_path, json.dumps(package), "hash-source", "reviewer")["report_version_id"]
    target = review.import_package(db_path, json.dumps(package), "hash-target", "reviewer")["report_version_id"]
    # Different package hashes are allowed while keeping equivalent review content.
    items = review.get_version(db_path, source)["items"]
    decision_item = next(i for i in items if i["kind"] == "FINDING")
    review.record_decision(db_path, source, decision_item["item_id"], "reviewer", "VALIDATED")
    preview = review.prefill_preview(db_path, target, source)
    assert preview == {"copyable": 1, "remaining": len(review.get_version(db_path, target)["items"]) - 1,
                       "from_report_version_id": source}
    actual = review.prefill_from(db_path, target, source, "reviewer")
    assert actual["prefilled_items"] == preview["copyable"]
    assert review.get_version(db_path, target)["status_counts"]["VALIDATED"] == preview["copyable"]


def test_export_history_orders_rows_and_decodes_counts(db_path, imported):
    counts = {"UNVALIDATED": 4, "VALIDATED": 0}
    review.record_export(db_path, imported, "reviewer", "html", False, counts)
    review.record_export(db_path, imported, "reviewer", "xlsx", True, {"VALIDATED": 2})
    exports = review.list_exports(db_path, imported)
    assert len(exports) == 2
    assert exports[0]["export_format"] == "xlsx"
    assert exports[0]["validated_only"] is True
    assert exports[0]["status_counts"] == {"VALIDATED": 2}


def test_signoff_blocks_decisions_with_current_status_and_immutability_triggers_remain(db_path, imported):
    version = review.get_version(db_path, imported)
    for item in version["items"]:
        review.record_decision(db_path, imported, item["item_id"], "reviewer", "VALIDATED")
    review.sign_off(db_path, imported, "reviewer", "Reviewed all items.")
    decided = review.get_version(db_path, imported)["items"][0]
    with pytest.raises(PermissionError, match="SIGNED_OFF"):
        review.record_decision(db_path, imported, decided["item_id"], "reviewer", "VALIDATED")
    with sqlite3.connect(db_path) as connection, pytest.raises(sqlite3.IntegrityError, match="frozen snapshots"):
        connection.execute("UPDATE case_report_item SET body_text='changed' WHERE item_id=?", (decided["item_id"],))
    with sqlite3.connect(db_path) as connection, pytest.raises(sqlite3.IntegrityError, match="frozen snapshots"):
        connection.execute("UPDATE case_report_version SET package_json='{}' WHERE report_version_id=?", (imported,))
    with sqlite3.connect(db_path) as connection, pytest.raises(sqlite3.IntegrityError, match="immutable"):
        connection.execute("UPDATE case_report_decision SET comment='changed'")
    with sqlite3.connect(db_path) as connection, pytest.raises(sqlite3.IntegrityError, match="frozen snapshots"):
        connection.execute("UPDATE case_report_item SET origin='COMPUTED'")


def test_review_routes_return_structured_409_and_422(db_path, imported, monkeypatch):
    monkeypatch.setattr(review_router.settings, "report_workflow_db_path", db_path)
    version = review.get_version(db_path, imported)
    for item in version["items"]:
        review.record_decision(db_path, imported, item["item_id"], "reviewer", "VALIDATED")
    review.sign_off(db_path, imported, "reviewer", "Reviewed all items.")
    app = FastAPI()
    app.include_router(review_router.router, prefix="/api/v1/case-reports")
    client = TestClient(app)
    item_id = version["items"][0]["item_id"]
    conflict = client.post(f"/api/v1/case-reports/{imported}/items/{item_id}/decisions", json={"disposition": "VALIDATED"})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "STATE_CONFLICT"
    assert "SIGNED_OFF" in conflict.json()["detail"]["message"]
    invalid = client.post(f"/api/v1/case-reports/{imported}/items/{item_id}/decisions", json={"disposition": "UNKNOWN"})
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["code"] == "INVALID_INPUT"
    assert invalid.json()["detail"]["errors"][0]["path"] == "disposition"
    review.record_export(db_path, imported, "reviewer", "html", False, {"UNVALIDATED": 0, "VALIDATED": 1})
    history = client.get(f"/api/v1/case-reports/{imported}/exports")
    assert history.status_code == 200
    assert len(history.json()["data"]) == 1
    missing = client.get("/api/v1/case-reports/not-a-version/exports")
    assert missing.status_code == 404
    assert missing.json()["detail"]["code"] == "NOT_FOUND"


def test_v2_sections_include_ordered_blocks_grouped_cases_and_number(db_path, package):
    package["sections"][0]["heading"] = "1. Summary"
    package["sections"][1]["heading"] = "4. Themes"
    package["sections"][2]["heading"] = "5. Evidence answers"
    package["sections"][2]["queries"] = [{"query_id": "Q1"}]
    package["sections"][1]["text"] = "Static themes introduction"
    version_id = review.import_package(db_path, json.dumps(package), "hash-v2-blocks", "reviewer")["report_version_id"]
    result = review.get_version(db_path, version_id)
    assert result["payload_version"] == 2
    assert [s["id"] for s in result["sections"]] == ["summary", "themes", "evidence", "scope_appendix"]
    themes = result["sections"][1]
    assert (themes["number"], themes["heading"]) == ("4", "Themes")
    assert themes["review"] == {"decided": 0, "total": 8, "needs_review": True}
    assert themes["blocks"][0] == {"type": "text", "origin": "TEMPLATE", "text": "Static themes introduction", "generated": False}
    group = next(b for b in themes["blocks"] if b["type"] == "theme_group")
    assert group["theme_item_id"] == next(i["item_id"] for i in result["items"] if i["item_key"] == "theme:T1")
    assert group["cases"][0]["case_number"] == "CASE001"
    assert len(group["cases"][0]["item_ids"]) == 7
    assert group["cases"][0]["summary"] == {"undecided": 7, "validated": 0, "revised": 0, "rejected": 0}
    assert any(b["type"] == "evidence_answer" and b["item_id"] for b in result["sections"][2]["blocks"])
    assert result["sections"][0]["review"]["needs_review"] is False
    assert result["sections"][0]["review"]["total"] == 0


def test_case_decision_with_field_overrides_and_multi_theme_case(db_path, package):
    package["themes"].append({**package["themes"][0], "theme_id": "T2", "theme_name_plain": "Second theme"})
    version_id = review.import_package(db_path, json.dumps(package), "hash-case-override", "reviewer")["report_version_id"]
    result = review.get_version(db_path, version_id)
    case_ids = next(b for b in result["sections"][1]["blocks"] if b["type"] == "theme_group")["cases"][0]["item_ids"]
    overridden = next(i for i in result["items"] if i["item_key"] == "finding:CASE001:what_happened")
    response = review.decide_case(db_path, version_id, "CASE001", "reviewer", "VALIDATED", "Reviewed",
                                  [{"item_id": overridden["item_id"], "disposition": "REVISED",
                                    "revised_text": "Corrected finding"}])
    assert response == {"decided": 7, "report_status": "IN_REVIEW"}
    after = review.get_version(db_path, version_id)
    changed = next(i for i in after["items"] if i["item_id"] == overridden["item_id"])
    assert changed["current_status"] == "REVISED"
    assert changed["decisions"][-1]["revised_text"] == "Corrected finding"
    assert len(case_ids) == 7
    theme_groups = [b for s in after["sections"] for b in s["blocks"] if b["type"] == "theme_group"]
    assert len(theme_groups) == 2
    assert all(group["cases"][0]["summary"]["revised"] == 1 for group in theme_groups)


@pytest.mark.parametrize("kwargs, message", [
    ({"disposition": "REJECTED"}, "rejection needs a comment"),
    ({"disposition": "VALIDATED", "field_overrides": [{"item_id": "x", "disposition": "REVISED"}]}, "revised text"),
    ({"disposition": "VALIDATED", "field_overrides": [{"item_id": "x", "disposition": "REJECTED"}]}, "rejection needs a comment"),
    ({"disposition": "VALIDATED", "field_overrides": [{"item_id": "x", "disposition": "REVISED", "revised_text": "x"}]}, "field_overrides must identify"),
])
def test_case_decision_validation_and_atomicity(db_path, imported, kwargs, message):
    with pytest.raises(ValueError, match=message):
        review.decide_case(db_path, imported, "CASE001", "reviewer", **kwargs)
    assert review.get_version(db_path, imported)["status_counts"]["UNVALIDATED"] == 10


def test_case_decision_rejects_after_signoff(db_path, imported):
    for item in review.get_version(db_path, imported)["items"]:
        review.record_decision(db_path, imported, item["item_id"], "reviewer", "VALIDATED")
    review.sign_off(db_path, imported, "reviewer", "Reviewed")
    with pytest.raises(PermissionError, match="SIGNED_OFF"):
        review.decide_case(db_path, imported, "CASE001", "reviewer", "VALIDATED")


def test_html_export_fixture_has_stable_bytes():
    import hashlib
    from app.case_reports import exports

    package = {"generated_at": "2026-10-02T12:30:00+00:00",
               "run": {"clients": ["Client A"], "analysis_run_id": "run-123", "model_id": "model-x"},
               "promptbook": {"title": "Fixture report", "promptbook_id": "book-1", "version": 1},
               "sections": [{"id": "intro", "kind": "narrative", "heading": "1. Introduction", "text": "Static text"}],
               "disclosures": []}
    rendered = exports.render_html(package).encode("utf-8")
    assert hashlib.sha256(rendered).hexdigest() == "89802602a8b05654d8c5c676b21656ad988298ebf1e5b090014a44a7aa88dfab"


def test_case_decision_route_accepts_group_and_returns_409_after_signoff(db_path, imported, monkeypatch):
    monkeypatch.setattr(review_router.settings, "report_workflow_db_path", db_path)
    app = FastAPI()
    app.include_router(review_router.router, prefix="/api/v1/case-reports")
    client = TestClient(app)
    path = f"/api/v1/case-reports/{imported}/cases/CASE001/decisions"
    response = client.post(path, json={"disposition": "VALIDATED", "comment": "Reviewed"})
    assert response.status_code == 200
    assert response.json() == {"decided": 7, "report_status": "IN_REVIEW"}
    invalid = client.post(path, json={"disposition": "REJECTED"})
    assert invalid.status_code == 422
    for item in review.get_version(db_path, imported)["items"]:
        if item["current_status"] == "UNVALIDATED":
            review.record_decision(db_path, imported, item["item_id"], "reviewer", "VALIDATED")
    review.sign_off(db_path, imported, "reviewer", "Reviewed")
    conflict = client.post(path, json={"disposition": "VALIDATED"})
    assert conflict.status_code == 409
