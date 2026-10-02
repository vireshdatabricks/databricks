'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../../../../components/ui';
import RunProgress from '../../../../components/patterns/run-progress';
import { cancelReportRequest, getReportRequest, importReportRequest, startReportRequest, type ReportRequest, type StartReportRequest } from '../../../../lib/api/case-reports';
import { formatActor, formatDate, formatDateTime, humanizeIdentifier } from '../../../../lib/format';
import { modelLabels } from '../../../../lib/labels';
import { labelFor } from '../../../../lib/labels';
import { getPromptbookVersion } from '../../../../lib/api/promptbooks';

function elapsedSince(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
function isTerminal(state: ReportRequest['state']) { return state === 'IMPORTED' || state === 'FAILED' || state === 'CANCELLED'; }
function requestBody(request: ReportRequest): StartReportRequest {
  const parameters = request.parameters;
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(parameters)) if (key.endsWith('_filter') && typeof value === 'string' && value) filters[key] = value;
  return {
    promptbook_id: parameters.promptbook_id,
    promptbook_version: Number(parameters.promptbook_version),
    client_accounts: parameters.client_accounts.split(',').filter(Boolean),
    date_from: parameters.date_from,
    date_to: parameters.date_to,
    model_id: parameters.model_id,
    filters,
  };
}

