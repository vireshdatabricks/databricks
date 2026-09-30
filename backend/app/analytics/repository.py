"""Read-only query layer against the Databricks Gold/Silver tables.

Every function builds parameterized SQL (named ``:param`` markers bound via
`run_query`) so no caller-supplied value is ever interpolated into the query text.
Only hard-coded, allow-listed column names are used to build WHERE clauses.
"""
from datetime import date
from typing import Any

from app.core.config import settings
from app.core.databricks_client import run_query

CASE_FACT = "gold_case_fact"
TASK_FACT = "gold_task_fact"
CASE_TRENDS = "gold_case_trend_monthly"
TASK_TRENDS = "gold_task_trend_monthly"
THEMES = "gold_theme_candidate"
THEME_LINKS = "gold_theme_case_link"
NARRATIVE_SEGMENTS = "silver_case_narrative_segments"
OPERATIONS_TABLES = {
    "workload": "gold_case_aging_workload",
    "date_risk": "gold_due_target_risk",
    "durations": "gold_case_duration_breakdown",
    "documentation": "gold_documentation_quality",
    "data_quality": "gold_data_quality_coverage",
}


def _table(name: str) -> str:
    return f"{settings.databricks_catalog}.{settings.databricks_schema}.{name}"


def _where(filters: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    clauses: list[str] = []
    params: dict[str, Any] = {}
    for index, (column, value) in enumerate(filters.items()):
        if value is None:
            continue
        param_name = f"p{index}"
        clauses.append(f"{column} = :{param_name}")
        params[param_name] = value
    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where_sql, params


def get_available_case_weeks() -> list[date]:
    rows = run_query(f"SELECT DISTINCT as_of_extract_week FROM {_table(CASE_FACT)} ORDER BY as_of_extract_week DESC")
    return [row["as_of_extract_week"] for row in rows]


def get_latest_built_at() -> Any:
    rows = run_query(f"SELECT MAX(built_at) AS built_at FROM {_table(CASE_FACT)}")
    return rows[0]["built_at"] if rows else None


def get_case_summary(as_of_week: date, client_account: str | None, line_of_business: str | None, assignment_group: str | None) -> dict:
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "client_account": client_account,
        "line_of_business": line_of_business,
        "case_assignment_group": assignment_group,
    })
    query = f"""
        SELECT
            COUNT(DISTINCT case_number) AS total_case_count,
            COUNT(DISTINCT CASE WHEN is_open THEN case_number END) AS open_case_count,
            COUNT(DISTINCT CASE WHEN NOT is_open THEN case_number END) AS closed_case_count,
            COUNT(DISTINCT source_file) AS source_file_count
        FROM {_table(CASE_FACT)}
        {where_sql}
    """
    rows = run_query(query, params)
    return rows[0] if rows else {}


def get_task_summary(as_of_week: date, client_account: str | None, assignment_group: str | None) -> dict:
    where_sql, params = _where({
        "t.as_of_extract_week": as_of_week,
        "t.task_assignment_group": assignment_group,
    })
    # gold_task_fact deliberately does not duplicate client dimensions. Scope task
    # counts through its stable case_number relationship to the case fact instead
    # of querying a non-existent task client_account column.
    if client_account is not None:
        client_predicate = (
            f" AND EXISTS (SELECT 1 FROM {_table(CASE_FACT)} c "
            "WHERE c.as_of_extract_week = t.as_of_extract_week "
            "AND c.case_number = t.case_number AND c.client_account = :task_client_account)"
        )
        params["task_client_account"] = client_account
    else:
        client_predicate = ""
    query = f"""
        SELECT
            COUNT(DISTINCT task_number) AS total_task_count,
            COUNT(DISTINCT CASE WHEN is_open THEN task_number END) AS open_task_count,
            COUNT(DISTINCT CASE WHEN NOT is_open THEN task_number END) AS closed_task_count
        FROM {_table(TASK_FACT)} t
        {where_sql}{client_predicate}
    """
    rows = run_query(query, params)
    return rows[0] if rows else {}


def list_case_trends(
    as_of_week: date, client_account: str | None, category: str | None, case_type: str | None,
    subtype: str | None, root_cause: str | None, limit: int, offset: int,
) -> list[dict]:
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "client_account": client_account,
        "category": category,
        "case_type": case_type,
        "subtype": subtype,
        "root_cause": root_cause,
    })
    query = f"""
        SELECT report_month, client_account, category, case_type, subtype, root_cause,
               opened_case_count, closed_case_count,
               closed_case_tat_business_days_avg, closed_case_tat_calendar_days_avg
        FROM {_table(CASE_TRENDS)}
        {where_sql}
        ORDER BY report_month DESC, client_account, category, case_type, subtype, root_cause
        LIMIT {int(limit) + 1} OFFSET {int(offset)}
    """
    return run_query(query, params)


