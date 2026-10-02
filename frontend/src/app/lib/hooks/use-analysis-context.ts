'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

// Monthly trend adds case_type, subtype, root_cause (cases) and state, type (tasks); kind picks the entity (reference/50 §4.3).
export type AnalysisContextKey = 'as_of_week' | 'client_account' | 'category' | 'line_of_business' | 'assignment_group'
  | 'case_type' | 'subtype' | 'root_cause' | 'state' | 'type' | 'kind';
export type AnalysisContext = { [Key in AnalysisContextKey]?: string };
export type AnalysisContextUpdates = Partial<Record<AnalysisContextKey, string | null | undefined>>;
export type AnalysisContextController = AnalysisContext & {
  values: AnalysisContext;
  set: (key: AnalysisContextKey, value: string | null | undefined) => void;
  clear: (keys?: readonly AnalysisContextKey[]) => void;
  hrefWith: (path: string, updates?: AnalysisContextUpdates) => string;
};

const contextKeys: readonly AnalysisContextKey[] = ['as_of_week', 'client_account', 'category', 'line_of_business', 'assignment_group', 'case_type', 'subtype', 'root_cause', 'state', 'type', 'kind'];
function setValues(query: URLSearchParams, updates: AnalysisContextUpdates) {
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') query.delete(key);
    else query.set(key, value);
  }
}

export function useAnalysisContext(): AnalysisContextController {
  const params = useSearchParams();
  const router = useRouter(); const pathname = usePathname();
  const values: AnalysisContext = Object.fromEntries(contextKeys.map((key) => [key, params.get(key) ?? undefined])) as AnalysisContext;
  const set = useCallback((key: AnalysisContextKey, value: string | null | undefined) => {
    const query = new URLSearchParams(params.toString()); setValues(query, { [key]: value });
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ''}`, { scroll: false });
  }, [params, pathname, router]);
  const clear = useCallback((keys: readonly AnalysisContextKey[] = contextKeys) => {
    const query = new URLSearchParams(params.toString());
    for (const key of keys) query.delete(key);
    router.replace(`${pathname}${query.size ? `?${query.toString()}` : ''}`, { scroll: false });
  }, [params, pathname, router]);
  const hrefWith = useCallback((path: string, updates: AnalysisContextUpdates = {}) => {
    const [targetPath, targetQuery = ''] = path.split('?');
    const query = new URLSearchParams(params.toString());
    new URLSearchParams(targetQuery).forEach((value, key) => query.set(key, value));
    setValues(query, updates);
    return `${targetPath}${query.size ? `?${query.toString()}` : ''}`;
  }, [params]);
  return { ...values, values, set, clear, hrefWith };
}
