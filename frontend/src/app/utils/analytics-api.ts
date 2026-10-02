import { BASE_PATH } from './base-path';
import { reviewerHeaders } from '../lib/api/client';

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

export interface FilterOptions { client_accounts: string[]; lines_of_business: string[]; assignment_groups: string[]; categories: string[]; }
export const getFilterOptions = (params: { as_of_week?: string }) => getJson<Envelope<FilterOptions>>('/filter-options', params);

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
export const reviewReportInsight = (reportId: string, insightId: string, request: { disposition: InsightDisposition; rationale?: string; revision_text?: string }) => reportJson<ReportReviewPacket>(`/${encodeURIComponent(reportId)}/insights/${encodeURIComponent(insightId)}/reviews`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...reviewerHeaders() }, body: JSON.stringify(request) });
export const reportExportUrl = (reportId: string, kind: 'REVIEWED_HTML' | 'DRAFT_HTML') => `${BASE_PATH}/api/v1/reports/${encodeURIComponent(reportId)}/export?kind=${kind}`;

// Interim workflow and recurrence metrics (reference/51 §5). Labels: DIRECT | PROXY | CANDIDATE | NOT_AVAILABLE.
export type MetricLabel = 'DIRECT' | 'PROXY' | 'CANDIDATE' | 'NOT_AVAILABLE';
export interface MetricDefinition {
    metric_id: string; definition_version: number; metric_name: string; label: MetricLabel; display_name: string;
    stands_in_for: string | null; measures_what: string; formula: string | null; time_basis: string | null;
    threshold: Record<string, unknown>; unlock_condition: string | null; target_value: number | null;
}
export interface WorkflowRow extends OperationRow {
    time_to_first_task_hours: number | null; first_task_flag: string; task_count: number; distinct_task_group_count: number;
    handoff_count: number; excessive_handoffs: boolean; task_group_path: string | null; gap_observable: boolean;
    gap_count: number | null; gap_total_days: number | null; gap_longest_days: number | null; gap_threshold_days: number;
}
export interface WorkflowSummary {
    case_count: number; cases_with_tasks: number; first_task_normal_count: number; first_task_automatic_count: number;
    no_task_count: number; task_before_case_count: number; first_task_median_hours: number | null; first_task_p90_hours: number | null;
    excessive_handoff_count: number; handoff_median: number | null; gap_observable_count: number; cases_with_counted_gap: number;
    longest_gap_median_days: number | null; gap_threshold_days: number | null;
    first_task_bands: BreakdownItem[]; handoff_bands: BreakdownItem[]; longest_gap_bands: BreakdownItem[];
    definitions: Record<string, MetricDefinition>;
}
export interface BaselineRow {
    metric_id: string; unit: string; period: 'BASELINE' | 'CURRENT'; period_from: string; period_to: string; n: number;
    median: number | null; p90: number | null; missing_count: number; invalid_count: number; suppressed: boolean; label: MetricLabel;
}
export interface Baselines { segment_type: string; segment_value: string; note: string | null; rows: BaselineRow[] }
export type ReopenSummary =
    | { status: 'NOT_AVAILABLE'; metric_id: string; reason: string; unlock_condition: string | null; observation_starts_after: string | null }
    | { status: 'AVAILABLE'; metric_id: string; label: MetricLabel; prior_extract_week: string; observation_starts_after: string; closed_in_prior_extract: number; reopened_count: number; rate: number | null; by_basis: BreakdownItem[] };
