import { BASE_PATH } from './base-path';

export interface Envelope<T> {
    as_of_week: string;
    logic_version: string;
    data_quality_status: string;
    data: T;
    next_cursor?: string;
}

export interface SummaryData {
    total_case_count: number;
    open_case_count: number;
    closed_case_count: number;
    total_task_count: number;
    open_task_count: number;
    closed_task_count: number;
    source_coverage_note: string;
}

export interface CaseTrendItem {
    report_month: string;
    client_account: string | null;
    category: string | null;
    case_type: string | null;
    subtype: string | null;
    root_cause: string | null;
    opened_case_count: number;
    closed_case_count: number;
    closed_case_tat_business_days_avg: number | null;
    closed_case_tat_calendar_days_avg: number | null;
}

export interface TaskTrendItem {
    report_month: string;
    task_assignment_group: string | null;
    task_state: string | null;
    task_category: string | null;
    task_type: string | null;
    task_subtype: string | null;
    opened_task_count: number;
    closed_task_count: number;
    closed_task_tat_business_days_avg: number | null;
    closed_task_tat_calendar_days_avg: number | null;
}

export interface MonthlyTrendPoint {
    report_month: string;
    opened_count: number;
    closed_count: number;
    represented_record_count: number;
}

export interface MonthlyTrendSeries {
    entity: string;
    unit: string;
    grain: string;
    series_definition: string;
    denominator_definition: string;
    month_count: number;
    total_opened_count: number;
    total_closed_count: number;
    points: MonthlyTrendPoint[];
}

export interface ThemeCandidate {
    theme_id: string;
    theme_label: string;
    category: string | null;
    root_cause: string | null;
    case_count: number;
    occurrence_rate: number;
    meets_min_support: boolean;
    method_type: string;
}

export interface ThemeSummaryCandidate extends ThemeCandidate {
    denominator_count: number;
    min_support_threshold: number;
}

export interface ThemeSummary {
    total_candidate_count: number;
    candidates_meeting_support_count: number;
    cases_represented_count: number;
    min_support_threshold: number;
    top_candidates: ThemeSummaryCandidate[];
}

export interface ThemeCaseLink {
    theme_id: string;
    case_number: string;
    client_account: string | null;
    line_of_business: string | null;
    category: string | null;
    case_type: string | null;
    subtype: string | null;
    root_cause: string | null;
    opened_at: string | null;
    closed_at: string | null;
    is_open: boolean | null;
    membership_basis: string;
}

export interface NarrativeSegment {
    segment_id: string;
    record_level: string;
    task_number: string | null;
    segment_type: string;
    segment_timestamp: string | null;
    segment_text: string;
    source_column: string;
    source_file: string | null;
    extract_week: string | null;
}

export interface CaseDetail {
    case_number: string;
    as_of_extract_week: string;
    client_account: string | null;
    line_of_business: string | null;
    category: string | null;
    case_type: string | null;
    subtype: string | null;
    root_cause: string | null;
    who_caused_issue: string | null;
    case_assignment_group: string | null;
    opened_at: string | null;
    closed_at: string | null;
    is_open: boolean;
    tat_business_days_src: number | null;
    tat_calendar_days_derived: number | null;
    task_count: number | null;
    source_file: string;
    logic_version: string;
    narrative_segments: NarrativeSegment[];
}

export interface MetadataResponse {
    available_weeks: string[];
    refresh_timestamp: string | null;
    logic_version: string;
    supported_metrics: string[];
    data_limitations: string[];
}

export class AnalyticsApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'AnalyticsApiError';
        this.status = status;
    }
}

type QueryParams = Record<string, string | number | undefined>;

async function getJson<T>(path: string, params: QueryParams = {}): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') query.set(key, String(value));
    }
    const qs = query.toString();
    const url = `${BASE_PATH}/api/v1/analytics${path}${qs ? `?${qs}` : ''}`;

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AnalyticsApiError(body?.message ?? `Request failed with status ${response.status}`, response.status);
    }
    return response.json();
}

export const getSummary = (params: {
    as_of_week?: string;
    client_account?: string;
    line_of_business?: string;
    assignment_group?: string;
}) => getJson<Envelope<SummaryData>>('/summary', params);

export const getCaseTrends = (params: {
    as_of_week?: string;
    client_account?: string;
    category?: string;
    case_type?: string;
    subtype?: string;
    root_cause?: string;
    limit?: number;
    cursor?: string;
}) => getJson<Envelope<CaseTrendItem[]>>('/case-trends', params);

export const getTaskTrends = (params: {
    as_of_week?: string;
    assignment_group?: string;
    state?: string;
    category?: string;
    type?: string;
    subtype?: string;
    limit?: number;
    cursor?: string;
}) => getJson<Envelope<TaskTrendItem[]>>('/task-trends', params);

export const getCaseTrendSeries = (params: {
    as_of_week?: string;
    client_account?: string;
    category?: string;
    case_type?: string;
    subtype?: string;
    root_cause?: string;
}) => getJson<Envelope<MonthlyTrendSeries>>('/case-trends/series', params);

