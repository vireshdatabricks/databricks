'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { Box, Button, Grid, Tab, Tabs, Typography } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import * as Brand from '../../components/ui';
import FreshnessBanner from '../components/freshness-banner';
import WeekSelect from '../components/week-select';
import { AnalyticsApiError, BreakdownItem, DataQualitySummary, DateRiskSummary, DocumentationSummary, DurationSummary, Envelope, getDataQuality, getDataQualitySummary, getDateRisk, getDateRiskSummary, getDocumentation, getDocumentationSummary, getDurations, getDurationsSummary, getWorkload, getWorkloadSummary, OperationRow, WorkloadSummary } from '../../utils/analytics-api';

const tabs = [
    { key: 'workload', label: 'Workload', load: getWorkload, columns: ['case_number', 'age_calendar_days', 'age_band', 'case_assignment_group'] },
    { key: 'risk', label: 'Date risk', load: getDateRisk, columns: ['case_number', 'risk_status', 'risk_reference_type', 'risk_date', 'days_from_as_of'] },
    { key: 'duration', label: 'Duration', load: getDurations, columns: ['case_number', 'tat_calendar_days_derived', 'open_to_acd_calendar_days', 'acd_to_close_calendar_days', 'duration_data_quality_status'] },
    { key: 'documentation', label: 'Documentation', load: getDocumentation, columns: ['case_number', 'documentation_status', 'description_present', 'closure_note_present', 'root_cause_present', 'resolution_present'] },
    { key: 'quality', label: 'Data quality', load: getDataQuality, columns: ['field_name', 'total_record_count', 'populated_record_count', 'populated_rate', 'quality_status'] },
] as const;

const ageBandLabels: Record<string, string> = {
    '0_2': '0–2 days',
    '3_6': '3–6 days',
    '7_13': '7–13 days',
    '14_29': '14–29 days',
    '30_plus': '30+ days',
    'not_applicable_closed': 'Not applicable (closed)',
    unknown: 'Unknown',
};

const columnLabels: Record<string, string> = {
    case_number: 'Case number',
    age_calendar_days: 'Age (calendar days)',
    age_band: 'Age band',
    case_assignment_group: 'Assignment group',
};

