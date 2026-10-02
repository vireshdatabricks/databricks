'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';
import { useRouter, useSearchParams } from 'next/navigation';
import * as Brand from '../../components/ui';
import { importReport, listReportFamilies, listReportRequests, type ReportFamilies, type ReportFamily, type ReportRequest, type ReportStatus } from '../../lib/api/case-reports';
import type { DataColumn } from '../../components/ui/data-table';
import type { ApiFailure } from '../../lib/api/client';
import { formatDateTime, formatPeriod, humanizeIdentifier, normaliseOptions, sentenceCase } from '../../lib/format';
import { labelFor, reportStatusLabels, requestStateLabels } from '../../lib/labels';

type LoadError = { state: 'unavailable' | 'forbidden' | 'not_found' | 'error'; message: string };
const TERMINAL = ['IMPORTED', 'FAILED', 'CANCELLED'];
const STATUS_FILTERS: Array<ReportStatus | 'all'> = ['all', 'IN_REVIEW', 'REVIEWED', 'SIGNED_OFF', 'SUPERSEDED'];

function toLoadError(error: ApiFailure): LoadError {
  const state = error.kind === 'forbidden' || error.kind === 'not_found' || error.kind === 'unavailable' ? error.kind : 'error';
  return { state, message: error.message };
}
// Short period in tables, full dates on hover (S20).
function period(from?: string | null, to?: string | null) {
  return <span title={formatPeriod(from, to, 'full')}>{formatPeriod(from, to)}</span>;
}
const rowAction = (status: ReportStatus) => status === 'SIGNED_OFF' || status === 'SUPERSEDED' ? 'View' : 'Continue review';
function promptbookName(family: ReportFamily) {
  return `${family.promptbook.name ?? humanizeIdentifier(family.promptbook.id)} v${family.promptbook.version}`;
}

function ReportTitle({ family, context }: { family: ReportFamily; context: string }) {
  const [open, setOpen] = useState(false);
  const href = (id: string) => `/dashboard/reports/${encodeURIComponent(id)}${context ? `?${context}` : ''}`;
  return <Stack spacing={0.5} alignItems="flex-start">
    <Link href={href(family.latest.report_version_id)}>{sentenceCase(family.title)}</Link>
    {family.versions.length > 0 && <>
      <Brand.Button variant="tertiary" size="compact" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Versions ({family.versions.length + 1})</Brand.Button>
      {open && <Box component="ul" sx={{ m: 0, pl: 3, display: 'grid', gap: 0.5 }}>
        {family.versions.map((version) => <Typography component="li" variant="body2" key={version.report_version_id}>
          <Link href={href(version.report_version_id)}>Imported {formatDateTime(version.imported_at)}</Link> · {labelFor(reportStatusLabels, version.status)} · {version.decided} of {version.total} decided
        </Typography>)}
      </Box>}
    </>}
  </Stack>;
}