export const getTaskTrendSeries = (params: {
    as_of_week?: string;
    assignment_group?: string;
    state?: string;
    category?: string;
    type?: string;
    subtype?: string;
}) => getJson<Envelope<MonthlyTrendSeries>>('/task-trends/series', params);

export const getThemes = (params: {
    as_of_week?: string;
    category?: string;
    root_cause?: string;
    min_support?: number;
    limit?: number;
    cursor?: string;
}) => getJson<Envelope<ThemeCandidate[]>>('/themes', params);

export const getThemesSummary = (params: {
    as_of_week?: string;
    category?: string;
    root_cause?: string;
    min_support?: number;
}) => getJson<Envelope<ThemeSummary>>('/themes/summary', params);

export const getThemeCases = (themeId: string, params: { as_of_week?: string; limit?: number; cursor?: string }) =>
    getJson<Envelope<ThemeCaseLink[]>>(`/themes/${encodeURIComponent(themeId)}/cases`, params);

export const getCase = (caseNumber: string, params: { as_of_week?: string }) =>
    getJson<Envelope<CaseDetail>>(`/cases/${encodeURIComponent(caseNumber)}`, params);

export type DiagnosticDisposition = 'VALIDATED' | 'REJECTED' | 'REVISED' | 'DUPLICATE' | 'ADDITIONAL_EVIDENCE_REQUIRED';

export interface DiagnosticEvidence {
    evidence_id?: string;
    segment_id: string;
    record_level: string;
    task_number: string | null;
    segment_type: string;
    source_column: string;
    source_file: string | null;
    extract_week: string | null;
    excerpt: string;
}

export interface DiagnosticReviewDecision {
    decision_id: string;
    reviewer_subject: string;
    disposition: DiagnosticDisposition;
    rationale: string;
    revision_text: string | null;
    created_at: string;
}

export interface CaseDiagnostic {
    diagnostic_id: string;
    case_number: string;
    as_of_week: string;
    client_account: string | null;
    status: string;
    observed_issue: string;
    candidate_contributing_factor: string;
    detection_gap: string;
    candidate_owner: string;
    proposed_action: string;
    created_by_subject: string;
    created_at: string;
    evidence: DiagnosticEvidence[];
    decisions: DiagnosticReviewDecision[];
}

export interface CaseDiagnosticContext {
    case_number: string;
    as_of_week: string;
    client_account: string | null;
    evidence: DiagnosticEvidence[];
    diagnostics: CaseDiagnostic[];
    identity_notice: string;
}

async function diagnosticJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_PATH}/api/v1/diagnostics${path}`, { cache: 'no-store', ...init });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AnalyticsApiError(body?.message ?? body?.detail ?? `Request failed with status ${response.status}`, response.status);
    }
    return response.json();
}

export const getCaseDiagnosticContext = (caseNumber: string, params: { as_of_week?: string }) => {
    const query = params.as_of_week ? `?as_of_week=${encodeURIComponent(params.as_of_week)}` : '';
    return diagnosticJson<CaseDiagnosticContext>(`/cases/${encodeURIComponent(caseNumber)}${query}`);
};

export const createCaseDiagnostic = (caseNumber: string, asOfWeek: string, request: {
    observed_issue: string;
    candidate_contributing_factor: string;
    detection_gap: string;
    candidate_owner: string;
    proposed_action: string;
    evidence_segment_ids: string[];
}) => diagnosticJson<CaseDiagnostic>(`/cases/${encodeURIComponent(caseNumber)}/candidates?as_of_week=${encodeURIComponent(asOfWeek)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Diagnostic-Reviewer': 'LOCAL_DEVELOPMENT_BUSINESS_REVIEWER' },
    body: JSON.stringify(request),
});

