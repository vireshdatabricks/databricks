"""Case diagnostic review — frozen by reference/52 (2026-10-02).

Report review happens only in the promptbook report workflow (/api/v1/case-reports). Write paths
return 410 RETIRED; reads stay so existing rows remain auditable until reference/44 step 11 removes
this package.
"""
from datetime import date

from fastapi import APIRouter, HTTPException, Path, status

from app.core.config import settings
from app.diagnostics import service

router = APIRouter()

RETIRED_DETAIL = {
    "code": "RETIRED",
    "message": "Case diagnostic review is retired. Review case findings in the report workflow (Reports).",
    "replacement": "/api/v1/case-reports",
}


def _retired() -> HTTPException:
    return HTTPException(status_code=status.HTTP_410_GONE, detail=RETIRED_DETAIL)


@router.get("/cases/{case_number}")
def get_case_diagnostic_context(case_number: str = Path(...), as_of_week: date | None = None):
    return service.get_case_diagnostics(settings.report_workflow_db_path, case_number, as_of_week)


@router.get("/reports/summary")
def get_client_diagnostic_report_summary(client_account: str, as_of_week: date | None = None):
    return service.get_client_diagnostic_report_summary(settings.report_workflow_db_path, client_account, as_of_week)


@router.post("/cases/{case_number}/candidates/draft", status_code=status.HTTP_410_GONE)
def post_case_diagnostic_draft(case_number: str = Path(...)):
    raise _retired()


@router.post("/cases/{case_number}/candidates", status_code=status.HTTP_410_GONE)
def post_case_diagnostic_candidate(case_number: str = Path(...)):
    raise _retired()


@router.post("/{diagnostic_id}/reviews", status_code=status.HTTP_410_GONE)
def post_diagnostic_review(diagnostic_id: str):
    raise _retired()
