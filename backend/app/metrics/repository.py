"""Read-only queries for the interim workflow and recurrence metrics (reference/51 §4.2, §5).

Gold tables are built by databricks/notebooks/03c_gold_workflow_recurrence.sql. Only allow-listed
column names reach SQL text; every value is a named parameter.
"""
from __future__ import annotations

from datetime import date
from typing import Any

from app.core.config import settings
from app.core.databricks_client import run_query

WORKFLOW_FILTERS = {"client_account", "line_of_business", "category", "case_assignment_group", "first_task_flag", "excessive_handoffs"}
WORKFLOW_SORTS = {
    "handoffs": "handoff_count DESC, case_number",
    "first_task": "time_to_first_task_hours DESC NULLS LAST, case_number",
    "gap": "gap_longest_days DESC NULLS LAST, case_number",
    "case_number": "case_number",
}
WORKFLOW_COLUMNS = (
    "case_number, as_of_extract_week, client_account, category, case_assignment_group, opened_at, closed_at, is_open, "
    "time_to_first_task_hours, first_task_flag, task_count, distinct_task_group_count, handoff_count, excessive_handoffs, "
    "task_group_path, gap_observable, gap_count, gap_total_days, gap_longest_days, gap_threshold_days, label, disclaimer"
)


def _t(name: str) -> str:
    return f"{settings.databricks_catalog}.{settings.databricks_schema}.{name}"


def _where(filters: dict[str, Any], alias: str = "") -> tuple[str, dict[str, Any]]:
    clauses, params = [], {}
    for index, (column, value) in enumerate(filters.items()):
        if value is None:
            continue
        clauses.append(f"{alias}{column} = :f{index}")
        params[f"f{index}"] = value
    return (" AND ".join(clauses), params)


def definitions() -> list[dict]:
    return run_query(f"SELECT * EXCEPT (version_rank) FROM {_t('v_metric_definition_current')} ORDER BY metric_id")


def workflow_rows(week: date, filters: dict[str, Any], order_by: str, limit: int, offset: int) -> list[dict]:
    where, params = _where({"as_of_extract_week": week, **filters})
    return run_query(f"SELECT {WORKFLOW_COLUMNS} FROM {_t('gold_case_workflow_proxy')} WHERE {where} "
                     f"ORDER BY {order_by} LIMIT {int(limit) + 1} OFFSET {int(offset)}", params)