export default function ReportRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [request, setRequest] = useState<ReportRequest>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ state: 'error' | 'unavailable' | 'forbidden' | 'not_found'; message: string }>();
  const [now, setNow] = useState(Date.now());
  const [cancelOpen, setCancelOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [duplicateId, setDuplicateId] = useState('');
  const [promptbookName, setPromptbookName] = useState('');
  const promptbookId = request?.parameters.promptbook_id;
  const promptbookVersion = request?.parameters.promptbook_version;

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const result = await getReportRequest(requestId);
    if (result.ok) { setRequest(result.data.data); setError(undefined); }
    else setError({ state: result.error.kind === 'forbidden' ? 'forbidden' : result.error.kind === 'not_found' ? 'not_found' : result.error.kind === 'unavailable' ? 'unavailable' : 'error', message: result.error.message });
    setLoading(false);
  }, [requestId]);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => {
    if (!promptbookId || promptbookVersion == null) return;
    let active = true;
    void getPromptbookVersion(promptbookId, Number(promptbookVersion)).then((result) => {
      if (!active) return;
      setPromptbookName(result.ok ? String(result.data.data.document.meta.name ?? humanizeIdentifier(promptbookId)) : humanizeIdentifier(promptbookId));
    });
    return () => { active = false; };
  }, [promptbookId, promptbookVersion]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!request || isTerminal(request.state)) return;
    const timer = window.setInterval(() => { void load(); }, 15000);
    return () => window.clearInterval(timer);
  }, [request, load]);

  const cancel = async () => {
    setActionBusy(true); setActionError('');
    const result = await cancelReportRequest(requestId);
    setActionBusy(false); setCancelOpen(false);
    if (result.ok) setRequest(result.data.data); else setActionError(result.error.message);
  };
  const retryImport = async () => {
    setActionBusy(true); setActionError('');
    const result = await importReportRequest(requestId);
    setActionBusy(false);
    if (result.ok) setRequest(result.data.data); else setActionError(result.error.message);
  };
  const startAgain = async () => {
    if (!request) return;
    setActionBusy(true); setActionError(''); setDuplicateId('');
    const result = await startReportRequest(requestBody(request));
    setActionBusy(false);
    if (result.ok) { window.location.assign(`/dashboard/reports/requests/${encodeURIComponent(result.data.data.request_id)}`); return; }
    if (result.error.kind === 'conflict' && result.error.request_id) setDuplicateId(result.error.request_id);
    setActionError(result.error.status === 503 ? 'Report requests are unavailable until the Databricks job is configured.' : result.error.message);
  };

  if (loading) return <Brand.StateView state="loading" title="Loading report request" />;
  if (error && !request) return <Brand.StateView state={error.state} title="Report request unavailable" description={error.message} onRetry={() => void load(true)} action={<Brand.Button component={Link} href="/dashboard/reports">Back to reports</Brand.Button>} />;
  if (!request) return null;
  const settings = request.parameters;
  const elapsedEnd = request.state === 'IMPORTED' || request.state === 'FAILED' || request.state === 'CANCELLED' ? new Date(request.updated_at).getTime() : now;

  return <Box sx={{ display: 'grid', gap: 3, maxWidth: 900 }}>
    <Brand.Breadcrumbs items={[{ label: 'Reports', href: '/dashboard/reports?tab=requests' }, { label: 'Report request' }]} />
    <Brand.PageHeader title="Report request" description={`${promptbookName || humanizeIdentifier(settings.promptbook_id)} v${settings.promptbook_version} · Requested ${formatDateTime(request.created_at)}`} details={[
      { label: 'Request ID', value: request.request_id },
      ...(request.analysis_run_id ? [{ label: 'Analysis run ID', value: request.analysis_run_id }] : []),
      ...(request.databricks_run_id ? [{ label: 'Databricks run ID', value: request.databricks_run_id }] : []),
      { label: 'Requested by', value: formatActor(request.requested_by) },
    ]} />
    {error && <Brand.Notice tone="warning" title="Status refresh unavailable">{error.message} The current status is from the last successful refresh.</Brand.Notice>}
    <RunProgress state={request.state} elapsed={elapsedSince(request.created_at, elapsedEnd)} />
    <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
      <Typography component="h2" variant="h3">Request settings</Typography>
      <Typography><strong>Clients:</strong> {settings.client_accounts.split(',').join(', ')}</Typography>
      <Typography><strong>Date range:</strong> {formatDate(settings.date_from)} to {formatDate(settings.date_to)}</Typography>
      <Typography><strong>Model:</strong> {labelFor(modelLabels, settings.model_id)}</Typography>
      {Object.entries(settings).filter(([key]) => key.endsWith('_filter')).map(([key, value]) => <Typography key={key}><strong>{humanizeIdentifier(key.replace(/_filter$/, ''))}:</strong> {value}</Typography>)}
    </Brand.Card>
    {request.state_detail && <Brand.Notice tone={request.state === 'FAILED' || request.state === 'CANCELLED' ? 'warning' : 'info'} title={request.state === 'FAILED' ? 'Run failed' : request.state === 'CANCELLED' ? 'Run cancelled' : undefined}>{request.state_detail}</Brand.Notice>}
    {actionError && <Brand.Notice tone="error">{actionError}{duplicateId && <> <Link href={`/dashboard/reports/requests/${encodeURIComponent(duplicateId)}`}>Open the existing request</Link></>}</Brand.Notice>}
    <Stack direction="row" gap={1.5} flexWrap="wrap">
      {request.state === 'IMPORTED' && request.report_version_id && <Brand.Button component={Link} href={`/dashboard/reports/${encodeURIComponent(request.report_version_id)}`}>Open report</Brand.Button>}
      {request.state === 'PACKAGED' && <Brand.Button onClick={() => void retryImport()} loading={actionBusy}>Retry report import</Brand.Button>}
      {(request.state === 'FAILED' || request.state === 'CANCELLED') && <Brand.Button onClick={() => void startAgain()} loading={actionBusy}>Start again with the same settings</Brand.Button>}
      {(request.state === 'QUEUED' || request.state === 'RUNNING') && <Brand.Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel run</Brand.Button>}
      <Brand.Button variant="tertiary" onClick={() => void load(true)}>Refresh status</Brand.Button>
      <Brand.Button variant="tertiary" component={Link} href="/dashboard/reports?tab=requests">All requests</Brand.Button>
    </Stack>
    <Brand.Dialog open={cancelOpen} title="Cancel this report run?" description="The Databricks run will be cancelled and will not produce a report." confirmLabel="Cancel run" destructive busy={actionBusy} onConfirm={() => void cancel()} onClose={() => setCancelOpen(false)} />
  </Box>;
}
