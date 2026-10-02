'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import ContextBar from '../../components/patterns/context-bar';
import RecurrenceSection from './_components/recurrence-section';
import MetricCard from '../../components/patterns/metric-card';
import type { DataColumn } from '../../components/ui/data-table';
import { useAnalysisContext } from '../../lib/hooks/use-analysis-context';
import { humanizeIdentifier } from '../../lib/format';
import { AnalyticsApiError, Envelope, ThemeCandidate, ThemeSummary, ThemeSummaryCandidate, getThemes, getThemesSummary } from '../../utils/analytics-api';
import { radius } from '../../utils/theme';

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

function RankedCandidates({ candidates, casesRepresented, href }: { candidates: ThemeSummaryCandidate[]; casesRepresented: number; href: (themeId: string) => string }) {
    const top = candidates.slice(0, 8);
    const max = Math.max(1, ...top.map((candidate) => candidate.case_count));
    return <Brand.Card bordered="outlined" component="section" aria-labelledby="top-candidates-heading" sx={{ display: 'grid', gap: 1.5 }}>
        <Typography variant="h3" component="h2" id="top-candidates-heading">Most represented candidate themes</Typography>
        <Typography variant="body2" color="text.secondary">Top eight by case count, out of {casesRepresented.toLocaleString()} cases represented.</Typography>
        {top.length === 0 ? <Typography variant="body2">No candidate themes match this selection.</Typography> : <Box component="ol" sx={{ listStyle: 'none', display: 'grid', gap: 1.5, p: 0, m: 0 }}>
            {top.map((candidate) => <Box component="li" key={candidate.theme_id}>
                <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={2}>
                    <Link href={href(candidate.theme_id)}>{candidate.theme_label}</Link>
                    <Typography variant="body2" fontWeight={700} sx={{ whiteSpace: 'nowrap' }}>{candidate.case_count.toLocaleString()} cases · {percent(candidate.occurrence_rate)}</Typography>
                </Stack>
                <Box aria-hidden sx={{ height: 8, bgcolor: 'action.hover', borderRadius: radius.field, mt: 0.5 }}><Box sx={{ width: `${(candidate.case_count / max) * 100}%`, height: '100%', borderRadius: radius.field, bgcolor: 'brand.chartSeries1' }} /></Box>
                <Typography variant="body2" color="text.secondary">{humanizeIdentifier(candidate.method_type)} · support threshold {candidate.meets_min_support ? 'met' : 'not met'} · {candidate.case_count.toLocaleString()} of {candidate.denominator_count.toLocaleString()} cases</Typography>
            </Box>)}
        </Box>}
    </Brand.Card>;
}

