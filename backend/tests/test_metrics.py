"""Interim workflow and recurrence metrics (reference/51 WP6, WP7)."""
import sqlite3
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.exceptions import BadRequestError
from app.metrics import labels, repository, router as metrics_router, service

WEEK = date(2026, 9, 21)
DEFINITIONS = [
    {"metric_id": "WF-08", "label": "DIRECT", "unlock_condition": "Reopen history", "threshold_json": None},
    {"metric_id": "RC-01", "label": "CANDIDATE", "threshold_json": '{"rule_version": "rc-v1", "long_range_days": 180}'},
    {"metric_id": "RC-02", "label": "CANDIDATE", "threshold_json": '{"min_labels": 3, "sample_per_tier": 4}'},
]


@pytest.fixture
def db(tmp_path, monkeypatch):
    path = tmp_path / "metrics.sqlite3"
    monkeypatch.setattr(service.settings, "report_workflow_db_path", path)
    monkeypatch.setattr(service.analytics, "resolve_as_of_week", lambda requested: requested or WEEK)
    monkeypatch.setattr(repository, "definitions", lambda: [dict(row) for row in DEFINITIONS])
    labels.initialize(path)
    return path


def _sample(db, tier="A", pairs=("p1", "p2", "p3", "p4")):
    return labels.ensure_sample(db, "rc-v1", tier, "2026-09-21", lambda: list(pairs))


def test_sample_is_frozen_and_labels_are_immutable(db):
    assert _sample(db) == ["p1", "p2", "p3", "p4"]
    assert _sample(db, pairs=("x", "y")) == ["p1", "p2", "p3", "p4"]
    labels.record_label(db, "rc-v1", "p1", "SAME_ISSUE", None, "r1")
    with sqlite3.connect(db) as con, pytest.raises(sqlite3.IntegrityError):
        con.execute("UPDATE recurrence_pair_label SET verdict = 'UNSURE'")
    with sqlite3.connect(db) as con, pytest.raises(sqlite3.IntegrityError):
        con.execute("DELETE FROM recurrence_label_sample")


def test_only_sampled_pairs_can_be_labelled(db):
    _sample(db)
    with pytest.raises(LookupError):
        labels.record_label(db, "rc-v1", "not-sampled", "SAME_ISSUE", None, "r1")
    with pytest.raises(ValueError):
        labels.record_label(db, "rc-v1", "p1", "MAYBE", None, "r1")


def test_precision_uses_latest_label_and_hides_below_minimum(db):
    _sample(db)
    labels.record_label(db, "rc-v1", "p1", "DIFFERENT_ISSUE", None, "r1")
    labels.record_label(db, "rc-v1", "p1", "SAME_ISSUE", "changed my mind", "r1")
    labels.record_label(db, "rc-v1", "p2", "UNSURE", None, "r1")
    result = labels.precision(db, "rc-v1", min_labels=3)["A"]
    assert (result["same_issue"], result["different_issue"], result["unsure"]) == (1, 0, 1)
    assert result["status"] == "CANDIDATE" and result["precision"] == 1.0
    labels.record_label(db, "rc-v1", "p3", "DIFFERENT_ISSUE", None, "r1")
    labels.record_label(db, "rc-v1", "p4", "SAME_ISSUE", None, "r1")
    result = labels.precision(db, "rc-v1", min_labels=3)["A"]
    assert result["status"] == "DIRECT" and result["precision"] == pytest.approx(2 / 3, abs=1e-4)
    assert result["false_positive_rate"] == pytest.approx(1 / 3, abs=1e-4)


def test_reviewer_agreement(db):
    _sample(db)
    labels.record_label(db, "rc-v1", "p1", "SAME_ISSUE", None, "r1")
    labels.record_label(db, "rc-v1", "p1", "SAME_ISSUE", None, "r2")
    labels.record_label(db, "rc-v1", "p2", "SAME_ISSUE", None, "r1")
    labels.record_label(db, "rc-v1", "p2", "DIFFERENT_ISSUE", None, "r2")
    assert labels.precision(db, "rc-v1", 3)["A"]["reviewer_agreement"] == 0.5


def test_next_pair_balances_tiers_per_reviewer(db):
    _sample(db, "A", ("a1", "a2"))
    _sample(db, "B", ("b1", "b2"))
    first, progress = labels.next_pair(db, "rc-v1", "r1")
    assert first == "a1" and progress["A"] == {"labelled": 0, "sampled": 2}
    labels.record_label(db, "rc-v1", "a1", "SAME_ISSUE", None, "r1")
    assert labels.next_pair(db, "rc-v1", "r1")[0] == "b1"
    assert labels.next_pair(db, "rc-v1", "r2")[0] == "a1"


