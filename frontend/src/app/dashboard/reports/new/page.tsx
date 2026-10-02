'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../../../components/ui';
import { presetRange, type DateRangeValue } from '../../../components/ui/date-range-field';
import { getReportRequestOptions, previewReportRequest, startReportRequest, type ReportPreview, type ReportRequestOptions, type StartReportRequest } from '../../../lib/api/case-reports';
import { getResolvedPromptbook } from '../../../lib/api/promptbooks';
import { formatCount, formatDate, humanizeIdentifier, normaliseOptions } from '../../../lib/format';
import { labelFor, modelLabels } from '../../../lib/labels';

type LoadError = { state: 'error' | 'unavailable' | 'forbidden' | 'not_found'; message: string };
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'line_of_business_filter', label: 'Line of business' },
  { key: 'functional_team_filter', label: 'Functional team' },
  { key: 'service_type_filter', label: 'Service type' },
  { key: 'category_filter', label: 'Category' },
];
type PreviewState = { state: 'idle' | 'loading' | 'ready' | 'unavailable'; data?: ReportPreview; message?: string };

function promptbookLabel(item: ReportRequestOptions['promptbooks'][number]) {
  return `${item.name ?? humanizeIdentifier(item.promptbook_id)} · v${item.version}`;
}
function periodText(range: DateRangeValue) {
  return range.from && range.to ? `${formatDate(`${range.from}T00:00:00Z`)} – ${formatDate(`${range.to}T00:00:00Z`)}` : 'Not set';
}