def list_task_trends(
    as_of_week: date, assignment_group: str | None, state: str | None, category: str | None,
    task_type: str | None, subtype: str | None, limit: int, offset: int,
) -> list[dict]:
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "task_assignment_group": assignment_group,
        "task_state": state,
        "task_category": category,
        "task_type": task_type,
        "task_subtype": subtype,
    })
    query = f"""
        SELECT report_month, task_assignment_group, task_state, task_category, task_type, task_subtype,
               opened_task_count, closed_task_count,
               closed_task_tat_business_days_avg, closed_task_tat_calendar_days_avg
        FROM {_table(TASK_TRENDS)}
        {where_sql}
        ORDER BY report_month DESC, task_assignment_group, task_state, task_category, task_type, task_subtype
        LIMIT {int(limit) + 1} OFFSET {int(offset)}
    """
    return run_query(query, params)


def list_themes(
    as_of_week: date, category: str | None, root_cause: str | None,
    min_support: int | None, limit: int, offset: int,
) -> list[dict]:
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "category": category,
        "root_cause": root_cause,
    })
    if min_support is not None:
        where_sql = f"{where_sql} AND case_count >= :min_support" if where_sql else "WHERE case_count >= :min_support"
        params["min_support"] = min_support
    query = f"""
        SELECT theme_id, theme_label, category, root_cause, case_count, occurrence_rate, meets_min_support, method_type
        FROM {_table(THEMES)}
        {where_sql}
        ORDER BY case_count DESC, theme_id
        LIMIT {int(limit) + 1} OFFSET {int(offset)}
    """
    return run_query(query, params)


def get_case_trend_series(
    as_of_week: date, client_account: str | None, category: str | None,
    case_type: str | None, subtype: str | None, root_cause: str | None,
) -> list[dict]:
    """Aggregate all selected-week case trend dimensions into a monthly series."""
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "client_account": client_account,
        "category": category,
        "case_type": case_type,
        "subtype": subtype,
        "root_cause": root_cause,
    })
    query = f"""
        SELECT report_month,
               SUM(opened_case_count) AS opened_count,
               SUM(closed_case_count) AS closed_count,
               SUM(record_count) AS represented_record_count
        FROM {_table(CASE_TRENDS)}
        {where_sql}
        GROUP BY report_month
        ORDER BY report_month
    """
    return run_query(query, params)


def get_task_trend_series(
    as_of_week: date, assignment_group: str | None, state: str | None,
    category: str | None, task_type: str | None, subtype: str | None,
) -> list[dict]:
    """Aggregate all selected-week task trend dimensions into a monthly series."""
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "task_assignment_group": assignment_group,
        "task_state": state,
        "task_category": category,
        "task_type": task_type,
        "task_subtype": subtype,
    })
    query = f"""
        SELECT report_month,
               SUM(opened_task_count) AS opened_count,
               SUM(closed_task_count) AS closed_count,
               SUM(record_count) AS represented_record_count
        FROM {_table(TASK_TRENDS)}
        {where_sql}
        GROUP BY report_month
        ORDER BY report_month
    """
    return run_query(query, params)


def get_theme_summary(
    as_of_week: date, category: str | None, root_cause: str | None,
    min_support: int | None, top_limit: int,
) -> dict:
    """Return full-universe theme aggregates and a bounded ranked candidate set.

    This deliberately does not reuse ``list_themes``: that function is paginated,
    whereas dashboard headline measures must cover every matching theme candidate.
    """
    filters = {
        "as_of_extract_week": as_of_week,
        "category": category,
        "root_cause": root_cause,
    }
    where_sql, params = _where(filters)
    aggregate_query = f"""
        SELECT
            COUNT(*) AS total_candidate_count,
            COUNT(CASE WHEN case_count >= COALESCE(:min_support, min_support_threshold) THEN 1 END)
                AS candidates_meeting_support_count,
            COALESCE(:min_support, MIN(min_support_threshold), 0) AS min_support_threshold
        FROM {_table(THEMES)}
        {where_sql}
    """
    aggregate_params = {**params, "min_support": min_support}
    aggregate_rows = run_query(aggregate_query, aggregate_params)
    aggregate = aggregate_rows[0] if aggregate_rows else {}

    # Theme candidates are one deterministic category/root-cause membership per
    # case. Count the links explicitly so the represented-case measure remains
    # correct even if that Gold-table implementation changes.
    link_filters = {
        "t.as_of_extract_week": as_of_week,
        "t.category": category,
        "t.root_cause": root_cause,
    }
    link_where_sql, link_params = _where(link_filters)
    represented_query = f"""
        SELECT COUNT(DISTINCT l.case_number) AS cases_represented_count
        FROM {_table(THEME_LINKS)} l
        JOIN {_table(THEMES)} t
          ON t.theme_id = l.theme_id AND t.as_of_extract_week = l.as_of_extract_week
        {link_where_sql}
    """
    represented_rows = run_query(represented_query, link_params)
    represented = represented_rows[0] if represented_rows else {}

    top_query = f"""
        SELECT theme_id, theme_label, category, root_cause, case_count,
               occurrence_rate, denominator_count, min_support_threshold,
               meets_min_support, method_type
        FROM {_table(THEMES)}
        {where_sql}{' AND' if where_sql else ' WHERE'}
            case_count >= COALESCE(:min_support, min_support_threshold)
        ORDER BY case_count DESC, theme_id
        LIMIT {int(top_limit)}
    """
    top_rows = run_query(top_query, aggregate_params)
    return {
        "total_candidate_count": aggregate.get("total_candidate_count") or 0,
        "candidates_meeting_support_count": aggregate.get("candidates_meeting_support_count") or 0,
        "cases_represented_count": represented.get("cases_represented_count") or 0,
        "min_support_threshold": aggregate.get("min_support_threshold") or 0,
        "top_candidates": top_rows,
    }