export const reviewCaseDiagnostic = (diagnosticId: string, request: { disposition: DiagnosticDisposition; rationale?: string; revision_text?: string }) =>
    diagnosticJson<CaseDiagnostic>(`/${encodeURIComponent(diagnosticId)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Diagnostic-Reviewer': 'LOCAL_DEVELOPMENT_BUSINESS_REVIEWER' },
        body: JSON.stringify(request),
    });

export const getMetadata = () => getJson<Envelope<MetadataResponse>>('/metadata');

export interface OperationRow {
    case_number?: string;
    as_of_extract_week: string;
    logic_version: string;
    classification: string;
    disclaimer: string | null;
    [key: string]: string | number | boolean | null | undefined;
}

export interface BreakdownItem {
    label: string;
    count: number;
}

export interface WorkloadSummary {
    total_case_count: number;
    open_case_count: number;
    unknown_age_count: number;
    oldest_age_calendar_days: number | null;
    age_band_counts: BreakdownItem[];
    assignment_group_counts: BreakdownItem[];
}

export interface DateRiskSummary {
    total_case_count: number;
    open_case_count: number;
    usable_risk_date_count: number;
    overdue_case_count: number;
    risk_status_counts: BreakdownItem[];
    risk_reference_type_counts: BreakdownItem[];
}

export interface DurationSummary { total_case_count: number; open_case_count: number; quality_status_counts: BreakdownItem[]; }
export interface DocumentationSummary { total_case_count: number; closed_case_count: number; missing_description_count: number; missing_closure_note_count: number; missing_root_cause_count: number; missing_resolution_count: number; documentation_status_counts: BreakdownItem[]; }
export interface DataQualitySummary { field_count: number; lowest_populated_rate: number | null; quality_status_counts: BreakdownItem[]; }

export const getWorkload = (params: QueryParams) => getJson<Envelope<OperationRow[]>>('/operations/workload', params);
export const getDateRisk = (params: QueryParams) => getJson<Envelope<OperationRow[]>>('/operations/date-risk', params);
export const getWorkloadSummary = (params: QueryParams) => getJson<Envelope<WorkloadSummary>>('/operations/workload/summary', params);
export const getDateRiskSummary = (params: QueryParams) => getJson<Envelope<DateRiskSummary>>('/operations/date-risk/summary', params);
export const getDurationsSummary = (params: QueryParams) => getJson<Envelope<DurationSummary>>('/operations/durations/summary', params);
export const getDocumentationSummary = (params: QueryParams) => getJson<Envelope<DocumentationSummary>>('/operations/documentation/summary', params);
export const getDataQualitySummary = (params: QueryParams) => getJson<Envelope<DataQualitySummary>>('/operations/data-quality/summary', params);
export const getDurations = (params: QueryParams) => getJson<Envelope<OperationRow[]>>('/operations/durations', params);
export const getDocumentation = (params: QueryParams) => getJson<Envelope<OperationRow[]>>('/operations/documentation', params);
export const getDataQuality = (params: QueryParams) => getJson<Envelope<OperationRow[]>>('/operations/data-quality', params);

export interface ReportFact {
    fact_id: string;
    label: string;
    value: string;
}

export interface ReportSection {
    heading: string;
    body: string;
    fact_ids: string[];
}

export interface SnapshotReportDraft {
    status: string;
    as_of_week: string;
    logic_version: string;
    generated_by_model: string;
    sections: ReportSection[];
    facts: ReportFact[];
    disclaimers: string[];
}

export interface SnapshotReportRequest {
    as_of_week?: string;
    client_account?: string;
    category?: string;
    evidence_authorized?: boolean;
}

export async function generateSnapshotReportDraft(request: SnapshotReportRequest): Promise<SnapshotReportDraft> {
    const response = await fetch(`${BASE_PATH}/api/v1/reports/snapshot-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        cache: 'no-store',
    });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AnalyticsApiError(body?.message ?? `Request failed with status ${response.status}`, response.status);
    }
    return response.json();
}

export interface ReportCitation { citation_id: string; source_type: 'AGGREGATE_FACT' | 'TICKET_FIELD' | 'WORK_NOTE' | 'ATTACHMENT'; source_locator: string; excerpt: string; classification: string; }
export type InsightDisposition = 'VALIDATED' | 'REJECTED' | 'REVISED' | 'DUPLICATE' | 'ADDITIONAL_EVIDENCE_REQUIRED';
export interface InsightReviewDecision { decision_id: string; reviewer_subject: string; disposition: InsightDisposition; rationale: string; revision_text: string | null; created_at: string; }
export interface ReportInsight { insight_id: string; sequence: number; title: string; body: string; claim_type: string; confidence: string; material: boolean; current_disposition: string; citations: ReportCitation[]; decisions: InsightReviewDecision[]; }
export interface ReportReadiness { total_material: number; validated: number; excluded: number; pending: number; ready: boolean; }
export interface ReportReviewPacket { report_id: string; status: string; as_of_week: string; client_account: string | null; category: string | null; logic_version: string; generated_by_model: string; disclaimers: string[]; insights: ReportInsight[]; readiness: ReportReadiness; }

async function reportJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${BASE_PATH}/api/v1/reports${path}`, { cache: 'no-store', ...init });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AnalyticsApiError(body?.message ?? body?.detail ?? `Request failed with status ${response.status}`, response.status);
    }
    return response.json();
}

export const createSnapshotReview = (request: SnapshotReportRequest) => reportJson<ReportReviewPacket>('/snapshot-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) });
export const reviewReportInsight = (reportId: string, insightId: string, request: { disposition: InsightDisposition; rationale?: string; revision_text?: string }) => reportJson<ReportReviewPacket>(`/${encodeURIComponent(reportId)}/insights/${encodeURIComponent(insightId)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Report-Reviewer': 'LOCAL_DEVELOPMENT_BUSINESS_REVIEWER' }, body: JSON.stringify(request) });
export const reportExportUrl = (reportId: string, kind: 'REVIEWED_HTML' | 'DRAFT_HTML') => `${BASE_PATH}/api/v1/reports/${encodeURIComponent(reportId)}/export?kind=${kind}`;