function ReportsList() {
  const search = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<ReportFamilies>({ families: [], status_counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError>();
  const [clients, setClients] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('all');
  const [importOpen, setImportOpen] = useState(false);
  const [runId, setRunId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [requests, setRequests] = useState<ReportRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<LoadError>();
  const [tab, setTab] = useState(search.get('tab') === 'requests' ? 'requests' : 'versions');
  const context = search.toString();

  const load = useCallback(async () => {
    setLoading(true); setError(undefined);
    const result = await listReportFamilies();
    if (result.ok) setData(result.data.data); else setError(toLoadError(result.error));
    setLoading(false);
  }, []);
  const loadRequests = useCallback(async (quiet = false) => {
    if (!quiet) setRequestsLoading(true);
    setRequestsError(undefined);
    const result = await listReportRequests();
    if (result.ok) setRequests(result.data.data); else setRequestsError(toLoadError(result.error));
    setRequestsLoading(false);
  }, []);
  useEffect(() => { void load(); void loadRequests(); }, [load, loadRequests]);
  useEffect(() => { setTab(search.get('tab') === 'requests' ? 'requests' : 'versions'); }, [search]);
  const active = requests.filter((row) => !TERMINAL.includes(row.state));
  useEffect(() => {
    if (!active.length) return;
    const timer = window.setInterval(() => { void loadRequests(true); }, 15000);
    return () => window.clearInterval(timer);
  }, [active.length, loadRequests]);
  // A request that finished importing adds a version: refresh the families once it lands.
  const importedCount = requests.filter((row) => row.state === 'IMPORTED').length;
  useEffect(() => { if (importedCount) void load(); }, [importedCount, load]);

  const clientOptions = useMemo(() => normaliseOptions(data.families.flatMap((family) => family.clients)), [data.families]);
  const filtered = data.families.filter((family) => (!clients.length || family.clients.some((client) => clients.includes(client)))
    && (status === 'all' || family.latest.status === status));
  const total = data.families.length;
  const statusOptions = STATUS_FILTERS.map((value) => ({ value, label: value === 'all' ? 'All' : labelFor(reportStatusLabels, value), count: value === 'all' ? total : data.status_counts[value] ?? 0 }));

  const columns: DataColumn<ReportFamily>[] = [
    { id: 'title', label: 'Report', sortable: true, minWidth: 220, value: (row) => row.title, render: (row) => <ReportTitle family={row} context={context} /> },
    { id: 'clients', label: 'Clients', maxLines: 2, minWidth: 140, value: (row) => row.clients.join(', ') },
    { id: 'period', label: 'Period', nowrap: true, render: (row) => period(row.date_from, row.date_to) },
    { id: 'promptbook', label: 'Promptbook', maxLines: 2, value: promptbookName },
    { id: 'progress', label: 'Decided', nowrap: true, render: (row) => <Brand.ProgressSummary compact decided={row.latest.decided} total={row.latest.total} /> },
    { id: 'status', label: 'Status', nowrap: true, render: (row) => <Brand.StatusBadge status={row.latest.status} /> },
    { id: 'last_activity_at', label: 'Last activity', nowrap: true, sortable: true, value: (row) => row.last_activity_at, render: (row) => formatDateTime(row.last_activity_at) },
    { id: 'action', label: 'Action', nowrap: true, render: (row) => <Brand.Button variant="secondary" size="compact" component={Link} href={`/dashboard/reports/${encodeURIComponent(row.latest.report_version_id)}${context ? `?${context}` : ''}`} aria-label={`${rowAction(row.latest.status)}: ${sentenceCase(row.title)}`}>{rowAction(row.latest.status)}</Brand.Button> },
  ];
  const requestColumns: DataColumn<ReportRequest>[] = [
    { id: 'promptbook', label: 'Promptbook', render: (row) => <Link href={`/dashboard/reports/requests/${encodeURIComponent(row.request_id)}`}>{humanizeIdentifier(row.parameters.promptbook_id)} v{row.parameters.promptbook_version}</Link> },
    { id: 'clients', label: 'Clients', value: (row) => row.parameters.client_accounts.split(',').join(', ') },
    { id: 'period', label: 'Period', nowrap: true, render: (row) => period(row.parameters.date_from, row.parameters.date_to) },
    { id: 'created_at', label: 'Requested', nowrap: true, sortable: true, value: (row) => row.created_at, render: (row) => formatDateTime(row.created_at) },
    { id: 'state', label: 'Status', nowrap: true, render: (row) => <Brand.StatusBadge status={row.state} /> },
    { id: 'action', label: 'Action', nowrap: true, render: (row) => <Brand.Button variant="secondary" size="compact" component={Link} href={`/dashboard/reports/requests/${encodeURIComponent(row.request_id)}`}>View</Brand.Button> },
  ];

  const handleImport = async () => {
    setImportError(''); setImporting(true);
    const result = await importReport(runId.trim());
    setImporting(false);
    if (result.ok) router.push(`/dashboard/reports/${encodeURIComponent(result.data.report_version_id)}${context ? `?${context}` : ''}`);
    else setImportError(result.error.kind === 'not_found' ? 'No report package exists for this run ID. Check the ID in the Databricks run output.' : result.error.message);
  };
  const changeTab = (value: string) => {
    setTab(value);
    const query = new URLSearchParams(search.toString());
    query.set('tab', value);
    router.replace(`/dashboard/reports?${query.toString()}`, { scroll: false });
  };

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Brand.PageHeader title="Reports" description="Review generated reports, decide every item, and sign off."
      actions={<><Brand.Button component={Link} href="/dashboard/reports/new">Request report</Brand.Button><Brand.MoreActionsMenu actions={[{ label: 'Import by run ID', onSelect: () => { setImportError(''); setImportOpen(true); } }]} /></>} />
    {active.length > 0 && <Brand.Notice tone="info" title={`In progress (${active.length})`}>
      <Box component="ul" sx={{ m: 0, pl: 3 }}>
        {active.map((row) => <li key={row.request_id}><Link href={`/dashboard/reports/requests/${encodeURIComponent(row.request_id)}`}>{row.parameters.client_accounts.split(',').join(', ')} · {period(row.parameters.date_from, row.parameters.date_to)}</Link> — {labelFor(requestStateLabels, row.state)}</li>)}
      </Box>
    </Brand.Notice>}
    <Brand.Tabs options={[{ value: 'versions', label: 'Reports' }, { value: 'requests', label: 'Requests' }]} value={tab} onChange={changeTab} />
    {tab === 'requests' ? <>
      <Brand.DataTable rows={requests} columns={requestColumns} getRowId={(row) => row.request_id} loading={requestsLoading} error={requestsError && { state: requestsError.state, description: requestsError.message }} onRetry={() => void loadRequests()} label="Report requests" resultLabel="request" emptyTitle="No report requests yet" emptyDescription="Use Request report to start a report run." />
      <Typography variant="body2" color="text.secondary">Active requests refresh every 15 seconds. Completed runs are imported automatically.</Typography>
    </> : <>
      <Brand.FilterBar label="Report filters" active={clients.length > 0 || status !== 'all'} onClear={() => { setClients([]); setStatus('all'); }}>
        <Brand.SegmentedControl label="Status" options={statusOptions} value={status} onChange={setStatus} />
        <Box sx={{ minWidth: { xs: '100%', sm: 320 } }}><Brand.MultiSelect label="Clients" emptyLabel="All clients" inBar options={clientOptions} value={clients} onChange={setClients} /></Box>
      </Brand.FilterBar>
      <Brand.DataTable rows={filtered} columns={columns} getRowId={(row) => row.family_key} loading={loading} error={error && { state: error.state, description: error.message }} onRetry={() => void load()} label="Reports" resultLabel="report"
        emptyTitle={total ? 'No reports match these filters' : 'No reports yet'} emptyDescription={total ? 'Change the status or clients, or clear the filters.' : 'Use Request report to start one.'} />
      <Typography variant="body2">Other report types: <Link href={`/dashboard/reports/snapshot-briefing${context ? `?${context}` : ''}`}>Snapshot briefing</Link></Typography>
    </>}
    <Brand.Dialog open={importOpen} title="Import by run ID" description="Import a report run that was started outside the application." confirmLabel="Import report" busy={importing}
      onClose={() => setImportOpen(false)} onConfirm={() => { if (runId.trim()) void handleImport(); else setImportError('Enter the analysis run ID.'); }}>
      <Brand.Field label="Analysis run ID" value={runId} onChange={(event) => setRunId(event.target.value)} required helperText="Shown in the Databricks run output." errorText={importError || undefined} />
    </Brand.Dialog>
  </Box>;
}

export default function ReportsPage() { return <Suspense fallback={<Brand.StateView state="loading" title="Loading reports" />}><ReportsList /></Suspense>; }
