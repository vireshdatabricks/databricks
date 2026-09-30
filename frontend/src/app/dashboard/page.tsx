'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Box, Grid, Typography } from '@mui/material';

import * as Brand from '../components/ui';
import { AnalyticsApiError, Envelope, SummaryData, getSummary } from '../utils/analytics-api';
import FreshnessBanner from './components/freshness-banner';
import MetricAvailability, { dashboardMetrics } from './components/metric-availability';
import WeekSelect from './components/week-select';

function Metric({ label, value }: { label: string; value: number }) {
    return <Grid item xs={6} sm={3}>
        <Brand.Card bordered="outlined" sx={{ height: '100%' }}>
            <Typography variant="h4">{value.toLocaleString()}</Typography>
            <Typography variant="body2" color="text.secondary">{label}</Typography>
        </Brand.Card>
    </Grid>;
}

function ReviewCard({ title, description, href }: { title: string; description: string; href: string }) {
    return <Grid item xs={12} sm={6}>
        <Brand.Card bordered="outlined" sx={{ height: '100%' }}>
            <Typography variant="h6" component={Link} href={href} sx={{ color: 'primary.main', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                {title}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{description}</Typography>
        </Brand.Card>
    </Grid>;
}

function DashboardContent() {
    const searchParams = useSearchParams();
    const [envelope, setEnvelope] = React.useState<Envelope<SummaryData> | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const clientAccount = searchParams.get('client_account') ?? undefined;
    const lineOfBusiness = searchParams.get('line_of_business') ?? undefined;
    const assignmentGroup = searchParams.get('assignment_group') ?? undefined;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getSummary({ as_of_week: asOfWeek, client_account: clientAccount, line_of_business: lineOfBusiness, assignment_group: assignmentGroup })
            .then((data) => { if (!cancelled) setEnvelope(data); })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load the snapshot overview.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [asOfWeek, clientAccount, lineOfBusiness, assignmentGroup]);

    const hrefFor = (path: string, tab?: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (tab) params.set('tab', tab);
        const query = params.toString();
        return `${path}${query ? `?${query}` : ''}`;
    };

    return <Box component="main" sx={{ display: 'grid', gap: 3 }}>
        <Box>
            <Typography variant="h4" component="h1">Snapshot overview</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
                Start with the current published workload, then choose an area to review.
            </Typography>
        </Box>

        <Box sx={{ minWidth: 220, justifySelf: 'start' }}><WeekSelect /></Box>

        {loading && <Typography role="status">Loading snapshot summary…</Typography>}
        {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

        {envelope && !loading && <>
            <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
            <Brand.Card bordered="outlined" sx={{ backgroundColor: 'action.hover' }}>
                <Typography variant="subtitle1" fontWeight={600}>How to read this page</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Counts describe records in this selected extract-week snapshot. They do not show week-to-week movement, causes, or service-level performance.
                </Typography>
            </Brand.Card>

            <Box>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Workload in this snapshot</Typography>
                <Grid container spacing={2}>
                    <Metric label="Cases" value={envelope.data.total_case_count} />
                    <Metric label="Open cases" value={envelope.data.open_case_count} />
                    <Metric label="Tasks" value={envelope.data.total_task_count} />
                    <Metric label="Open tasks" value={envelope.data.open_task_count} />
                </Grid>
            </Box>

            <Box>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Dashboard sections</Typography>
                <Grid container spacing={2}>
                    <ReviewCard title="Operations Flow" description="Review workload, aging, operational dates, and available duration fields." href={hrefFor('/dashboard/operations', 'workload')} />
                    <ReviewCard title="Risk & SLA" description="Review source readiness for SLA and performance-guarantee measures." href={hrefFor('/dashboard/risk-sla')} />
                    <ReviewCard title="Recurring Issues" description="Explore current candidate themes and recurrence-measure readiness." href={hrefFor('/dashboard/recurring-issues')} />
                    <ReviewCard title="Insights Review" description="Review candidate findings and the planned validation measures." href={hrefFor('/dashboard/insights-review')} />
                    <ReviewCard title="Ticket Evidence" description="Open ticket details and inspect evidence currently available from the extracts." href={hrefFor('/dashboard/ticket-evidence')} />
                    <ReviewCard title="Data Readiness" description="See which required measures have data, partial support, or await sources." href={hrefFor('/dashboard/data-readiness')} />
                </Grid>
            </Box>
            <MetricAvailability metrics={dashboardMetrics} />
            <Box>
                <Typography variant="h6" sx={{ mb: 1.5 }}>Additional reviews</Typography>
                <Grid container spacing={2}>
                    <ReviewCard title="Theme candidates" description="Explore deterministic groupings and the cases represented by them." href={hrefFor('/dashboard/themes')} />
                    <ReviewCard title="Fast Facts briefing" description="Review a snapshot-based, fact-linked briefing draft." href={hrefFor('/dashboard/reports')} />
                </Grid>
            </Box>
            <Typography variant="body2" color="text.secondary">{envelope.data.source_coverage_note}</Typography>
        </>}
    </Box>;
}

export default function DashboardPage() {
    return <Suspense fallback={<Typography>Loading snapshot overview…</Typography>}><DashboardContent /></Suspense>;
}
