"""Interim workflow and recurrence metrics (reference/51 §5). Every response carries its labels."""
from __future__ import annotations

import json
from datetime import date
from typing import Any

from app.analytics import service as analytics
from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError
from app.metrics import labels, repository

WORKFLOW_METRICS = ["WF-01", "WF-06", "WF-07"]
DURATION_METRICS = ["WF-03", "WF-04", "WF-05", "WF-05-BD", "WF-11-TASK", "WF-11-SUBTASK"]
LIMITATIONS = [
    "Proxies are derived from task timestamps in weekly snapshot extracts; they are not first-response, assignment, or activity history.",
    "Recurrence pairs are candidates from a field-matching rule; precision comes only from reviewer labels on a random sample.",
]


def _db():
    labels.initialize(settings.report_workflow_db_path)
    return settings.report_workflow_db_path


def _envelope(week: date, data: Any, next_cursor: str | None = None) -> dict:
    body = analytics._envelope(week, data, next_cursor)
    body["data_limitations"] = LIMITATIONS
    return body


def definitions_by_id() -> dict[str, dict[str, Any]]:
    result = {}
    for row in repository.definitions():
        row = dict(row)
        row["threshold"] = json.loads(row["threshold_json"]) if row.get("threshold_json") else {}
        result[row["metric_id"]] = row
    return result


def get_definitions() -> dict:
    week = analytics.resolve_as_of_week(None)
    return _envelope(week, list(definitions_by_id().values()))


def _segment(filters: dict[str, Any]) -> tuple[str, str, str | None]:
    """Baseline segment for the active filters: one dimension maps to its segment, otherwise All."""
    mapping = [("client_account", "CLIENT"), ("category", "CATEGORY"), ("case_assignment_group", "ASSIGNMENT_GROUP")]
    active = [(column, kind) for column, kind in mapping if filters.get(column)]
    if len(active) == 1:
        column, kind = active[0]
        return kind, str(filters[column]), None
    note = "Baselines cover all cases because more than one filter is applied." if len(active) > 1 else None
    return "ALL", "All", note


def get_baselines(as_of_week: date | None, metric_ids: list[str], filters: dict[str, Any]) -> dict:
    allowed = set(WORKFLOW_METRICS + DURATION_METRICS)
    if not metric_ids or set(metric_ids) - allowed:
        raise BadRequestError(f"metric_ids must be among {sorted(allowed)}")
    week = analytics.resolve_as_of_week(as_of_week)
    segment_type, segment_value, note = _segment(filters)
    rows = repository.baselines(week, metric_ids, segment_type, segment_value)
    return _envelope(week, {"segment_type": segment_type, "segment_value": segment_value, "note": note, "rows": rows})


def list_workflow(as_of_week: date | None, filters: dict[str, Any], sort: str | None, limit: int, cursor: str | None) -> dict:
    week = analytics.resolve_as_of_week(as_of_week)
    order_by = repository.WORKFLOW_SORTS.get(sort or "handoffs")
    if order_by is None:
        raise BadRequestError(f"Unsupported sort: {sort}")
    offset = analytics._decode_cursor(cursor)
    rows = repository.workflow_rows(week, filters, order_by, limit, offset)
    page, next_cursor = analytics._paginate(rows, limit, offset)
    return _envelope(week, page, next_cursor)


def get_workflow_summary(as_of_week: date | None, filters: dict[str, Any]) -> dict:
    week = analytics.resolve_as_of_week(as_of_week)
    summary = repository.workflow_summary(week, filters)
    definitions = definitions_by_id()
    summary["definitions"] = {key: definitions[key] for key in ("WF-01", "WF-02", "WF-06", "WF-07", "WF-08", "WF-13") if key in definitions}
    return _envelope(week, summary)


def get_reopens(as_of_week: date | None, client_account: str | None) -> dict:
    week = analytics.resolve_as_of_week(as_of_week)
    weeks = [w for w in repository.extract_weeks() if w <= week]
    definition = definitions_by_id().get("WF-08", {})
    if len(weeks) < 2:
        return _envelope(week, {
            "status": "NOT_AVAILABLE", "metric_id": "WF-08",
            "reason": "Reopens are detected by comparing two weekly extracts; only one extract has been loaded.",
            "unlock_condition": definition.get("unlock_condition"),
            "observation_starts_after": weeks[0].isoformat() if weeks else None,
        })
    counts = repository.reopen_summary(week, weeks[-2], client_account)
    closed = counts["closed_in_prior_extract"]
    return _envelope(week, {"status": "AVAILABLE", "metric_id": "WF-08", "label": definition.get("label", "DIRECT"),
                            "prior_extract_week": weeks[-2].isoformat(), "observation_starts_after": weeks[0].isoformat(),
                            **counts, "rate": round(counts["reopened_count"] / closed, 4) if closed else None})


