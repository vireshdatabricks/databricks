'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Box, Chip, Divider, Grid, TextField, Typography } from '@mui/material';

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

const DISPLAY_LABELS: Record<string, string> = {
    SYSTEM_GENERATED_DRAFT: 'System-generated draft',
    DRAFT_REQUIRES_REVIEW: 'Draft requires review',
    LOCAL_TEST_ONLY: 'Local test only',
    ADDITIONAL_EVIDENCE_REQUIRED: 'Additional evidence required',
    AGGREGATE_FACT: 'Aggregate fact',
    TICKET_FIELD: 'Ticket field',
    WORK_NOTE: 'Work note',
    VALIDATED: 'Validated',
    REJECTED: 'Rejected',
    REVISED: 'Revised',
    DUPLICATE: 'Duplicate',
    PENDING: 'Pending',
};

const REPORT_ACTION_SX = { width: 168, justifyContent: 'center' };

function displayLabel(value: string) {
    return DISPLAY_LABELS[value] ?? value.replaceAll('_', ' ').replaceAll('.', ' / ');
}

function displayValue(value: string) {
    return value.replaceAll('_', ' ');
}

function NarrativeText({ text }: { text: string }) {
    const blocks = text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
    return <Box sx={{ display: 'grid', gap: 1.25 }}>
        {blocks.map((block, index) => {
            const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const bulletLines = lines.length > 0 && lines.every((line) => /^[*-]\s+/.test(line));
            return bulletLines
                ? <Box component="ul" key={index} sx={{ m: 0, pl: 2.5 }}>{lines.map((line, lineIndex) => <li key={lineIndex}>{displayValue(line.replace(/^[*-]\s+/, ''))}</li>)}</Box>
                : <Typography key={index} variant="body1" sx={{ lineHeight: 1.75, fontSize: '1.02rem' }}>{displayValue(lines.join(' '))}</Typography>;
        })}
    </Box>;
}

function labelForFact(factId: string, factsById: Map<string, ReportFact>) {
    return displayLabel(factsById.get(factId)?.label ?? factId);
}

