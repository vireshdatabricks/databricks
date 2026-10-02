'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Checkbox, FormControlLabel, Stack, Typography } from '@mui/material';
import * as Brand from '../../../components/ui';
import { applyPrefill, decideCase, getPrefillSources, getReportVersion, previewPrefill, saveItemDecision, signOffReport, validateTheme, type ReportCaseGroup, type ReportCitation, type ReportItem, type ReportVersion } from '../../../lib/api/case-reports';
import { CitationPanelContent } from '../../../components/patterns/report-review';
import ReviewDocument from '../../../components/patterns/review-document';
import ReviewToc from '../../../components/patterns/review-toc';
import { remainingGroups } from '../../../components/patterns/review-state';
import type { CaseDecisionValue } from '../../../components/patterns/case-finding-card';
import ReportExportPanel from '../../../components/patterns/report-export-panel';
import { formatActor, formatDate, formatDateTime } from '../../../lib/format';
import { humanizeIdentifier } from '../../../lib/format';
import { getPromptbookVersion } from '../../../lib/api/promptbooks';

type ScreenError = { state: 'error' | 'unavailable' | 'forbidden' | 'not_found'; message: string };
type PrefillSource = { report_version_id: string; title: string; status: string; imported_at: string; clients: string[]; promptbook_id: string };

function LifecycleBadge({ status }: { status: string }) {
  if (status === 'REVIEWED') return <Brand.StatusBadge status="ready-to-sign-off" />;
  if (status === 'SIGNED_OFF') return <Brand.StatusBadge status="signed-off" />;
  if (status === 'SUPERSEDED') return <Brand.StatusBadge status="superseded" />;
  return <Brand.StatusBadge status="in-review" />;
}

