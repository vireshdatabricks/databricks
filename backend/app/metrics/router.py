"""Interim workflow and recurrence metric endpoints (reference/51 §5), mounted under /v1/analytics."""
from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.metrics import service

router = APIRouter()
AsOfWeek = Query(default=None, description="Published week (YYYY-MM-DD). Omit for the latest READY week.")
PLACEHOLDER_REVIEWER = "LOCAL_DEVELOPMENT_BUSINESS_REVIEWER"


def _filters(client_account, line_of_business, category, case_assignment_group) -> dict:
    return {"client_account": client_account, "line_of_business": line_of_business, "category": category,
            "case_assignment_group": case_assignment_group}


@router.get("/metrics/definitions", status_code=status.HTTP_200_OK)
def get_definitions():
    return service.get_definitions()


@router.get("/metrics/baselines", status_code=status.HTTP_200_OK)
def get_baselines(metric_ids: list[str] = Query(...), as_of_week: date | None = AsOfWeek, client_account: str | None = None,
                  category: str | None = None, case_assignment_group: str | None = None):
    return service.get_baselines(as_of_week, metric_ids, {"client_account": client_account, "category": category,
                                                          "case_assignment_group": case_assignment_group})


@router.get("/operations/workflow", status_code=status.HTTP_200_OK)
def get_workflow(as_of_week: date | None = AsOfWeek, client_account: str | None = None, line_of_business: str | None = None,
                 category: str | None = None, case_assignment_group: str | None = None,
                 first_task_flag: Literal["NORMAL", "LIKELY_AUTOMATIC", "NO_TASK", "TASK_BEFORE_CASE"] | None = None,
                 excessive_handoffs: bool | None = None, sort: str | None = None,
                 limit: int = Query(default=50, ge=1, le=200), cursor: str | None = None):
    filters = _filters(client_account, line_of_business, category, case_assignment_group)
    filters.update({"first_task_flag": first_task_flag, "excessive_handoffs": excessive_handoffs})
    return service.list_workflow(as_of_week, filters, sort, limit, cursor)


@router.get("/operations/workflow/summary", status_code=status.HTTP_200_OK)
def get_workflow_summary(as_of_week: date | None = AsOfWeek, client_account: str | None = None, line_of_business: str | None = None,
                         category: str | None = None, case_assignment_group: str | None = None):
    return service.get_workflow_summary(as_of_week, _filters(client_account, line_of_business, category, case_assignment_group))


@router.get("/operations/reopens", status_code=status.HTTP_200_OK)
def get_reopens(as_of_week: date | None = AsOfWeek, client_account: str | None = None):
    return service.get_reopens(as_of_week, client_account)


@router.get("/recurrence/windows", status_code=status.HTTP_200_OK)
def get_recurrence_windows(as_of_week: date | None = AsOfWeek, client_account: str | None = None):
    return service.get_recurrence_windows(as_of_week, client_account)


@router.get("/recurrence/pairs", status_code=status.HTTP_200_OK)
def get_recurrence_pairs(as_of_week: date | None = AsOfWeek, client_account: str | None = None, tier: str | None = None,
                         window_days: int | None = Query(default=None, ge=1, le=3650),
                         limit: int = Query(default=50, ge=1, le=200), cursor: str | None = None):
    return service.list_pairs(as_of_week, client_account, tier, window_days, limit, cursor)


@router.get("/recurrence/precision", status_code=status.HTTP_200_OK)
def get_precision(as_of_week: date | None = AsOfWeek):
    return service.get_precision(as_of_week)


@router.get("/recurrence/label-queue", status_code=status.HTTP_200_OK)
def get_label_queue(x_report_reviewer: str | None = Header(default=None)):
    return service.label_queue(x_report_reviewer or PLACEHOLDER_REVIEWER)


class LabelRequest(BaseModel):
    verdict: Literal["SAME_ISSUE", "DIFFERENT_ISSUE", "UNSURE"]
    comment: str | None = Field(default=None, max_length=2000)


@router.post("/recurrence/pairs/{pair_id}/labels", status_code=status.HTTP_201_CREATED)
def post_label(pair_id: str, request: LabelRequest, x_report_reviewer: str | None = Header(default=None)):
    try:
        return service.record_label(pair_id, request.verdict, request.comment, x_report_reviewer or PLACEHOLDER_REVIEWER)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": str(exc)}) from exc
