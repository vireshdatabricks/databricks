import { apiFetch, reviewerHeaders, type ApiResult } from './client';

export type Envelope<T> = { data: T };
export type PromptbookRow = { promptbook_id: string; kind: 'base' | 'override'; active_version: number | null; published_at: string | null; latest_draft: number | null; name?: string | null };
export type PromptbookVersion = { promptbook_id: string; version: number; status: 'DRAFT' | 'ACTIVE' | 'RETIRED'; base_promptbook_id?: string | null; base_version?: number | null; change_note: string; created_by: string; created_at: string; activated_at?: string | null; published_at?: string | null; name?: string | null; document: PromptbookDocument };
export type PromptbookDocument = { meta: Record<string, unknown> & { promptbook_id: string; name?: string; base?: { promptbook_id: string; version: number }; extend?: string[] }; focus?: string; scope?: Record<string, unknown>; lens?: Array<Record<string, unknown>>; grouping?: Record<string, unknown>; report_template?: Record<string, unknown>; style?: Record<string, unknown>; thresholds?: Record<string, unknown>; [key: string]: unknown };
export type ResolvedPromptbook = { document: PromptbookDocument; promptbook_id: string; version: number; base?: { promptbook_id: string; version: number } | null; resolved_hash: string; lens_hash: string; section_hashes: Record<string, string>; section_origins: Record<string, 'base' | 'override'> };
export type PromptbookDiff = { against: 'base' | 'active'; changed_sections: string[]; sections: Record<string, { before: unknown; after: unknown }> };
export type ValidationResult = { valid: boolean; errors: Array<{ path: string; message: string }> };
export type ImpactResult = { impact: 'WORDING_ONLY' | 'CLASSIFICATION_RERUN'; changed_sections: string[] };

const root = '/promptbooks';
function json(method: string, body?: unknown) { return { method, headers: { ...reviewerHeaders(), 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }; }
export const listPromptbooks = () => apiFetch<Envelope<PromptbookRow[]>>(root);
export const getPromptbookVersions = (id: string) => apiFetch<Envelope<PromptbookVersion[]>>(`${root}/${encodeURIComponent(id)}/versions`);
export const getPromptbookVersion = (id: string, version: number) => apiFetch<Envelope<PromptbookVersion>>(`${root}/${encodeURIComponent(id)}/versions/${version}`);
export const getResolvedPromptbook = (id: string, version: number) => apiFetch<Envelope<ResolvedPromptbook>>(`${root}/${encodeURIComponent(id)}/versions/${version}/resolved`);
export const getPromptbookDiff = (id: string, version: number, against: 'base' | 'active') => apiFetch<Envelope<PromptbookDiff>>(`${root}/${encodeURIComponent(id)}/versions/${version}/diff?against=${against}`);
export const getLockedRules = () => apiFetch<Envelope<string[]>>(`${root}/locked-rules`);
export const createPromptbookDraft = (id: string, change_note: string) => apiFetch<Envelope<PromptbookVersion>>(`${root}/${encodeURIComponent(id)}/drafts`, json('POST', { change_note }));
export const savePromptbookDraft = (id: string, version: number, document: PromptbookDocument, change_note: string) => apiFetch<Envelope<PromptbookVersion & { revision: number }>>(`${root}/${encodeURIComponent(id)}/versions/${version}`, json('PUT', { document, change_note }));
export const validatePromptbook = (id: string, version: number) => apiFetch<Envelope<ValidationResult>>(`${root}/${encodeURIComponent(id)}/versions/${version}/validate`, json('POST'));
export const getPromptbookImpact = (id: string, version: number) => apiFetch<Envelope<ImpactResult>>(`${root}/${encodeURIComponent(id)}/versions/${version}/impact`);
export const activatePromptbook = (id: string, version: number) => apiFetch<Envelope<PromptbookVersion>>(`${root}/${encodeURIComponent(id)}/versions/${version}/activate`, json('POST'));
export const publishPromptbook = (id: string, version: number) => apiFetch<Envelope<{ promptbook_id: string; version: number; resolved_hash: string; published_at: string }>>(`${root}/${encodeURIComponent(id)}/versions/${version}/publish`, json('POST', {}));

export function failureState(result: ApiResult<unknown>) {
  if (result.ok) return undefined;
  return result.error.kind === 'forbidden' ? 'forbidden' : result.error.kind === 'not_found' ? 'not_found' : result.error.kind === 'unavailable' ? 'unavailable' : 'error';
}
