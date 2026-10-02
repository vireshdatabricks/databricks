import { apiFetch, apiFetchFile, reviewerHeaders, type ApiResult, type ApiFileResult } from './client';

export type ReportStatus = 'IN_REVIEW' | 'REVIEWED' | 'SIGNED_OFF' | 'SUPERSEDED';
export type DecisionStatus = 'UNVALIDATED' | 'VALIDATED' | 'REVISED' | 'REJECTED';
export type ReportCitation = {
  source_type?: string | null; record?: string | null; field?: string | null; file?: string | null;
  sheet?: string | null; quote?: string | null; extract_week?: string | null; children?: ReportCitation[];
};
export type ReportDecision = {
  decision_id: string; reviewer_subject: string; disposition: DecisionStatus; revised_text?: string | null;
  comment?: string | null; prefilled_from?: string | null; created_at: string;
};
export type ReportItem = {
  item_id: string; item_key: string; kind: string; case_number?: string | null; theme_id?: string | null;
  title: string; body_text: string; citations: ReportCitation[]; sequence: number; section_id: string;
  origin: 'COMPUTED' | 'MODEL'; current_status: DecisionStatus; detail?: {
    question?: string; generated_sql?: string; check_status?: string; check_detail?: string;
    result_columns?: string[]; rows?: Array<Record<string, unknown>>; row_count?: number;
  } | null; decisions: ReportDecision[];
};
export type ReportBlock =
  | { type: 'text'; origin: 'TEMPLATE' | 'COMPUTED'; text: string; generated?: boolean }
  | { type: 'facts'; origin: 'COMPUTED'; rows: Array<{ label: string; value: string }> }
  | { type: 'item' | 'evidence_answer'; item_id?: string | null; [key: string]: unknown }
  | { type: 'theme_group'; theme_item_id?: string | null; cases: Array<{ case_number: string; item_ids: string[]; summary: { undecided: number; validated: number; revised: number; rejected: number } }> };
export type ReportCaseGroup = Extract<ReportBlock, { type: 'theme_group' }>['cases'][number];
export type ReportSection = { id: string; number?: string | null; heading: string; kind: string; origin_note?: string | null; review?: { decided: number; total: number; needs_review: boolean }; blocks?: ReportBlock[]; item_counts: Record<string, number> };
export type ReportVersion = {
  report_version_id: string; analysis_run_id: string; package_version: number; promptbook_id: string;
  promptbook_version: number; clients: string[]; title: string; status: ReportStatus; imported_at: string;
  imported_by: string; superseded_by?: string | null; items: ReportItem[]; sections: ReportSection[];
  signoffs: Array<{ reviewer_subject: string; statement: string; created_at: string }>;
  status_counts: Record<DecisionStatus, number>; payload_version?: number;
};
export type ReportListRow = Omit<ReportVersion, 'items' | 'sections' | 'signoffs' | 'status_counts'> & {
  pending: number; items: number;
};
type Envelope<T> = { data: T };
export type ReportExport = {
  audit_id: string; report_version_id: string; requester_subject: string; export_format: 'html' | 'xlsx';
  validated_only: boolean; status_counts: Record<string, number>; created_at: string;
};
export type ReportRequestState = 'QUEUED' | 'RUNNING' | 'PACKAGED' | 'IMPORTED' | 'FAILED' | 'CANCELLED';
export type ReportRequest = {
  request_id: string;
  parameters: { promptbook_id: string; promptbook_version: string | number; client_accounts: string; date_from: string; date_to: string; model_id: string; [key: string]: string | number };
  requested_by: string;
  databricks_run_id?: string | null;
  state: ReportRequestState;
  state_detail?: string | null;
  analysis_run_id?: string | null;
  report_version_id?: string | null;
  created_at: string;
  updated_at: string;
};
export type OptionAvailability = { available: boolean; reason: 'service_unavailable' | 'query_failed' | 'column_missing' | null };
export type ReportRequestOptions = {
  models: string[];
  promptbooks: Array<{ promptbook_id: string; version: number; name?: string | null; published_at: string }>;
  client_accounts: string[];
  filter_values: Record<string, string[]>;
  availability: Record<string, OptionAvailability>;
};
export type ReportPreviewRequest = Omit<StartReportRequest, 'model_id'>;
export type ReportPreview = {
  matching_cases_total: number; by_client: Array<{ client_account: string; cases: number }>;
  period: { date_from: string; date_to: string }; as_of_extract_week?: string | null; warnings: string[];
};
export type ReportFamilyVersion = {
  report_version_id: string; status: ReportStatus; decided: number; total: number; imported_at: string;
  last_activity_at: string; analysis_run_id: string; package_version: number;
};
export type ReportFamily = {
  family_key: string; title: string; clients: string[]; date_from?: string | null; date_to?: string | null;
  filters: Record<string, string>; promptbook: { id: string; version: number; name?: string | null };
  latest: ReportFamilyVersion; versions: ReportFamilyVersion[]; last_activity_at: string;
};
export type ReportFamilies = { families: ReportFamily[]; status_counts: Partial<Record<ReportStatus, number>> };
export type StartReportRequest = {
  promptbook_id: string;
  promptbook_version?: number;
  client_accounts: string[];
  date_from: string;
  date_to: string;
  model_id: string;
  filters: Record<string, string>;
};