def _recurrence_settings(definitions: dict[str, dict[str, Any]]) -> tuple[str, int, int]:
    rc01, rc02 = definitions.get("RC-01", {}), definitions.get("RC-02", {})
    return (rc01.get("threshold", {}).get("rule_version", "rc-v1"), int(rc02.get("threshold", {}).get("min_labels", 30)),
            int(rc02.get("threshold", {}).get("sample_per_tier", 60)))


def get_precision(as_of_week: date | None = None) -> dict:
    week = analytics.resolve_as_of_week(as_of_week)
    definitions = definitions_by_id()
    rule_version, min_labels, _ = _recurrence_settings(definitions)
    tiers = labels.precision(_db(), rule_version, min_labels)
    counts = repository.pair_counts(week, rule_version)
    if all(tiers[t]["status"] == "DIRECT" for t in labels.TIERS) and sum(counts.get(t, 0) for t in labels.TIERS):
        total = sum(counts.get(t, 0) for t in labels.TIERS)
        combined = sum(tiers[t]["precision"] * counts.get(t, 0) for t in labels.TIERS) / total
        tiers["ALL"] = {"tier": "ALL", "status": "DIRECT", "precision": round(combined, 4), "weighted_by_pairs": counts}
    else:
        tiers["ALL"] = {"tier": "ALL", "status": "CANDIDATE", "precision": None, "weighted_by_pairs": counts}
    return _envelope(week, {"rule_version": rule_version, "min_labels": min_labels, "tiers": tiers})


def get_recurrence_windows(as_of_week: date | None, client_account: str | None) -> dict:
    week = analytics.resolve_as_of_week(as_of_week)
    definitions = definitions_by_id()
    rule_version, min_labels, _ = _recurrence_settings(definitions)
    segment_type, segment_value = ("CLIENT", client_account) if client_account else ("ALL", "All")
    rows = repository.recurrence_windows(week, segment_type, segment_value)
    tiers = labels.precision(_db(), rule_version, min_labels)
    for row in rows:
        tier_precision = tiers.get(row["tier"])
        measured = tier_precision is not None and tier_precision["status"] == "DIRECT"
        row["precision"] = tier_precision["precision"] if measured else None
        row["precision_adjusted_related_cases"] = round(row["related_case_count"] * tier_precision["precision"], 1) if measured else None
    remediation = repository.remediation_rows(week)
    overall = next((row for row in repository.recurrence_windows(week, "ALL", "All") if row["window_code"] == "LONG" and row["tier"] == "ALL"), None)
    return _envelope(week, {
        "rule_version": rule_version, "segment_type": segment_type, "segment_value": segment_value, "windows": rows,
        "remediation": {"rows": remediation, "cases_with_preventive_action": sum(row["closed_index_count"] for row in remediation),
                        "closed_cases": overall["closed_index_count"] if overall else None},
        "definitions": {key: definitions[key] for key in ("RC-01", "RC-02", "RC-03", "RC-04") if key in definitions},
    })


def list_pairs(as_of_week: date | None, client_account: str | None, tier: str | None, window_days: int | None, limit: int, cursor: str | None) -> dict:
    if tier is not None and tier not in labels.TIERS:
        raise BadRequestError("tier must be A or B")
    week = analytics.resolve_as_of_week(as_of_week)
    offset = analytics._decode_cursor(cursor)
    rows = repository.recurrence_pairs(week, {"client_account": client_account, "match_tier": tier}, window_days, limit, offset)
    page, next_cursor = analytics._paginate(rows, limit, offset)
    return _envelope(week, page, next_cursor)


def label_queue(reviewer: str) -> dict:
    week = analytics.resolve_as_of_week(None)
    rule_version, min_labels, sample_size = _recurrence_settings(definitions_by_id())
    database = _db()
    for tier in labels.TIERS:
        labels.ensure_sample(database, rule_version, tier, week.isoformat(),
                             lambda tier=tier: repository.sample_candidates(week, rule_version, tier, sample_size))
    pair_id, progress = labels.next_pair(database, rule_version, reviewer)
    pair = None
    if pair_id:
        pair = repository.pair_detail(pair_id)
        if pair is None:
            raise NotFoundError("The next sampled pair is no longer published.")
        pair["labels"] = labels.reviewer_labels(database, rule_version, pair_id)
    return _envelope(week, {"rule_version": rule_version, "min_labels": min_labels, "progress": progress, "pair": pair})


def record_label(pair_id: str, verdict: str, comment: str | None, reviewer: str) -> dict:
    rule_version, _, _ = _recurrence_settings(definitions_by_id())
    label = labels.record_label(_db(), rule_version, pair_id, verdict, comment, reviewer)
    return {"data": label}
