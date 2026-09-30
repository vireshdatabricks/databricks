import base64
from datetime import date
from typing import Any

from app.analytics import repository
from app.analytics.schemas import (
    CaseDetail,
    CaseTrendItem,
    MetadataResponse,
    MonthlyTrendPoint,
    MonthlyTrendSeries,
    NarrativeSegment,
    SummaryData,
    TaskTrendItem,
    ThemeCandidate,
    ThemeCaseLink,
    ThemeSummary,
    ThemeSummaryCandidate,
)
from app.core.config import settings
from app.core.exceptions import BadRequestError, NotFoundError

SUPPORTED_METRICS = [
    "case_counts", "task_counts", "case_trends_monthly", "task_trends_monthly",
    "turnaround_time_business_days", "turnaround_time_calendar_days", "deterministic_theme_candidates",
]

DATA_LIMITATIONS = [
    "Limited to the weekly snapshot CSV extract; no event-history, SLA/PG, or recurrence-validation sources.",
    "Themes are deterministic category/root-cause groupings, not validated findings.",
    "First response, assignment timing, inactivity, handoffs, reopen rate, and SLA/PG metrics are out of scope for Phase 1.",
]

OPERATION_LIMITATIONS = [
    "Limited to the latest accepted weekly snapshot CSV extract; no event-history or SLA/PG source is used.",
    "Operational-proxy values are not contractual SLA, PG, queue-time, time-in-state, or breach measures.",
]

OPERATION_COLUMNS = {
    "workload": ["case_number", "as_of_extract_week", "is_open", "opened_at", "age_calendar_days", "age_band", "age_data_quality_status", "case_assignment_group", "case_assigned_to", "client_account", "line_of_business", "carrier_id", "account_id", "group_id", "category", "case_type", "subtype", "classification", "disclaimer", "reporting_time_zone", "logic_version"],
    "date_risk": ["case_number", "as_of_extract_week", "is_open", "risk_reference_type", "risk_status", "risk_date", "days_from_as_of", "target_date_change_code", "case_assignment_group", "case_assigned_to", "client_account", "line_of_business", "carrier_id", "account_id", "group_id", "category", "case_type", "subtype", "classification", "disclaimer", "reporting_time_zone", "logic_version"],
    "durations": ["case_number", "as_of_extract_week", "is_open", "opened_at", "actual_completion_at", "closed_at", "case_assignment_group", "client_account", "category", "case_type", "subtype", "tat_business_days_src", "tat_calendar_days_derived", "open_to_acd_calendar_days", "acd_to_close_calendar_days", "duration_data_quality_status", "classification", "disclaimer", "logic_version"],
    "documentation": ["case_number", "as_of_extract_week", "is_open", "case_assignment_group", "client_account", "category", "case_type", "subtype", "description_present", "closure_note_present", "root_cause_present", "resolution_present", "documentation_status", "classification", "disclaimer", "logic_version"],
    "data_quality": ["entity_type", "field_name", "total_record_count", "populated_record_count", "populated_rate", "quality_status", "as_of_extract_week", "source_coverage_note", "classification", "disclaimer", "logic_version"],
}

OPERATION_SORTS = {
    "workload": {"age_desc": "age_calendar_days DESC NULLS LAST, case_number", "case_number": "case_number"},
    "date_risk": {"risk_date": "risk_date NULLS LAST, case_number", "case_number": "case_number"},
    "durations": {"opened_at": "opened_at DESC NULLS LAST, case_number", "case_number": "case_number"},
    "documentation": {"case_number": "case_number", "status": "documentation_status, case_number"},
    "data_quality": {"field_name": "field_name", "populated_rate": "populated_rate ASC, field_name"},
}


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        offset = int(base64.urlsafe_b64decode(cursor.encode()).decode())
    except Exception as exc:
        raise BadRequestError("Invalid cursor") from exc
    if offset < 0:
        raise BadRequestError("Invalid cursor")
    return offset


def _paginate(rows: list[dict], limit: int, offset: int) -> tuple[list[dict], str | None]:
    has_more = len(rows) > limit
    page = rows[:limit]
    next_cursor = _encode_cursor(offset + limit) if has_more else None
    return page, next_cursor


def _envelope(as_of_week: date, data: Any, next_cursor: str | None = None) -> dict:
    body: dict[str, Any] = {
        "as_of_week": as_of_week.isoformat(),
        "logic_version": settings.logic_version,
        "data_quality_status": settings.data_quality_status,
        "data_limitations": DATA_LIMITATIONS,
        "data": data,
    }
    if next_cursor is not None:
        body["next_cursor"] = next_cursor
    return body


