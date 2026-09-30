from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class DiagnosticCandidateRequest(BaseModel):
    observed_issue: str = Field(min_length=1, max_length=4000)
    candidate_contributing_factor: str = Field(default="", max_length=4000)
    detection_gap: str = Field(default="", max_length=4000)
    candidate_owner: str = Field(default="", max_length=500)
    proposed_action: str = Field(default="", max_length=4000)
    evidence_segment_ids: list[str] = Field(min_length=1, max_length=12)


class DiagnosticReviewRequest(BaseModel):
    disposition: Literal["VALIDATED", "REJECTED", "REVISED", "DUPLICATE", "ADDITIONAL_EVIDENCE_REQUIRED"]
    rationale: str = Field(default="", max_length=4000)
    revision_text: str | None = Field(default=None, max_length=4000)


class DiagnosticEvidence(BaseModel):
    evidence_id: str
    segment_id: str
    record_level: str
    task_number: str | None = None
    segment_type: str
    source_column: str
    source_file: str | None = None
    extract_week: date | None = None
    excerpt: str


class DiagnosticReviewDecision(BaseModel):
    decision_id: str
    reviewer_subject: str
    disposition: str
    rationale: str
    revision_text: str | None = None
    created_at: str
