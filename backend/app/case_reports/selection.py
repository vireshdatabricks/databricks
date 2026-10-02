"""Report case-selection predicate shared by request options and request preview (reference/49 G19, G20).

MIRRORED RULE — keep in step with ``select_population`` in
``databricks/notebooks/case_analysis_common.py`` (used by notebook 07). The notebook runs in
Spark and cannot import this module, so the rule is mirrored and pinned by
``tests/test_case_selection.py``:

* week: the latest ``as_of_extract_week`` in ``gold_case_fact`` (the run refuses to start unless
  that week's latest ``gold_publication_registry`` attempt is READY);
* ``client_account`` is one of the selected clients;
* ``to_date(opened_at)`` is between ``date_from`` and ``date_to`` inclusive;
* line of business, service type, and category filters match the case column;
* the functional team filter matches the case assignment group OR the assignment group of any
  task of that case in the same week.

Filter values are comma-separated lists, exactly as the notebook widgets read them.
"""
from __future__ import annotations

from datetime import date
from typing import Any

CASE_FILTER_COLUMNS = {
    "line_of_business_filter": "line_of_business",
    "service_type_filter": "service_type",
    "category_filter": "category",
}
TEAM_FILTER = "functional_team_filter"
FILTER_NAMES = (*CASE_FILTER_COLUMNS, TEAM_FILTER)


def split_values(value: str | None) -> list[str]:
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def in_list(column: str, values: list[str], prefix: str, params: dict[str, Any]) -> str:
    names = []
    for index, value in enumerate(values):
        name = f"{prefix}{index}"
        params[name] = value
        names.append(f":{name}")
    return f"{column} IN ({', '.join(names)})"


def case_selection(case_table: str, task_table: str, clients: list[str], date_from: date, date_to: date,
                   filters: dict[str, str], alias: str = "c") -> tuple[str, dict[str, Any]]:
    """Return ``(where_sql, params)`` selecting report cases from ``case_table AS <alias>``.

    The caller binds ``:week``. Only allow-listed column names reach the SQL text; every value is
    a named parameter.
    """
    params: dict[str, Any] = {"date_from": date_from.isoformat(), "date_to": date_to.isoformat()}
    clauses = [f"{alias}.as_of_extract_week = :week",
               in_list(f"{alias}.client_account", clients, "client", params),
               f"to_date({alias}.opened_at) BETWEEN :date_from AND :date_to"]
    for name, column in CASE_FILTER_COLUMNS.items():
        values = split_values(filters.get(name))
        if values:
            clauses.append(in_list(f"{alias}.{column}", values, f"{name[:4]}", params))
    teams = split_values(filters.get(TEAM_FILTER))
    if teams:
        case_team = in_list(f"{alias}.case_assignment_group", teams, "team", params)
        task_team = in_list("t.task_assignment_group", teams, "team", params)
        clauses.append(f"({case_team} OR EXISTS (SELECT 1 FROM {task_table} t WHERE t.as_of_extract_week = :week "
                       f"AND t.case_number = {alias}.case_number AND {task_team}))")
    return " AND ".join(clauses), params
