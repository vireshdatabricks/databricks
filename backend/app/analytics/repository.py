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


def get_task_summary(as_of_week: date, assignment_group: str | None) -> dict:
    where_sql, params = _where({
        "as_of_extract_week": as_of_week,
        "task_assignment_group": assignment_group,
    })
    query = f"""
        SELECT
            COUNT(DISTINCT task_number) AS total_task_count,
            COUNT(DISTINCT CASE WHEN is_open THEN task_number END) AS open_task_count,
            COUNT(DISTINCT CASE WHEN NOT is_open THEN task_number END) AS closed_task_count
        FROM {_table(TASK_FACT)}
        {where_sql}
    """
    rows = run_query(query, params)
    return rows[0] if rows else {}


def list_case_trends(
    client_account: str | None, category: str | None, case_type: str | None,
    subtype: str | None, root_cause: str | None, limit: int, offset: int,
) -> list[dict]:
    where_sql, params = _where({
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
    assignment_group: str | None, state: str | None, category: str | None,
    task_type: str | None, subtype: str | None, limit: int, offset: int,
) -> list[dict]:
    where_sql, params = _where({
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
        SELECT segment_id, record_level, task_number, segment_type, segment_timestamp, segment_text, source_column
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
