'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Grid, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import { AnalyticsApiError, Envelope, SummaryData, getSummary } from '../../utils/analytics-api';
import FreshnessBanner from '../components/freshness-banner';
import QueryTextFilter from '../components/query-text-filter';
import WeekSelect from '../components/week-select';

function MetricCard({ label, value }: { label: string; value: number }) {
    return (
        <Grid item xs={6} sm={4} md={2}>
            <Brand.Card bordered="outlined" sx={{ textAlign: 'center' }}>
                <Typography variant="h3">{value.toLocaleString()}</Typography>
                <Typography variant="body2">{label}</Typography>
            </Brand.Card>
        </Grid>
    );
}

function OverviewContent() {
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
            .then((data) => {
                if (!cancelled) setEnvelope(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load the overview summary.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [asOfWeek, clientAccount, lineOfBusiness, assignmentGroup]);

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Overview</Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Box sx={{ minWidth: 220 }}>
                    <WeekSelect />
                </Box>
                <QueryTextFilter label="Client account" paramKey="client_account" />
                <QueryTextFilter label="Line of business" paramKey="line_of_business" />
                <QueryTextFilter label="Assignment group" paramKey="assignment_group" />
            </Box>

            {loading && <Typography>Loading…</Typography>}
            {error && (
                <Brand.Card bordered="outlined">
                    <Typography color="error">{error}</Typography>
                </Brand.Card>
            )}

            {envelope && !loading && (
                <>
                    <FreshnessBanner
                        asOfWeek={envelope.as_of_week}
                        dataQualityStatus={envelope.data_quality_status}
                        logicVersion={envelope.logic_version}
                    />
                    <Grid container spacing={2}>
                        <MetricCard label="Total cases" value={envelope.data.total_case_count} />
                        <MetricCard label="Open cases" value={envelope.data.open_case_count} />
                        <MetricCard label="Closed cases" value={envelope.data.closed_case_count} />
                        <MetricCard label="Total tasks" value={envelope.data.total_task_count} />
                        <MetricCard label="Open tasks" value={envelope.data.open_task_count} />
                        <MetricCard label="Closed tasks" value={envelope.data.closed_task_count} />
                    </Grid>
                    <Typography variant="body2" color="text.secondary">
                        {envelope.data.source_coverage_note}
                    </Typography>
                </>
            )}
        </Box>
    );
}

export default function OverviewPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <OverviewContent />
        </Suspense>
    );
}
