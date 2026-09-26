from datetime import date, datetime

from pydantic import BaseModel


class SummaryData(BaseModel):
    total_case_count: int
    open_case_count: int
    closed_case_count: int
    total_task_count: int
    open_task_count: int
    closed_task_count: int
    source_coverage_note: str


class CaseTrendItem(BaseModel):
    report_month: date
    client_account: str | None = None
    category: str | None = None
    case_type: str | None = None
    subtype: str | None = None
    root_cause: str | None = None
    opened_case_count: int
    closed_case_count: int
    closed_case_tat_business_days_avg: float | None = None
    closed_case_tat_calendar_days_avg: float | None = None


class TaskTrendItem(BaseModel):
    report_month: date
    task_assignment_group: str | None = None
    task_state: str | None = None
    task_category: str | None = None
    task_type: str | None = None
    task_subtype: str | None = None
    opened_task_count: int
    closed_task_count: int
    closed_task_tat_business_days_avg: float | None = None
    closed_task_tat_calendar_days_avg: float | None = None


class ThemeCandidate(BaseModel):
    theme_id: str
    theme_label: str
    category: str | None = None
    root_cause: str | None = None
    case_count: int
    occurrence_rate: float
    meets_min_support: bool
    method_type: str


class ThemeCaseLink(BaseModel):
    theme_id: str
    case_number: str
    client_account: str | None = None
    line_of_business: str | None = None
    category: str | None = None
    case_type: str | None = None
    subtype: str | None = None
    root_cause: str | None = None
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    is_open: bool | None = None
    membership_basis: str


class NarrativeSegment(BaseModel):
    segment_id: str
    record_level: str
    task_number: str | None = None
    segment_type: str
    segment_timestamp: datetime | None = None
    segment_text: str
    source_column: str


class CaseDetail(BaseModel):
    case_number: str
    as_of_extract_week: date
    client_account: str | None = None
    line_of_business: str | None = None
    category: str | None = None
    case_type: str | None = None
    subtype: str | None = None
    root_cause: str | None = None
    who_caused_issue: str | None = None
    case_assignment_group: str | None = None
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    is_open: bool
    tat_business_days_src: float | None = None
    tat_calendar_days_derived: float | None = None
    task_count: int | None = None
    source_file: str
    logic_version: str
    narrative_segments: list[NarrativeSegment]


class MetadataResponse(BaseModel):
    available_weeks: list[date]
    refresh_timestamp: datetime | None = None
    logic_version: str
    supported_metrics: list[str]
    data_limitations: list[str]
