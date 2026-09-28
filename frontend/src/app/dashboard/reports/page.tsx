'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, FormControlLabel, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import {
    AnalyticsApiError,
    ReportSection,
    SnapshotReportDraft,
    generateSnapshotReportDraft,
} from '../../utils/analytics-api';
import QueryTextFilter from '../components/query-text-filter';
import WeekSelect from '../components/week-select';

function ReportSectionCard({ section }: { section: ReportSection }) {
    return (
        <Brand.Card bordered="outlined">
            <Typography variant="h6">{section.heading}</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 1 }}>{section.body}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                Cites: {section.fact_ids.join(', ')}
            </Typography>
        </Brand.Card>
    );
}

function ReportsContent() {
    const searchParams = useSearchParams();
    const [evidenceAuthorized, setEvidenceAuthorized] = React.useState(false);
    const [draft, setDraft] = React.useState<SnapshotReportDraft | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const clientAccount = searchParams.get('client_account') ?? undefined;
    const category = searchParams.get('category') ?? undefined;

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setDraft(null);
        try {
            const result = await generateSnapshotReportDraft({
                as_of_week: asOfWeek,
                client_account: clientAccount,
                category,
                evidence_authorized: evidenceAuthorized,
            });
            setDraft(result);
        } catch (err) {
            setError(err instanceof AnalyticsApiError ? err.message : 'Unable to generate the snapshot report draft.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Snapshot Report Draft</Typography>
            <Typography variant="body2" color="text.secondary">
                Generates a system-drafted narrative over the existing analytics aggregates. Every claim requires
                human review before distribution — see disclaimers below.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Box sx={{ minWidth: 220 }}>
                    <WeekSelect />
                </Box>
                <QueryTextFilter label="Client account" paramKey="client_account" />
                <QueryTextFilter label="Category" paramKey="category" />
                <FormControlLabel
                    control={
                        <Brand.Switch
                            checked={evidenceAuthorized}
                            onChange={(event) => setEvidenceAuthorized(event.target.checked)}
                        />
                    }
                    label="Evidence authorized"
                />
                <Brand.Button onClick={handleGenerate} disabled={loading}>
                    {loading ? 'Generating…' : 'Generate draft'}
                </Brand.Button>
            </Box>

            {error && (
                <Brand.Card bordered="outlined">
                    <Typography color="error">{error}</Typography>
                </Brand.Card>
            )}

            {draft && (
                <Box sx={{ display: 'grid', gap: 2 }}>
                    <Brand.Card bordered="outlined">
                        <Typography variant="body2"><strong>Status:</strong> {draft.status}</Typography>
                        <Typography variant="body2"><strong>As of week:</strong> {draft.as_of_week}</Typography>
                        <Typography variant="body2"><strong>Model:</strong> {draft.generated_by_model}</Typography>
                        {draft.disclaimers.map((disclaimer) => (
                            <Typography key={disclaimer} variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                {disclaimer}
                            </Typography>
                        ))}
                    </Brand.Card>

                    {draft.sections.map((section) => (
                        <ReportSectionCard key={section.heading} section={section} />
                    ))}
                </Box>
            )}
        </Box>
    );
}

export default function ReportsPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <ReportsContent />
        </Suspense>
    );
}
