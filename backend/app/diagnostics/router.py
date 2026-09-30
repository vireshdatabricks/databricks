from datetime import date

from fastapi import APIRouter, Header, HTTPException, Path, status

from app.core.config import settings
from app.diagnostics import service, workflow
from app.diagnostics.schemas import DiagnosticCandidateRequest, DiagnosticReviewRequest

router = APIRouter()


def _actor(x_diagnostic_reviewer: str | None) -> str:
    # No verified identity dependency exists in the local build. This label must
    # not be interpreted as production authorization or RBAC enforcement.
    return x_diagnostic_reviewer or "LOCAL_DEVELOPMENT_BUSINESS_REVIEWER"


@router.get("/cases/{case_number}")
def get_case_diagnostic_context(case_number: str = Path(...), as_of_week: date | None = None):
    return service.get_case_diagnostics(settings.report_workflow_db_path, case_number, as_of_week)


@router.post("/cases/{case_number}/candidates", status_code=status.HTTP_201_CREATED)
def post_case_diagnostic_candidate(case_number: str, request: DiagnosticCandidateRequest, as_of_week: date | None = None, x_diagnostic_reviewer: str | None = Header(default=None)):
    try:
        return service.create_case_diagnostic(settings.report_workflow_db_path, case_number, as_of_week, _actor(x_diagnostic_reviewer), request)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


@router.post("/{diagnostic_id}/reviews")
def post_diagnostic_review(diagnostic_id: str, request: DiagnosticReviewRequest, x_diagnostic_reviewer: str | None = Header(default=None)):
    rationale = request.rationale.strip()
    if request.disposition != "VALIDATED" and not rationale:
        raise HTTPException(status_code=422, detail="A reviewer rationale is required for this decision.")
    diagnostic = workflow.review_diagnostic(settings.report_workflow_db_path, diagnostic_id, _actor(x_diagnostic_reviewer), request.disposition, rationale or "Approved without comment.", request.revision_text)
    if diagnostic is None:
        raise HTTPException(status_code=404, detail="Diagnostic candidate was not found.")
    return diagnostic