def workflow_summary(week: date, filters: dict[str, Any]) -> dict[str, Any]:
    where, params = _where({"as_of_extract_week": week, **filters})
    table = _t("gold_case_workflow_proxy")
    totals = run_query(f"""
        SELECT COUNT(*) AS case_count,
               COUNT(CASE WHEN task_count > 0 THEN 1 END) AS cases_with_tasks,
               COUNT(CASE WHEN first_task_flag = 'NORMAL' THEN 1 END) AS first_task_normal_count,
               COUNT(CASE WHEN first_task_flag = 'LIKELY_AUTOMATIC' THEN 1 END) AS first_task_automatic_count,
               COUNT(CASE WHEN first_task_flag = 'NO_TASK' THEN 1 END) AS no_task_count,
               COUNT(CASE WHEN first_task_flag = 'TASK_BEFORE_CASE' THEN 1 END) AS task_before_case_count,
               percentile(CASE WHEN first_task_flag = 'NORMAL' THEN time_to_first_task_hours END, 0.5) AS first_task_median_hours,
               percentile(CASE WHEN first_task_flag = 'NORMAL' THEN time_to_first_task_hours END, 0.9) AS first_task_p90_hours,
               COUNT(CASE WHEN excessive_handoffs THEN 1 END) AS excessive_handoff_count,
               percentile(CASE WHEN task_count > 0 THEN handoff_count END, 0.5) AS handoff_median,
               COUNT(CASE WHEN gap_observable THEN 1 END) AS gap_observable_count,
               COUNT(CASE WHEN gap_count > 0 THEN 1 END) AS cases_with_counted_gap,
               percentile(CASE WHEN gap_observable THEN gap_longest_days END, 0.5) AS longest_gap_median_days,
               MAX(gap_threshold_days) AS gap_threshold_days
        FROM {table} WHERE {where}""", params)
    first_task_bands = run_query(f"""
        SELECT band AS label, COUNT(*) AS count FROM (
          SELECT CASE WHEN time_to_first_task_hours < 1 THEN '1. Under 1 hour'
                      WHEN time_to_first_task_hours < 8 THEN '2. 1 to 8 hours'
                      WHEN time_to_first_task_hours < 24 THEN '3. 8 to 24 hours'
                      WHEN time_to_first_task_hours < 72 THEN '4. 1 to 3 days'
                      ELSE '5. 3 days or more' END AS band
          FROM {table} WHERE {where} AND first_task_flag = 'NORMAL') GROUP BY band ORDER BY band""", params)
    handoff_bands = run_query(f"""
        SELECT CASE WHEN handoff_count >= 4 THEN '4 or more' ELSE CAST(handoff_count AS STRING) END AS label, COUNT(*) AS count
        FROM {table} WHERE {where} AND task_count > 0
        GROUP BY CASE WHEN handoff_count >= 4 THEN '4 or more' ELSE CAST(handoff_count AS STRING) END ORDER BY label""", params)
    gap_bands = run_query(f"""
        SELECT band AS label, COUNT(*) AS count FROM (
          SELECT CASE WHEN gap_longest_days < 1 THEN '1. Under 1 day'
                      WHEN gap_longest_days < 5 THEN '2. 1 to 5 days'
                      WHEN gap_longest_days < 15 THEN '3. 5 to 15 days'
                      WHEN gap_longest_days < 30 THEN '4. 15 to 30 days'
                      ELSE '5. 30 days or more' END AS band
          FROM {table} WHERE {where} AND gap_observable) GROUP BY band ORDER BY band""", params)
    strip = lambda rows: [{"label": row["label"].split(". ", 1)[-1], "count": row["count"]} for row in rows]
    return {**(totals[0] if totals else {}), "first_task_bands": strip(first_task_bands),
            "handoff_bands": handoff_bands, "longest_gap_bands": strip(gap_bands)}


def baselines(week: date, metric_ids: list[str], segment_type: str, segment_value: str) -> list[dict]:
    params: dict[str, Any] = {"week": week, "segment_type": segment_type, "segment_value": segment_value}
    names = []
    for index, metric_id in enumerate(metric_ids):
        params[f"m{index}"] = metric_id
        names.append(f":m{index}")
    return run_query(f"""
        SELECT metric_id, unit, segment_type, segment_value, period, period_from, period_to, n, median, p90,
               missing_count, invalid_count, suppressed, label, definition_version
        FROM {_t('gold_workflow_baseline')}
        WHERE as_of_extract_week = :week AND segment_type = :segment_type AND segment_value = :segment_value
          AND metric_id IN ({', '.join(names)})
        ORDER BY metric_id, period""", params)


def extract_weeks() -> list[date]:
    return [row["as_of_extract_week"] for row in run_query(
        f"SELECT DISTINCT as_of_extract_week FROM {_t('gold_case_fact')} ORDER BY as_of_extract_week")]


def reopen_summary(week: date, prior_week: date, client_account: str | None) -> dict[str, Any]:
    params: dict[str, Any] = {"week": week, "prior": prior_week}
    client = ""
    if client_account:
        client = " AND client_account = :client"
        params["client"] = client_account
    closed = run_query(f"SELECT COUNT(*) AS n FROM {_t('gold_case_fact')} WHERE as_of_extract_week = :prior AND NOT is_open{client}", params)
    reopened = run_query(f"""
        SELECT detection_basis AS label, COUNT(*) AS count FROM {_t('gold_case_reopen_event')}
        WHERE as_of_extract_week = :week{client} GROUP BY detection_basis ORDER BY label""", params)
    return {"closed_in_prior_extract": closed[0]["n"] if closed else 0, "by_basis": reopened,
            "reopened_count": sum(row["count"] for row in reopened)}


