import json
from pathlib import Path

import pytest

from app.case_reports import review


@pytest.fixture
def package():
    # Derived from notebook 07's package assembly and citation structs.
    return {
        "package_version": 1,
        "generated_at": "2026-10-01T00:00:00+00:00",
        "run": {"analysis_run_id": "run-0001", "clients": ["Health Alliance"],
                "as_of_extract_week": "2026-09-27", "date_from": "2026-01-01", "date_to": "2026-09-30"},
        "promptbook": {"promptbook_id": "PBI", "version": 1, "title": "Benefit issues"},
        "sections": [
            {"id": "summary", "kind": "narrative", "heading": "Summary"},
            {"id": "themes", "kind": "themes", "heading": "Themes"},
            {"id": "evidence", "kind": "evidence_query", "heading": "Evidence answers"},
            {"id": "scope_appendix", "kind": "scope_appendix", "heading": "Scope decisions"},
        ],
        "themes": [{"theme_id": "T1", "theme_name_plain": "Setup failures", "problem_statement_plain": "Incorrect setup",
                    "key_systemic_action_plain": "Review configuration", "case_numbers": ["CASE001"]}],
        "cases": {"CASE001": {
            "case_number": "CASE001", "lens": {"in_scope": True, "scope_rationale": "Matches criteria",
                "citations": [{"source_type": "CHILD_SUMMARY", "record_number": "TASK001", "field_name": "task_summary",
                               "attachment_citations": [{"source_type": "ATTACHMENT_CHUNK", "record_number": "TASK001",
                                  "attachment_name": "evidence.xlsx", "page_or_sheet": "Sheet1", "excerpt": "Exact quote"}]}]},
            "finding": {"what_happened": "Configuration failed", "citations": [{"section": "what_happened",
                "source_type": "CASE_FIELD", "record_number": "CASE001", "field_name": "description", "excerpt": "Observed text"}]}}},
        "queries": [{"query_id": "Q1", "section_id": "evidence", "question": "How many tasks?", "generated_sql": "select 1",
                     "check_status": "ACCEPTED", "check_detail": "Client scoped", "result_columns": ["count"],
                     "rows": [[1]], "result_row_count": 1}],
    }


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    path = tmp_path / "review.sqlite3"
    review.initialize(path)
    return path


@pytest.fixture
def imported(db_path: Path, package: dict):
    encoded = json.dumps(package)
    first = review.import_package(db_path, encoded, "hash-1", "reviewer")
    return first["report_version_id"]