def get_theme(theme_id: str, as_of_week: date) -> dict | None:
    rows = run_query(
        f"SELECT theme_id FROM {_table(THEMES)} WHERE theme_id = :theme_id AND as_of_extract_week = :as_of_week",
        {"theme_id": theme_id, "as_of_week": as_of_week},
    )
    return rows[0] if rows else None


def list_theme_cases(theme_id: str, as_of_week: date, limit: int, offset: int) -> list[dict]:
    query = f"""
        SELECT l.theme_id, l.case_number, l.membership_basis,
               c.client_account, c.line_of_business, c.category, c.case_type, c.subtype, c.root_cause,
               c.opened_at, c.closed_at, c.is_open
        FROM {_table(THEME_LINKS)} l
        JOIN {_table(CASE_FACT)} c
          ON c.case_number = l.case_number AND c.as_of_extract_week = l.as_of_extract_week
        WHERE l.theme_id = :theme_id AND l.as_of_extract_week = :as_of_week
        ORDER BY l.case_number
        LIMIT {int(limit) + 1} OFFSET {int(offset)}
    """
    return run_query(query, {"theme_id": theme_id, "as_of_week": as_of_week})


def get_case_fact(case_number: str, as_of_week: date) -> dict | None:
    rows = run_query(
        f"""
        SELECT case_number, as_of_extract_week, client_account, line_of_business, category, case_type, subtype,
               root_cause, who_caused_issue, case_assignment_group, opened_at, closed_at, is_open,
               tat_business_days_src, tat_calendar_days_derived, task_count, source_file, logic_version
        FROM {_table(CASE_FACT)}
        WHERE case_number = :case_number AND as_of_extract_week = :as_of_week
        """,
        {"case_number": case_number, "as_of_week": as_of_week},
    )
    return rows[0] if rows else None


def list_narrative_segments(case_number: str) -> list[dict]:
    query = f"""
        SELECT segment_id, record_level, task_number, segment_type, segment_timestamp, segment_text, source_column,
               source_file, extract_week
        FROM {_table(NARRATIVE_SEGMENTS)}
        WHERE case_number = :case_number
        ORDER BY segment_timestamp
    """
    return run_query(query, {"case_number": case_number})


def list_operation_rows(
    operation: str, columns: list[str], filters: dict[str, Any], order_by: str, limit: int, offset: int,
) -> list[dict]:
    """Read one allow-listed Operations Gold source with validated SQL identifiers only."""
    table_name = OPERATIONS_TABLES[operation]
    where_sql, params = _where(filters)
    select_columns = ", ".join(columns)
    query = f"""
        SELECT {select_columns}
        FROM {_table(table_name)}
        {where_sql}
        ORDER BY {order_by}
        LIMIT {int(limit) + 1} OFFSET {int(offset)}
    """
    return run_query(query, params)


