'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Box, Divider, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { AnalyticsApiError, CaseDetail, Envelope, getCase } from '../../../utils/analytics-api';
import { formatDateTime } from '../../../lib/format';
import { evidenceSegmentLabels, labelFor } from '../../../lib/labels';

function FactList({ facts }: { facts: Array<[string, React.ReactNode]> }) {
    return <Box component="dl" sx={{ m: 0, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
        {facts.map(([label, value]) => <Box key={label}>
            <Typography component="dt" variant="label" color="text.secondary">{label}</Typography>
            <Typography component="dd" variant="body1" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value === null || value === undefined || value === '' ? '—' : value}</Typography>
        </Box>)}
    </Box>;
}

function CaseDetailContent() {
    const params = useParams<{ caseNumber: string }>();
    const context = useAnalysisContext();
    const caseNumber = decodeURIComponent(params.caseNumber);
    const asOfWeek = context.as_of_week;
    const [envelope, setEnvelope] = React.useState<Envelope<CaseDetail> | null>(null);
    const [error, setError] = React.useState<{ status: number; message: string } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [attempt, setAttempt] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        getCase(caseNumber, { as_of_week: asOfWeek })
            .then((data) => { if (!cancelled) setEnvelope(data); })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? { status: err.status, message: err.message } : { status: 0, message: 'This case could not be loaded.' }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [caseNumber, asOfWeek, attempt]);

    const data = envelope?.data;
    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.Breadcrumbs items={[{ label: 'Ticket evidence', href: context.hrefWith('/dashboard/ticket-evidence') }, { label: `Case ${caseNumber}` }]} />
        <Brand.PageHeader title={`Case ${caseNumber}`} description={data ? `${data.client_account ?? 'Unknown client'} · ${data.is_open ? 'Open' : 'Closed'} · extract week ${envelope!.as_of_week}` : undefined}
            details={envelope ? [{ label: 'Source file', value: envelope.data.source_file }, { label: 'Logic version', value: envelope.logic_version }, { label: 'Data quality', value: envelope.data_quality_status }] : undefined} />
        {loading && !envelope ? <Brand.StateView state="loading" title="Loading case" />
            : error ? <Brand.StateView state={error.status === 404 ? 'not_found' : 'error'} title={error.status === 404 ? 'Case not found in this week' : 'This case could not be loaded'} description={error.message} onRetry={error.status === 404 ? undefined : () => setAttempt((value) => value + 1)} />
            : data && <>
                <Brand.Card bordered="outlined">
                    <FactList facts={[
                        ['Client', data.client_account], ['Line of business', data.line_of_business], ['Assignment group', data.case_assignment_group],
                        ['Category', data.category], ['Case type', data.case_type], ['Subtype', data.subtype], ['Root cause', data.root_cause],
                        ['Who caused the issue', data.who_caused_issue], ['Opened', formatDateTime(data.opened_at)], ['Closed', data.closed_at ? formatDateTime(data.closed_at) : '—'],
                        ['Tasks', data.task_count], ['Turnaround (business days)', data.tat_business_days_src], ['Turnaround (calendar days)', data.tat_calendar_days_derived],
                    ]} />
                </Brand.Card>
                <Brand.Card bordered="outlined" component="section" aria-labelledby="narrative-evidence" sx={{ display: 'grid', gap: 2 }}>
                    <Typography id="narrative-evidence" variant="h2">Narrative evidence</Typography>
                    {data.narrative_segments.length === 0 && <Typography variant="body2" color="text.secondary">No narrative segments are recorded for this case.</Typography>}
                    {data.narrative_segments.map((segment, index) => <Box key={segment.segment_id} sx={{ display: 'grid', gap: 0.5 }}>
                        <Typography variant="label" color="text.secondary">{labelFor(evidenceSegmentLabels, segment.record_level)}{segment.task_number ? ` · ${segment.task_number}` : ''} · {labelFor(evidenceSegmentLabels, segment.segment_type)}{segment.segment_timestamp ? ` · ${formatDateTime(segment.segment_timestamp)}` : ''}</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{segment.segment_text}</Typography>
                        {index < data.narrative_segments.length - 1 && <Divider sx={{ mt: 1.5 }} />}
                    </Box>)}
                </Brand.Card>
            </>}
    </Box>;
}

export default function CaseDetailPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading case" />}><CaseDetailContent /></Suspense>;
}
