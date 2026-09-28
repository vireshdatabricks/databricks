from fastapi import APIRouter, status

from app.reports import service
from app.reports.schemas import SnapshotReportRequest

router = APIRouter()


@router.post("/snapshot-draft", status_code=status.HTTP_200_OK)
def post_snapshot_draft(request: SnapshotReportRequest):
    draft = service.generate_snapshot_report_draft(request)
    return draft.model_dump(mode="json")
