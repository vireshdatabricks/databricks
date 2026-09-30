'use client';

import React, { Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
    Box,
    Tab,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tabs,
    Typography
} from '@mui/material';

import * as Brand from '../../components/ui';
import {
    AnalyticsApiError,
    CaseTrendItem,
    Envelope,
    MonthlyTrendSeries,
    TaskTrendItem,
    getCaseTrends,
    getCaseTrendSeries,
    getTaskTrends,
    getTaskTrendSeries
} from '../../utils/analytics-api';
import FreshnessBanner from '../components/freshness-banner';
import QueryTextFilter from '../components/query-text-filter';
import WeekSelect from '../components/week-select';

type TrendKind = 'case' | 'task';

function VolumeChart({ series }: { series: MonthlyTrendSeries }) {
    const max = Math.max(1, ...series.points.flatMap((point) => [point.opened_count, point.closed_count]));
    return (
        <Box>
            <Typography variant="body2" color="text.secondary">{series.series_definition} {series.denominator_definition}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Full selected snapshot date breakdown · {series.entity} counts in {series.unit}
            </Typography>
            <Box role="img" aria-label={`${series.entity} opened and closed counts by month, in ${series.unit}`} sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 160, overflowX: 'auto', py: 1 }}>
                {series.points.map((point) => (
                <Box key={point.report_month} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, minWidth: 64 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 120 }}>
                        <Box sx={{ width: 16, height: `${(point.opened_count / max) * 100}%`, backgroundColor: '#0C55B8', borderRadius: '2px 2px 0 0' }} title={`Opened: ${point.opened_count}; represented records: ${point.represented_record_count}`} />
                        <Box sx={{ width: 16, height: `${(point.closed_count / max) * 100}%`, backgroundColor: '#FF612B', borderRadius: '2px 2px 0 0' }} title={`Closed: ${point.closed_count}; represented records: ${point.represented_record_count}`} />
                    </Box>
                    <Typography variant="subtitle2">{point.report_month}</Typography>
                </Box>
                ))}
            </Box>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="caption"><Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: '#0C55B8', mr: 0.75 }} />Opened ({series.unit}): {series.total_opened_count.toLocaleString()}</Typography>
                <Typography variant="caption"><Box component="span" sx={{ display: 'inline-block', width: 10, height: 10, bgcolor: '#FF612B', mr: 0.75 }} />Closed ({series.unit}): {series.total_closed_count.toLocaleString()}</Typography>
                <Typography variant="caption">{series.month_count} months · {series.grain}</Typography>
            </Box>
            <Table size="small" aria-label={`Monthly ${series.entity} opened, closed, and represented record counts`}>
                <TableHead>
                    <TableRow>
                        <TableCell>Month</TableCell>
                        <TableCell align="right">Opened ({series.unit})</TableCell>
                        <TableCell align="right">Closed ({series.unit})</TableCell>
                        <TableCell align="right">Represented records</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {series.points.map((point) => (
                        <TableRow key={point.report_month}>
                            <TableCell>{point.report_month}</TableCell>
                            <TableCell align="right">{point.opened_count.toLocaleString()}</TableCell>
                            <TableCell align="right">{point.closed_count.toLocaleString()}</TableCell>
                            <TableCell align="right">{point.represented_record_count.toLocaleString()}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );
}

function CaseTrendsPanel() {
    const searchParams = useSearchParams();
    const [envelope, setEnvelope] = React.useState<Envelope<CaseTrendItem[]> | null>(null);
    const [items, setItems] = React.useState<CaseTrendItem[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [series, setSeries] = React.useState<Envelope<MonthlyTrendSeries> | null>(null);
    const [seriesError, setSeriesError] = React.useState<string | null>(null);
    const [seriesLoading, setSeriesLoading] = React.useState(true);

    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const clientAccount = searchParams.get('client_account') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const caseType = searchParams.get('case_type') ?? undefined;
    const subtype = searchParams.get('subtype') ?? undefined;
    const rootCause = searchParams.get('root_cause') ?? undefined;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getCaseTrends({ as_of_week: asOfWeek, client_account: clientAccount, category, case_type: caseType, subtype, root_cause: rootCause, limit: 100 })
            .then((data) => {
                if (cancelled) return;
                setEnvelope(data);
                setItems(data.data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load case trends.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [asOfWeek, clientAccount, category, caseType, subtype, rootCause]);

    React.useEffect(() => {
        let cancelled = false;
        setSeriesLoading(true);
        setSeriesError(null);
        setSeries(null);
        getCaseTrendSeries({ as_of_week: asOfWeek, client_account: clientAccount, category, case_type: caseType, subtype, root_cause: rootCause })
            .then((data) => { if (!cancelled) setSeries(data); })
            .catch((err) => { if (!cancelled) setSeriesError(err instanceof AnalyticsApiError ? err.message : 'Unable to load the monthly case series.'); })
            .finally(() => { if (!cancelled) setSeriesLoading(false); });
        return () => { cancelled = true; };
    }, [asOfWeek, clientAccount, category, caseType, subtype, rootCause]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getCaseTrends({ as_of_week: asOfWeek, client_account: clientAccount, category, case_type: caseType, subtype, root_cause: rootCause, limit: 100, cursor: envelope.next_cursor })
            .then((data) => {
                setEnvelope(data);
                setItems((prev) => [...prev, ...data.data]);
            })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load more case trends.'));
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <QueryTextFilter label="Client account" paramKey="client_account" />
                <QueryTextFilter label="Category" paramKey="category" />
                <QueryTextFilter label="Case type" paramKey="case_type" />
                <QueryTextFilter label="Subtype" paramKey="subtype" />
                <QueryTextFilter label="Root cause" paramKey="root_cause" />
            </Box>

            {loading && <Typography>Loading…</Typography>}
            {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

            {envelope && !loading && (
                <>
                    <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
                    <Brand.Card bordered="outlined">
                        <Typography variant="h6" sx={{ mb: 1 }}>Opened and closed cases by month</Typography>
                        {seriesLoading && <Typography role="status">Loading full monthly case totals…</Typography>}
                        {seriesError && <Typography color="error" role="alert">{seriesError}</Typography>}
                        {series && !seriesLoading && <VolumeChart series={series.data} />}
                    </Brand.Card>
                    <TableContainer component={Brand.Card} sx={{ padding: 0 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Month</TableCell>
                                    <TableCell>Client account</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Case type</TableCell>
                                    <TableCell>Subtype</TableCell>
                                    <TableCell>Root cause</TableCell>
                                    <TableCell align="right">Opened</TableCell>
                                    <TableCell align="right">Closed</TableCell>
                                    <TableCell align="right">Avg closed-record duration (business days)</TableCell>
                                    <TableCell align="right">Avg closed-record duration (calendar days)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((row, index) => (
                                    <TableRow key={`${row.report_month}-${index}`}>
                                        <TableCell>{row.report_month}</TableCell>
                                        <TableCell>{row.client_account ?? '—'}</TableCell>
                                        <TableCell>{row.category ?? '—'}</TableCell>
                                        <TableCell>{row.case_type ?? '—'}</TableCell>
                                        <TableCell>{row.subtype ?? '—'}</TableCell>
                                        <TableCell>{row.root_cause ?? '—'}</TableCell>
                                        <TableCell align="right">{row.opened_case_count}</TableCell>
                                        <TableCell align="right">{row.closed_case_count}</TableCell>
                                        <TableCell align="right">{row.closed_case_tat_business_days_avg ?? '—'}</TableCell>
                                        <TableCell align="right">{row.closed_case_tat_calendar_days_avg ?? '—'}</TableCell>
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

function TaskTrendsPanel() {
    const searchParams = useSearchParams();
    const [envelope, setEnvelope] = React.useState<Envelope<TaskTrendItem[]> | null>(null);
    const [items, setItems] = React.useState<TaskTrendItem[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [series, setSeries] = React.useState<Envelope<MonthlyTrendSeries> | null>(null);
    const [seriesError, setSeriesError] = React.useState<string | null>(null);
    const [seriesLoading, setSeriesLoading] = React.useState(true);

    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const assignmentGroup = searchParams.get('assignment_group') ?? undefined;
    const state = searchParams.get('state') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const type = searchParams.get('type') ?? undefined;
    const subtype = searchParams.get('subtype') ?? undefined;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getTaskTrends({ as_of_week: asOfWeek, assignment_group: assignmentGroup, state, category, type, subtype, limit: 100 })
            .then((data) => {
                if (cancelled) return;
                setEnvelope(data);
                setItems(data.data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load task trends.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [asOfWeek, assignmentGroup, state, category, type, subtype]);

    React.useEffect(() => {
        let cancelled = false;
        setSeriesLoading(true);
        setSeriesError(null);
        setSeries(null);
        getTaskTrendSeries({ as_of_week: asOfWeek, assignment_group: assignmentGroup, state, category, type, subtype })
            .then((data) => { if (!cancelled) setSeries(data); })
            .catch((err) => { if (!cancelled) setSeriesError(err instanceof AnalyticsApiError ? err.message : 'Unable to load the monthly task series.'); })
            .finally(() => { if (!cancelled) setSeriesLoading(false); });
        return () => { cancelled = true; };
    }, [asOfWeek, assignmentGroup, state, category, type, subtype]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getTaskTrends({ as_of_week: asOfWeek, assignment_group: assignmentGroup, state, category, type, subtype, limit: 100, cursor: envelope.next_cursor })
            .then((data) => {
                setEnvelope(data);
                setItems((prev) => [...prev, ...data.data]);
            })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load more task trends.'));
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <QueryTextFilter label="Assignment group" paramKey="assignment_group" />
                <QueryTextFilter label="State" paramKey="state" />
                <QueryTextFilter label="Category" paramKey="category" />
                <QueryTextFilter label="Type" paramKey="type" />
                <QueryTextFilter label="Subtype" paramKey="subtype" />
            </Box>

            {loading && <Typography>Loading…</Typography>}
            {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

            {envelope && !loading && (
                <>
                    <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
                    <Brand.Card bordered="outlined">
                        <Typography variant="h6" sx={{ mb: 1 }}>Opened and closed tasks by month</Typography>
                        {seriesLoading && <Typography role="status">Loading full monthly task totals…</Typography>}
                        {seriesError && <Typography color="error" role="alert">{seriesError}</Typography>}
                        {series && !seriesLoading && <VolumeChart series={series.data} />}
                    </Brand.Card>
                    <TableContainer component={Brand.Card} sx={{ padding: 0 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Month</TableCell>
                                    <TableCell>Assignment group</TableCell>
                                    <TableCell>State</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Subtype</TableCell>
                                    <TableCell align="right">Opened</TableCell>
                                    <TableCell align="right">Closed</TableCell>
                                    <TableCell align="right">Avg closed-record duration (business days)</TableCell>
                                    <TableCell align="right">Avg closed-record duration (calendar days)</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((row, index) => (
                                    <TableRow key={`${row.report_month}-${index}`}>
                                        <TableCell>{row.report_month}</TableCell>
                                        <TableCell>{row.task_assignment_group ?? '—'}</TableCell>
                                        <TableCell>{row.task_state ?? '—'}</TableCell>
                                        <TableCell>{row.task_category ?? '—'}</TableCell>
                                        <TableCell>{row.task_type ?? '—'}</TableCell>
                                        <TableCell>{row.task_subtype ?? '—'}</TableCell>
                                        <TableCell align="right">{row.opened_task_count}</TableCell>
                                        <TableCell align="right">{row.closed_task_count}</TableCell>
                                        <TableCell align="right">{row.closed_task_tat_business_days_avg ?? '—'}</TableCell>
                                        <TableCell align="right">{row.closed_task_tat_calendar_days_avg ?? '—'}</TableCell>
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

function TrendsContent() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const kind: TrendKind = searchParams.get('kind') === 'task' ? 'task' : 'case';

    const handleTabChange = (_: React.SyntheticEvent, value: TrendKind) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('kind', value);
        params.delete('cursor');
        router.push(`${pathname}?${params.toString()}`);
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Monthly date breakdown</Typography>
            <Typography variant="body2" color="text.secondary">
                Records are grouped by their opened and closed months within the selected extract-week snapshot. This is a date breakdown, not week-over-week movement or a performance measure.
            </Typography>
            <Box sx={{ maxWidth: 260 }}>
                <WeekSelect />
            </Box>
            <Tabs value={kind} onChange={handleTabChange}>
                <Tab label="Cases by month" value="case" />
                <Tab label="Tasks by month" value="task" />
            </Tabs>
            {kind === 'case' ? <CaseTrendsPanel /> : <TaskTrendsPanel />}
        </Box>
    );
}

export default function TrendsPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <TrendsContent />
        </Suspense>
    );
}
