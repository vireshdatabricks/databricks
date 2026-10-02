"""Report case selection (G19), request options (G20), and report families (G21)."""
import json
import sqlite3
from datetime import date

import pytest

from app.case_reports import requests as request_api
from app.case_reports import review, selection
from app.core.exceptions import QueryFailedError, ServiceUnavailableError
from tests.test_case_report_requests import _client

WEEK = "2026-09-21"
# Fixture definition shared by the SQL builder and the notebook-rule reference below.
CASES = [
    # case_number, week, client, opened_at, lob, service_type, category, case_group
    ("C1", WEEK, "Alpha", "2026-02-01 10:00:00", "HIX", "Issue", "BOM", "Team A"),
    ("C2", WEEK, "Alpha", "2026-03-31 23:59:00", "Med D", "Issue", "Formulary", "Team B"),
    ("C3", WEEK, "Beta", "2026-01-01 00:00:00", "HIX", "Request", "BOM", "Team C"),
    ("C4", WEEK, "Beta", "2025-12-31 23:00:00", "HIX", "Issue", "BOM", "Team A"),  # before period
    ("C5", "2026-09-14", "Alpha", "2026-02-01 10:00:00", "HIX", "Issue", "BOM", "Team A"),  # older week
    ("C6", WEEK, "Gamma", "2026-02-01 10:00:00", "HIX", "Issue", "BOM", "Team A"),  # other client
]
TASKS = [("C3", WEEK, "Team A"), ("C2", "2026-09-14", "Team A")]  # C3 matches Team A through a task only


def notebook_rule(clients, date_from, date_to, filters):
    """Transcription of ``select_population`` in databricks/notebooks/case_analysis_common.py."""
    picked = {c[0]: c for c in CASES if c[1] == WEEK and c[2] in clients and date_from <= c[3][:10] <= date_to}
    for name, index in (("line_of_business_filter", 4), ("service_type_filter", 5), ("category_filter", 6)):
        values = selection.split_values(filters.get(name))
        if values:
            picked = {k: c for k, c in picked.items() if c[index] in values}
    teams = set(selection.split_values(filters.get("functional_team_filter")))
    if teams:
        keep = {k for k, c in picked.items() if c[7] in teams}
        keep |= {t[0] for t in TASKS if t[1] == WEEK and t[0] in picked and t[2] in teams}
        picked = {k: c for k, c in picked.items() if k in keep}
    return set(picked)


def builder_rule(clients, date_from, date_to, filters):
    con = sqlite3.connect(":memory:")
    con.create_function("to_date", 1, lambda value: value[:10] if value else None)
    con.execute("CREATE TABLE case_fact (case_number, as_of_extract_week, client_account, opened_at, line_of_business, "
                "service_type, category, case_assignment_group)")
    con.execute("CREATE TABLE task_fact (case_number, as_of_extract_week, task_assignment_group)")
    con.executemany("INSERT INTO case_fact VALUES (?, ?, ?, ?, ?, ?, ?, ?)", CASES)
    con.executemany("INSERT INTO task_fact VALUES (?, ?, ?)", TASKS)
    where, params = selection.case_selection("case_fact", "task_fact", clients, date.fromisoformat(date_from),
                                             date.fromisoformat(date_to), filters)
    params["week"] = WEEK
    return {row[0] for row in con.execute(f"SELECT c.case_number FROM case_fact c WHERE {where}", params)}


@pytest.mark.parametrize(("clients", "filters"), [
    (["Alpha", "Beta"], {}),
    (["Alpha"], {"line_of_business_filter": "HIX"}),
    (["Alpha", "Beta"], {"line_of_business_filter": "HIX, Med D", "category_filter": "BOM"}),
    (["Alpha", "Beta"], {"functional_team_filter": "Team A"}),
    (["Beta"], {"service_type_filter": "Request", "functional_team_filter": "Team C,Team A"}),
    (["Gamma", "Alpha"], {"category_filter": "Nothing"}),
])
def test_selection_builder_matches_notebook_rule(clients, filters):
    expected = notebook_rule(clients, "2026-01-01", "2026-03-31", filters)
    assert builder_rule(clients, "2026-01-01", "2026-03-31", filters) == expected