function format(value: OperationRow[string], column?: string) {
    if (value === null || value === undefined) return '—';
    if (column === 'age_band' && typeof value === 'string') return ageBandLabels[value] ?? value.replaceAll('_', ' ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function Metric({ label, value }: { label: string; value: number | null }) {
    return <Grid item xs={6} md={3}><Brand.Card bordered="outlined" sx={{ height: '100%' }}>
        <Typography variant="h5">{value === null ? '—' : value.toLocaleString()}</Typography>
        <Typography variant="body2">{label}</Typography>
    </Brand.Card></Grid>;
}

function BreakdownBars({ title, items }: { title: string; items: BreakdownItem[] }) {
    const max = Math.max(1, ...items.map((item) => item.count));
    return <Brand.Card bordered="outlined"><Typography variant="h6" sx={{ mb: 2 }}>{title}</Typography>
        <Box sx={{ display: 'grid', gap: 1.25 }}>
            {items.map((item) => <Box key={item.label}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}><Typography variant="body2">{item.label}</Typography><Typography variant="body2" fontWeight={600}>{item.count.toLocaleString()}</Typography></Box>
                <Box aria-label={`${item.label}: ${item.count}`} sx={{ height: 8, backgroundColor: 'action.hover', borderRadius: 4, mt: 0.5 }}><Box sx={{ width: `${(item.count / max) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: 'primary.main' }} /></Box>
            </Box>)}
        </Box>
    </Brand.Card>;
}

function OperationsSummary({ tabKey, data }: { tabKey: string; data: WorkloadSummary | DateRiskSummary | DurationSummary | DocumentationSummary | DataQualitySummary | null }) {
    if (!data) return null;
    if (tabKey === 'workload' && 'age_band_counts' in data) return <>
        <Grid container spacing={2}><Metric label="Open cases" value={data.open_case_count} /><Metric label="Unknown age" value={data.unknown_age_count} /><Metric label="Oldest valid age (days)" value={data.oldest_age_calendar_days} /><Metric label="Filtered cases" value={data.total_case_count} /></Grid>
        <Grid container spacing={2}><Grid item xs={12} md={6}><BreakdownBars title="Open cases by age band" items={data.age_band_counts} /></Grid><Grid item xs={12} md={6}><BreakdownBars title="Top assignment groups" items={data.assignment_group_counts} /></Grid></Grid>
    </>;
    if (tabKey === 'risk' && 'risk_status_counts' in data) return <>
        <Grid container spacing={2}><Metric label="Open cases" value={data.open_case_count} /><Metric label="Overdue operational proxy" value={data.overdue_case_count} /><Metric label="Cases with usable date" value={data.usable_risk_date_count} /><Metric label="Filtered cases" value={data.total_case_count} /></Grid>
        <Grid container spacing={2}><Grid item xs={12} md={6}><BreakdownBars title="Cases by operational date status" items={data.risk_status_counts} /></Grid><Grid item xs={12} md={6}><BreakdownBars title="Date reference used" items={data.risk_reference_type_counts} /></Grid></Grid>
    </>;
    if (tabKey === 'duration' && 'quality_status_counts' in data && 'open_case_count' in data) return <><Grid container spacing={2}><Metric label="Filtered cases" value={data.total_case_count} /><Metric label="Open cases" value={data.open_case_count} /></Grid><BreakdownBars title="Duration data-quality status" items={data.quality_status_counts} /></>;
    if (tabKey === 'documentation' && 'documentation_status_counts' in data) return <><Grid container spacing={2}><Metric label="Filtered cases" value={data.total_case_count} /><Metric label="Closed cases" value={data.closed_case_count} /><Metric label="Missing close note" value={data.missing_closure_note_count} /><Metric label="Missing root cause" value={data.missing_root_cause_count} /></Grid><BreakdownBars title="Documentation field-presence status" items={data.documentation_status_counts} /></>;
    if (tabKey === 'quality' && 'lowest_populated_rate' in data) return <><Grid container spacing={2}><Metric label="Published fields" value={data.field_count} /><Metric label="Lowest coverage (%)" value={data.lowest_populated_rate === null ? null : Math.round(data.lowest_populated_rate * 100)} /></Grid><BreakdownBars title="Data-quality status" items={data.quality_status_counts} /></>;
    return null;
}

function OperationsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const tabKey = searchParams.get('tab') ?? 'workload';
    const active = tabs.find((tab) => tab.key === tabKey) ?? tabs[0];
    const [envelope, setEnvelope] = React.useState<Envelope<OperationRow[]> | null>(null);
    const [summary, setSummary] = React.useState<WorkloadSummary | DateRiskSummary | DurationSummary | DocumentationSummary | DataQualitySummary | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [cursorHistory, setCursorHistory] = React.useState<Array<string | undefined>>([undefined]);
    const [pageIndex, setPageIndex] = React.useState(0);
    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const currentCursor = cursorHistory[pageIndex];

    React.useEffect(() => {
        setCursorHistory([undefined]);
        setPageIndex(0);
    }, [active.key, asOfWeek]);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        const summaries = { workload: getWorkloadSummary, risk: getDateRiskSummary, duration: getDurationsSummary, documentation: getDocumentationSummary, quality: getDataQualitySummary } as const;
        const summaryLoad = summaries[active.key as keyof typeof summaries];
        const workloadParams = active.key === 'workload'
            ? { as_of_week: asOfWeek, is_open: 'true', sort: 'age_desc', limit: 50, cursor: currentCursor }
            : { as_of_week: asOfWeek, limit: 50 };
        const summaryParams = active.key === 'workload' ? { as_of_week: asOfWeek, is_open: 'true' } : { as_of_week: asOfWeek };
        Promise.all([active.load(workloadParams), summaryLoad ? summaryLoad(summaryParams) : Promise.resolve(null)])
            .then(([result, summaryResult]) => { if (!cancelled) { setEnvelope(result); setSummary(summaryResult?.data ?? null); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load Operations data.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [active, asOfWeek, currentCursor]);

    const changeTab = (_event: React.SyntheticEvent, key: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', key); params.delete('cursor');
        setCursorHistory([undefined]);
        setPageIndex(0);
        router.push(`${pathname}?${params.toString()}`);
    };

    const nextPage = () => {
        if (!envelope?.next_cursor) return;
        setCursorHistory((history) => [...history.slice(0, pageIndex + 1), envelope.next_cursor]);
        setPageIndex((index) => index + 1);
    };

    const previousPage = () => setPageIndex((index) => Math.max(0, index - 1));

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Typography variant="h4" component="h1">Operations</Typography>
        <Box sx={{ minWidth: 220 }}><WeekSelect /></Box>
        <Tabs value={active.key} onChange={changeTab} variant="scrollable" scrollButtons="auto" aria-label="Operations analysis tabs">
            {tabs.map((tab) => <Tab key={tab.key} value={tab.key} label={tab.label} />)}
        </Tabs>
        {loading && <Typography>Loading…</Typography>}
        {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}
        {envelope && !loading && <>
            <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
            <OperationsSummary tabKey={active.key} data={summary} />
            <Brand.Card bordered="outlined">
                {active.key === 'workload' && <Typography variant="h6" sx={{ mb: 0.5 }}>Open cases by calendar-day age</Typography>}
                <Typography variant="body2" sx={{ mb: 2 }}>{envelope.data[0]?.disclaimer ?? 'Direct snapshot values with the displayed data-quality status.'}</Typography>
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { textAlign: 'left', p: 1, borderBottom: '1px solid', borderColor: 'divider', verticalAlign: 'top' } }}>
                    <thead><tr>{active.columns.map((column) => <th key={column}>{columnLabels[column] ?? column.replaceAll('_', ' ')}</th>)}</tr></thead>
                    <tbody>{envelope.data.map((row, index) => <tr key={`${row.case_number ?? row.field_name ?? 'row'}-${index}`}>{active.columns.map((column) => <td key={column}>{column === 'case_number' && row.case_number ? <Link href={`/dashboard/cases/${encodeURIComponent(row.case_number)}?as_of_week=${encodeURIComponent(envelope.as_of_week)}`}>{row.case_number}</Link> : format(row[column], column)}</td>)}</tr>)}</tbody>
                </Box>
                {envelope.data.length === 0 && <Typography>No matching records for this extract week.</Typography>}
                {active.key === 'workload' && summary && <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2, flexWrap: 'wrap' }}>
                    <Typography variant="body2" color="text.secondary">
                        Showing {envelope.data.length ? pageIndex * 50 + 1 : 0}–{pageIndex * 50 + envelope.data.length} of {summary.total_case_count.toLocaleString()} matching open cases
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="outlined" onClick={previousPage} disabled={pageIndex === 0}>Previous</Button>
                        <Button variant="contained" onClick={nextPage} disabled={!envelope.next_cursor}>Next</Button>
                    </Box>
                </Box>}
            </Brand.Card>
        </>}
    </Box>;
}

export default function OperationsPage() {
    return <Suspense fallback={<Typography>Loading…</Typography>}><OperationsContent /></Suspense>;
}