export interface RecurrenceWindow {
    window_code: string; window_days: number; tier: 'A' | 'B' | 'ALL'; closed_index_count: number; eligible_index_count: number;
    censored_count: number; recurring_index_count: number; rate: number | null; related_case_count: number;
    precision: number | null; precision_adjusted_related_cases: number | null;
}
export interface RecurrenceSummary {
    rule_version: string; segment_type: string; segment_value: string; windows: RecurrenceWindow[];
    remediation: { rows: Array<{ category: string; closed_index_count: number; eligible_index_count: number; censored_count: number; recurring_index_count: number; rate: number | null }>; cases_with_preventive_action: number; closed_cases: number | null };
    definitions: Record<string, MetricDefinition>;
}
export interface TierPrecision {
    tier: string; status: 'DIRECT' | 'CANDIDATE'; precision: number | null; sampled_pairs?: number; labelled_pairs?: number;
    same_issue?: number; different_issue?: number; unsure?: number; decided_labels?: number; min_labels?: number;
    false_positive_rate?: number | null; reviewer_agreement?: number | null;
}
export interface PrecisionSummary { rule_version: string; min_labels: number; tiers: Record<'A' | 'B' | 'ALL', TierPrecision> }
export interface RecurrencePair {
    pair_id: string; client_account: string; index_case_number: string; related_case_number: string; match_tier: 'A' | 'B';
    days_after_close: number; category: string; subtype: string; index_root_cause: string | null; related_root_cause: string | null;
    index_short_description: string | null; related_short_description: string | null;
}
export interface LabelQueue {
    rule_version: string; min_labels: number; progress: Record<'A' | 'B', { labelled: number; sampled: number }>;
    pair: (Record<string, string | number | null | unknown> & { pair_id: string; match_tier: 'A' | 'B'; client_account: string; days_after_close: number; index_case_number: string; related_case_number: string; labels: Array<{ verdict: string; comment: string | null; reviewer: string; labelled_at: string }> }) | null;
}
export type MatchVerdict = 'SAME_ISSUE' | 'DIFFERENT_ISSUE' | 'UNSURE';

type MetricFilters = { as_of_week?: string; client_account?: string; line_of_business?: string; category?: string; case_assignment_group?: string };
const METRIC_REVIEWER = { 'X-Report-Reviewer': 'LOCAL_DEVELOPMENT_BUSINESS_REVIEWER' };

async function metricRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${BASE_PATH}/api/v1/analytics${path}`, { cache: 'no-store', ...init });
    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new AnalyticsApiError(body?.detail?.message ?? body?.message ?? `Request failed with status ${response.status}`, response.status);
    }
    return response.json();
}

export const getWorkflowSummary = (params: MetricFilters) => getJson<Envelope<WorkflowSummary>>('/operations/workflow/summary', params);
export const getWorkflow = (params: MetricFilters & { sort?: string; first_task_flag?: string; excessive_handoffs?: string; limit?: number; cursor?: string }) => getJson<Envelope<WorkflowRow[]>>('/operations/workflow', params);
export const getReopens = (params: { as_of_week?: string; client_account?: string }) => getJson<Envelope<ReopenSummary>>('/operations/reopens', params);
export function getBaselines(metricIds: string[], params: MetricFilters): Promise<Envelope<Baselines>> {
    const query = new URLSearchParams();
    metricIds.forEach((id) => query.append('metric_ids', id));
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    return metricRequest('/metrics/baselines?' + query.toString());
}
export const getRecurrenceWindows = (params: { as_of_week?: string; client_account?: string }) => getJson<Envelope<RecurrenceSummary>>('/recurrence/windows', params);
export const getRecurrencePairs = (params: { as_of_week?: string; client_account?: string; tier?: string; window_days?: number; limit?: number; cursor?: string }) => getJson<Envelope<RecurrencePair[]>>('/recurrence/pairs', params);
export const getPrecision = (params: { as_of_week?: string } = {}) => getJson<Envelope<PrecisionSummary>>('/recurrence/precision', params);
export const getLabelQueue = () => metricRequest<Envelope<LabelQueue>>('/recurrence/label-queue', { headers: METRIC_REVIEWER });
export const labelRecurrencePair = (pairId: string, verdict: MatchVerdict, comment?: string) =>
    metricRequest<unknown>('/recurrence/pairs/' + encodeURIComponent(pairId) + '/labels', {
        method: 'POST', headers: { ...METRIC_REVIEWER, 'Content-Type': 'application/json' }, body: JSON.stringify({ verdict, comment: comment || undefined }),
    });
