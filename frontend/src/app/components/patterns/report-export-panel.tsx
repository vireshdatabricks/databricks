'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import { downloadReportExport, getReportExports, type ReportExport, type ReportStatus } from '../../lib/api/case-reports';
import { formatDecided } from '../../lib/format';
import { exportContentLabels, exportFormatLabels, labelFor } from '../../lib/labels';

type HistoryError = { state: 'error' | 'unavailable' | 'forbidden' | 'not_found'; title: string; description: string };

export default function ReportExportPanel({ open, onClose, reportVersionId, status, statusCounts }: { open: boolean; onClose: () => void; reportVersionId: string; status: ReportStatus; statusCounts: Record<string, number> }) {
  const [format, setFormat] = useState<'html' | 'xlsx'>('html');
  const [content, setContent] = useState<'all' | 'validated'>('all');
  const [history, setHistory] = useState<ReportExport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<HistoryError | undefined>();
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState<HistoryError | undefined>();
  const [notice, setNotice] = useState('');
  const undecided = statusCounts.UNVALIDATED ?? 0;
  const signedOff = status === 'SIGNED_OFF';

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true); setHistoryError(undefined);
    const result = await getReportExports(reportVersionId);
    if (result.ok) setHistory(result.data.data);
    else setHistoryError({
      state: result.error.kind === 'forbidden' ? 'forbidden' : result.error.kind === 'not_found' ? 'not_found' : result.error.kind === 'unavailable' ? 'unavailable' : 'error',
      title: result.error.kind === 'forbidden' ? 'Export history is not authorised' : 'Could not load export history',
      description: result.error.message,
    });
    setHistoryLoading(false);
  }, [reportVersionId]);
  useEffect(() => { if (open) void refreshHistory(); }, [open, refreshHistory]);

  const download = async () => {
    setBusy(true); setDownloadError(undefined); setNotice('');
    const result = await downloadReportExport(reportVersionId, format, content === 'validated');
    if (!result.ok) {
      setDownloadError({
        state: result.error.kind === 'forbidden' ? 'forbidden' : result.error.kind === 'not_found' ? 'not_found' : result.error.kind === 'unavailable' ? 'unavailable' : 'error',
        title: result.error.kind === 'forbidden' ? 'Export is not authorised' : 'Export could not be generated',
        description: result.error.message,
      });
      setBusy(false);
      return;
    }
    const url = URL.createObjectURL(result.data.blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = result.data.filename; anchor.hidden = true;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Download started.');
    await refreshHistory();
    setBusy(false);
  };

  const entries = history.map((row) => ({
    id: row.audit_id,
    time: row.created_at,
    actor: row.requester_subject,
    action: `Downloaded ${labelFor(exportFormatLabels, row.export_format)}`,
    qualifiers: <>{labelFor(exportContentLabels, row.validated_only ? 'validated' : 'all')} · Decided at download: {formatDecided(row.status_counts)}</>,
  }));
  const includeNotice = content === 'all'
    ? `${undecided > 0 ? `${undecided} ${undecided === 1 ? 'item is' : 'items are'} undecided and will be marked Unvalidated in the file.` : 'No items are undecided; none will be marked Unvalidated.'}${signedOff ? '' : ' This report is not signed off yet.'}`
    : `Only validated and revised items will be included.${signedOff ? '' : ' This report is not signed off yet.'}`;

  return <Brand.SidePanel open={open} title="Export report" onClose={onClose}>
    <Stack spacing={3}>
      <Brand.ChoiceGroup label="File format" name="report-export-format" value={format} onChange={(value) => setFormat(value as 'html' | 'xlsx')} options={[
        { value: 'html', label: 'HTML' }, { value: 'xlsx', label: 'Excel' },
      ]} />
      <Brand.ChoiceGroup label="Included items" name="report-export-content" value={content} onChange={(value) => setContent(value as 'all' | 'validated')} options={[
        { value: 'all', label: labelFor(exportContentLabels, 'all') },
        { value: 'validated', label: labelFor(exportContentLabels, 'validated'), helperText: exportContentLabels.validated.meaning },
      ]} />
      <Brand.Notice tone={content === 'all' && undecided > 0 ? 'warning' : 'info'}>{includeNotice}</Brand.Notice>
      <Box>
        <Brand.Button onClick={() => void download()} loading={busy}>{busy ? `Preparing ${format === 'html' ? 'HTML' : 'Excel file'}…` : `Download ${format === 'html' ? 'HTML' : 'Excel file'}`}</Brand.Button>
        {notice && <Typography role="status" aria-live="polite" sx={{ mt: 1 }}>{notice}</Typography>}
      </Box>
      {downloadError && <Brand.StateView state={downloadError.state} title={downloadError.title} description={downloadError.description} onRetry={downloadError.state === 'unavailable' || downloadError.state === 'error' ? () => void download() : undefined} />}
      <Box>
        <Brand.Disclosure title={`Previous downloads (${history.length})`}>
          {historyError
            ? <Brand.StateView state={historyError.state} title={historyError.title} description={historyError.description} onRetry={() => void refreshHistory()} />
            : historyLoading
              ? <Brand.StateView state="loading" title="Loading download history" />
              : <Brand.ActivityList entries={entries} emptyText="No downloads yet." />}
        </Brand.Disclosure>
      </Box>
    </Stack>
  </Brand.SidePanel>;
}