export function listReportVersions(): Promise<ApiResult<Envelope<ReportListRow[]>>> {
  return apiFetch('/case-reports');
}
export function getReportRequestOptions(clientAccounts: string[] = []): Promise<ApiResult<Envelope<ReportRequestOptions>>> {
  const query = new URLSearchParams();
  clientAccounts.forEach((client) => query.append('client_accounts', client));
  return apiFetch(`/case-reports/request-options${clientAccounts.length ? `?${query}` : ''}`);
}
export function listReportFamilies(): Promise<ApiResult<Envelope<ReportFamilies>>> {
  return apiFetch('/case-reports?group=family');
}
export function previewReportRequest(body: ReportPreviewRequest, signal?: AbortSignal): Promise<ApiResult<Envelope<ReportPreview>>> {
  return apiFetch('/case-reports/request-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
}
export function startReportRequest(body: StartReportRequest): Promise<ApiResult<Envelope<ReportRequest>>> {
  return apiFetch('/case-reports/requests', { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export function listReportRequests(): Promise<ApiResult<Envelope<ReportRequest[]>>> {
  return apiFetch('/case-reports/requests');
}
export function getReportRequest(id: string): Promise<ApiResult<Envelope<ReportRequest>>> {
  return apiFetch(`/case-reports/requests/${encodeURIComponent(id)}`, { headers: reviewerHeaders() });
}
export function cancelReportRequest(id: string): Promise<ApiResult<Envelope<ReportRequest>>> {
  return apiFetch(`/case-reports/requests/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: reviewerHeaders() });
}
export function importReportRequest(id: string): Promise<ApiResult<Envelope<ReportRequest>>> {
  return apiFetch(`/case-reports/requests/${encodeURIComponent(id)}/import`, { method: 'POST', headers: reviewerHeaders() });
}
export function getReportVersion(id: string): Promise<ApiResult<Envelope<ReportVersion>>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}`);
}
export function importReport(analysisRunId: string): Promise<ApiResult<{ report_version_id: string; created: boolean }>> {
  return apiFetch('/case-reports/import', { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ analysis_run_id: analysisRunId }) });
}
export function saveItemDecision(id: string, itemId: string, body: { disposition: DecisionStatus; comment?: string; revised_text?: string }): Promise<ApiResult<unknown>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/decisions`, { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export function validateTheme(id: string, themeId: string, body: { disposition: 'VALIDATED'; comment?: string; exclude_item_ids: string[] }): Promise<ApiResult<{ validated: number; skipped_decided: number; excluded: number; report_status: string; cases?: string[] }>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/themes/${encodeURIComponent(themeId)}/decisions`, { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export function decideCase(id: string, caseNumber: string, body: { disposition?: 'VALIDATED' | 'REJECTED'; comment?: string; field_overrides: Array<{ item_id: string; disposition: 'REVISED' | 'REJECTED'; revised_text?: string; comment?: string }> }): Promise<ApiResult<{ decided: number; report_status: string }>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/cases/${encodeURIComponent(caseNumber)}/decisions`, { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
export function getPrefillSources(id: string): Promise<ApiResult<Envelope<Array<{ report_version_id: string; title: string; status: ReportStatus; imported_at: string; clients: string[]; promptbook_id: string }>>>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/prefill-sources`);
}
export function previewPrefill(id: string, sourceId: string): Promise<ApiResult<{ copyable: number; remaining: number; from_report_version_id: string }>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/prefill?preview=true`, { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ from_report_version_id: sourceId }) });
}
export function applyPrefill(id: string, sourceId: string): Promise<ApiResult<unknown>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/prefill`, { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ from_report_version_id: sourceId }) });
}
export function signOffReport(id: string, statement: string): Promise<ApiResult<unknown>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/signoff`, { method: 'POST', headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ statement }) });
}
export function getReportExports(id: string): Promise<ApiResult<Envelope<ReportExport[]>>> {
  return apiFetch(`/case-reports/${encodeURIComponent(id)}/exports`);
}
export function downloadReportExport(id: string, format: 'html' | 'xlsx', validatedOnly: boolean): Promise<ApiFileResult> {
  const query = new URLSearchParams({ format, validated_only: String(validatedOnly) });
  return apiFetchFile(`/case-reports/${encodeURIComponent(id)}/export?${query}`, { headers: reviewerHeaders() });
}