def test_reopens_not_available_with_one_extract(db, monkeypatch):
    monkeypatch.setattr(repository, "extract_weeks", lambda: [WEEK])
    data = service.get_reopens(None, None)["data"]
    assert data["status"] == "NOT_AVAILABLE" and data["observation_starts_after"] == "2026-09-21"
    assert "reopened_count" not in data and data["unlock_condition"] == "Reopen history"


def test_reopens_rate_from_second_extract(db, monkeypatch):
    monkeypatch.setattr(repository, "extract_weeks", lambda: [date(2026, 9, 14), WEEK])
    monkeypatch.setattr(repository, "reopen_summary", lambda week, prior, client: {"closed_in_prior_extract": 50, "by_basis": [], "reopened_count": 2})
    data = service.get_reopens(None, None)["data"]
    assert data["status"] == "AVAILABLE" and data["rate"] == 0.04 and data["prior_extract_week"] == "2026-09-14"


def test_baseline_segment_selection(db, monkeypatch):
    seen = []
    monkeypatch.setattr(repository, "baselines", lambda week, ids, kind, value: seen.append((kind, value)) or [])
    service.get_baselines(None, ["WF-05"], {"client_account": "Quartz"})
    service.get_baselines(None, ["WF-05"], {"client_account": "Quartz", "category": "BOM"})
    assert seen == [("CLIENT", "Quartz"), ("ALL", "All")]
    with pytest.raises(BadRequestError):
        service.get_baselines(None, ["NOPE"], {})


def test_windows_attach_precision_only_when_measured(db, monkeypatch):
    rows = [{"window_code": "30", "window_days": 30, "tier": tier, "related_case_count": 10, "closed_index_count": 100} for tier in ("A", "B", "ALL")]
    monkeypatch.setattr(repository, "recurrence_windows", lambda week, kind, value: [dict(row) for row in rows])
    monkeypatch.setattr(repository, "remediation_rows", lambda week: [])
    _sample(db, "A", ("a1", "a2", "a3"))
    for pair, verdict in (("a1", "SAME_ISSUE"), ("a2", "SAME_ISSUE"), ("a3", "DIFFERENT_ISSUE")):
        labels.record_label(db, "rc-v1", pair, verdict, None, "r1")
    windows = {row["tier"]: row for row in service.get_recurrence_windows(None, None)["data"]["windows"]}
    assert windows["A"]["precision"] == pytest.approx(0.6667, abs=1e-4)
    assert windows["A"]["precision_adjusted_related_cases"] == pytest.approx(6.7)
    assert windows["B"]["precision"] is None and windows["B"]["precision_adjusted_related_cases"] is None


def test_label_endpoint_and_queue(db, monkeypatch):
    monkeypatch.setattr(repository, "sample_candidates", lambda week, rule, tier, size: [f"{tier}{i}" for i in range(size)])
    monkeypatch.setattr(repository, "pair_detail", lambda pair_id: {"pair_id": pair_id, "match_tier": pair_id[0]})
    app = FastAPI()
    app.include_router(metrics_router.router, prefix="/api/v1/analytics")
    client = TestClient(app)
    queue = client.get("/api/v1/analytics/recurrence/label-queue", headers={"X-Report-Reviewer": "r1"}).json()["data"]
    assert queue["pair"]["pair_id"] == "A0" and queue["progress"]["B"] == {"labelled": 0, "sampled": 4}
    saved = client.post("/api/v1/analytics/recurrence/pairs/A0/labels", json={"verdict": "SAME_ISSUE"}, headers={"X-Report-Reviewer": "r1"})
    assert saved.status_code == 201 and saved.json()["data"]["match_tier"] == "A"
    missing = client.post("/api/v1/analytics/recurrence/pairs/zzz/labels", json={"verdict": "SAME_ISSUE"})
    assert missing.status_code == 404
    bad = client.post("/api/v1/analytics/recurrence/pairs/A1/labels", json={"verdict": "MAYBE"})
    assert bad.status_code == 422
    assert client.get("/api/v1/analytics/recurrence/label-queue", headers={"X-Report-Reviewer": "r1"}).json()["data"]["pair"]["pair_id"] == "B0"
