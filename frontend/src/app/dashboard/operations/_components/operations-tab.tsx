'use client';

import React from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import MetricCard from '../../../components/patterns/metric-card';
import type { DataColumn } from '../../../components/ui/data-table';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { humanizeIdentifier } from '../../../lib/format';
import DurationBaselines from './duration-baselines';
import { AnalyticsApiError, BreakdownItem, DataQualitySummary, DateRiskSummary, DocumentationSummary, DurationSummary, Envelope, getDataQuality, getDataQualitySummary, getDateRisk, getDateRiskSummary, getDocumentation, getDocumentationSummary, getDurations, getDurationsSummary, getWorkload, getWorkloadSummary, OperationRow, WorkloadSummary } from '../../../utils/analytics-api';
import { radius } from '../../../utils/theme';

export const OPERATION_TABS = [
    { key: 'workload', label: 'Workload', load: getWorkload, summary: getWorkloadSummary, columns: ['case_number', 'age_calendar_days', 'age_band', 'case_assignment_group'] },
    { key: 'risk', label: 'Date risk', load: getDateRisk, summary: getDateRiskSummary, columns: ['case_number', 'risk_status', 'risk_reference_type', 'risk_date', 'days_from_as_of'] },
    { key: 'duration', label: 'Duration', load: getDurations, summary: getDurationsSummary, columns: ['case_number', 'tat_calendar_days_derived', 'open_to_acd_calendar_days', 'acd_to_close_calendar_days', 'duration_data_quality_status'] },
    { key: 'documentation', label: 'Documentation', load: getDocumentation, summary: getDocumentationSummary, columns: ['case_number', 'documentation_status', 'description_present', 'closure_note_present', 'root_cause_present', 'resolution_present'] },
    { key: 'quality', label: 'Data quality', load: getDataQuality, summary: getDataQualitySummary, columns: ['field_name', 'total_record_count', 'populated_record_count', 'populated_rate', 'quality_status'] },
] as const;
export type OperationTab = typeof OPERATION_TABS[number];
type Summary = WorkloadSummary | DateRiskSummary | DurationSummary | DocumentationSummary | DataQualitySummary;
const PAGE_SIZE = 50;

const ageBandLabels: Record<string, string> = {
    '0_2': '0–2 days', '3_6': '3–6 days', '7_13': '7–13 days', '14_29': '14–29 days', '30_plus': '30+ days',
    not_applicable_closed: 'Not applicable (closed)', unknown: 'Unknown',
};
const columnLabels: Record<string, string> = {
    case_number: 'Case number', age_calendar_days: 'Age (calendar days)', age_band: 'Age band', case_assignment_group: 'Assignment group',
    tat_calendar_days_derived: 'Turnaround (calendar days)', open_to_acd_calendar_days: 'Open to ACD (calendar days)', acd_to_close_calendar_days: 'ACD to close (calendar days)',
    days_from_as_of: 'Days from week end', populated_rate: 'Populated (%)',
};

function display(value: OperationRow[string], column: string) {
    if (value === null || value === undefined) return '—';
    if (column === 'age_band' && typeof value === 'string') return ageBandLabels[value] ?? humanizeIdentifier(value);
    if (column === 'populated_rate' && typeof value === 'number') return `${Math.round(value * 100)}%`;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string' && /^[A-Z_]+$/.test(value)) return humanizeIdentifier(value.toLowerCase());
    return String(value);
}

export function BreakdownBars({ title, items }: { title: string; items: BreakdownItem[] }) {
    const max = Math.max(1, ...items.map((item) => item.count));
    return <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
        <Typography variant="h3" component="h2">{title}</Typography>
        {items.length === 0 && <Typography variant="body2" color="text.secondary">No records.</Typography>}
        {items.map((item) => <Box key={item.label}>
            <Stack direction="row" justifyContent="space-between" gap={2}><Typography variant="body2">{display(item.label, 'label')}</Typography><Typography variant="body2" fontWeight={700}>{item.count.toLocaleString()}</Typography></Stack>
            <Box aria-hidden sx={{ height: 8, bgcolor: 'action.hover', borderRadius: radius.field, mt: 0.5 }}><Box sx={{ width: `${(item.count / max) * 100}%`, height: '100%', borderRadius: radius.field, bgcolor: 'brand.chartSeries1' }} /></Box>
        </Box>)}
    </Brand.Card>;
}

function Metrics({ items }: { items: Array<[string, number | null]> }) {
    return <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr 1fr', md: `repeat(${items.length}, minmax(0, 1fr))` } }}>
        {items.map(([label, value]) => <MetricCard key={label} label={label} value={value} />)}
    </Box>;
}

