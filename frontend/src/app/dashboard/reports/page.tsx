'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Chip, Divider, Grid, MenuItem, TextField, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import {
    AnalyticsApiError,
    ReportFact,
    ReportSection,
    SnapshotReportDraft,
    InsightDisposition,
    ReportReviewPacket,
    createSnapshotReview,
    reportExportUrl,
    reviewReportInsight,
} from '../../utils/analytics-api';
import QueryTextFilter from '../components/query-text-filter';
import WeekSelect from '../components/week-select';

const BASE_LIMITATIONS = [
    'Snapshot-only: this is not a longitudinal trend, recurrence, SLA, or PG view.',
    'Candidate groupings and source fields require human interpretation; they do not establish root cause.',
    'Case-level narrative evidence is not included until authenticated authorization is available.',
];

function labelForFact(factId: string, factsById: Map<string, ReportFact>) {
    return factsById.get(factId)?.label ?? factId;
}

function ReportSectionCard({ section, factsById }: { section: ReportSection; factsById: Map<string, ReportFact> }) {
    return (
        <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
            <Typography variant="h6">{section.heading}</Typography>
            <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{section.body}</Typography>
            <Divider />
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    Fact references supporting this draft section
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {section.fact_ids.map((factId) => (
                        <Chip key={factId} label={labelForFact(factId, factsById)} size="small" variant="outlined" title={factId} />
                    ))}
                </Box>
            </Box>
        </Brand.Card>
    );
}

function ReferencedFacts({ draft }: { draft: SnapshotReportDraft }) {
    const referencedIds = Array.from(new Set(draft.sections.flatMap((section) => section.fact_ids)));
    const factsById = new Map(draft.facts.map((fact) => [fact.fact_id, fact]));

    return (
        <Brand.Card bordered="outlined">
            <Typography variant="h6">Fact reference register</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                The generated narrative may use only these server-provided facts. Expand a reference to inspect its deterministic label and value.
            </Typography>
            <Box sx={{ display: 'grid', gap: 1, mt: 2 }}>
                {referencedIds.map((factId) => {
                    const fact = factsById.get(factId);
                    return (
                        <Box component="details" key={factId} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, px: 1.5, py: 1 }}>
                            <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>{fact?.label ?? factId}</Box>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Fact ID: {factId}</Typography>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {fact?.value ?? 'The referenced fact was unavailable in this response.'}
                            </Typography>
                        </Box>
                    );
                })}
            </Box>
        </Brand.Card>
    );
}

function BriefingDraft({ draft, filtersApplied }: { draft: SnapshotReportDraft; filtersApplied: string[] }) {
    const factsById = new Map(draft.facts.map((fact) => [fact.fact_id, fact]));
    const isLocalTest = draft.disclaimers.some((disclaimer) => disclaimer.startsWith('LOCAL_TEST_ONLY'));
    const scope = filtersApplied.length ? filtersApplied.join(' - ') : 'Entire published snapshot';
    const citedFacts = new Set(draft.sections.flatMap((section) => section.fact_ids)).size;

    return (
        <Box sx={{ display: 'grid', gap: 2 }}>
            <Brand.Card bordered="outlined" sx={{ borderLeft: '5px solid', borderLeftColor: 'warning.main' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap' }}>
                    <Box>
                        <Typography variant="h5">Fast Facts briefing draft</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            A concise, traceable starting point for human review - not a final governed report.
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip label="Human review required" color="warning" size="small" />
                        {isLocalTest && <Chip label="Local test only" color="error" size="small" />}
                    </Box>
                </Box>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">Status</Typography><Typography variant="body2">{draft.status}</Typography></Grid>
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">As-of week</Typography><Typography variant="body2">{draft.as_of_week}</Typography></Grid>
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">Logic version</Typography><Typography variant="body2">{draft.logic_version}</Typography></Grid>
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">Drafting model</Typography><Typography variant="body2">{draft.generated_by_model}</Typography></Grid>
                </Grid>
            </Brand.Card>

            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <Brand.Card bordered="outlined" sx={{ height: '100%' }}>
                        <Typography variant="h6">Briefing scope</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}><strong>Selected population:</strong> {scope}</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}><strong>Fact package:</strong> {draft.facts.length.toLocaleString()} server-provided facts; {citedFacts.toLocaleString()} cited in this draft.</Typography>
                    </Brand.Card>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Brand.Card bordered="outlined" sx={{ height: '100%' }}>
                        <Typography variant="h6">Review boundary</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            Check each material statement against its fact reference before sharing. This flow does not include authorized case-level narrative evidence.
                        </Typography>
                    </Brand.Card>
                </Grid>
            </Grid>

            <Brand.Card bordered="outlined">
                <Typography variant="h6">Scope and limitations</Typography>
                <Box component="ul" sx={{ m: 0, mt: 1.25, pl: 2.5 }}>
                    {[...draft.disclaimers, ...BASE_LIMITATIONS].map((limitation) => <li key={limitation}><Typography variant="body2">{limitation}</Typography></li>)}
                </Box>
            </Brand.Card>

            <Box sx={{ display: 'grid', gap: 2 }}>
                <Typography variant="h5" component="h2">Draft briefing</Typography>
                {draft.sections.map((section, index) => <ReportSectionCard key={`${section.heading}-${index}`} section={section} factsById={factsById} />)}
            </Box>

            <ReferencedFacts draft={draft} />
        </Box>
    );
}

