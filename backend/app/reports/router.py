from fastapi import APIRouter, Header, HTTPException, Response, status

from app.reports import service
from app.reports.schemas import ReviewDecisionRequest, SnapshotReportRequest
from app.reports.workflow import decide_insight, get_report, record_download, render_html
from app.core.config import settings

router = APIRouter()


@router.post("/snapshot-draft", status_code=status.HTTP_200_OK)
def post_snapshot_draft(request: SnapshotReportRequest):
    draft = service.generate_snapshot_report_draft(request)
    return draft.model_dump(mode="json")


def _actor(x_report_reviewer: str | None) -> str:
    # No authenticated identity dependency exists in the local build. Never treat
    # this development label as verified production RBAC.
    return x_report_reviewer or "LOCAL_DEVELOPMENT_BUSINESS_REVIEWER"


@router.post("/snapshot-review", status_code=status.HTTP_201_CREATED)
def post_snapshot_review(request: SnapshotReportRequest):
    return service.create_review_report(request)


@router.get("/{report_id}")
def get_snapshot_review(report_id: str):
    report = get_report(settings.report_workflow_db_path, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report review packet was not found.")
    return report


@router.post("/{report_id}/insights/{insight_id}/reviews")
def post_insight_review(report_id: str, insight_id: str, request: ReviewDecisionRequest, x_report_reviewer: str | None = Header(default=None)):
    rationale = request.rationale.strip()
    if request.disposition != "VALIDATED" and not rationale:
        raise HTTPException(status_code=422, detail="A reviewer rationale is required for this decision.")
    report = decide_insight(settings.report_workflow_db_path, report_id, insight_id, _actor(x_report_reviewer), request.disposition, rationale or "Approved without comment.", request.revision_text)
    if report is None:
        raise HTTPException(status_code=404, detail="Candidate insight was not found in this report.")
    return report


@router.get("/{report_id}/download-readiness")
def get_download_readiness(report_id: str):
    report = get_report(settings.report_workflow_db_path, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report review packet was not found.")
    return report["readiness"]


@router.get("/{report_id}/export")
def get_report_export(report_id: str, kind: str = "REVIEWED_HTML", x_report_reviewer: str | None = Header(default=None)):
    if kind not in {"REVIEWED_HTML", "DRAFT_HTML"}:
        raise HTTPException(status_code=422, detail="Export kind must be REVIEWED_HTML or DRAFT_HTML.")
    report, allowed = record_download(settings.report_workflow_db_path, report_id, _actor(x_report_reviewer), kind)
    if report is None:
        raise HTTPException(status_code=404, detail="Report review packet was not found.")
    if not allowed:
        raise HTTPException(status_code=409, detail="Reviewed export is blocked until every material insight is validated or explicitly excluded.")
    return Response(content=render_html(report, final=kind == "REVIEWED_HTML"), media_type="text/html", headers={"Content-Disposition": f'attachment; filename="report-{report_id}.html"'})