def recurrence_windows(week: date, segment_type: str, segment_value: str) -> list[dict]:
    return run_query(f"""
        SELECT rule_version, segment_type, segment_value, window_code, window_days, tier, closed_index_count,
               eligible_index_count, censored_count, recurring_index_count, rate, related_case_count
        FROM {_t('gold_recurrence_window_summary')}
        WHERE as_of_extract_week = :week AND segment_type = :segment_type AND segment_value = :segment_value
        ORDER BY window_days, tier""", {"week": week, "segment_type": segment_type, "segment_value": segment_value})


def remediation_rows(week: date) -> list[dict]:
    return run_query(f"""
        SELECT segment_value AS category, closed_index_count, eligible_index_count, censored_count, recurring_index_count, rate
        FROM {_t('gold_recurrence_window_summary')}
        WHERE as_of_extract_week = :week AND segment_type = 'REMEDIATED_CATEGORY' AND window_code = 'LONG' AND tier = 'ALL'
        ORDER BY eligible_index_count DESC, category""", {"week": week})


PAIR_CASE_FIELDS = ("case_short_description", "category", "subtype", "root_cause", "opened_at", "closed_at", "case_close_notes")


def recurrence_pairs(week: date, filters: dict[str, Any], max_days: float | None, limit: int, offset: int) -> list[dict]:
    where, params = _where({"as_of_extract_week": week, **filters}, alias="p.")
    if max_days is not None:
        where += " AND p.days_after_close <= :max_days"
        params["max_days"] = max_days
    return run_query(f"""
        SELECT p.pair_id, p.rule_version, p.client_account, p.index_case_number, p.related_case_number, p.match_tier,
               p.days_after_close, p.category, p.subtype, p.index_root_cause, p.related_root_cause,
               i.case_short_description AS index_short_description, r.case_short_description AS related_short_description
        FROM {_t('gold_recurrence_pair')} p
        JOIN {_t('gold_case_fact')} i ON i.case_number = p.index_case_number AND i.as_of_extract_week = p.as_of_extract_week
        JOIN {_t('gold_case_fact')} r ON r.case_number = p.related_case_number AND r.as_of_extract_week = p.as_of_extract_week
        WHERE {where}
        ORDER BY p.days_after_close, p.index_case_number, p.related_case_number
        LIMIT {int(limit) + 1} OFFSET {int(offset)}""", params)


def pair_counts(week: date, rule_version: str) -> dict[str, int]:
    rows = run_query(f"SELECT match_tier, COUNT(*) AS n FROM {_t('gold_recurrence_pair')} "
                     "WHERE as_of_extract_week = :week AND rule_version = :rule GROUP BY match_tier", {"week": week, "rule": rule_version})
    return {row["match_tier"]: row["n"] for row in rows}


def sample_candidates(week: date, rule_version: str, tier: str, size: int) -> list[str]:
    """Pseudo-random, reproducible order by hash so the reviewer never chooses the sample."""
    rows = run_query(f"""
        SELECT pair_id FROM {_t('gold_recurrence_pair')}
        WHERE as_of_extract_week = :week AND rule_version = :rule AND match_tier = :tier
        ORDER BY sha2(concat(pair_id, '|label-sample-v1'), 256) LIMIT {int(size)}""", {"week": week, "rule": rule_version, "tier": tier})
    return [row["pair_id"] for row in rows]


def pair_detail(pair_id: str) -> dict[str, Any] | None:
    fields = ", ".join(f"i.{name} AS index_{name}, r.{name} AS related_{name}" for name in PAIR_CASE_FIELDS)
    rows = run_query(f"""
        SELECT p.pair_id, p.rule_version, p.match_tier, p.client_account, p.days_after_close,
               p.index_case_number, p.related_case_number, {fields}
        FROM {_t('gold_recurrence_pair')} p
        JOIN {_t('gold_case_fact')} i ON i.case_number = p.index_case_number AND i.as_of_extract_week = p.as_of_extract_week
        JOIN {_t('gold_case_fact')} r ON r.case_number = p.related_case_number AND r.as_of_extract_week = p.as_of_extract_week
        WHERE p.pair_id = :pair_id
        ORDER BY p.as_of_extract_week DESC LIMIT 1""", {"pair_id": pair_id})
    return rows[0] if rows else None
