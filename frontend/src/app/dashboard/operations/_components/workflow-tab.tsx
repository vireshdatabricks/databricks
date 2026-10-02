'use client';

import React from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import BaselineTable from '../../../components/patterns/baseline-table';
import MetricTile from '../../../components/patterns/metric-tile';
import type { DataColumn } from '../../../components/ui/data-table';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { AnalyticsApiError, Baselines, Envelope, ReopenSummary, WorkflowRow, WorkflowSummary, getBaselines, getReopens, getWorkflow, getWorkflowSummary } from '../../../utils/analytics-api';
import { formatDate } from '../../../lib/format';
import { BreakdownBars } from './operations-tab';

const PAGE_SIZE = 50;
const BASELINE_NAMES = { 'WF-01': 'Time to first task (hours)', 'WF-06': 'Longest gap with no open task (days)', 'WF-07': 'Cross-team handoffs' };
const SORTS = [{ value: 'handoffs', label: 'Most handoffs' }, { value: 'gap', label: 'Longest gap' }, { value: 'first_task', label: 'Slowest first task' }];
const FLAG_LABELS: Record<string, string> = { NORMAL: 'Normal', LIKELY_AUTOMATIC: 'Likely automatic', NO_TASK: 'No task', TASK_BEFORE_CASE: 'Task before case' };
const number = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? '—' : Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });

/** Operations → Workflow (reference/51 §6): WF-01, WF-06, WF-07 proxies, WF-08 reopens, WF-02 not available. */
export default function WorkflowTab() {
    const context = useAnalysisContext();
    const [summary, setSummary] = React.useState<Envelope<WorkflowSummary> | null>(null);
    const [baselines, setBaselines] = React.useState<Baselines | null>(null);
    const [reopens, setReopens] = React.useState<ReopenSummary | null>(null);
    const [rows, setRows] = React.useState<Envelope<WorkflowRow[]> | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [sort, setSort] = React.useState('handoffs');
    const [cursors, setCursors] = React.useState<Array<string | undefined>>([undefined]);
    const [page, setPage] = React.useState(0);
    const [attempt, setAttempt] = React.useState(0);
    const { as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, assignment_group: assignmentGroup } = context;
    const filters = React.useMemo(() => ({ as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, case_assignment_group: assignmentGroup }), [asOfWeek, clientAccount, lineOfBusiness, assignmentGroup]);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null); setCursors([undefined]); setPage(0);
        Promise.all([getWorkflowSummary(filters), getBaselines(Object.keys(BASELINE_NAMES), filters), getReopens({ as_of_week: asOfWeek, client_account: clientAccount })])
            .then(([summaryResult, baselineResult, reopenResult]) => { if (!cancelled) { setSummary(summaryResult); setBaselines(baselineResult.data); setReopens(reopenResult.data); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Workflow measures could not be loaded.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filters, asOfWeek, clientAccount, attempt]);

    const cursor = cursors[page];
    React.useEffect(() => {
        let cancelled = false;
        getWorkflow({ ...filters, sort, limit: PAGE_SIZE, cursor }).then((result) => { if (!cancelled) setRows(result); }).catch(() => { if (!cancelled) setRows(null); });
        return () => { cancelled = true; };
    }, [filters, sort, cursor]);

    if (loading && !summary) return <Brand.StateView state="loading" title="Loading workflow measures" />;
    if (error) return <Brand.StateView state="error" title="Workflow measures could not be loaded" description={error} onRetry={() => setAttempt((value) => value + 1)} />;
    if (!summary) return null;
    const data = summary.data;
    const definitions = data.definitions;
    if (data.case_count === 0) return <Brand.StateView state="empty" title="No cases match this selection" description="Change the week or clear filters." />;

    const columns: DataColumn<WorkflowRow>[] = [
        { id: 'case_number', label: 'Case', render: (row) => row.case_number ? <Link href={context.hrefWith(`/dashboard/cases/${encodeURIComponent(row.case_number)}`, { as_of_week: summary.as_of_week })}>{row.case_number}</Link> : '—' },
        { id: 'client_account', label: 'Client' },
        { id: 'opened_at', label: 'Opened', value: (row) => formatDate(row.opened_at as string) },
        { id: 'first', label: 'First task (hours)', align: 'right', render: (row) => <>{number(row.time_to_first_task_hours)}{row.first_task_flag !== 'NORMAL' ? <Typography component="span" variant="body2" color="text.secondary"> · {FLAG_LABELS[row.first_task_flag] ?? row.first_task_flag}</Typography> : null}</> },
        { id: 'handoff_count', label: 'Handoffs', align: 'right' },
        { id: 'task_group_path', label: 'Team path', minWidth: 240 },
        { id: 'gap', label: 'Longest gap (days)', align: 'right', value: (row) => row.gap_observable ? number(row.gap_longest_days) : 'Not observable' },
    ];
    const reopenTile = reopens?.status === 'AVAILABLE'
        ? <MetricTile title="Reopens seen between weekly extracts" label="DIRECT" definition={definitions['WF-08']} value={reopens.rate === null ? '—' : `${(reopens.rate * 100).toFixed(1)}%`} detail={`${reopens.reopened_count} of ${reopens.closed_in_prior_extract} cases closed in the ${reopens.prior_extract_week} extract. Tracked since ${reopens.observation_starts_after}.`} />
        : <MetricTile title="Reopens seen between weekly extracts" label="NOT_AVAILABLE" definition={definitions['WF-08']} reason={reopens?.status === 'NOT_AVAILABLE' ? `${reopens.reason} Tracking starts with the extract after ${reopens.observation_starts_after}.` : undefined} />;

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Typography variant="body2" color="text.secondary">Substitute measures from task open and close times in the weekly snapshot. They are not first-response, assignment or activity history; each tile says what it measures.</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            <MetricTile title="Time to first task" label="PROXY" definition={definitions['WF-01']} value={`${number(data.first_task_median_hours)} h`}
                detail={`Median of ${data.first_task_normal_count.toLocaleString()} cases; 90th percentile ${number(data.first_task_p90_hours)} h. ${data.first_task_automatic_count.toLocaleString()} cases with a first task within 10 minutes are reported separately as likely automatic.`} />
            <MetricTile title="Cross-team handoffs" label="PROXY" definition={definitions['WF-07']} value={data.excessive_handoff_count.toLocaleString()}
                detail={`Cases with 3 or more handoffs between task teams, of ${data.cases_with_tasks.toLocaleString()} with tasks. Median ${number(data.handoff_median, 0)} handoffs.`} />
            <MetricTile title="Gaps with no open task" label="PROXY" definition={definitions['WF-06']} value={data.cases_with_counted_gap.toLocaleString()}
                detail={`Cases with a gap longer than ${number(data.gap_threshold_days, 0)} days, of ${data.gap_observable_count.toLocaleString()} observable. Median longest gap ${number(data.longest_gap_median_days)} days.`} />
            {reopenTile}
            <MetricTile title="Open to assignment" label="NOT_AVAILABLE" definition={definitions['WF-02']} />
            <MetricTile title="Targets" label="NOT_AVAILABLE" definition={definitions['WF-13']} reason="No target set. Targets are business-owned and not yet approved." />
        </Box>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            <BreakdownBars title="Time to first task" items={data.first_task_bands} />
            <BreakdownBars title="Handoffs per case" items={data.handoff_bands} />
            <BreakdownBars title="Longest gap per case" items={data.longest_gap_bands} />
        </Box>
        {baselines && <BaselineTable baselines={baselines} names={BASELINE_NAMES} title="Workflow baselines" />}
        <Box component="section" aria-labelledby="workflow-cases" sx={{ display: 'grid', gap: 1 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'flex-end' }}>
                <Typography id="workflow-cases" variant="h3" component="h2">Cases</Typography>
                <Box sx={{ minWidth: 220 }}><Brand.Field label="Sort by" kind="select" value={sort} onChange={(event) => { setSort(String(event.target.value)); setCursors([undefined]); setPage(0); }} options={SORTS} /></Box>
            </Stack>
            <Brand.DataTable rows={rows?.data ?? []} columns={columns} getRowId={(row) => String(row.case_number)} loading={!rows} label="Workflow cases" resultLabel="case" rowsPerPageOptions={[PAGE_SIZE]} initialRowsPerPage={PAGE_SIZE} emptyTitle="No cases" emptyDescription="No cases match this selection." />
            {rows && (page > 0 || rows.next_cursor) && <Stack direction="row" gap={1} justifyContent="flex-end">
                <Brand.Button variant="secondary" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</Brand.Button>
                <Brand.Button variant="secondary" disabled={!rows.next_cursor} onClick={() => { setCursors((history) => [...history.slice(0, page + 1), rows.next_cursor ?? undefined]); setPage((value) => value + 1); }}>Next</Brand.Button>
            </Stack>}
        </Box>
    </Box>;
}
