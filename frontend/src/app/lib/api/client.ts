import { BASE_PATH } from '../../utils/base-path';

export type ApiErrorKind = 'unavailable' | 'forbidden' | 'not_found' | 'conflict' | 'invalid' | 'error';
export type ApiFieldError = { path: string; message: string };
export type ApiFailure = { kind: ApiErrorKind; message: string; status?: number; errors: ApiFieldError[]; request_id?: string };
export type ApiResult<T> = { ok: true; data: T; status: number } | { ok: false; error: ApiFailure };
export type ApiFetchOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit; baseUrl?: string };

function getMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const body = payload as { detail?: unknown; message?: unknown };
    if (typeof body.message === 'string') return body.message;
    if (body.detail && typeof body.detail === 'object' && typeof (body.detail as { message?: unknown }).message === 'string') return (body.detail as { message: string }).message;
    if (typeof body.detail === 'string') return body.detail;
  }
  return fallback;
}
function mapFailure(status?: number, payload?: unknown): ApiFailure {
  let kind: ApiErrorKind = 'error';
  if (status === undefined || status >= 500) kind = 'unavailable';
  else if (status === 403) kind = 'forbidden';
  else if (status === 404) kind = 'not_found';
  else if (status === 409) kind = 'conflict';
  else if (status === 422) kind = 'invalid';
  const detail = payload && typeof payload === 'object' ? (payload as { detail?: unknown }).detail : undefined;
  const errors = detail && typeof detail === 'object' && Array.isArray((detail as { errors?: unknown }).errors) ? (detail as { errors: ApiFieldError[] }).errors : [];
  const requestId = detail && typeof detail === 'object' && typeof (detail as { request_id?: unknown }).request_id === 'string' ? (detail as { request_id: string }).request_id : undefined;
  return { kind, message: getMessage(payload, status ? `Request failed (${status}).` : 'The service could not be reached.'), status, errors, request_id: requestId };
}
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  const { baseUrl = `${BASE_PATH}/api/v1`, ...init } = options;
  try {
    const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store', ...init });
    const payload = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, error: mapFailure(response.status, payload) };
    return { ok: true, data: payload as T, status: response.status };
  } catch {
    return { ok: false, error: mapFailure() };
  }
}

export type ApiFileResult = ApiResult<{ blob: Blob; filename: string }>;
export async function apiFetchFile(path: string, options: ApiFetchOptions = {}): Promise<ApiFileResult> {
  const { baseUrl = `${BASE_PATH}/api/v1`, ...init } = options;
  try {
    const response = await fetch(`${baseUrl}${path}`, { cache: 'no-store', ...init });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      return { ok: false, error: mapFailure(response.status, payload) };
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = disposition.match(/filename\*?=(?:UTF-8''|\"?)([^\";]+)/i)?.[1] ?? 'report-export';
    return { ok: true, data: { blob: await response.blob(), filename: decodeURIComponent(filename) }, status: response.status };
  } catch {
    return { ok: false, error: mapFailure() };
  }
}

const REVIEWER_ID = 'LOCAL_DEVELOPMENT_BUSINESS_REVIEWER';
export function reviewerHeaders(): Record<string, string> {
  return { 'X-Report-Reviewer': REVIEWER_ID };
}
