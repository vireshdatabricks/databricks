'use client';

import React from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import MetricTile from '../../../components/patterns/metric-tile';
import type { DataColumn } from '../../../components/ui/data-table';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { AnalyticsApiError, Envelope, PrecisionSummary, RecurrencePair, RecurrenceSummary, getPrecision, getRecurrencePairs, getRecurrenceWindows } from '../../../utils/analytics-api';

const WINDOWS = [{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: '30', label: '30 days' }, { value: 'LONG', label: 'Long range' }];
const TIERS = [{ value: 'ALL', label: 'All matches' }, { value: 'A', label: 'Tier A (same root cause)' }, { value: 'B', label: 'Tier B (category and subtype only)' }];
const pct = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

/** Recurring issues → Recurrence after closure (reference/51 §6 journey 2): RC-01, RC-02 status, RC-03, RC-04. */
export default function RecurrenceSection() {
    const context = useAnalysisContext();
    const [windowCode, setWindowCode] = React.useState('30');
    const [tier, setTier] = React.useState('ALL');
    const [summary, setSummary] = React.useState<Envelope<RecurrenceSummary> | null>(null);
    const [precision, setPrecision] = React.useState<PrecisionSummary | null>(null);
    const [pairs, setPairs] = React.useState<Envelope<RecurrencePair[]> | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [attempt, setAttempt] = React.useState(0);
    const { as_of_week: asOfWeek, client_account: clientAccount } = context;

    React.useEffect(() => {
        let cancelled = false;
        setError(null); setSummary(null);
        Promise.all([getRecurrenceWindows({ as_of_week: asOfWeek, client_account: clientAccount }), getPrecision({ as_of_week: asOfWeek })])
            .then(([windows, labels]) => { if (!cancelled) { setSummary(windows); setPrecision(labels.data); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Recurrence measures could not be loaded.'); });
        return () => { cancelled = true; };
    }, [asOfWeek, clientAccount, attempt]);

    const current = summary?.data.windows.find((row) => row.window_code === windowCode && row.tier === tier);
    React.useEffect(() => {
        if (!current) return;
        let cancelled = false;
        setPairs(null);
        getRecurrencePairs({ as_of_week: asOfWeek, client_account: clientAccount, tier: tier === 'ALL' ? undefined : tier, window_days: current.window_days, limit: 100 })
            .then((result) => { if (!cancelled) setPairs(result); }).catch(() => { if (!cancelled) setPairs({ ...summary!, data: [] } as unknown as Envelope<RecurrencePair[]>); });
        return () => { cancelled = true; };
    }, [asOfWeek, clientAccount, tier, current, summary]);

    if (error) return <Brand.StateView state="error" title="Recurrence measures could not be loaded" description={error} onRetry={() => setAttempt((value) => value + 1)} />;
    if (!summary) return <Brand.StateView state="loading" title="Loading recurrence measures" />;
    const data = summary.data;
    const definitions = data.definitions;
    const longDays = data.windows.find((row) => row.window_code === 'LONG')?.window_days;
    const windowLabel = windowCode === 'LONG' ? `${longDays} days` : `${windowCode} days`;
    const tierPrecision = precision?.tiers[tier as 'A' | 'B' | 'ALL'];
    const precisionText = !tierPrecision ? '—' : tierPrecision.status === 'DIRECT' ? pct(tierPrecision.precision)
        : tier === 'ALL' ? 'Needs enough labels in tiers A and B' : `Not enough labels yet (${tierPrecision.decided_labels ?? 0} of ${tierPrecision.min_labels ?? precision?.min_labels})`;

    const columns: DataColumn<RecurrencePair>[] = [
        { id: 'index', label: 'Closed case', render: (row) => <Stack><Link href={context.hrefWith(`/dashboard/cases/${encodeURIComponent(row.index_case_number)}`)}>{row.index_case_number}</Link><Typography variant="body2" color="text.secondary">{row.index_short_description ?? '—'}</Typography></Stack> },
        { id: 'related', label: 'Later case', render: (row) => <Stack><Link href={context.hrefWith(`/dashboard/cases/${encodeURIComponent(row.related_case_number)}`)}>{row.related_case_number}</Link><Typography variant="body2" color="text.secondary">{row.related_short_description ?? '—'}</Typography></Stack> },
        { id: 'days_after_close', label: 'Days after close', align: 'right', sortable: true, value: (row) => row.days_after_close },
        { id: 'match_tier', label: 'Tier' },
        { id: 'category', label: 'Category / subtype', value: (row) => `${row.category} / ${row.subtype}` },
        { id: 'client_account', label: 'Client' },
    ];

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Typography variant="body2" color="text.secondary">Candidate matches from a field rule ({data.rule_version}): a later case for the same client with the same category and subtype, opened after a case closed. Precision comes only from reviewer labels on a random sample.</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2}>
            <Brand.SegmentedControl label="Window after closure" options={WINDOWS.map((item) => item.value === 'LONG' ? { ...item, label: `Long range (${longDays} days)` } : item)} value={windowCode} onChange={setWindowCode} />
            <Brand.SegmentedControl label="Match tier" options={TIERS} value={tier} onChange={setTier} />
        </Stack>
        {!current ? <Brand.StateView state="empty" title="No closed cases in this selection" /> : <>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
                <MetricTile title={`Recurrence within ${windowLabel}`} label="CANDIDATE" definition={definitions['RC-01']} value={pct(current.rate)}
                    detail={`${current.recurring_index_count.toLocaleString()} of ${current.eligible_index_count.toLocaleString()} eligible closed cases had a later matching case. ${current.censored_count.toLocaleString()} recent closures are not yet eligible for this window.`} />
                <MetricTile title="Related cases after closure" label="CANDIDATE" definition={definitions['RC-03']} value={current.related_case_count.toLocaleString()}
                    detail={current.precision_adjusted_related_cases !== null ? `About ${current.precision_adjusted_related_cases.toLocaleString()} after adjusting for match precision.` : 'A precision-adjusted estimate appears once enough matches are labelled.'} />
                <MetricTile title="Match precision" label={tierPrecision?.status === 'DIRECT' ? 'DIRECT' : 'CANDIDATE'} definition={definitions['RC-02']} value={precisionText}
                    detail={tierPrecision?.status === 'DIRECT' && tierPrecision.false_positive_rate !== undefined ? `False-positive rate ${pct(tierPrecision.false_positive_rate ?? null)}.` : undefined} />
            </Box>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
                <Brand.Button component={Link} href={context.hrefWith('/dashboard/recurring-issues/review-matches')} variant="secondary">Review matches</Brand.Button>
                <Typography variant="body2" color="text.secondary">Label randomly sampled pairs to measure precision.</Typography>
            </Stack>
            <Box component="section" aria-labelledby="matched-pairs" sx={{ display: 'grid', gap: 1 }}>
                <Typography id="matched-pairs" variant="h3" component="h2">Matched cases within {windowLabel}</Typography>
                <Brand.DataTable rows={pairs?.data ?? []} columns={columns} getRowId={(row) => row.pair_id} loading={!pairs} label="Matched cases" resultLabel="pair" emptyTitle="No matches in this window" emptyDescription="No later case matched a closed case in this window and tier." />
                {pairs?.next_cursor && <Typography variant="body2" color="text.secondary">Showing the first 100 pairs, nearest to closure first.</Typography>}
            </Box>
        </>}
        <Box component="section" aria-labelledby="remediation" sx={{ display: 'grid', gap: 1 }}>
            <Stack direction="row" gap={1} alignItems="center"><Typography id="remediation" variant="h3" component="h2">Recurrence after a recorded preventive action</Typography><Brand.StatusBadge status="CANDIDATE" /></Stack>
            <Typography variant="body2" color="text.secondary">Limited coverage: {data.remediation.cases_with_preventive_action.toLocaleString()} of {(data.remediation.closed_cases ?? 0).toLocaleString()} closed cases have a preventive action recorded. All clients, long-range window, all matches.</Typography>
            <Brand.DataTable rows={data.remediation.rows} getRowId={(row) => row.category} label="Recurrence after preventive action" resultLabel="category" emptyTitle="No preventive actions recorded"
                columns={[
                    { id: 'category', label: 'Category' },
                    { id: 'eligible_index_count', label: 'Eligible closed cases', align: 'right' },
                    { id: 'recurring_index_count', label: 'Followed by a match', align: 'right' },
                    { id: 'rate', label: 'Share', align: 'right', value: (row) => pct(row.rate) },
                    { id: 'censored_count', label: 'Too recent', align: 'right' },
                ]} />
        </Box>
    </Box>;
}
