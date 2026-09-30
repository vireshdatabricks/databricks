'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Box, Chip, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import { AnalyticsApiError, Envelope, ThemeCandidate, ThemeSummary, ThemeSummaryCandidate, getThemes, getThemesSummary } from '../../utils/analytics-api';
import FreshnessBanner from '../components/freshness-banner';
import QueryTextFilter from '../components/query-text-filter';
import WeekSelect from '../components/week-select';

function ThemesContent() {
    const searchParams = useSearchParams();
    const [envelope, setEnvelope] = React.useState<Envelope<ThemeCandidate[]> | null>(null);
    const [items, setItems] = React.useState<ThemeCandidate[]>([]);
    const [summary, setSummary] = React.useState<ThemeSummary | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const rootCause = searchParams.get('root_cause') ?? undefined;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        Promise.all([
            getThemes({ as_of_week: asOfWeek, category, root_cause: rootCause, limit: 100 }),
            getThemesSummary({ as_of_week: asOfWeek, category, root_cause: rootCause }),
        ])
            .then(([data, summaryResult]) => {
                if (cancelled) return;
                setEnvelope(data);
                setItems(data.data);
                setSummary(summaryResult.data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load themes.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [asOfWeek, category, rootCause]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getThemes({ as_of_week: asOfWeek, category, root_cause: rootCause, limit: 100, cursor: envelope.next_cursor })
            .then((data) => {
                setEnvelope(data);
                setItems((prev) => [...prev, ...data.data]);
            })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load more themes.'));
    };

    const evidenceHref = (themeId: string) => {
        const params = new URLSearchParams();
        if (asOfWeek) params.set('as_of_week', asOfWeek);
        if (category) params.set('category', category);
        if (rootCause) params.set('root_cause', rootCause);
        const query = params.toString();
        return `/dashboard/themes/${encodeURIComponent(themeId)}${query ? `?${query}` : ''}`;
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Themes</Typography>
            <Typography variant="body2" color="text.secondary">
                Deterministic category / root-cause groupings. These are candidates, not validated findings.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Box sx={{ minWidth: 220 }}>
                    <WeekSelect />
                </Box>
                <QueryTextFilter label="Category" paramKey="category" />
                <QueryTextFilter label="Root cause" paramKey="root_cause" />
            </Box>

            {loading && <Typography>Loading…</Typography>}
            {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

            {envelope && !loading && (
                <>
                    <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
                    <Brand.Card bordered="outlined">
                        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Candidate grouping boundary</Typography>
                        <Typography variant="body2" color="text.secondary">
                            These are deterministic category / root-cause groupings for review. They indicate candidate membership, not a validated root cause, severity, or causal finding.
                        </Typography>
                    </Brand.Card>
                    {summary && <>
                        <Grid container spacing={2} aria-label="Theme candidate summary">
                            <Metric label="Candidate groupings" value={summary.total_candidate_count} />
                            <Metric label="Meeting support threshold" value={summary.candidates_meeting_support_count} />
                            <Metric label="Cases represented" value={summary.cases_represented_count} />
                            <Metric label="Minimum support (cases)" value={summary.min_support_threshold} />
                        </Grid>
                        <RankedCandidates candidates={summary.top_candidates} casesRepresented={summary.cases_represented_count} evidenceHref={evidenceHref} />
                    </>}
                    <TableContainer component={Brand.Card} sx={{ padding: 0 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Theme</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Root cause</TableCell>
                                    <TableCell align="right">Case count</TableCell>
                                    <TableCell align="right">Occurrence rate</TableCell>
                                    <TableCell>Min. support met</TableCell>
                                    <TableCell>Method</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((theme) => (
                                    <TableRow key={theme.theme_id}>
                                        <TableCell>{theme.theme_label}</TableCell>
                                        <TableCell>{theme.category ?? '—'}</TableCell>
                                        <TableCell>{theme.root_cause ?? '—'}</TableCell>
                                        <TableCell align="right">{theme.case_count}</TableCell>
                                        <TableCell align="right">{(theme.occurrence_rate * 100).toFixed(1)}%</TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={theme.meets_min_support ? 'Yes' : 'No'}
                                                color={theme.meets_min_support ? 'success' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell>{theme.method_type}</TableCell>
                                        <TableCell>
                                            <Link
                                                href={evidenceHref(theme.theme_id)}
                                            >
                                                View cases
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {envelope.next_cursor && (
                        <Brand.Button variant="secondary" onClick={loadMore} sx={{ justifySelf: 'start' }}>
                            Load more
                        </Brand.Button>
                    )}
                </>
            )}
        </Box>
    );
}

function Metric({ label, value }: { label: string; value: number }) {
    return <Grid item xs={6} md={3}><Brand.Card bordered="outlined" sx={{ height: '100%' }}>
        <Typography variant="h5">{value.toLocaleString()}</Typography>
        <Typography variant="body2">{label}</Typography>
    </Brand.Card></Grid>;
}

function RankedCandidates({ candidates, casesRepresented, evidenceHref }: { candidates: ThemeSummaryCandidate[]; casesRepresented: number; evidenceHref: (themeId: string) => string }) {
    const topCandidates = candidates.slice(0, 8);
    const maxCaseCount = Math.max(1, ...topCandidates.map((candidate) => candidate.case_count));
    return <Brand.Card bordered="outlined" component="section" aria-labelledby="top-candidates-heading">
        <Typography variant="h6" component="h2" id="top-candidates-heading">Most represented candidate groupings</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
            Top eight, ranked by case count. The summary represents {casesRepresented.toLocaleString()} cases; method and support status remain visible for every candidate below.
        </Typography>
        {topCandidates.length === 0 ? <Typography>No candidate groupings match this context.</Typography> : <Box component="ol" sx={{ listStyle: 'none', display: 'grid', gap: 1.5, p: 0, m: 0 }}>
            {topCandidates.map((candidate) => <Box component="li" key={candidate.theme_id}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 2 }}>
                    <Link href={evidenceHref(candidate.theme_id)} aria-label={`View cases for ${candidate.theme_label}: ${candidate.case_count.toLocaleString()} cases`}>
                        {candidate.theme_label}
                    </Link>
                    <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>{candidate.case_count.toLocaleString()} cases · {(candidate.occurrence_rate * 100).toFixed(1)}%</Typography>
                </Box>
                <Box aria-hidden="true" sx={{ height: 8, backgroundColor: 'action.hover', borderRadius: 4, mt: 0.5 }}>
                    <Box sx={{ width: `${(candidate.case_count / maxCaseCount) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: 'primary.main' }} />
                </Box>
                <Typography variant="caption" color="text.secondary">
                    {candidate.method_type} · support threshold {candidate.meets_min_support ? 'met' : 'not met'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Candidate support: {candidate.case_count.toLocaleString()} of {candidate.denominator_count.toLocaleString()} cases.
                </Typography>
            </Box>)}
        </Box>}
    </Brand.Card>;
}

export default function ThemesPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <ThemesContent />
        </Suspense>
    );
}
