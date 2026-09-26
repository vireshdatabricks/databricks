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

export const getThemes = (params: {
    as_of_week?: string;
    category?: string;
    root_cause?: string;
    min_support?: number;
    limit?: number;
    cursor?: string;
}) => getJson<Envelope<ThemeCandidate[]>>('/themes', params);

export const getThemeCases = (themeId: string, params: { as_of_week?: string; limit?: number; cursor?: string }) =>
    getJson<Envelope<ThemeCaseLink[]>>(`/themes/${encodeURIComponent(themeId)}/cases`, params);

export const getCase = (caseNumber: string, params: { as_of_week?: string }) =>
    getJson<Envelope<CaseDetail>>(`/cases/${encodeURIComponent(caseNumber)}`, params);

export const getMetadata = () => getJson<Envelope<MetadataResponse>>('/metadata');
