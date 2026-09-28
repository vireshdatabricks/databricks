from datetime import date

from pydantic import BaseModel


class SnapshotReportRequest(BaseModel):
    as_of_week: date | None = None
    client_account: str | None = None
    category: str | None = None
    # Case IDs/static narrative are only included in the fact package when true; the caller
    # is responsible for enforcing the authorization check before setting this.
    evidence_authorized: bool = False


class ReportFact(BaseModel):
    fact_id: str
    label: str
    value: str


class ReportSection(BaseModel):
    heading: str
    body: str
    fact_ids: list[str]


class SnapshotReportDraft(BaseModel):
    status: str = "SYSTEM_GENERATED_DRAFT"
    as_of_week: date
    logic_version: str
    generated_by_model: str
    sections: list[ReportSection]
    facts: list[ReportFact]
    disclaimers: list[str]