export default function NewReportRequestPage() {
  const router = useRouter();
  const [options, setOptions] = useState<ReportRequestOptions>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<LoadError>();
  const [promptbook, setPromptbook] = useState('');
  const [focus, setFocus] = useState('');
  const [clients, setClients] = useState<string[]>([]);
  const [range, setRange] = useState<DateRangeValue>(() => presetRange('last90'));
  const [model, setModel] = useState('');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [filterOptions, setFilterOptions] = useState<Pick<ReportRequestOptions, 'filter_values' | 'availability'>>();
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ state: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [duplicateId, setDuplicateId] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setLoadError(undefined);
    const result = await getReportRequestOptions();
    if (result.ok) {
      const data = result.data.data;
      setOptions(data);
      setFilterOptions(data);
      setPromptbook((value) => value || data.promptbooks[0]?.promptbook_id || '');
      setModel((value) => value || data.models[0] || '');
    } else setLoadError({ state: result.error.kind === 'forbidden' || result.error.kind === 'not_found' || result.error.kind === 'unavailable' ? result.error.kind : 'error', message: result.error.message });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const selectedBook = options?.promptbooks.find((item) => item.promptbook_id === promptbook);
  useEffect(() => {
    if (!selectedBook) return;
    let active = true;
    void getResolvedPromptbook(selectedBook.promptbook_id, selectedBook.version).then((result) => {
      if (active) setFocus(result.ok && typeof result.data.data.document.focus === 'string' ? result.data.data.document.focus : '');
    });
    return () => { active = false; };
  }, [selectedBook]);

  // Filter values follow the selected clients (G20); a selection no longer offered is dropped.
  const loadFilters = useCallback(async (forClients: string[]) => {
    setFiltersLoading(true);
    const result = await getReportRequestOptions(forClients);
    if (result.ok) {
      const data = result.data.data;
      setFilterOptions(data);
      setSelectedFilters((current) => Object.fromEntries(Object.entries(current).filter(([key, value]) => data.filter_values[key]?.includes(value))));
    } else setFilterOptions((current) => current && { ...current, availability: Object.fromEntries(FILTERS.map(({ key }) => [key, { available: false, reason: 'service_unavailable' as const }])) });
    setFiltersLoading(false);
  }, []);
  const clientKey = clients.join('\u0000');
  const loadedClientKey = useRef('');
  useEffect(() => {
    if (!options || clientKey === loadedClientKey.current) return;
    loadedClientKey.current = clientKey;
    void loadFilters(clientKey ? clientKey.split('\u0000') : []);
  }, [clientKey, options, loadFilters]);

  const filters = useMemo(() => Object.fromEntries(Object.entries(selectedFilters).filter(([, value]) => value)), [selectedFilters]);
  const rangeValid = Boolean(range.from && range.to && range.from <= range.to);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    if (!promptbook || !clients.length || !rangeValid) { setPreview({ state: 'idle' }); return; }
    const controller = new AbortController();
    setPreview((current) => ({ ...current, state: 'loading' }));
    const timer = window.setTimeout(() => {
      void previewReportRequest({ promptbook_id: promptbook, promptbook_version: selectedBook?.version, client_accounts: clients, date_from: range.from, date_to: range.to, filters: JSON.parse(filterKey) }, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setPreview(result.ok ? { state: 'ready', data: result.data.data } : { state: 'unavailable', message: result.error.message });
      });
    }, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [promptbook, selectedBook?.version, clients, range.from, range.to, rangeValid, filterKey]);

  const missing = [!promptbook && 'a promptbook', !clients.length && 'at least one client', !rangeValid && 'a valid period', !model && 'a model'].filter(Boolean) as string[];
  const zeroMatch = preview.state === 'ready' && preview.data?.matching_cases_total === 0;
  const actionHint = missing.length ? `Choose ${missing.join(', ')} to start.` : zeroMatch ? 'No cases match. Change the clients, period, or filters.' : preview.state === 'loading' ? 'Counting matching cases…' : undefined;

  const start = async () => {
    if (missing.length || zeroMatch) return;
    const body: StartReportRequest = { promptbook_id: promptbook, promptbook_version: selectedBook?.version, client_accounts: clients, date_from: range.from, date_to: range.to, model_id: model, filters };
    setSubmitting(true); setSubmitError(''); setDuplicateId('');
    const result = await startReportRequest(body);
    setSubmitting(false);
    if (result.ok) { router.push(`/dashboard/reports/requests/${encodeURIComponent(result.data.data.request_id)}`); return; }
    if (result.error.kind === 'conflict' && result.error.request_id) { setDuplicateId(result.error.request_id); setSubmitError('An identical report request is already queued or running.'); return; }
    if (result.error.kind === 'invalid') setSubmitError(result.error.errors.map((error) => error.message).join(' ') || result.error.message);
    else setSubmitError(result.error.status === 503 ? 'Report runs are unavailable until the Databricks job is configured. You can still import a completed run from the Reports page.' : result.error.message);
  };

  if (loading) return <Brand.StateView state="loading" title="Loading report options" />;
  if (loadError) return <Brand.StateView state={loadError.state} title="Report options unavailable" description={loadError.message} onRetry={() => void load()} />;
  if (!options?.promptbooks.length || !options.models.length || !options.client_accounts.length) return <Box sx={{ display: 'grid', gap: 2 }}>
    <Brand.PageHeader title="Request a report" />
    <Brand.StateView state="unavailable" title="Reports cannot be requested yet" description={!options?.promptbooks.length ? 'There are no active, published promptbooks.' : !options?.client_accounts.length ? 'Client options are unavailable. Check the Databricks connection and try again.' : 'No approved models are configured.'} onRetry={() => void load()} action={<Brand.Button variant="secondary" component={Link} href="/dashboard/reports">Back to reports</Brand.Button>} />
  </Box>;

  const availableFilters = FILTERS.filter(({ key }) => filterOptions?.availability[key]?.available && (filterOptions.filter_values[key]?.length ?? 0) > 0);
  const filtersUnavailable = FILTERS.some(({ key }) => filterOptions?.availability[key] && !filterOptions.availability[key].available && filterOptions.availability[key].reason !== 'column_missing');
  const modelMeaning = modelLabels[model]?.meaning;
  const summaryRows = [
    { label: 'Promptbook', value: selectedBook ? promptbookLabel(selectedBook) : 'Not set' },
    { label: 'Clients', value: clients.length ? clients.join(', ') : 'Not set' },
    { label: 'Period', value: periodText(range) },
    { label: 'Filters', value: Object.keys(filters).length ? FILTERS.filter(({ key }) => filters[key]).map(({ key, label }) => `${label}: ${filters[key]}`).join('; ') : 'None' },
    { label: 'Matching cases', value: preview.state === 'idle' ? '—' : preview.state === 'loading' ? 'Counting…' : preview.state === 'unavailable' ? 'Unavailable' : preview.data!.matching_cases_total === 0 ? 'None — change the clients or period' : preview.data!.matching_cases_total.toLocaleString() },
    { label: 'Model', value: labelFor(modelLabels, model) },
  ];

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Brand.Breadcrumbs items={[{ label: 'Reports', href: '/dashboard/reports' }, { label: 'Request report' }]} />
    <Brand.PageHeader title="Request a report" description="Runs use the published version of the promptbook you choose." />
    <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, alignItems: 'start' }}>
      <Box component="form" noValidate onSubmit={(event) => { event.preventDefault(); void start(); }} sx={{ display: 'grid', gap: 3, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">All fields are required unless marked optional.</Typography>
        <Stack spacing={0.5}>
          <Brand.Field label="Promptbook" kind="select" value={promptbook} onChange={(event) => setPromptbook(String(event.target.value))} options={options.promptbooks.map((item) => ({ value: item.promptbook_id, label: promptbookLabel(item) }))} helperText="Only published promptbooks are listed." />
          {focus && <Typography variant="body2" color="text.secondary">Focus: {focus}</Typography>}
        </Stack>
        <Stack spacing={1}>
          <Brand.MultiSelect label="Clients" emptyLabel="Choose one or more clients" options={normaliseOptions(options.client_accounts)} value={clients} onChange={setClients} />
          {clients.length >= 2 && <Typography variant="body2" color="text.secondary">Case text from every selected client is analysed together in one report.</Typography>}
        </Stack>
        <Brand.DateRangeField label="Period (cases opened)" value={range} onChange={setRange} initialPreset="last90" />
        <Brand.Disclosure title="Optional filters">
          <Stack spacing={2}>
            {filtersLoading && <Typography variant="body2" color="text.secondary">Loading filter values…</Typography>}
            {filtersUnavailable && <Brand.Notice tone="warning" action={<Brand.Button variant="tertiary" size="compact" onClick={() => void loadFilters(clients)}>Retry</Brand.Button>}>Some filter values could not be loaded. You can start without them.</Brand.Notice>}
            {!filtersLoading && !availableFilters.length && !filtersUnavailable && <Typography variant="body2">No filter values are available for the selected clients.</Typography>}
            {availableFilters.map(({ key, label }) => <Brand.Field key={key} label={`${label} (optional)`} kind="select" value={selectedFilters[key] ?? ''} onChange={(event) => setSelectedFilters((current) => ({ ...current, [key]: String(event.target.value) }))} options={[{ value: '', label: 'All values' }, ...normaliseOptions(filterOptions?.filter_values[key] ?? []).map((value) => ({ value, label: value }))]} />)}
          </Stack>
        </Brand.Disclosure>
        <Brand.Disclosure title="Advanced">
          <Brand.Field label="Model" kind="select" value={model} onChange={(event) => setModel(String(event.target.value))} options={options.models.map((value) => ({ value, label: labelFor(modelLabels, value) }))} helperText={modelMeaning ?? 'Only models approved for report runs are listed.'} />
        </Brand.Disclosure>
        <Box sx={{ display: { xs: 'block', md: 'none' } }}><RequestSummary rows={summaryRows} preview={preview} /></Box>
        {submitError && <Brand.Notice tone="error" title="Report could not be started">{submitError}{duplicateId && <> <Link href={`/dashboard/reports/requests/${encodeURIComponent(duplicateId)}`}>Open the existing request</Link></>}</Brand.Notice>}
        <Stack spacing={1}>
          <Stack direction="row" gap={1.5} flexWrap="wrap">
            <Brand.Button type="submit" loading={submitting} disabled={missing.length > 0 || zeroMatch} aria-describedby={actionHint ? 'start-report-hint' : undefined}>Start report</Brand.Button>
            <Brand.Button variant="tertiary" component={Link} href="/dashboard/reports">Cancel</Brand.Button>
          </Stack>
          {actionHint && <Typography id="start-report-hint" variant="body2" color="text.secondary">{actionHint}</Typography>}
        </Stack>
      </Box>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}><RequestSummary rows={summaryRows} preview={preview} /></Box>
    </Box>
  </Box>;
}

function RequestSummary({ rows, preview }: { rows: Array<{ label: string; value: React.ReactNode }>; preview: PreviewState }) {
  return <Stack spacing={1.5}>
    <Brand.SummaryPanel rows={rows} />
    {preview.state === 'ready' && preview.data && preview.data.by_client.length > 1 && preview.data.matching_cases_total > 0 && <Typography variant="body2" color="text.secondary">{preview.data.by_client.map((row) => `${row.client_account}: ${formatCount(row.cases, 'case')}`).join(' · ')}</Typography>}
    {preview.state === 'ready' && preview.data?.warnings.map((warning) => <Brand.Notice key={warning} tone="warning">{warning}</Brand.Notice>)}
    {preview.state === 'unavailable' && <Brand.Notice tone="warning">Matching cases cannot be counted right now. {preview.message}</Brand.Notice>}
  </Stack>;
}