function SummaryBlock({ tab, data }: { tab: OperationTab['key']; data: Summary | null }) {
    if (!data) return null;
    const pair = (left: React.ReactNode, right: React.ReactNode) => <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>{left}{right}</Box>;
    if (tab === 'workload' && 'age_band_counts' in data) return <><Metrics items={[['Open cases', data.open_case_count], ['Unknown age', data.unknown_age_count], ['Oldest valid age (days)', data.oldest_age_calendar_days], ['Filtered cases', data.total_case_count]]} />
        {pair(<BreakdownBars title="Open cases by age band" items={data.age_band_counts} />, <BreakdownBars title="Top assignment groups" items={data.assignment_group_counts} />)}</>;
    if (tab === 'risk' && 'risk_status_counts' in data) return <><Metrics items={[['Open cases', data.open_case_count], ['Overdue operational proxy', data.overdue_case_count], ['Cases with usable date', data.usable_risk_date_count], ['Filtered cases', data.total_case_count]]} />
        {pair(<BreakdownBars title="Cases by operational date status" items={data.risk_status_counts} />, <BreakdownBars title="Date reference used" items={data.risk_reference_type_counts} />)}</>;
    if (tab === 'duration' && 'quality_status_counts' in data && 'open_case_count' in data) return <><Metrics items={[['Filtered cases', data.total_case_count], ['Open cases', data.open_case_count]]} /><BreakdownBars title="Duration data-quality status" items={data.quality_status_counts} /></>;
    if (tab === 'documentation' && 'documentation_status_counts' in data) return <><Metrics items={[['Filtered cases', data.total_case_count], ['Closed cases', data.closed_case_count], ['Missing close note', data.missing_closure_note_count], ['Missing root cause', data.missing_root_cause_count]]} /><BreakdownBars title="Documentation field-presence status" items={data.documentation_status_counts} /></>;
    if (tab === 'quality' && 'lowest_populated_rate' in data) return <><Metrics items={[['Published fields', data.field_count], ['Lowest coverage (%)', data.lowest_populated_rate === null ? null : Math.round(data.lowest_populated_rate * 100)]]} /><BreakdownBars title="Data-quality status" items={data.quality_status_counts} /></>;
    return null;
}

export default function OperationsTab({ tab, onEnvelope }: { tab: OperationTab; onEnvelope?: (envelope: Envelope<unknown>) => void }) {
    const context = useAnalysisContext();
    const [envelope, setEnvelope] = React.useState<Envelope<OperationRow[]> | null>(null);
    const [summary, setSummary] = React.useState<Summary | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [cursors, setCursors] = React.useState<Array<string | undefined>>([undefined]);
    const [page, setPage] = React.useState(0);
    const [attempt, setAttempt] = React.useState(0);
    const { as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, assignment_group: assignmentGroup } = context;
    const cursor = cursors[page];

    React.useEffect(() => { setCursors([undefined]); setPage(0); }, [tab.key, asOfWeek, clientAccount, lineOfBusiness, assignmentGroup]);
    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        const filters = { as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, case_assignment_group: assignmentGroup };
        const listParams = tab.key === 'workload' ? { ...filters, is_open: 'true', sort: 'age_desc', limit: PAGE_SIZE, cursor } : { ...filters, limit: PAGE_SIZE, cursor };
        const summaryParams = tab.key === 'workload' ? { ...filters, is_open: 'true' } : filters;
        Promise.all([tab.load(listParams), tab.summary(summaryParams)])
            .then(([rows, totals]) => { if (!cancelled) { setEnvelope(rows); setSummary(totals.data); onEnvelope?.(rows); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Operations data could not be loaded.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [tab, asOfWeek, clientAccount, lineOfBusiness, assignmentGroup, cursor, attempt, onEnvelope]);

    if (loading && !envelope) return <Brand.StateView state="loading" title={`Loading ${tab.label.toLowerCase()}`} />;
    if (error) return <Brand.StateView state="error" title={`${tab.label} could not be loaded`} description={error} onRetry={() => setAttempt((value) => value + 1)} />;
    if (!envelope) return null;
    const columns: DataColumn<OperationRow>[] = tab.columns.map((column) => ({
        id: column,
        label: columnLabels[column] ?? humanizeIdentifier(column),
        align: typeof envelope.data[0]?.[column] === 'number' ? 'right' : undefined,
        render: (row: OperationRow) => column === 'case_number' && row.case_number ? <Link href={context.hrefWith(`/dashboard/cases/${encodeURIComponent(row.case_number)}`, { as_of_week: envelope.as_of_week })}>{row.case_number}</Link> : display(row[column], column),
    }));
    const total = summary && 'total_case_count' in summary ? summary.total_case_count : null;
    return <Box sx={{ display: 'grid', gap: 3 }}>
        <SummaryBlock tab={tab.key} data={summary} />
        {tab.key === 'duration' && <DurationBaselines />}
        <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="h3" component="h2">{tab.key === 'workload' ? 'Open cases by calendar-day age' : `${tab.label} records`}</Typography>
            <Typography variant="body2" color="text.secondary">{envelope.data[0]?.disclaimer ?? 'Direct snapshot values with the displayed data-quality status.'}</Typography>
            <Brand.DataTable rows={envelope.data} columns={columns} getRowId={(row) => String(row.case_number ?? row.field_name ?? JSON.stringify(row))} loading={loading} label={`${tab.label} records`} resultLabel="record" rowsPerPageOptions={[PAGE_SIZE]} initialRowsPerPage={PAGE_SIZE}
                emptyTitle="No matching records" emptyDescription="No records match this week and these filters." />
            {(page > 0 || envelope.next_cursor) && <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1}>
                <Typography variant="body2" color="text.secondary">Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + envelope.data.length}{total !== null ? ` of ${total.toLocaleString()}` : ''}</Typography>
                <Stack direction="row" gap={1}>
                    <Brand.Button variant="secondary" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>Previous</Brand.Button>
                    <Brand.Button variant="secondary" onClick={() => { setCursors((history) => [...history.slice(0, page + 1), envelope.next_cursor ?? undefined]); setPage((value) => value + 1); }} disabled={!envelope.next_cursor}>Next</Brand.Button>
                </Stack>
            </Stack>}
        </Box>
    </Box>;
}
