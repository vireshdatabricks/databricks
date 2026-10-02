'use client';

import React from 'react';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import type { DataColumn } from '../../../components/ui/data-table';
import { useAnalysisContext, type AnalysisContextKey } from '../../../lib/hooks/use-analysis-context';
import { AnalyticsApiError, CaseTrendItem, Envelope, getCaseTrends, getCaseTrendSeries, getTaskTrends, getTaskTrendSeries, MonthlyTrendPoint, MonthlyTrendSeries, TaskTrendItem } from '../../../utils/analytics-api';
import { radius } from '../../../utils/theme';

type Kind = 'case' | 'task';
type BreakdownRow = CaseTrendItem | TaskTrendItem;
/**
 * The one supported-parameter matrix (reference/50 §4.3). Names match the former /dashboard/trends
 * URLs. A parameter not listed for the current kind stays in the URL but is neither sent nor shown.
 * `field` is the breakdown-row column that supplies the select's values.
 */
export const TREND_FILTERS: Record<Kind, Array<{ key: AnalysisContextKey; label: string; field: string }>> = {
    case: [
        { key: 'client_account', label: 'Client', field: 'client_account' },
        { key: 'category', label: 'Category', field: 'category' },
        { key: 'case_type', label: 'Case type', field: 'case_type' },
        { key: 'subtype', label: 'Subtype', field: 'subtype' },
        { key: 'root_cause', label: 'Root cause', field: 'root_cause' },
    ],
    task: [
        { key: 'assignment_group', label: 'Assignment group', field: 'task_assignment_group' },
        { key: 'state', label: 'State', field: 'task_state' },
        { key: 'category', label: 'Category', field: 'task_category' },
        { key: 'type', label: 'Type', field: 'task_type' },
        { key: 'subtype', label: 'Subtype', field: 'task_subtype' },
    ],
};
const PAGE = 100;

function monthLabel(value: string) {
    const match = /^(\d{4})-(\d{2})/.exec(value);
    if (!match) return value;
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}
function niceMax(value: number) {
    if (value <= 5) return 5;
    const step = 10 ** Math.floor(Math.log10(value));
    return Math.ceil(value / step) * step;
}
// Rounded data-end (top), square at the zero baseline.
function barPath(x: number, y: number, width: number, height: number) {
    if (height <= 0) return '';
    const r = Math.min(4, width / 2, height);
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function TrendChart({ series, entity }: { series: MonthlyTrendSeries; entity: string }) {
    const [hover, setHover] = React.useState<number | null>(null);
    const points = series.points;
    const width = Math.max(560, points.length * 44);
    const height = 240;
    const margin = { top: 12, right: 12, bottom: 28, left: 44 };
    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const max = niceMax(Math.max(1, ...points.flatMap((point) => [point.opened_count, point.closed_count])));
    const band = plotW / Math.max(1, points.length);
    const barW = Math.max(4, Math.min(16, (band - 10) / 2));
    const y = (value: number) => margin.top + plotH - (value / max) * plotH;
    const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
    const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 64)));
    const top = points.reduce<MonthlyTrendPoint | null>((best, point) => !best || point.opened_count > best.opened_count ? point : best, null);
    const hovered = hover !== null ? points[hover] : null;
    return <Box sx={{ display: 'grid', gap: 1 }}>
        <Stack direction="row" gap={2} flexWrap="wrap" aria-hidden>
            {[['Opened', 'brand.chartSeries1'], ['Closed', 'brand.chartSeries2']].map(([label, color]) => <Stack key={label} direction="row" gap={1} alignItems="center"><Box sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: color }} /><Typography variant="body2">{label}</Typography></Stack>)}
        </Stack>
        <Typography variant="body2" color="text.secondary">
            {top ? `Highest opened month: ${monthLabel(top.report_month)} (${top.opened_count.toLocaleString()} ${entity}). ` : ''}
            Totals: {series.total_opened_count.toLocaleString()} opened, {series.total_closed_count.toLocaleString()} closed over {series.month_count} months.
        </Typography>
        <Box sx={{ position: 'relative', overflowX: 'auto' }} onMouseLeave={() => setHover(null)}>
            <Box component="svg" aria-hidden viewBox={`0 0 ${width} ${height}`} sx={{ width: '100%', minWidth: width * 0.75, height: 'auto', display: 'block', color: 'text.secondary' }}>
                {ticks.map((tick) => <g key={tick}>
                    <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity={tick === 0 ? 0.6 : 0.15} strokeWidth={1} />
                    <text x={margin.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={11} fill="currentColor">{Math.round(tick).toLocaleString()}</text>
                </g>)}
                {points.map((point, index) => {
                    const cx = margin.left + band * index + band / 2;
                    return <g key={point.report_month}>
                        {hover === index && <rect x={cx - band / 2} y={margin.top} width={band} height={plotH} fill="currentColor" fillOpacity={0.06} />}
                        <Box component="path" d={barPath(cx - barW - 1, y(point.opened_count), barW, y(0) - y(point.opened_count))} sx={{ fill: (theme) => theme.palette.brand.chartSeries1 }} />
                        <Box component="path" d={barPath(cx + 1, y(point.closed_count), barW, y(0) - y(point.closed_count))} sx={{ fill: (theme) => theme.palette.brand.chartSeries2 }} />
                        {index % labelEvery === 0 && <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="currentColor">{monthLabel(point.report_month)}</text>}
                        <rect x={cx - band / 2} y={margin.top} width={band} height={plotH} fill="transparent" onMouseEnter={() => setHover(index)} />
                    </g>;
                })}
            </Box>
            {hovered && hover !== null && <Box role="presentation" sx={{ position: 'absolute', top: 8, left: `${((margin.left + band * hover + band / 2) / width) * 100}%`, transform: hover > points.length / 2 ? 'translateX(-105%)' : 'translateX(5%)', pointerEvents: 'none', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: radius.card, boxShadow: 2, px: 1.5, py: 1, minWidth: 140 }}>
                <Typography variant="label" component="p">{monthLabel(hovered.report_month)}</Typography>
                <Typography variant="body2">Opened: {hovered.opened_count.toLocaleString()}</Typography>
                <Typography variant="body2">Closed: {hovered.closed_count.toLocaleString()}</Typography>
                <Typography variant="body2">Net: {(hovered.opened_count - hovered.closed_count).toLocaleString()}</Typography>
            </Box>}
        </Box>
    </Box>;
}