function ReportSectionCard({ section, factsById }: { section: ReportSection; factsById: Map<string, ReportFact> }) {
    return (
        <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
            <Typography variant="h6">{displayLabel(section.heading)}</Typography>
            <NarrativeText text={section.body} />
            <Divider />
            <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
                    Fact references supporting this draft section
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {section.fact_ids.map((factId) => (
                        <Chip key={factId} label={labelForFact(factId, factsById)} size="small" variant="outlined" />
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
                            <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>{displayLabel(fact?.label ?? factId)}</Box>
                            <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                                {displayValue(fact?.value ?? 'The referenced fact was unavailable in this response.')}
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
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">Status</Typography><Typography variant="body2">{displayLabel(draft.status)}</Typography></Grid>
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">As-of week</Typography><Typography variant="body2">{draft.as_of_week}</Typography></Grid>
                    <Grid item xs={12} sm={6} md={3}><Typography variant="caption" color="text.secondary">Logic version</Typography><Typography variant="body2">{displayValue(draft.logic_version)}</Typography></Grid>
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
                    {[...draft.disclaimers, ...BASE_LIMITATIONS].map((limitation) => <li key={limitation}><Typography variant="body2">{displayLabel(limitation)}</Typography></li>)}
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

function ReviewPacket({ packet, onUpdate }: { packet: ReportReviewPacket; onUpdate: (next: ReportReviewPacket) => void }) {
    return <AllInsightsReview packet={packet} onUpdate={onUpdate} />;
    /* Legacy single-insight wizard retained below temporarily for a small, safe diff.
    const [pendingActions, setPendingActions] = React.useState<Record<string, InsightDisposition | undefined>>({});
    const [rationales, setRationales] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const decide = async (insightId: string, disposition: InsightDisposition) => {
        const rationale = rationales[insightId]?.trim() ?? '';
        if (disposition !== 'VALIDATED' && !rationale) { setError('Please add a short reason for this decision.'); return; }
        setBusy(insightId); setError(null);
        try {
            onUpdate(await reviewReportInsight(packet.report_id, insightId, { disposition, rationale: rationale || undefined }));
            setRationales((current) => ({ ...current, [insightId]: '' }));
            setPendingActions((current) => ({ ...current, [insightId]: undefined }));
        }
        catch (err) { setError(err instanceof AnalyticsApiError ? err.message : 'Unable to record review decision.'); }
        finally { setBusy(null); }
    };
    const { readiness } = packet;
    const reviewProgress = readiness.total_material ? ((readiness.validated + readiness.excluded) / readiness.total_material) * 100 : 0;
    return <Grid container spacing={2.5} sx={{ alignItems: 'flex-start' }}>
        <Grid item xs={12} md={3}>
            <Brand.Card bordered="outlined" sx={{ position: { md: 'sticky' }, top: { md: 20 }, p: 0, overflow: 'hidden', borderColor: 'divider' }}>
                <Box sx={{ px: 2.25, py: 2, bgcolor: '#f5f8fc', borderBottom: '1px solid', borderColor: 'divider' }}><Typography variant="overline" color="primary.main">Report process</Typography><Typography variant="h6">Sanford review</Typography></Box>
                <Box sx={{ p: 1 }}>{[
                    ['Briefing', 'Complete', '✓'],
                    ['Insight review', `${readiness.total_material - readiness.pending} / ${readiness.total_material} decided`, readiness.pending ? '•' : '✓'],
                    ['Evidence', 'Aggregate facts cited', '✓'],
                    ['Export', readiness.ready ? 'Ready' : `${readiness.pending} decision(s) needed`, readiness.ready ? '✓' : '•'],
                ].map(([name, detail, mark], index) => <Box key={name} sx={{ display: 'flex', gap: 1.25, px: 1.25, py: 1.2, borderRadius: 1.5, bgcolor: index === 1 ? '#eaf2ff' : 'transparent' }}><Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: index === 1 ? 'primary.main' : mark === '✓' ? 'success.light' : 'warning.light', color: index === 1 ? 'common.white' : 'text.primary', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>{mark}</Box><Box><Typography variant="body2" fontWeight={700}>{name}</Typography><Typography variant="caption" color="text.secondary">{detail}</Typography></Box></Box>)}</Box>
                <Box sx={{ px: 2.25, pb: 2 }}><Box sx={{ height: 6, borderRadius: 99, bgcolor: 'grey.200', overflow: 'hidden' }}><Box sx={{ width: `${reviewProgress}%`, height: '100%', bgcolor: 'primary.main', transition: 'width 200ms' }} /></Box><Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>{readiness.validated + readiness.excluded} of {readiness.total_material} decisions recorded</Typography></Box>
            </Brand.Card>
        </Grid>
        <Grid item xs={12} md={9}><Box sx={{ display: 'grid', gap: 2 }}>
            <Brand.Card bordered="outlined" sx={{ bgcolor: '#fbfcfe' }}><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}><Box><Typography variant="h5">AI PSA account review</Typography><Typography variant="body2" color="text.secondary">{packet.client_account ?? 'General snapshot'} · as of {packet.as_of_week}</Typography></Box><Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}><Chip label="Cited" color="primary" variant="outlined" /><Brand.Button component="a" href={reportExportUrl(packet.report_id, 'DRAFT_HTML')} target="_blank" variant="secondary">Draft HTML</Brand.Button><Brand.Button component="a" href={readiness.ready ? reportExportUrl(packet.report_id, 'REVIEWED_HTML') : undefined} disabled={!readiness.ready}>Reviewed export</Brand.Button></Box></Box></Brand.Card>
            {activeInsight && <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 2.25, borderColor: '#cbd9ec' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}><Box><Typography variant="overline" color="primary.main">Insight {activeInsight.sequence} of {packet.insights.length}</Typography><Typography variant="h5">{activeInsight.title}</Typography></Box><Chip label={activeInsight.current_disposition.replaceAll('_', ' ')} color={activeInsight.current_disposition === 'VALIDATED' ? 'success' : activeInsight.current_disposition === 'PENDING' ? 'warning' : 'default'} /></Box>
                <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, fontSize: '1.02rem' }}>{activeInsight.body}</Typography><Divider />
                <Box><Typography variant="subtitle2">Cited evidence</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>These are the aggregate facts used to create this candidate insight.</Typography>{activeInsight.citations.map((citation) => <Box key={citation.citation_id} sx={{ mt: 0.75, px: 1.25, py: 1, borderRadius: 1, bgcolor: '#f6f9fd', borderLeft: '3px solid', borderColor: 'primary.light' }}><Typography variant="caption" color="primary.main" fontWeight={700}>{citation.source_locator}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{citation.excerpt}</Typography></Box>)}</Box>
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}><Typography variant="subtitle2">Decision</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1.25 }}>Approve is immediate. Other decisions require a short explanation.</Typography><Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}><Brand.Button onClick={() => decide('VALIDATED')} disabled={busy === activeInsight.insight_id}>{busy === activeInsight.insight_id ? 'Saving...' : 'Approve insight'}</Brand.Button><Brand.Button variant="secondary" onClick={() => setPendingAction('REJECTED')}>Decline</Brand.Button><Brand.Button variant="tertiary" onClick={() => setPendingAction('REVISED')}>Revise</Brand.Button><Brand.Button variant="tertiary" onClick={() => setPendingAction('ADDITIONAL_EVIDENCE_REQUIRED')}>Need evidence</Brand.Button></Box>{pendingAction && <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}><TextField size="small" autoFocus required label="Reason for this decision" value={rationale} onChange={(event) => setRationale(event.target.value)} sx={{ minWidth: 300, flex: 1 }} /><Brand.Button onClick={() => decide(pendingAction)} disabled={busy === activeInsight.insight_id}>Confirm {pendingAction === 'REJECTED' ? 'decline' : pendingAction === 'REVISED' ? 'revision' : 'evidence request'}</Brand.Button><Brand.Button variant="tertiary" onClick={() => { setPendingAction(null); setRationale(''); }}>Cancel</Brand.Button></Box>}</Box>
                {error && <Typography color="error" role="alert">{error}</Typography>}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}><Brand.Button variant="tertiary" onClick={() => setActiveIndex(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}>Previous</Brand.Button><Brand.Button variant="tertiary" onClick={() => setActiveIndex(Math.min(packet.insights.length - 1, activeIndex + 1))} disabled={activeIndex === packet.insights.length - 1}>Next insight</Brand.Button></Box>
            </Brand.Card>}
        </Box></Grid>
    </Grid>;
    */
}

function AllInsightsReview({ packet, onUpdate }: { packet: ReportReviewPacket; onUpdate: (next: ReportReviewPacket) => void }) {
    const [pendingActions, setPendingActions] = React.useState<Record<string, InsightDisposition | undefined>>({});
    const [rationales, setRationales] = React.useState<Record<string, string>>({});
    const [busy, setBusy] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const { readiness } = packet;
    const reviewProgress = readiness.total_material ? ((readiness.validated + readiness.excluded) / readiness.total_material) * 100 : 0;

    const decide = async (insightId: string, disposition: InsightDisposition) => {
        const rationale = rationales[insightId]?.trim() ?? '';
        if (disposition !== 'VALIDATED' && !rationale) { setError('Please add a short reason for this decision.'); return; }
        setBusy(insightId); setError(null);
        try {
            onUpdate(await reviewReportInsight(packet.report_id, insightId, { disposition, rationale: rationale || undefined }));
            setRationales((current) => ({ ...current, [insightId]: '' }));
            setPendingActions((current) => ({ ...current, [insightId]: undefined }));
        } catch (err) {
            setError(err instanceof AnalyticsApiError ? err.message : 'Unable to record review decision.');
        } finally {
            setBusy(null);
        }
    };

    return <Box sx={{ display: 'grid', gap: 2 }}>
        <Brand.Card bordered="outlined" sx={{ borderLeft: '5px solid', borderLeftColor: readiness.ready ? 'success.main' : 'warning.main' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box><Typography variant="h5">Briefing review and export</Typography><Typography variant="body2" color="text.secondary">Each decision is stored separately with the local development reviewer label.</Typography></Box>
                <Chip label={readiness.ready ? 'Reviewed export ready' : `${readiness.pending} material insight(s) pending`} color={readiness.ready ? 'success' : 'warning'} />
            </Box>
            <Grid container spacing={2} sx={{ mt: 1 }}>
                {[['Material insights', readiness.total_material], ['Validated', readiness.validated], ['Excluded', readiness.excluded], ['Pending', readiness.pending]].map(([label, value]) => <Grid item xs={6} md={3} key={String(label)}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6">{value}</Typography></Grid>)}
            </Grid>
            <Box sx={{ height: 6, borderRadius: 99, bgcolor: 'grey.200', overflow: 'hidden', mt: 2 }}><Box sx={{ width: `${reviewProgress}%`, height: '100%', bgcolor: 'primary.main', transition: 'width 200ms' }} /></Box>
            <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}><Brand.Button component="a" href={reportExportUrl(packet.report_id, 'DRAFT_HTML')} target="_blank" variant="secondary" sx={REPORT_ACTION_SX}>Draft HTML</Brand.Button><Brand.Button component="a" href={readiness.ready ? reportExportUrl(packet.report_id, 'REVIEWED_HTML') : undefined} disabled={!readiness.ready} sx={REPORT_ACTION_SX}>Reviewed export</Brand.Button></Box>
        </Brand.Card>
        {error && <Typography color="error" role="alert">{error}</Typography>}
        {packet.insights.map((insight) => {
            const pendingAction = pendingActions[insight.insight_id];
            const rationale = rationales[insight.insight_id] ?? '';
            return <Brand.Card key={insight.insight_id} bordered="outlined" sx={{ display: 'grid', gap: 2, borderColor: '#cbd9ec' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start' }}><Box><Typography variant="overline" color="primary.main">Insight {insight.sequence} of {packet.insights.length}</Typography><Typography variant="h5">{displayLabel(insight.title)}</Typography></Box><Chip label={displayLabel(insight.current_disposition)} color={insight.current_disposition === 'VALIDATED' ? 'success' : insight.current_disposition === 'PENDING' ? 'warning' : 'default'} /></Box>
                <NarrativeText text={insight.body} />
                <Divider />
                <Box><Typography variant="subtitle2">Cited evidence</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>These aggregate facts support this candidate insight.</Typography>{insight.citations.map((citation) => <Box key={citation.citation_id} sx={{ mt: 0.75, px: 1.25, py: 1, borderRadius: 1, bgcolor: '#f6f9fd', borderLeft: '3px solid', borderColor: 'primary.light' }}><Typography variant="caption" color="primary.main" fontWeight={700}>{displayLabel(citation.source_locator)}</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{displayValue(citation.excerpt)}</Typography></Box>)}</Box>
                <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}><Typography variant="subtitle2">Decision</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1.25 }}>Approval is immediate. Other decisions require a short explanation.</Typography><Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}><Brand.Button onClick={() => decide(insight.insight_id, 'VALIDATED')} disabled={busy === insight.insight_id} sx={REPORT_ACTION_SX}>{busy === insight.insight_id ? 'Saving...' : 'Approve insight'}</Brand.Button><Brand.Button variant="secondary" onClick={() => setPendingActions((current) => ({ ...current, [insight.insight_id]: 'REJECTED' }))} sx={REPORT_ACTION_SX}>Decline</Brand.Button><Brand.Button variant="tertiary" onClick={() => setPendingActions((current) => ({ ...current, [insight.insight_id]: 'REVISED' }))} sx={REPORT_ACTION_SX}>Revise</Brand.Button><Brand.Button variant="tertiary" onClick={() => setPendingActions((current) => ({ ...current, [insight.insight_id]: 'ADDITIONAL_EVIDENCE_REQUIRED' }))} sx={REPORT_ACTION_SX}>Need evidence</Brand.Button></Box>{pendingAction && <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap', alignItems: 'center' }}><TextField size="small" autoFocus required label="Reason for this decision" value={rationale} onChange={(event) => setRationales((current) => ({ ...current, [insight.insight_id]: event.target.value }))} sx={{ minWidth: 300, flex: 1 }} /><Brand.Button onClick={() => decide(insight.insight_id, pendingAction)} disabled={busy === insight.insight_id} sx={REPORT_ACTION_SX}>Confirm {pendingAction === 'REJECTED' ? 'decline' : pendingAction === 'REVISED' ? 'revision' : 'evidence request'}</Brand.Button><Brand.Button variant="tertiary" onClick={() => { setPendingActions((current) => ({ ...current, [insight.insight_id]: undefined })); setRationales((current) => ({ ...current, [insight.insight_id]: '' })); }} sx={REPORT_ACTION_SX}>Cancel</Brand.Button></Box>}</Box>
            </Brand.Card>;
        })}
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
                <Typography variant="h4" component="h1">Snapshot operational briefing</Typography>
                <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75, maxWidth: 780 }}>
                    Create a fact-referenced operational briefing for a selected snapshot. It identifies review priorities from supported aggregates and remains a draft until reviewed.
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
                    <Brand.Button onClick={handleGenerate} loading={loading} sx={REPORT_ACTION_SX}>{loading ? 'Creating briefing...' : 'Create briefing'}</Brand.Button>
                </Box>
            </Brand.Card>

            {loading && <Typography aria-live="polite">Creating the fact-referenced operational briefing...</Typography>}
            {error && <Brand.Card bordered="outlined" role="alert"><Typography color="error">{error}</Typography></Brand.Card>}

            {reviewPacket ? <ReviewPacket packet={reviewPacket} onUpdate={setReviewPacket} /> : draft ? <BriefingDraft draft={draft} filtersApplied={filtersApplied} /> : !loading && !error && (
                <Brand.Card bordered="outlined">
                    <Typography variant="h6">What this produces</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                        A persisted local review packet with an executive snapshot, evidence-backed review priorities, immutable review decisions, approval counts, and gated HTML exports.
                    </Typography>
                </Brand.Card>
            )}
        </Box>
    );
}

export default function ReportsPage() {
    return <Suspense fallback={<Typography>Loading...</Typography>}><ReportsContent /></Suspense>;
}
