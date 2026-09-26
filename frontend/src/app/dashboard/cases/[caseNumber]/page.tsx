'use client';

import React, { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Divider, Grid, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import { AnalyticsApiError, CaseDetail, Envelope, getCase } from '../../../utils/analytics-api';
import FreshnessBanner from '../../components/freshness-banner';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Grid item xs={12} sm={6} md={4}>
            <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
            <Typography variant="body1">{value ?? '—'}</Typography>
        </Grid>
    );
}

function CaseDetailContent() {
    const params = useParams<{ caseNumber: string }>();
    const searchParams = useSearchParams();
    const caseNumber = decodeURIComponent(params.caseNumber);
    const asOfWeek = searchParams.get('as_of_week') ?? undefined;

    const [envelope, setEnvelope] = React.useState<Envelope<CaseDetail> | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getCase(caseNumber, { as_of_week: asOfWeek })
            .then((data) => {
                if (!cancelled) setEnvelope(data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load this case.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [caseNumber, asOfWeek]);

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Case {caseNumber}</Typography>

            {loading && <Typography>Loading…</Typography>}
            {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

            {envelope && !loading && (
                <>
                    <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />

                    <Brand.Card bordered="outlined">
                        <Grid container spacing={2}>
                            <Field label="Client account" value={envelope.data.client_account} />
                            <Field label="Line of business" value={envelope.data.line_of_business} />
                            <Field label="Assignment group" value={envelope.data.case_assignment_group} />
                            <Field label="Category" value={envelope.data.category} />
                            <Field label="Case type" value={envelope.data.case_type} />
                            <Field label="Subtype" value={envelope.data.subtype} />
                            <Field label="Root cause" value={envelope.data.root_cause} />
                            <Field label="Who caused issue" value={envelope.data.who_caused_issue} />
                            <Field label="Status" value={envelope.data.is_open ? 'Open' : 'Closed'} />
                            <Field label="Opened at" value={envelope.data.opened_at} />
                            <Field label="Closed at" value={envelope.data.closed_at} />
                            <Field label="Task count" value={envelope.data.task_count} />
                            <Field label="TAT (business days)" value={envelope.data.tat_business_days_src} />
                            <Field label="TAT (calendar days)" value={envelope.data.tat_calendar_days_derived} />
                            <Field label="Source file" value={envelope.data.source_file} />
                        </Grid>
                    </Brand.Card>

                    <Brand.Card bordered="outlined">
                        <Typography variant="h6" sx={{ mb: 2 }}>Narrative evidence</Typography>
                        {envelope.data.narrative_segments.length === 0 && (
                            <Typography variant="body2" color="text.secondary">No narrative segments recorded for this case.</Typography>
                        )}
                        <Box sx={{ display: 'grid', gap: 2 }}>
                            {envelope.data.narrative_segments.map((segment) => (
                                <Box key={segment.segment_id}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        {segment.record_level}{segment.task_number ? ` · ${segment.task_number}` : ''} · {segment.segment_type}
                                        {segment.segment_timestamp ? ` · ${segment.segment_timestamp}` : ''}
                                    </Typography>
                                    <Typography variant="body2">{segment.segment_text}</Typography>
                                    <Divider sx={{ mt: 2 }} />
                                </Box>
                            ))}
                        </Box>
                    </Brand.Card>
                </>
            )}
        </Box>
    );
}

export default function CaseDetailPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <CaseDetailContent />
        </Suspense>
    );
}