def list_operation(
    operation: str, as_of_week: date | None, filters: dict[str, Any], sort: str | None, limit: int, cursor: str | None,
) -> dict:
    """Return a paginated, week-consistent Operations Gold result."""
    resolved_week = resolve_as_of_week(as_of_week)
    selected_sort = sort or next(iter(OPERATION_SORTS[operation]))
    order_by = OPERATION_SORTS[operation].get(selected_sort)
    if order_by is None:
        raise BadRequestError(f"Unsupported sort for {operation}: {selected_sort}")
    offset = _decode_cursor(cursor)
    query_filters = {"as_of_extract_week": resolved_week, **filters}
    rows = repository.list_operation_rows(operation, OPERATION_COLUMNS[operation], query_filters, order_by, limit, offset)
    page, next_cursor = _paginate(rows, limit, offset)
    body = _envelope(resolved_week, page, next_cursor)
    body["data_limitations"] = OPERATION_LIMITATIONS
    return body


def get_operation_summary(operation: str, as_of_week: date | None, filters: dict[str, Any]) -> dict:
    """Return one week-consistent Operations aggregate without pagination."""
    resolved_week = resolve_as_of_week(as_of_week)
    data = repository.get_operation_summary(operation, {"as_of_extract_week": resolved_week, **filters})
    body = _envelope(resolved_week, data)
    body["data_limitations"] = OPERATION_LIMITATIONS
    return body


def resolve_as_of_week(requested: date | None) -> date:
    available = repository.get_available_case_weeks()
    if not available:
        raise NotFoundError("No published analytics weeks are available yet.")
    if requested is None:
        return available[0]
    if requested not in available:
        raise NotFoundError(f"as_of_week {requested.isoformat()} is not a published week.")
    return requested


def get_summary(as_of_week: date | None, client_account: str | None, line_of_business: str | None, assignment_group: str | None) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    case_row = repository.get_case_summary(resolved_week, client_account, line_of_business, assignment_group)
    task_row = repository.get_task_summary(resolved_week, client_account, assignment_group)
    source_file_count = case_row.get("source_file_count") or 0
    data = SummaryData(
        total_case_count=case_row.get("total_case_count") or 0,
        open_case_count=case_row.get("open_case_count") or 0,
        closed_case_count=case_row.get("closed_case_count") or 0,
        total_task_count=task_row.get("total_task_count") or 0,
        open_task_count=task_row.get("open_task_count") or 0,
        closed_task_count=task_row.get("closed_task_count") or 0,
        source_coverage_note=f"Snapshot built from {source_file_count} case source file(s) as of {resolved_week.isoformat()}.",
    )
    return _envelope(resolved_week, data.model_dump(mode="json"))


def list_case_trends(
    as_of_week: date | None, client_account: str | None, category: str | None, case_type: str | None,
    subtype: str | None, root_cause: str | None, limit: int, cursor: str | None,
) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    offset = _decode_cursor(cursor)
    rows = repository.list_case_trends(resolved_week, client_account, category, case_type, subtype, root_cause, limit, offset)
    page, next_cursor = _paginate(rows, limit, offset)
    items = [CaseTrendItem(**row).model_dump(mode="json") for row in page]
    return _envelope(resolved_week, items, next_cursor)


def list_task_trends(
    as_of_week: date | None, assignment_group: str | None, state: str | None, category: str | None,
    task_type: str | None, subtype: str | None, limit: int, cursor: str | None,
) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    offset = _decode_cursor(cursor)
    rows = repository.list_task_trends(resolved_week, assignment_group, state, category, task_type, subtype, limit, offset)
    page, next_cursor = _paginate(rows, limit, offset)
    items = [TaskTrendItem(**row).model_dump(mode="json") for row in page]
    return _envelope(resolved_week, items, next_cursor)


def list_themes(
    as_of_week: date | None, category: str | None, root_cause: str | None,
    min_support: int | None, limit: int, cursor: str | None,
) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    offset = _decode_cursor(cursor)
    rows = repository.list_themes(resolved_week, category, root_cause, min_support, limit, offset)
    page, next_cursor = _paginate(rows, limit, offset)
    items = [ThemeCandidate(**row).model_dump(mode="json") for row in page]
    return _envelope(resolved_week, items, next_cursor)