def get_operation_summary(operation: str, filters: dict[str, Any]) -> dict:
    """Return allow-listed, full-filter-universe aggregates for an Operations tab."""
    table_name = OPERATIONS_TABLES[operation]
    where_sql, params = _where(filters)

    if operation == "workload":
        totals_query = f"""
            SELECT COUNT(DISTINCT case_number) AS total_case_count,
                   COUNT(DISTINCT CASE WHEN is_open THEN case_number END) AS open_case_count,
                   COUNT(DISTINCT CASE WHEN age_data_quality_status <> 'VALID' THEN case_number END) AS unknown_age_count,
                   MAX(age_calendar_days) AS oldest_age_calendar_days
            FROM {_table(table_name)} {where_sql}
        """
        age_query = f"""
            SELECT COALESCE(age_band, 'unknown') AS label, COUNT(DISTINCT case_number) AS count
            FROM {_table(table_name)} {where_sql}
            GROUP BY COALESCE(age_band, 'unknown')
            ORDER BY count DESC, label
        """
        group_query = f"""
            SELECT COALESCE(case_assignment_group, 'Unassigned') AS label, COUNT(DISTINCT case_number) AS count
            FROM {_table(table_name)} {where_sql}
            GROUP BY COALESCE(case_assignment_group, 'Unassigned')
            ORDER BY count DESC, label
            LIMIT 10
        """
        totals = run_query(totals_query, params)[0]
        return {**totals, "age_band_counts": run_query(age_query, params), "assignment_group_counts": run_query(group_query, params)}

    if operation == "date_risk":
        totals_query = f"""
            SELECT COUNT(DISTINCT case_number) AS total_case_count,
                   COUNT(DISTINCT CASE WHEN is_open THEN case_number END) AS open_case_count,
                   COUNT(DISTINCT CASE WHEN risk_date IS NOT NULL THEN case_number END) AS usable_risk_date_count,
                   COUNT(DISTINCT CASE WHEN risk_status = 'overdue' THEN case_number END) AS overdue_case_count
            FROM {_table(table_name)} {where_sql}
        """
        status_query = f"""
            SELECT COALESCE(risk_status, 'unknown') AS label, COUNT(DISTINCT case_number) AS count
            FROM {_table(table_name)} {where_sql}
            GROUP BY COALESCE(risk_status, 'unknown')
            ORDER BY count DESC, label
        """
        reference_query = f"""
            SELECT COALESCE(risk_reference_type, 'unknown') AS label, COUNT(DISTINCT case_number) AS count
            FROM {_table(table_name)} {where_sql}
            GROUP BY COALESCE(risk_reference_type, 'unknown')
            ORDER BY count DESC, label
        """
        totals = run_query(totals_query, params)[0]
        return {**totals, "risk_status_counts": run_query(status_query, params), "risk_reference_type_counts": run_query(reference_query, params)}

    if operation == "durations":
        totals_query = f"SELECT COUNT(DISTINCT case_number) AS total_case_count, COUNT(DISTINCT CASE WHEN is_open THEN case_number END) AS open_case_count FROM {_table(table_name)} {where_sql}"
        status_query = f"SELECT COALESCE(duration_data_quality_status, 'unknown') AS label, COUNT(DISTINCT case_number) AS count FROM {_table(table_name)} {where_sql} GROUP BY COALESCE(duration_data_quality_status, 'unknown') ORDER BY count DESC, label"
        totals = run_query(totals_query, params)[0]
        return {**totals, "quality_status_counts": run_query(status_query, params)}

    if operation == "documentation":
        totals_query = f"""SELECT COUNT(DISTINCT case_number) AS total_case_count, COUNT(DISTINCT CASE WHEN NOT is_open THEN case_number END) AS closed_case_count,
            COUNT(DISTINCT CASE WHEN description_present = false THEN case_number END) AS missing_description_count,
            COUNT(DISTINCT CASE WHEN closure_note_present = false THEN case_number END) AS missing_closure_note_count,
            COUNT(DISTINCT CASE WHEN root_cause_present = false THEN case_number END) AS missing_root_cause_count,
            COUNT(DISTINCT CASE WHEN resolution_present = false THEN case_number END) AS missing_resolution_count
            FROM {_table(table_name)} {where_sql}"""
        status_query = f"SELECT COALESCE(documentation_status, 'unknown') AS label, COUNT(DISTINCT case_number) AS count FROM {_table(table_name)} {where_sql} GROUP BY COALESCE(documentation_status, 'unknown') ORDER BY count DESC, label"
        totals = run_query(totals_query, params)[0]
        return {**totals, "documentation_status_counts": run_query(status_query, params)}

    if operation == "data_quality":
        totals_query = f"SELECT COUNT(*) AS field_count, MIN(populated_rate) AS lowest_populated_rate FROM {_table(table_name)} {where_sql}"
        status_query = f"SELECT COALESCE(quality_status, 'unknown') AS label, COUNT(*) AS count FROM {_table(table_name)} {where_sql} GROUP BY COALESCE(quality_status, 'unknown') ORDER BY count DESC, label"
        totals = run_query(totals_query, params)[0]
        return {**totals, "quality_status_counts": run_query(status_query, params)}

    raise ValueError(f"Unsupported operation summary: {operation}")