export default function MonthlyTrendTab() {
    const context = useAnalysisContext();
    const kind: Kind = context.kind === 'task' ? 'task' : 'case';
    const entity = kind === 'case' ? 'cases' : 'tasks';
    const active = TREND_FILTERS[kind];
    const filterValues = Object.fromEntries(active.map(({ key }) => [key, context[key]]));
    const filterKey = JSON.stringify(filterValues);
    const [view, setView] = React.useState<'chart' | 'table'>('chart');
    const [series, setSeries] = React.useState<Envelope<MonthlyTrendSeries> | null>(null);
    const [rows, setRows] = React.useState<BreakdownRow[]>([]);
    const [cursor, setCursor] = React.useState<string | null | undefined>();
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [attempt, setAttempt] = React.useState(0);
    const asOfWeek = context.as_of_week;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        const params = { as_of_week: asOfWeek, ...JSON.parse(filterKey) as Record<string, string | undefined> };
        const seriesLoad = kind === 'case' ? getCaseTrendSeries(params) : getTaskTrendSeries(params);
        const rowsLoad: Promise<Envelope<BreakdownRow[]>> = kind === 'case' ? getCaseTrends({ ...params, limit: PAGE }) : getTaskTrends({ ...params, limit: PAGE });
        Promise.all([seriesLoad, rowsLoad])
            .then(([seriesResult, rowResult]) => { if (!cancelled) { setSeries(seriesResult); setRows(rowResult.data); setCursor(rowResult.next_cursor); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : `The monthly ${kind} trend could not be loaded.`); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [kind, asOfWeek, filterKey, attempt]);

    const loadMore = () => {
        if (!cursor) return;
        const params = { as_of_week: asOfWeek, ...JSON.parse(filterKey) as Record<string, string | undefined>, limit: PAGE, cursor };
        const next: Promise<Envelope<BreakdownRow[]>> = kind === 'case' ? getCaseTrends(params) : getTaskTrends(params);
        next.then((result) => { setRows((current) => [...current, ...result.data]); setCursor(result.next_cursor); })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'More rows could not be loaded.'));
    };

    const applied = active.filter(({ key }) => context[key]);
    const optionsFor = (field: string, current?: string) => {
        const values = new Set(rows.map((row) => (row as unknown as Record<string, unknown>)[field]).filter((value): value is string => typeof value === 'string' && value !== ''));
        if (current) values.add(current);
        return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    };
    const points = series?.data.points ?? [];
    const monthColumns: DataColumn<MonthlyTrendPoint>[] = [
        { id: 'report_month', label: 'Month', sortable: true, value: (row) => row.report_month, render: (row) => monthLabel(row.report_month) },
        { id: 'opened_count', label: 'Opened', align: 'right', sortable: true, value: (row) => row.opened_count, render: (row) => row.opened_count.toLocaleString() },
        { id: 'closed_count', label: 'Closed', align: 'right', sortable: true, value: (row) => row.closed_count, render: (row) => row.closed_count.toLocaleString() },
        { id: 'net', label: 'Net', align: 'right', sortable: true, value: (row) => row.opened_count - row.closed_count, render: (row) => { const net = row.opened_count - row.closed_count; return `${net > 0 ? '+' : ''}${net.toLocaleString()}`; } },
    ];
    const breakdownColumns: DataColumn<BreakdownRow>[] = [
        { id: 'report_month', label: 'Month', render: (row) => monthLabel(row.report_month) },
        ...active.map(({ label, field }) => ({ id: field, label, value: (row: BreakdownRow) => ((row as unknown as Record<string, unknown>)[field] as string | null) ?? '—' })),
        { id: 'opened', label: 'Opened', align: 'right' as const, value: (row: BreakdownRow) => 'opened_case_count' in row ? row.opened_case_count : row.opened_task_count },
        { id: 'closed', label: 'Closed', align: 'right' as const, value: (row: BreakdownRow) => 'closed_case_count' in row ? row.closed_case_count : row.closed_task_count },
        { id: 'tat', label: 'Average closed duration (business days)', align: 'right' as const, value: (row: BreakdownRow) => ('closed_case_tat_business_days_avg' in row ? row.closed_case_tat_business_days_avg : row.closed_task_tat_business_days_avg) ?? '—' },
    ];

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.SegmentedControl label="Show" options={[{ value: 'case', label: 'Cases' }, { value: 'task', label: 'Tasks' }]} value={kind} onChange={(value) => context.set('kind', value === 'case' ? null : value)} />
        <Box component="form" aria-label={`${kind === 'case' ? 'Case' : 'Task'} filters`} onSubmit={(event) => event.preventDefault()} sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: `repeat(${active.length}, minmax(0, 1fr))` } }}>
            {active.map(({ key, label, field }) => <Brand.Field key={key} label={label} kind="select" value={context[key] ?? ''} onChange={(event) => context.set(key, String(event.target.value) || null)} options={[{ value: '', label: 'All' }, ...optionsFor(field, context[key]).map((value) => ({ value, label: value }))]} />)}
        </Box>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" color="text.secondary">{applied.length ? `Filtered by ${applied.map(({ key, label }) => `${label}: ${context[key]}`).join(', ')}` : 'No filters applied'}</Typography>
            {applied.length > 0 && <Brand.Button variant="tertiary" size="compact" onClick={() => context.clear(active.map(({ key }) => key))}>Clear filters</Brand.Button>}
        </Stack>
        {loading ? <Brand.StateView state="loading" title={`Loading monthly ${entity}`} />
            : error ? <Brand.StateView state="error" title={`The monthly ${kind} trend could not be loaded`} description={error} onRetry={() => setAttempt((value) => value + 1)} />
            : !points.length ? <Brand.StateView state="empty" title={`No ${entity} opened or closed in this selection.`} />
            : <>
                <Box component="section" aria-labelledby="monthly-trend-title" sx={{ display: 'grid', gap: 1.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
                        <Typography id="monthly-trend-title" variant="h2">Opened and closed {entity} by month</Typography>
                        <Brand.Button variant="secondary" size="compact" onClick={() => setView((value) => value === 'chart' ? 'table' : 'chart')}>{view === 'chart' ? 'View as table' : 'View as chart'}</Brand.Button>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">Records grouped by the month they were opened or closed, within extract week {series?.as_of_week}. This is a date breakdown, not week-to-week movement.</Typography>
                    {view === 'chart' && series && <TrendChart series={series.data} entity={entity} />}
                    <Box sx={view === 'chart' ? { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' } : undefined}>
                        <Brand.DataTable rows={points} columns={monthColumns} getRowId={(row) => row.report_month} label={`Opened and closed ${entity} by month`} resultLabel="month" rowsPerPageOptions={[24, 60]} initialRowsPerPage={24} />
                    </Box>
                </Box>
                <Brand.Disclosure title={`Breakdown by month and ${kind === 'case' ? 'case' : 'task'} attributes`}>
                    <Box sx={{ display: 'grid', gap: 1.5 }}>
                        <Brand.DataTable rows={rows} columns={breakdownColumns} getRowId={(row) => JSON.stringify(row)} label="Monthly breakdown" resultLabel="row" rowsPerPageOptions={[25, 50, 100]} initialRowsPerPage={25} bordered={false} />
                        {cursor && <Brand.Button variant="secondary" onClick={loadMore} sx={{ justifySelf: 'start' }}>Load more rows</Brand.Button>}
                    </Box>
                </Brand.Disclosure>
            </>}
    </Box>;
}