def get_case_trend_series(
    as_of_week: date | None, client_account: str | None, category: str | None,
    case_type: str | None, subtype: str | None, root_cause: str | None,
) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    rows = repository.get_case_trend_series(resolved_week, client_account, category, case_type, subtype, root_cause)
    points = [MonthlyTrendPoint(**row) for row in rows]
    data = MonthlyTrendSeries(
        entity="case", unit="cases", grain="case_number by report_month",
        series_definition="Current selected-week case records grouped by opened and closed month.",
        denominator_definition="represented_record_count is the number of distinct cases contributing opened or closed dates in that month.",
        month_count=len(points),
        total_opened_count=sum(point.opened_count for point in points),
        total_closed_count=sum(point.closed_count for point in points),
        points=points,
    )
    return _envelope(resolved_week, data.model_dump(mode="json"))


def get_task_trend_series(
    as_of_week: date | None, assignment_group: str | None, state: str | None,
    category: str | None, task_type: str | None, subtype: str | None,
) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    rows = repository.get_task_trend_series(resolved_week, assignment_group, state, category, task_type, subtype)
    points = [MonthlyTrendPoint(**row) for row in rows]
    data = MonthlyTrendSeries(
        entity="task", unit="tasks", grain="task_number by report_month",
        series_definition="Current selected-week task records grouped by opened and closed month.",
        denominator_definition="represented_record_count is the number of distinct tasks contributing opened or closed dates in that month.",
        month_count=len(points),
        total_opened_count=sum(point.opened_count for point in points),
        total_closed_count=sum(point.closed_count for point in points),
        points=points,
    )
    return _envelope(resolved_week, data.model_dump(mode="json"))


def get_theme_summary(
    as_of_week: date | None, category: str | None, root_cause: str | None,
    min_support: int | None, top_limit: int,
) -> dict:
    """Return one unpaginated Themes dashboard summary for a published week."""
    resolved_week = resolve_as_of_week(as_of_week)
    raw_data = repository.get_theme_summary(resolved_week, category, root_cause, min_support, top_limit)
    data = ThemeSummary(
        total_candidate_count=raw_data["total_candidate_count"],
        candidates_meeting_support_count=raw_data["candidates_meeting_support_count"],
        cases_represented_count=raw_data["cases_represented_count"],
        min_support_threshold=raw_data["min_support_threshold"],
        top_candidates=[ThemeSummaryCandidate(**row) for row in raw_data["top_candidates"]],
    )
    body = _envelope(resolved_week, data.model_dump(mode="json"))
    body["selected_min_support"] = min_support
    body["ranking_limit"] = top_limit
    return body


def list_theme_cases(theme_id: str, as_of_week: date | None, limit: int, cursor: str | None) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    if repository.get_theme(theme_id, resolved_week) is None:
        raise NotFoundError(f"Theme {theme_id} was not found for as_of_week {resolved_week.isoformat()}.")
    offset = _decode_cursor(cursor)
    rows = repository.list_theme_cases(theme_id, resolved_week, limit, offset)
    page, next_cursor = _paginate(rows, limit, offset)
    items = [ThemeCaseLink(**row).model_dump(mode="json") for row in page]
    return _envelope(resolved_week, items, next_cursor)


def get_case_detail(case_number: str, as_of_week: date | None) -> dict:
    resolved_week = resolve_as_of_week(as_of_week)
    case_row = repository.get_case_fact(case_number, resolved_week)
    if case_row is None:
        raise NotFoundError(f"Case {case_number} was not found for as_of_week {resolved_week.isoformat()}.")
    segment_rows = repository.list_narrative_segments(case_number)
    detail = CaseDetail(
        **case_row,
        narrative_segments=[NarrativeSegment(**row) for row in segment_rows],
    )
    return _envelope(resolved_week, detail.model_dump(mode="json"))


def get_metadata() -> dict:
    available_weeks = repository.get_available_case_weeks()
    if not available_weeks:
        raise NotFoundError("No published analytics weeks are available yet.")
    refresh_timestamp = repository.get_latest_built_at()
    data = MetadataResponse(
        available_weeks=available_weeks,
        refresh_timestamp=refresh_timestamp,
        logic_version=settings.logic_version,
        supported_metrics=SUPPORTED_METRICS,
        data_limitations=DATA_LIMITATIONS,
    )
    return _envelope(available_weeks[0], data.model_dump(mode="json"))