const REVIEW_CHOICES: Array<{ value: InsightDisposition; label: string }> = [
    { value: 'VALIDATED', label: 'Validate' }, { value: 'REJECTED', label: 'Reject / exclude' },
    { value: 'REVISED', label: 'Revise' }, { value: 'DUPLICATE', label: 'Duplicate / exclude' },
    { value: 'ADDITIONAL_EVIDENCE_REQUIRED', label: 'Request evidence' },
];

function ReviewPacket({ packet, onUpdate }: { packet: ReportReviewPacket; onUpdate: (next: ReportReviewPacket) => void }) {
    const [selection, setSelection] = React.useState<Record<string, InsightDisposition>>({});
    const [rationales, setRationales] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const decide = async (insightId: string) => {
        const rationale = rationales[insightId]?.trim();
        if (!rationale) { setError('Add a reviewer rationale before recording a decision.'); return; }
        setBusy(insightId); setError(null);
        try { onUpdate(await reviewReportInsight(packet.report_id, insightId, { disposition: selection[insightId] ?? 'VALIDATED', rationale })); }
        catch (err) { setError(err instanceof AnalyticsApiError ? err.message : 'Unable to record review decision.'); }
        finally { setBusy(null); }
    };
    const { readiness } = packet;
    return <Box sx={{ display: 'grid', gap: 2 }}>
        <Brand.Card bordered="outlined" sx={{ borderLeft: '5px solid', borderLeftColor: readiness.ready ? 'success.main' : 'warning.main' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box><Typography variant="h5">Insight review and download gate</Typography><Typography variant="body2" color="text.secondary">Review decisions are stored locally with a development actor label until production authentication is connected.</Typography></Box>
                <Chip label={readiness.ready ? 'Reviewed export ready' : `${readiness.pending} material insight(s) pending`} color={readiness.ready ? 'success' : 'warning'} />
            </Box>
            <Grid container spacing={2} sx={{ mt: 1 }}>
                {[['Material', readiness.total_material], ['Validated', readiness.validated], ['Excluded', readiness.excluded], ['Pending', readiness.pending]].map(([label, value]) => <Grid item xs={6} md={3} key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6">{value}</Typography></Grid>)}
            </Grid>
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
                <Brand.Button component="a" href={reportExportUrl(packet.report_id, 'DRAFT_HTML')} target="_blank" variant="secondary">Download labelled draft</Brand.Button>
                <Brand.Button component="a" href={readiness.ready ? reportExportUrl(packet.report_id, 'REVIEWED_HTML') : undefined} disabled={!readiness.ready}>Download reviewed report</Brand.Button>
            </Box>
        </Brand.Card>
        {error && <Typography color="error" role="alert">{error}</Typography>}
        {packet.insights.map((insight) => <Brand.Card key={insight.insight_id} bordered="outlined" sx={{ display: 'grid', gap: 1.25 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}><Box><Typography variant="h6">{insight.sequence}. {insight.title}</Typography><Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>{insight.body}</Typography></Box><Chip size="small" label={insight.current_disposition.replaceAll('_', ' ')} /></Box>
            <Divider /><Box><Typography variant="caption" color="text.secondary">Cited evidence</Typography>{insight.citations.map((citation) => <Box key={citation.citation_id} sx={{ mt: 0.5, pl: 1, borderLeft: '3px solid', borderColor: 'divider' }}><Typography variant="caption">{citation.source_type} · {citation.source_locator}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{citation.excerpt}</Typography></Box>)}</Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}><TextField select size="small" label="Disposition" value={selection[insight.insight_id] ?? 'VALIDATED'} onChange={(event) => setSelection({ ...selection, [insight.insight_id]: event.target.value as InsightDisposition })} sx={{ minWidth: 210 }}>{REVIEW_CHOICES.map((choice) => <MenuItem key={choice.value} value={choice.value}>{choice.label}</MenuItem>)}</TextField><TextField size="small" required label="Reviewer rationale" value={rationales[insight.insight_id] ?? ''} onChange={(event) => setRationales({ ...rationales, [insight.insight_id]: event.target.value })} sx={{ minWidth: 280, flex: 1 }} /><Brand.Button onClick={() => decide(insight.insight_id)} disabled={busy === insight.insight_id}>{busy === insight.insight_id ? 'Recording...' : 'Record decision'}</Brand.Button></Box>
        </Brand.Card>)}
    </Box>;
}

function ReportsContent() {
    const searchParams = useSearchParams();
    const [draft, setDraft] = React.useState<SnapshotReportDraft | null>(null);
    const [reviewPacket, setReviewPacket] = React.useState<ReportReviewPacket | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const clientAccount = searchParams.get('client_account') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const filtersApplied = [clientAccount && `Client account: ${clientAccount}`, category && `Category: ${category}`]
        .filter((value): value is string => Boolean(value));

    const handleGenerate = async () => {
        setLoading(true);
        setError(null);
        setDraft(null);
        setReviewPacket(null);
        try {
            const result = await createSnapshotReview({
                as_of_week: asOfWeek,
                client_account: clientAccount,
                category,
                evidence_authorized: false,
            });
            setReviewPacket(result);
        } catch (err) {
            setError(err instanceof AnalyticsApiError ? err.message : 'Unable to generate the Fast Facts briefing draft.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ display: 'grid', gap: 3, maxWidth: 1120 }}>
            <Box>
                <Typography variant="h4" component="h1">Fast Facts briefing</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 780 }}>
                    Create a concise, fact-referenced snapshot briefing to focus a human review. Generated content is always a draft and is not ready for distribution.
                </Typography>
            </Box>

            <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 2 }}>
                <Box>
                    <Typography variant="h6">Set briefing scope</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Select the snapshot and optional filters. The report uses aggregate facts only; case-level narrative evidence is not available in this flow.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Box sx={{ minWidth: 220 }}><WeekSelect /></Box>
                    <QueryTextFilter label="Client account" paramKey="client_account" />
                    <QueryTextFilter label="Category" paramKey="category" />
                    <Brand.Button onClick={handleGenerate} disabled={loading}>{loading ? 'Building draft...' : 'Build Fast Facts draft'}</Brand.Button>
                </Box>
            </Brand.Card>

            {loading && <Typography aria-live="polite">Building the fact-referenced briefing draft...</Typography>}
            {error && <Brand.Card bordered="outlined" role="alert"><Typography color="error">{error}</Typography></Brand.Card>}

            {reviewPacket ? <ReviewPacket packet={reviewPacket} onUpdate={setReviewPacket} /> : draft ? <BriefingDraft draft={draft} filtersApplied={filtersApplied} /> : !loading && !error && (
                <Brand.Card bordered="outlined">
                    <Typography variant="h6">What this produces</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        A persisted local review packet with cited candidate insights, immutable review decisions, approval counts, and gated HTML exports.
                    </Typography>
                </Brand.Card>
            )}
        </Box>
    );
}

export default function ReportsPage() {
    return <Suspense fallback={<Typography>Loading...</Typography>}><ReportsContent /></Suspense>;
}