function RecurringIssuesContent() {
    const context = useAnalysisContext();
    const search = useSearchParams();
    const [envelope, setEnvelope] = React.useState<Envelope<ThemeCandidate[]> | null>(null);
    const [items, setItems] = React.useState<ThemeCandidate[]>([]);
    const [summary, setSummary] = React.useState<ThemeSummary | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [attempt, setAttempt] = React.useState(0);
    const { as_of_week: asOfWeek, category, root_cause: rootCause } = context;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        Promise.all([getThemes({ as_of_week: asOfWeek, category, root_cause: rootCause, limit: 100 }), getThemesSummary({ as_of_week: asOfWeek, category, root_cause: rootCause })])
            .then(([data, totals]) => { if (!cancelled) { setEnvelope(data); setItems(data.data); setSummary(totals.data); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Candidate themes could not be loaded.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [asOfWeek, category, rootCause, attempt]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getThemes({ as_of_week: asOfWeek, category, root_cause: rootCause, limit: 100, cursor: envelope.next_cursor })
            .then((data) => { setEnvelope(data); setItems((prev) => [...prev, ...data.data]); })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'More themes could not be loaded.'));
    };
    const href = (themeId: string) => context.hrefWith(`/dashboard/recurring-issues/${encodeURIComponent(themeId)}`);
    const valuesOf = (key: 'category' | 'root_cause', current?: string) => [...new Set([...items.map((item) => item[key]).filter((value): value is string => Boolean(value)), ...(current ? [current] : [])])].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const columns: DataColumn<ThemeCandidate>[] = [
        { id: 'theme_label', label: 'Theme', sortable: true, minWidth: 200, value: (row) => row.theme_label, render: (row) => <Link href={href(row.theme_id)}>{row.theme_label}</Link> },
        { id: 'category', label: 'Category' },
        { id: 'root_cause', label: 'Root cause' },
        { id: 'case_count', label: 'Cases', align: 'right', sortable: true, value: (row) => row.case_count },
        { id: 'occurrence_rate', label: 'Share of cases', align: 'right', sortable: true, value: (row) => row.occurrence_rate, render: (row) => percent(row.occurrence_rate) },
        { id: 'meets_min_support', label: 'Minimum support', value: (row) => row.meets_min_support ? 'Met' : 'Not met' },
        { id: 'method_type', label: 'Method', value: (row) => humanizeIdentifier(row.method_type) },
    ];

    const recurrence = search.get('view') === 'recurrence';
    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.PageHeader title="Recurring issues" description="Candidate themes and recurrence after closure. Both are candidates for review, not validated findings."
            details={envelope ? [{ label: 'Logic version', value: envelope.logic_version }, { label: 'Data quality', value: envelope.data_quality_status }] : undefined} />
        <Brand.Tabs param="view" options={[{ value: 'themes', label: 'Candidate themes' }, { value: 'recurrence', label: 'Recurrence after closure' }]} />
        <ContextBar fields={recurrence ? ['client_account'] : []} freshness={envelope ? { asOfWeek: envelope.as_of_week, logicVersion: envelope.logic_version } : undefined} />
        {recurrence ? <RecurrenceSection /> : <>
        <Box component="form" aria-label="Theme filters" onSubmit={(event) => event.preventDefault()} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <Brand.Field label="Category" kind="select" value={category ?? ''} onChange={(event) => context.set('category', String(event.target.value) || null)} options={[{ value: '', label: 'All categories' }, ...valuesOf('category', category).map((value) => ({ value, label: value }))]} />
            <Brand.Field label="Root cause" kind="select" value={rootCause ?? ''} onChange={(event) => context.set('root_cause', String(event.target.value) || null)} options={[{ value: '', label: 'All root causes' }, ...valuesOf('root_cause', rootCause).map((value) => ({ value, label: value }))]} />
        </Box>
        {loading && !envelope ? <Brand.StateView state="loading" title="Loading candidate themes" />
            : error ? <Brand.StateView state="error" title="Candidate themes could not be loaded" description={error} onRetry={() => setAttempt((value) => value + 1)} />
            : envelope && <>
                {summary && <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
                    <MetricCard label="Candidate themes" value={summary.total_candidate_count} />
                    <MetricCard label="Meeting support threshold" value={summary.candidates_meeting_support_count} />
                    <MetricCard label="Cases represented" value={summary.cases_represented_count} />
                    <MetricCard label="Minimum support (cases)" value={summary.min_support_threshold} />
                </Box>}
                {summary && <RankedCandidates candidates={summary.top_candidates} casesRepresented={summary.cases_represented_count} href={href} />}
                <Brand.DataTable rows={items} columns={columns} getRowId={(row) => row.theme_id} label="Candidate themes" resultLabel="theme" emptyTitle="No candidate themes" emptyDescription="No themes match this week and these filters." />
                {envelope.next_cursor && <Brand.Button variant="secondary" onClick={loadMore} sx={{ justifySelf: 'start' }}>Load more themes</Brand.Button>}
            </>}
        </>}
    </Box>;
}

export default function RecurringIssuesPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading recurring issues" />}><RecurringIssuesContent /></Suspense>;
}