def test_selection_period_bounds_are_inclusive_dates():
    assert builder_rule(["Alpha", "Beta"], "2026-01-01", "2026-03-31", {}) == {"C1", "C2", "C3"}


class FakeWarehouse:
    """Answers the preview's queries; records what was asked."""

    def __init__(self, status="READY", counts=None):
        self.status, self.counts, self.calls = status, counts or {}, []

    def __call__(self, query, params=None):
        self.calls.append((query, params or {}))
        if "MAX(as_of_extract_week) AS week" in query:
            return [{"week": WEEK}]
        if "gold_publication_registry" in query:
            return [{"status": self.status}]
        return [{"client_account": client, "cases": n} for client, n in self.counts.items()]


def _preview_body(**overrides):
    body = {"promptbook_id": "PBI", "client_accounts": ["Beta", "Alpha"], "date_from": "2026-01-01", "date_to": "2026-03-31"}
    body.update(overrides)
    return body


def test_preview_counts_per_client(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    warehouse = FakeWarehouse(counts={"Alpha": 2, "Beta": 1})
    monkeypatch.setattr(request_api, "run_query", warehouse)
    result = client.post("/api/v1/case-reports/request-preview", json=_preview_body(filters={"category_filter": "BOM"}))
    assert result.status_code == 200
    data = result.json()["data"]
    assert data["matching_cases_total"] == 3
    assert data["by_client"] == [{"client_account": "Alpha", "cases": 2}, {"client_account": "Beta", "cases": 1}]
    assert data["warnings"] == [] and data["as_of_extract_week"] == WEEK
    query, params = warehouse.calls[-1]
    assert "c.category IN (:cate0)" in query and params["cate0"] == "BOM" and params["week"] == WEEK


def test_preview_zero_match_and_not_ready_warning(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    monkeypatch.setattr(request_api, "run_query", FakeWarehouse(status="BUILDING"))
    data = client.post("/api/v1/case-reports/request-preview", json=_preview_body()).json()["data"]
    assert data["matching_cases_total"] == 0
    assert data["by_client"] == [{"client_account": "Alpha", "cases": 0}, {"client_account": "Beta", "cases": 0}]
    assert "not published as READY" in data["warnings"][0]


def test_preview_validation_and_unavailable(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    bad = client.post("/api/v1/case-reports/request-preview", json=_preview_body(date_to="2025-01-01"))
    assert bad.status_code == 422 and bad.json()["detail"]["errors"][0]["path"] == "date_to"
    unsupported = client.post("/api/v1/case-reports/request-preview", json=_preview_body(filters={"owner": "x"}))
    assert unsupported.status_code == 422

    def down(*_args, **_kwargs):
        raise ServiceUnavailableError("down")
    monkeypatch.setattr(request_api, "run_query", down)
    result = client.post("/api/v1/case-reports/request-preview", json=_preview_body())
    assert result.status_code == 503 and result.json()["detail"]["code"] == "UPSTREAM_UNAVAILABLE"


def test_options_sort_case_insensitively_and_narrow_by_client(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    calls = []

    def warehouse(query, params=None):
        calls.append((query, params or {}))
        if query.startswith("SHOW COLUMNS"):
            return [{"col_name": c} for c in ("client_account", "line_of_business", "case_assignment_group", "category")]
        return [{"dim": "client_accounts", "value": v} for v in ("eternalHealth", "Beta", "alpha")] + [
            {"dim": "line_of_business_filter", "value": "hix"}, {"dim": "line_of_business_filter", "value": "Med D"},
            {"dim": "functional_team_filter", "value": "Team B"}, {"dim": "functional_team_filter", "value": "Team B"}]
    monkeypatch.setattr(request_api, "run_query", warehouse)
    data = client.get("/api/v1/case-reports/request-options", params={"client_accounts": ["Beta"]}).json()["data"]
    assert data["client_accounts"] == ["alpha", "Beta", "eternalHealth"]
    assert data["filter_values"]["line_of_business_filter"] == ["hix", "Med D"]
    assert data["filter_values"]["functional_team_filter"] == ["Team B"]
    assert data["availability"]["service_type_filter"] == {"available": False, "reason": "column_missing"}
    assert data["availability"]["category_filter"] == {"available": True, "reason": None}
    query, params = calls[-1]
    assert "latest.client_account IN (:client0)" in query and params == {"client0": "Beta"}


def test_options_query_failure_is_reported_separately(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)

    def broken(*_args, **_kwargs):
        raise QueryFailedError("bad column")
    monkeypatch.setattr(request_api, "run_query", broken)
    data = client.get("/api/v1/case-reports/request-options").json()["data"]
    assert data["availability"]["line_of_business_filter"] == {"available": False, "reason": "query_failed"}


def test_families_group_versions_and_backfill(db_path, package):
    rerun = json.loads(json.dumps(package))
    rerun["run"]["analysis_run_id"] = "run-0002"
    other = json.loads(json.dumps(package))
    other["run"]["analysis_run_id"] = "run-0003"
    other["run"]["date_from"] = "2026-02-01"
    first = review.import_package(db_path, json.dumps(package), "hash-a", "reviewer")["report_version_id"]
    second = review.import_package(db_path, json.dumps(rerun), "hash-b", "reviewer")["report_version_id"]
    third = review.import_package(db_path, json.dumps(other), "hash-c", "reviewer")["report_version_id"]

    # Simulate a version imported before G21: its scope columns are empty until initialize backfills them.
    with sqlite3.connect(db_path) as con:
        con.execute("UPDATE case_report_version SET family_key = NULL, date_from = NULL WHERE report_version_id = ?", (first,))
    review.initialize(db_path)

    result = review.list_families(db_path)
    families = {f["latest"]["report_version_id"]: f for f in result["families"]}
    assert set(families) == {second, third}
    assert [v["report_version_id"] for v in families[second]["versions"]] == [first]
    assert families[second]["date_from"] == "2026-01-01" and families[third]["date_from"] == "2026-02-01"
    assert families[second]["latest"]["total"] > 0 and families[second]["latest"]["decided"] == 0
    assert result["status_counts"] == {"IN_REVIEW": 2}


def test_family_list_endpoint_includes_promptbook_name(db_path, package, monkeypatch):
    client = _client(db_path, monkeypatch)
    with sqlite3.connect(db_path) as con:
        con.execute("INSERT OR REPLACE INTO promptbook_version (promptbook_id, version, status, document_json, created_by, created_at, "
                    "activated_at, published_at) VALUES ('PBI', 1, 'ACTIVE', ?, 'tester', '2026-10-01', '2026-10-01', '2026-10-01')",
                    (json.dumps({"meta": {"promptbook_id": "PBI", "name": "Benefit issues"}}),))
    review.import_package(db_path, json.dumps(package), "hash-a", "reviewer")
    data = client.get("/api/v1/case-reports", params={"group": "family"}).json()["data"]
    assert data["families"][0]["promptbook"] == {"id": "PBI", "version": 1, "name": "Benefit issues"}


def test_request_option_queries_exclude_blank_values(db_path, monkeypatch):
    client = _client(db_path, monkeypatch)
    queries = []

    def warehouse(query, params=None):
        queries.append(query)
        if query.startswith("SHOW COLUMNS"):
            return [{"col_name": c} for c in ("client_account", "line_of_business", "case_assignment_group", "category", "service_type")]
        return [{"dim": "client_accounts", "value": "Alpha"}, {"dim": "category_filter", "value": "  "}]
    monkeypatch.setattr(request_api, "run_query", warehouse)
    data = client.get("/api/v1/case-reports/request-options").json()["data"]
    assert data["filter_values"]["category_filter"] == []
    assert "trim(category) <> ''" in queries[-1] and "trim(client_account) <> ''" in queries[-1]
