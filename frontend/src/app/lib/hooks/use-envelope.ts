'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiFailure } from '../api/client';
export type EnvelopeStatus = 'loading' | 'success' | 'empty' | 'error' | 'unavailable' | 'forbidden' | 'not_found' | 'conflict' | 'invalid';
export type EnvelopeState<T> = { status: EnvelopeStatus; data: T | null; error: ApiFailure | null; retry: () => void };
export function useEnvelope<T>(key: string, loader: (signal: AbortSignal) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>, isEmpty: (data: T) => boolean = () => false): EnvelopeState<T> {
  const [attempt, setAttempt] = useState(0); const [state, setState] = useState<Omit<EnvelopeState<T>, 'retry'>>({ status: 'loading', data: null, error: null });
  const loaderRef = useRef(loader); const isEmptyRef = useRef(isEmpty);
  loaderRef.current = loader; isEmptyRef.current = isEmpty;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController(); setState((current) => ({ ...current, status: 'loading', error: null }));
    loaderRef.current(controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setState({ status: isEmptyRef.current(result.data) ? 'empty' : 'success', data: result.data, error: null });
      else setState({ status: result.error.kind, data: null, error: result.error });
    }).catch(() => { if (!controller.signal.aborted) setState({ status: 'unavailable', data: null, error: { kind: 'unavailable', message: 'The service could not be reached.', errors: [] } }); });
    return () => controller.abort();
  }, [key, attempt]);
  return { ...state, retry };
}
