'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../components/ui';
import ContextBar from '../components/patterns/context-bar';
import MetricCard from '../components/patterns/metric-card';
import { useAnalysisContext } from '../lib/hooks/use-analysis-context';
import { AnalyticsApiError, Envelope, SummaryData, getSummary } from '../utils/analytics-api';
import { radius } from '../utils/theme';

const DESTINATIONS = [
    { title: 'Operations', description: 'Workload, ageing, date risk, and the monthly trend.', path: '/dashboard/operations' },
    { title: 'Recurring issues', description: 'Candidate themes and the cases behind them.', path: '/dashboard/recurring-issues' },
    { title: 'Ticket evidence', description: 'Look up a case and its evidence.', path: '/dashboard/ticket-evidence' },
    { title: 'Reports', description: 'Review and sign off generated reports.', path: '/dashboard/reports' },
];
const AWAITING = [
    { label: 'Risk and SLA', path: '/dashboard/risk-sla' },
    { label: 'Data readiness', path: '/dashboard/data-readiness' },
];

function Destination({ title, description, href }: { title: string; description: string; href: string }) {
    return <Box component={Link} href={href} aria-label={`${title}: ${description}`} sx={{ display: 'block', height: '100%', p: 2, border: 1, borderColor: 'divider', borderRadius: radius.card, textDecoration: 'none', color: 'text.primary', '&:hover': { borderColor: 'primary.main' }, '&:focus-visible': { outline: '2px solid', outlineColor: 'brand.hyperlink', outlineOffset: 2 } }}>
        <Typography variant="h3" component="span" sx={{ display: 'block', color: 'brand.hyperlink', textDecoration: 'underline' }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{description}</Typography>
    </Box>;
}

function MetricGroup({ title, scope, metrics }: { title: string; scope: string; metrics: Array<[string, number]> }) {
    return <Box component="section" aria-labelledby={`metrics-${title}`} sx={{ display: 'grid', gap: 1 }}>
        <Typography id={`metrics-${title}`} variant="h2">{title}</Typography>
        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {metrics.map(([label, value]) => <MetricCard key={label} label={label} value={value} scope={scope} />)}
        </Box>
    </Box>;
}

function OverviewContent() {
    const context = useAnalysisContext();
    const [envelope, setEnvelope] = React.useState<Envelope<SummaryData> | null>(null);
    const [error, setError] = React.useState<{ status: number; message: string } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [attempt, setAttempt] = React.useState(0);
    const { as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, assignment_group: assignmentGroup } = context;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getSummary({ as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, assignment_group: assignmentGroup })
            .then((data) => { if (!cancelled) setEnvelope(data); })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? { status: err.status, message: err.message } : { status: 0, message: 'The workload summary could not be loaded.' }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [asOfWeek, clientAccount, lineOfBusiness, assignmentGroup, attempt]);

    const data = envelope?.data;
    const scope = `in extract week ${envelope?.as_of_week ?? asOfWeek ?? ''}`;
    const empty = data && data.total_case_count === 0 && data.total_task_count === 0;
    const filtered = Boolean(clientAccount || lineOfBusiness || assignmentGroup);

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.PageHeader title="Overview" description="Current published workload for your selection, and where to look next."
            details={envelope ? [{ label: 'Source coverage', value: envelope.data.source_coverage_note }, { label: 'Logic version', value: envelope.logic_version }, { label: 'Data quality', value: envelope.data_quality_status }] : undefined} />
        <ContextBar freshness={envelope ? { asOfWeek: envelope.as_of_week, logicVersion: envelope.logic_version } : undefined} />

        {loading ? <Brand.StateView state="loading" title={`Loading workload${asOfWeek ? ` for week ${asOfWeek}` : ''}`} />
            : error ? (error.status === 404
                ? <Brand.StateView state="unavailable" title={asOfWeek ? `Week ${asOfWeek} is not published yet` : 'No published week yet'} description="Nothing is shown until the week is ready." action={asOfWeek ? <Brand.Button variant="secondary" onClick={() => context.set('as_of_week', null)}>Show the latest published week</Brand.Button> : undefined} />
                : <Brand.StateView state="error" title="Workload could not be loaded" description={error.message} onRetry={() => setAttempt((value) => value + 1)} />)
            : empty ? <Brand.StateView state="empty" title={`No cases or tasks match these filters in week ${envelope!.as_of_week}.`} action={filtered ? <Brand.Button variant="secondary" onClick={() => context.clear(['client_account', 'line_of_business', 'assignment_group'])}>Clear filters</Brand.Button> : undefined} />
            : data && <>
                <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                    <MetricGroup title="Cases" scope={scope} metrics={[['Total', data.total_case_count], ['Open', data.open_case_count], ['Closed', data.closed_case_count]]} />
                    <MetricGroup title="Tasks" scope={scope} metrics={[['Total', data.total_task_count], ['Open', data.open_task_count], ['Closed', data.closed_task_count]]} />
                </Box>
                <Typography variant="body2" color="text.secondary">Counts describe records in the selected extract week. They do not show week-to-week movement, causes, or service-level performance.</Typography>
            </>}

        <Box component="section" aria-labelledby="where-next" sx={{ display: 'grid', gap: 1.5 }}>
            <Typography id="where-next" variant="h2">Where to go next</Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' } }}>
                {DESTINATIONS.map((item) => <Destination key={item.path} title={item.title} description={item.description} href={context.hrefWith(item.path)} />)}
            </Box>
            <Stack direction="row" gap={1.5} alignItems="center" flexWrap="wrap">
                <Typography variant="body2">Not available yet:</Typography>
                {AWAITING.map((item) => <Stack key={item.path} direction="row" gap={1} alignItems="center"><Link href={context.hrefWith(item.path)}>{item.label}</Link><Brand.StatusBadge status="awaiting-source" /></Stack>)}
            </Stack>
        </Box>
    </Box>;
}

export default function DashboardPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading overview" />}><OverviewContent /></Suspense>;
}
