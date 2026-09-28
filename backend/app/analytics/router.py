from datetime import date

from fastapi import APIRouter, Path, Query, status

from app.analytics import service

router = APIRouter()

CursorQuery = Query(default=None, description="Opaque pagination cursor from a previous response's next_cursor.")
LimitQuery = Query(default=50, ge=1, le=200)
AsOfWeekQuery = Query(default=None, description="Published week (YYYY-MM-DD). Omit for the latest complete week.")


@router.get("/summary", status_code=status.HTTP_200_OK)
def get_summary(
    as_of_week: date | None = AsOfWeekQuery,
    client_account: str | None = Query(default=None),
    line_of_business: str | None = Query(default=None),
    assignment_group: str | None = Query(default=None),
):
    return service.get_summary(as_of_week, client_account, line_of_business, assignment_group)


@router.get("/case-trends", status_code=status.HTTP_200_OK)
def get_case_trends(
    as_of_week: date | None = AsOfWeekQuery,
    client_account: str | None = Query(default=None),
    category: str | None = Query(default=None),
    case_type: str | None = Query(default=None),
    subtype: str | None = Query(default=None),
    root_cause: str | None = Query(default=None),
    limit: int = LimitQuery,
    cursor: str | None = CursorQuery,
):
    return service.list_case_trends(as_of_week, client_account, category, case_type, subtype, root_cause, limit, cursor)


@router.get("/task-trends", status_code=status.HTTP_200_OK)
def get_task_trends(
    as_of_week: date | None = AsOfWeekQuery,
    assignment_group: str | None = Query(default=None),
    state: str | None = Query(default=None),
    category: str | None = Query(default=None),
    type: str | None = Query(default=None),
    subtype: str | None = Query(default=None),
    limit: int = LimitQuery,
    cursor: str | None = CursorQuery,
):
    return service.list_task_trends(as_of_week, assignment_group, state, category, type, subtype, limit, cursor)


@router.get("/themes", status_code=status.HTTP_200_OK)
def get_themes(
    as_of_week: date | None = AsOfWeekQuery,
    category: str | None = Query(default=None),
    root_cause: str | None = Query(default=None),
    min_support: int | None = Query(default=None, ge=1),
    limit: int = LimitQuery,
    cursor: str | None = CursorQuery,
):
    return service.list_themes(as_of_week, category, root_cause, min_support, limit, cursor)


@router.get("/themes/{theme_id}/cases", status_code=status.HTTP_200_OK)
def get_theme_cases(
    theme_id: str = Path(...),
    as_of_week: date | None = AsOfWeekQuery,
    limit: int = LimitQuery,
    cursor: str | None = CursorQuery,
):
    return service.list_theme_cases(theme_id, as_of_week, limit, cursor)


@router.get("/cases/{case_number}", status_code=status.HTTP_200_OK)
def get_case(
    case_number: str = Path(...),
    as_of_week: date | None = AsOfWeekQuery,
):
    return service.get_case_detail(case_number, as_of_week)


@router.get("/metadata", status_code=status.HTTP_200_OK)
def get_metadata():
    return service.get_metadata()


def operation_filters(
    client_account: str | None, line_of_business: str | None, carrier_id: str | None, account_id: str | None,
    group_id: str | None, case_assignment_group: str | None, case_assigned_to: str | None, category: str | None,
    case_type: str | None, subtype: str | None, is_open: bool | None,
) -> dict:
    return {"client_account": client_account, "line_of_business": line_of_business, "carrier_id": carrier_id,
            "account_id": account_id, "group_id": group_id, "case_assignment_group": case_assignment_group,
            "case_assigned_to": case_assigned_to, "category": category, "case_type": case_type,
            "subtype": subtype, "is_open": is_open}


@router.get("/operations/workload", status_code=status.HTTP_200_OK)
def get_workload(as_of_week: date | None = AsOfWeekQuery, client_account: str | None = None, line_of_business: str | None = None,
    carrier_id: str | None = None, account_id: str | None = None, group_id: str | None = None, case_assignment_group: str | None = None,
    case_assigned_to: str | None = None, category: str | None = None, case_type: str | None = None, subtype: str | None = None,
    is_open: bool | None = None, age_band: str | None = None, age_data_quality_status: str | None = None,
    sort: str | None = None, limit: int = LimitQuery, cursor: str | None = CursorQuery):
    filters = operation_filters(client_account, line_of_business, carrier_id, account_id, group_id, case_assignment_group, case_assigned_to, category, case_type, subtype, is_open)
    filters.update({"age_band": age_band, "age_data_quality_status": age_data_quality_status})
    return service.list_operation("workload", as_of_week, filters, sort, limit, cursor)


@router.get("/operations/date-risk", status_code=status.HTTP_200_OK)
def get_date_risk(as_of_week: date | None = AsOfWeekQuery, client_account: str | None = None, line_of_business: str | None = None,
    carrier_id: str | None = None, account_id: str | None = None, group_id: str | None = None, case_assignment_group: str | None = None,
    case_assigned_to: str | None = None, category: str | None = None, case_type: str | None = None, subtype: str | None = None,
    is_open: bool | None = None, risk_status: str | None = None, risk_reference_type: str | None = None,
    sort: str | None = None, limit: int = LimitQuery, cursor: str | None = CursorQuery):
    filters = operation_filters(client_account, line_of_business, carrier_id, account_id, group_id, case_assignment_group, case_assigned_to, category, case_type, subtype, is_open)
    filters.update({"risk_status": risk_status, "risk_reference_type": risk_reference_type})
    return service.list_operation("date_risk", as_of_week, filters, sort, limit, cursor)


@router.get("/operations/durations", status_code=status.HTTP_200_OK)
def get_durations(as_of_week: date | None = AsOfWeekQuery, client_account: str | None = None, case_assignment_group: str | None = None,
    category: str | None = None, case_type: str | None = None, subtype: str | None = None, is_open: bool | None = None,
    duration_data_quality_status: str | None = None, sort: str | None = None, limit: int = LimitQuery, cursor: str | None = CursorQuery):
    filters = {"client_account": client_account, "case_assignment_group": case_assignment_group, "category": category,
               "case_type": case_type, "subtype": subtype, "is_open": is_open, "duration_data_quality_status": duration_data_quality_status}
    return service.list_operation("durations", as_of_week, filters, sort, limit, cursor)


@router.get("/operations/documentation", status_code=status.HTTP_200_OK)
def get_documentation(as_of_week: date | None = AsOfWeekQuery, client_account: str | None = None, case_assignment_group: str | None = None,
    category: str | None = None, case_type: str | None = None, subtype: str | None = None, is_open: bool | None = None,
    documentation_status: str | None = None, sort: str | None = None, limit: int = LimitQuery, cursor: str | None = CursorQuery):
    filters = {"client_account": client_account, "case_assignment_group": case_assignment_group, "category": category,
               "case_type": case_type, "subtype": subtype, "is_open": is_open, "documentation_status": documentation_status}
    return service.list_operation("documentation", as_of_week, filters, sort, limit, cursor)


@router.get("/operations/data-quality", status_code=status.HTTP_200_OK)
def get_data_quality(as_of_week: date | None = AsOfWeekQuery, entity_type: str | None = None, field_name: str | None = None,
    quality_status: str | None = None, sort: str | None = None, limit: int = LimitQuery, cursor: str | None = CursorQuery):
    return service.list_operation("data_quality", as_of_week, {"entity_type": entity_type, "field_name": field_name, "quality_status": quality_status}, sort, limit, cursor)
