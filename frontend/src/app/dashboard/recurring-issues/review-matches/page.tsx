'use client';

import React, { Suspense } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { formatActor, formatDate, formatDateTime } from '../../../lib/format';
import { AnalyticsApiError, LabelQueue, MatchVerdict, PrecisionSummary, getLabelQueue, getPrecision, labelRecurrencePair } from '../../../utils/analytics-api';

const VERDICTS: Array<{ value: MatchVerdict; label: string; helperText: string }> = [
    { value: 'SAME_ISSUE', label: 'Same issue', helperText: 'The later case repeats the problem of the closed case.' },
    { value: 'DIFFERENT_ISSUE', label: 'Different issue', helperText: 'The cases share fields but describe different problems.' },
    { value: 'UNSURE', label: 'Unsure', helperText: 'Not enough information to decide. Excluded from precision.' },
];
const VERDICT_TEXT: Record<string, string> = { SAME_ISSUE: 'Same issue', DIFFERENT_ISSUE: 'Different issue', UNSURE: 'Unsure' };
const SIDE_FIELDS: Array<[string, string]> = [['case_short_description', 'Short description'], ['category', 'Category'], ['subtype', 'Subtype'], ['root_cause', 'Root cause'], ['opened_at', 'Opened'], ['closed_at', 'Closed'], ['case_close_notes', 'Close notes']];

function CaseSide({ pair, side, caseNumber, title }: { pair: NonNullable<LabelQueue['pair']>; side: 'index' | 'related'; caseNumber: string; title: string }) {
    return <Brand.Card bordered="outlined" component="section" aria-label={`${title}: ${caseNumber}`} sx={{ display: 'grid', gap: 1, alignContent: 'start' }}>
        <Typography variant="label" color="text.secondary">{title}</Typography>
        <Typography variant="h3" component="h2">{caseNumber}</Typography>
        <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1 }}>
            {SIDE_FIELDS.map(([field, label]) => {
                const raw = pair[`${side}_${field}`];
                const value = raw === null || raw === undefined || raw === '' ? '—' : field.endsWith('_at') ? formatDateTime(String(raw)) : String(raw);
                return <Box key={field}><Typography component="dt" variant="label" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</Typography></Box>;
            })}
        </Box>
    </Brand.Card>;
}

function PrecisionPanel({ precision }: { precision: PrecisionSummary }) {
    return <Box component="section" aria-labelledby="precision-heading" sx={{ display: 'grid', gap: 1 }}>
        <Typography id="precision-heading" variant="h2">Match precision</Typography>
        <Typography variant="body2" color="text.secondary">Precision is shown as measured once a tier has {precision.min_labels} decided labels (Same or Different). Unsure labels are excluded.</Typography>
        <Brand.DataTable rows={(['A', 'B'] as const).map((tier) => precision.tiers[tier])} getRowId={(row) => row.tier} label="Match precision by tier" resultLabel="tier"
            columns={[
                { id: 'tier', label: 'Tier', value: (row) => row.tier === 'A' ? 'A (same root cause)' : 'B (category and subtype only)' },
                { id: 'status', label: 'Label', render: (row) => <Brand.StatusBadge status={row.status === 'DIRECT' ? 'DIRECT' : 'CANDIDATE'} /> },
                { id: 'decided', label: 'Decided labels', align: 'right', value: (row) => `${row.decided_labels ?? 0} of ${row.min_labels ?? precision.min_labels}` },
                { id: 'same', label: 'Same / different / unsure', align: 'right', value: (row) => `${row.same_issue ?? 0} / ${row.different_issue ?? 0} / ${row.unsure ?? 0}` },
                { id: 'precision', label: 'Precision', align: 'right', value: (row) => row.status === 'DIRECT' && row.precision !== null ? `${(row.precision * 100).toFixed(1)}%` : 'Not enough labels yet' },
                { id: 'agreement', label: 'Reviewer agreement', align: 'right', value: (row) => row.reviewer_agreement === null || row.reviewer_agreement === undefined ? '—' : `${(row.reviewer_agreement * 100).toFixed(0)}%` },
            ]} />
    </Box>;
}

