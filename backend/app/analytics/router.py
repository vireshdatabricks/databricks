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