function ReportReview() {
  const { reportVersionId } = useParams<{ reportVersionId: string }>();
  const search = useSearchParams();
  const [report, setReport] = useState<ReportVersion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ScreenError | undefined>();
  const [canDecide, setCanDecide] = useState(true);
  const [stale, setStale] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [activeSectionId, setActiveSectionId] = useState('');
  const [citation, setCitation] = useState<{ value: ReportCitation; index: number } | null>(null);
  const [bulk, setBulk] = useState<{ theme: ReportItem; cases: Array<{ case_number: string; item_ids: string[]; summary: { undecided: number; validated: number; revised: number; rejected: number } }> } | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [bulkComment, setBulkComment] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [bulkResult, setBulkResult] = useState('');
  const [prefillOpen, setPrefillOpen] = useState(false);
  const [prefillSources, setPrefillSources] = useState<PrefillSource[]>([]);
  const [prefillSource, setPrefillSource] = useState('');
  const [prefillPreview, setPrefillPreview] = useState<{ copyable: number; remaining: number } | null>(null);
  const [prefillBusy, setPrefillBusy] = useState(false);
  const [prefillError, setPrefillError] = useState('');
  const [signoffOpen, setSignoffOpen] = useState(false);
  const [statement, setStatement] = useState('I have reviewed every item in this version.');
  const [signoffBusy, setSignoffBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [promptbookName, setPromptbookName] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const query = search.toString();
  const href = (path: string) => `${path}${query ? `?${query}` : ''}`;

  const load = useCallback(async () => {
    setLoading(true); setError(undefined); setStale(false);
    const result = await getReportVersion(reportVersionId);
    if (result.ok) {
      setReport(result.data.data);
      setActiveSectionId((current) => current || result.data.data.sections[0]?.id || '');
    } else {
      const state = result.error.kind === 'forbidden' ? 'forbidden' : result.error.kind === 'not_found' ? 'not_found' : result.error.kind === 'unavailable' ? 'unavailable' : 'error';
      setError({ state, message: result.error.message });
    }
    setLoading(false);
  }, [reportVersionId]);
  useEffect(() => { void load(); }, [load]);
  const promptbookId = report?.promptbook_id;
  const promptbookVersion = report?.promptbook_version;
  useEffect(() => {
    if (!promptbookId || promptbookVersion == null) return;
    let active = true;
    void getPromptbookVersion(promptbookId, promptbookVersion).then((result) => {
      if (!active) return;
      setPromptbookName(result.ok ? String(result.data.data.document.meta.name ?? humanizeIdentifier(promptbookId)) : humanizeIdentifier(promptbookId));
    });
    return () => { active = false; };
  }, [promptbookId, promptbookVersion]);

  const allItems = useMemo(() => report?.items ?? [], [report?.items]);
  const total = allItems.length;
  const decided = allItems.filter((item) => item.current_status !== 'UNVALIDATED').length;
  const readOnly = report?.status === 'SIGNED_OFF' || report?.status === 'SUPERSEDED';
  const sections = useMemo(() => report?.sections ?? [], [report?.sections]);
  const compatibleSources = prefillSources.filter((source) => source.report_version_id !== reportVersionId && source.promptbook_id === report?.promptbook_id && JSON.stringify([...source.clients].sort()) === JSON.stringify([...(report?.clients ?? [])].sort()));

  const handleDecision = async (item: ReportItem, decision: { disposition: 'VALIDATED' | 'REVISED' | 'REJECTED'; comment: string; revisedText: string }) => {
    const result = await saveItemDecision(reportVersionId, item.item_id, { disposition: decision.disposition, comment: decision.comment || undefined, revised_text: decision.disposition === 'REVISED' ? decision.revisedText : undefined });
    if (!result.ok) {
      if (result.error.kind === 'forbidden') setCanDecide(false);
      if (result.error.kind === 'conflict') setStale(true);
      if (result.error.kind === 'unavailable') setError({ state: 'unavailable', message: result.error.message });
      throw new Error(result.error.message);
    }
    await load();
  };

  const openPrefill = async () => {
    setPrefillOpen(true); setPrefillError(''); setPrefillPreview(null); setPrefillSource('');
    const result = await getPrefillSources(reportVersionId);
    if (result.ok) setPrefillSources(result.data.data);
    else setPrefillError(result.error.message);
  };
  const choosePrefill = async (value: string) => {
    setPrefillSource(value); setPrefillPreview(null); setPrefillError('');
    if (!value) return;
    const result = await previewPrefill(reportVersionId, value);
    if (result.ok) setPrefillPreview(result.data);
    else setPrefillError(result.error.message);
  };
  const confirmPrefill = async () => {
    setPrefillBusy(true); setPrefillError('');
    const result = await applyPrefill(reportVersionId, prefillSource);
    setPrefillBusy(false);
    if (!result.ok) {
      setPrefillError(result.error.message);
      if (result.error.kind === 'conflict') setStale(true);
      if (result.error.kind === 'forbidden') setCanDecide(false);
      if (result.error.kind === 'unavailable') setError({ state: 'unavailable', message: result.error.message });
      return;
    }
    setPrefillOpen(false); await load();
  };
  const confirmBulk = async () => {
    if (!bulk || !report) return;
    setBulkBusy(true); setBulkError('');
    const result = await validateTheme(reportVersionId, bulk.theme.theme_id ?? '', { disposition: 'VALIDATED', comment: bulkComment || undefined, exclude_item_ids: excluded });
    setBulkBusy(false);
    if (!result.ok) {
      setBulkError(result.error.message);
      if (result.error.kind === 'conflict') setStale(true);
      if (result.error.kind === 'forbidden') setCanDecide(false);
      if (result.error.kind === 'unavailable') setError({ state: 'unavailable', message: result.error.message });
      return;
    }
    setBulkResult(`${result.data.validated} fields were validated across ${result.data.cases?.length ?? 0} cases. ${result.data.excluded ? `${result.data.excluded} fields remain for individual review.` : ''}`);
    setBulk(null); setBulkComment(''); setExcluded([]); await load();
  };
  const confirmSignoff = async () => {
    if (!statement.trim()) return;
    setSignoffBusy(true); setActionError('');
    const result = await signOffReport(reportVersionId, statement);
    setSignoffBusy(false);
    if (!result.ok) {
      setActionError(result.error.message);
      if (result.error.kind === 'conflict') setStale(true);
      if (result.error.kind === 'forbidden') setCanDecide(false);
      if (result.error.kind === 'unavailable') setError({ state: 'unavailable', message: result.error.message });
      return;
    }
    setSignoffOpen(false); await load();
  };
  // Undecided items in document order, grouped for the header hint and the "Next undecided" target (S22).
  const remaining = remainingGroups(sections, allItems);
  const goTo = (targetId: string) => {
    setFilter('ALL');
    window.setTimeout(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target?.focus({ preventScroll: true });
    }, 80);
  };
  const nextUndecided = () => { if (remaining[0]) goTo(remaining[0].targetId); };
  const startBulk = (theme: ReportItem, cases: ReportCaseGroup[]) => {
    setBulk({ theme, cases }); setExcluded([]); setBulkComment(''); setBulkError('');
  };
  const handleCaseDecision = async (caseNumber: string, value: CaseDecisionValue) => {
    const result = await decideCase(reportVersionId, caseNumber, { disposition: value.disposition, comment: value.comment || undefined, field_overrides: value.fieldOverrides });
    if (!result.ok) {
      if (result.error.kind === 'forbidden') setCanDecide(false);
      if (result.error.kind === 'conflict') setStale(true);
      if (result.error.kind === 'unavailable') setError({ state: 'unavailable', message: result.error.message });
      throw new Error(result.error.message);
    }
    await load();
  };
  const navigateSection = (id: string) => { setActiveSectionId(id); document.getElementById(`report-section-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  if (loading && !report) return <Brand.StateView state="loading" title="Loading report" />;
  if (error && !report) return <Brand.StateView state={error.state} title={error.state === 'not_found' ? 'Report version not found' : undefined} description={error.message} onRetry={error.state === 'unavailable' ? () => void load() : undefined} action={<Brand.Button component={Link} href={href('/dashboard/reports')} variant="secondary">Back to reports</Brand.Button>} />;
  if (!report) return null;
  const latestSignoff = report.signoffs[report.signoffs.length - 1];
  const importDate = formatDateTime(report.imported_at);

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Brand.Breadcrumbs items={[{ label: 'Reports', href: href('/dashboard/reports') }, { label: report.title }]} />
    <Brand.PageHeader title={report.title} description={<>{report.clients.join(', ')} · {promptbookName || humanizeIdentifier(report.promptbook_id)} v{report.promptbook_version} · imported {importDate} by {formatActor(report.imported_by)}</>} details={[{ label: 'Analysis run ID', value: report.analysis_run_id }]} actions={<Stack direction="row" gap={1.5} alignItems="center"><LifecycleBadge status={report.status} /><Brand.Button variant="secondary" aria-haspopup="dialog" aria-expanded={exportOpen} onClick={() => setExportOpen(true)}>Export</Brand.Button><Brand.Button disabled={readOnly || !canDecide || decided !== total} onClick={() => setSignoffOpen(true)}>Sign off</Brand.Button></Stack>} actionHint={readOnly ? 'This report is read-only.' : !canDecide ? 'You do not have permission to record decisions.' : decided !== total
      ? <>Still need a decision before sign-off: {remaining.map((group, index) => <span key={group.key}>{index > 0 ? '; ' : ''}<a href={`#${group.targetId}`} onClick={(event) => { event.preventDefault(); goTo(group.targetId); }}>{group.text}</a></span>)}.</>
      : 'All items are decided. Sign off to finish.'} />
    {report.status === 'SUPERSEDED' && <Brand.Notice tone="warning">A newer version of this report exists. <Link href={href(`/dashboard/reports/${encodeURIComponent(report.superseded_by ?? '')}`)}>Open newer version</Link></Brand.Notice>}
    {report.status === 'SIGNED_OFF' && latestSignoff && <Brand.Notice tone="success">Signed off by {formatActor(latestSignoff.reviewer_subject)} on {formatDateTime(latestSignoff.created_at)}. {latestSignoff.statement}</Brand.Notice>}
    <ReportExportPanel open={exportOpen} onClose={() => setExportOpen(false)} reportVersionId={reportVersionId} status={report.status} statusCounts={report.status_counts} />
    {total === 0 && sections.length === 0 && <Brand.StateView state="empty" title="This report has no reviewable items" description="No reviewable items are available for this report." />}
    {stale && <Brand.Notice tone="warning" action={<Brand.Button size="compact" variant="secondary" onClick={() => void load()}>Reload report</Brand.Button>}>This report changed since you opened it. Reload to see the current state.</Brand.Notice>}
    {error?.state === 'unavailable' && <Brand.Notice tone="error" action={<Brand.Button size="compact" variant="secondary" onClick={() => void load()}>Retry</Brand.Button>}>Reports are unavailable. Unsaved decision text is still on this page. {error.message}</Brand.Notice>}
    {error?.state === 'forbidden' && <Brand.Notice tone="warning">You do not have access to this report.</Brand.Notice>}
    {actionError && <Brand.Notice tone="error">{actionError}</Brand.Notice>}
    {total > 0 && <>
      <Box sx={{ position: 'sticky', top: 0, zIndex: 3, bgcolor: 'background.paper', py: 1.5 }}><Brand.ProgressSummary decided={decided} total={total} /></Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1.5}>
        <Brand.SegmentedControl label="Show" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'All' }, { value: 'UNDECIDED', label: 'Undecided' }, { value: 'DECIDED', label: 'Decided' }]} />
        <Stack direction="row" gap={1.5} alignItems="center"><Brand.Button variant="secondary" disabled={!remaining.length} onClick={nextUndecided}>{remaining[0] ? `Next undecided: ${remaining[0].text.replace(/^\d+ /, '')}` : 'No undecided items'}</Brand.Button>{!readOnly && canDecide && <Brand.MoreActionsMenu actions={[{ label: 'Copy decisions from an earlier version', onSelect: () => void openPrefill() }]} />}</Stack>
      </Stack>
      {bulkResult && <Brand.Notice tone="success">{bulkResult}</Brand.Notice>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '260px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
      <ReviewToc sections={sections} activeId={activeSectionId || sections[0]?.id || ''} onActiveChange={setActiveSectionId} onNavigate={navigateSection} />
        <ReviewDocument sections={sections} items={allItems} filter={filter} readOnly={Boolean(readOnly || !canDecide)} onSaveItem={handleDecision} onDecideCase={handleCaseDecision} onCitation={(value, index) => setCitation({ value, index })} onBulk={startBulk} sectionRef={() => undefined} />
      </Box>
    </>}
    {total === 0 && sections.length > 0 && <ReviewDocument sections={sections} items={allItems} filter={filter} readOnly={Boolean(readOnly || !canDecide)} onSaveItem={handleDecision} onDecideCase={handleCaseDecision} onCitation={(value, index) => setCitation({ value, index })} onBulk={startBulk} sectionRef={() => undefined} />}

    <Brand.SidePanel open={Boolean(citation)} title={citation ? `Source ${citation.index}` : 'Source'} onClose={() => setCitation(null)}>{citation && <CitationPanelContent citation={citation.value} />}</Brand.SidePanel>
    <Brand.Dialog open={Boolean(bulk)} title="Validate remaining case findings" description="Choose which undecided cases to validate. Each selected case is decided as a group." confirmLabel={`Validate ${bulk?.cases.filter((item) => !item.item_ids.every((id) => excluded.includes(id))).length ?? 0} cases`} busy={bulkBusy} onConfirm={() => void confirmBulk()} onClose={() => !bulkBusy && setBulk(null)}>
      {bulk && <Stack gap={1.5}>{bulk.cases.map((group) => { const isExcluded = group.item_ids.every((id) => excluded.includes(id)); return <FormControlLabel key={group.case_number} control={<Checkbox checked={!isExcluded} onChange={(event) => setExcluded((value) => event.target.checked ? value.filter((id) => !group.item_ids.includes(id)) : [...new Set([...value, ...group.item_ids])])} />} label={`${group.case_number} · ${group.summary.undecided} undecided fields`} sx={{ minHeight: 44 }} />; })}<Brand.Field label="Comment (optional)" kind="textarea" value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} />{bulkError && <Brand.Notice tone="error">{bulkError}</Brand.Notice>}</Stack>}
    </Brand.Dialog>
    <Brand.Dialog open={prefillOpen} title="Copy decisions from an earlier version" description="Only identical report items are copied. Review copied decisions and decide the remaining items." confirmLabel={`Copy ${prefillPreview?.copyable ?? 0} decisions`} busy={prefillBusy} onConfirm={() => void confirmPrefill()} onClose={() => !prefillBusy && setPrefillOpen(false)}>
      <Stack gap={1.5}><Brand.Field label="Earlier report version" kind="select" value={prefillSource} onChange={(event) => void choosePrefill(String(event.target.value))} options={[{ value: '', label: 'Select a comparable version' }, ...compatibleSources.map((source) => ({ value: source.report_version_id, label: `${source.title} · ${formatDate(source.imported_at)}` }))]} />{compatibleSources.length === 0 && <Typography variant="body2" color="text.secondary">No comparable earlier version is available.</Typography>}{prefillPreview && <Brand.Notice tone="info">{prefillPreview.copyable} items have identical text and can be copied; {prefillPreview.remaining} need a decision.</Brand.Notice>}{prefillError && <Brand.Notice tone="error">{prefillError}</Brand.Notice>}</Stack>
    </Brand.Dialog>
    <Brand.Dialog open={signoffOpen} title="Sign off report" description={`${decided} of ${total} items are decided. Signing off makes this report read-only.`} confirmLabel="Sign off report" busy={signoffBusy} onConfirm={() => void confirmSignoff()} onClose={() => !signoffBusy && setSignoffOpen(false)}>
      <Brand.Field label="Sign-off statement" kind="textarea" required value={statement} onChange={(event) => setStatement(event.target.value)} />
    </Brand.Dialog>
  </Box>;
}

export default function ReportReviewPage() { return <Suspense fallback={<Brand.StateView state="loading" title="Loading report" />}><ReportReview /></Suspense>; }