function ReviewMatchesContent() {
    const context = useAnalysisContext();
    const [queue, setQueue] = React.useState<LabelQueue | null>(null);
    const [precision, setPrecision] = React.useState<PrecisionSummary | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [verdict, setVerdict] = React.useState<MatchVerdict | ''>('');
    const [comment, setComment] = React.useState('');
    const [saving, setSaving] = React.useState(false);
    const [saveError, setSaveError] = React.useState('');
    const [announcement, setAnnouncement] = React.useState('');
    const [attempt, setAttempt] = React.useState(0);
    const headingRef = React.useRef<HTMLHeadingElement>(null);

    const load = React.useCallback(async () => {
        setError(null);
        try {
            const [queueResult, precisionResult] = await Promise.all([getLabelQueue(), getPrecision()]);
            setQueue(queueResult.data); setPrecision(precisionResult.data);
        } catch (err) { setError(err instanceof AnalyticsApiError ? err.message : 'The review queue could not be loaded.'); }
    }, []);
    React.useEffect(() => { void load(); }, [load, attempt]);

    const save = async () => {
        if (!queue?.pair || !verdict) return;
        setSaving(true); setSaveError('');
        try {
            await labelRecurrencePair(queue.pair.pair_id, verdict, comment);
            setAnnouncement(`Saved: ${VERDICT_TEXT[verdict]}. Showing the next pair.`);
            setVerdict(''); setComment('');
            await load();
            requestAnimationFrame(() => headingRef.current?.focus());
        } catch (err) { setSaveError(err instanceof AnalyticsApiError ? err.message : 'The label could not be saved.'); }
        finally { setSaving(false); }
    };

    const pair = queue?.pair;
    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.Breadcrumbs items={[{ label: 'Recurring issues', href: context.hrefWith('/dashboard/recurring-issues?view=recurrence') }, { label: 'Review matches' }]} />
        <Brand.PageHeader title="Review matches" description="Decide whether each randomly sampled pair describes the same issue. Your labels measure how precise the recurrence rule is." />
        <Typography role="status" aria-live="polite" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{announcement}</Typography>
        {error ? <Brand.StateView state="error" title="The review queue could not be loaded" description={error} onRetry={() => setAttempt((value) => value + 1)} />
            : !queue ? <Brand.StateView state="loading" title="Loading the next pair" />
            : <>
                <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                    {(['A', 'B'] as const).map((tier) => <Brand.ProgressSummary key={tier} decided={queue.progress[tier].labelled} total={queue.progress[tier].sampled} label={`tier ${tier} pairs`} />)}
                </Box>
                {!pair ? <Brand.StateView state="empty" title="You have labelled every sampled pair" description="Precision below updates as more reviewers label." />
                    : <Box component="section" aria-labelledby="pair-heading" sx={{ display: 'grid', gap: 2 }}>
                        <Box>
                            <Typography id="pair-heading" ref={headingRef} tabIndex={-1} variant="h2">Tier {pair.match_tier} pair · {pair.client_account}</Typography>
                            <Typography variant="body2" color="text.secondary">The later case opened {Number(pair.days_after_close).toLocaleString(undefined, { maximumFractionDigits: 1 })} days after the earlier case closed. Rule {queue.rule_version}.</Typography>
                        </Box>
                        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                            <CaseSide pair={pair} side="index" caseNumber={pair.index_case_number} title="Closed case" />
                            <CaseSide pair={pair} side="related" caseNumber={pair.related_case_number} title="Later case" />
                        </Box>
                        {pair.labels.length > 0 && <Typography variant="body2" color="text.secondary">Earlier labels: {pair.labels.map((item) => `${VERDICT_TEXT[item.verdict]} by ${formatActor(item.reviewer)} (${formatDate(item.labelled_at)})`).join('; ')}</Typography>}
                        <Brand.ChoiceGroup label="Is this the same issue?" name={`verdict-${pair.pair_id}`} value={verdict} onChange={(value) => { setVerdict(value as MatchVerdict); setSaveError(''); }} options={VERDICTS} />
                        <Brand.Field label="Comment (optional)" kind="textarea" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />
                        {saveError && <Brand.Notice tone="error">{saveError}</Brand.Notice>}
                        <Stack direction="row" gap={1} alignItems="center">
                            <Brand.Button onClick={() => void save()} loading={saving} disabled={!verdict} aria-describedby="save-hint">Save and show next</Brand.Button>
                            {!verdict && <Typography id="save-hint" variant="body2" color="text.secondary">Choose an answer to save.</Typography>}
                        </Stack>
                    </Box>}
                {precision && <PrecisionPanel precision={precision} />}
            </>}
    </Box>;
}

export default function ReviewMatchesPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading review matches" />}><ReviewMatchesContent /></Suspense>;
}
