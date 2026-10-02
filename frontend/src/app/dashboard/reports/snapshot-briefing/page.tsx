'use client';

import React, { Suspense } from 'react';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import ContextBar from '../../../components/patterns/context-bar';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { humanizeIdentifier } from '../../../lib/format';
import { decisionStatusLabels, labelFor } from '../../../lib/labels';
import { radius } from '../../../utils/theme';
import {
    AnalyticsApiError,
    InsightDisposition,
    ReportInsight,
    ReportReviewPacket,
    createSnapshotReview,
    reportExportUrl,
    reviewReportInsight,
} from '../../../utils/analytics-api';

const DECISIONS: Array<{ value: InsightDisposition; label: string }> = [
    { value: 'VALIDATED', label: 'Approve' },
    { value: 'REJECTED', label: 'Decline' },
    { value: 'REVISED', label: 'Revise' },
    { value: 'ADDITIONAL_EVIDENCE_REQUIRED', label: 'Needs more evidence' },
];
// Identifiers in generated text and citation locators read as words.
const readable = (value: string) => value.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (match) => humanizeIdentifier(match.toLowerCase()));

function NarrativeText({ text }: { text: string }) {
    const blocks = text.trim().split(/\r?\n\s*\r?\n/).filter(Boolean);
    return <Box sx={{ display: 'grid', gap: 1.5 }}>
        {blocks.map((block, index) => {
            const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            return lines.length > 0 && lines.every((line) => /^[*-]\s+/.test(line))
                ? <Box component="ul" key={index} sx={{ m: 0, pl: 3 }}>{lines.map((line, lineIndex) => <Typography component="li" variant="body1" key={lineIndex}>{readable(line.replace(/^[*-]\s+/, ''))}</Typography>)}</Box>
                : <Typography key={index} variant="body1">{readable(lines.join(' '))}</Typography>;
        })}
    </Box>;
}

/** RP3b decision pattern: no answer starts selected; anything but Approve needs a reason. */
function InsightDecision({ insight, onSave }: { insight: ReportInsight; onSave: (disposition: InsightDisposition, rationale: string) => Promise<void> }) {
    const [disposition, setDisposition] = React.useState<InsightDisposition | ''>('');
    const [rationale, setRationale] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState('');
    const needsReason = disposition !== '' && disposition !== 'VALIDATED';
    const save = async () => {
        if (!disposition) return;
        if (needsReason && !rationale.trim()) { setError('Add a short reason for this decision.'); return; }
        setBusy(true); setError('');
        try { await onSave(disposition, rationale.trim()); setDisposition(''); setRationale(''); }
        catch (err) { setError(err instanceof AnalyticsApiError ? err.message : 'The decision could not be saved.'); }
        finally { setBusy(false); }
    };
    return <Stack spacing={1.5} sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
        <Brand.ChoiceGroup label="Your decision" name={`insight-${insight.insight_id}`} row value={disposition} onChange={(value) => { setDisposition(value as InsightDisposition); setError(''); }} options={DECISIONS} />
        {needsReason && <Brand.Field label="Reason" kind="textarea" rows={2} required value={rationale} onChange={(event) => setRationale(event.target.value)} errorText={error || undefined} />}
        {error && !needsReason && <Typography role="alert" variant="body2" color="error">{error}</Typography>}
        {disposition && <Box><Brand.Button size="compact" onClick={() => void save()} loading={busy}>Save decision</Brand.Button></Box>}
    </Stack>;
}

function InsightsReview({ packet, onUpdate }: { packet: ReportReviewPacket; onUpdate: (next: ReportReviewPacket) => void }) {
    const { readiness } = packet;
    const decided = readiness.validated + readiness.excluded;
    return <Box sx={{ display: 'grid', gap: 2 }}>
        <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.5}>
                <Box>
                    <Typography variant="h2">Briefing review and export</Typography>
                    <Typography variant="body2" color="text.secondary">{packet.client_account ?? 'Whole snapshot'} · week {packet.as_of_week}. Each decision is stored separately.</Typography>
                </Box>
                <Stack direction="row" gap={1} flexWrap="wrap" alignItems="flex-start">
                    <Brand.Button component="a" href={reportExportUrl(packet.report_id, 'DRAFT_HTML')} target="_blank" variant="secondary">Download draft HTML</Brand.Button>
                    <Brand.Button component="a" href={readiness.ready ? reportExportUrl(packet.report_id, 'REVIEWED_HTML') : undefined} disabled={!readiness.ready} aria-describedby="reviewed-export-hint">Download reviewed HTML</Brand.Button>
                </Stack>
            </Stack>
            <Brand.ProgressSummary decided={decided} total={readiness.total_material} label="material insights" />
            <Typography id="reviewed-export-hint" variant="body2" color="text.secondary">{readiness.ready ? 'Every material insight is decided; the reviewed export is ready.' : `Decide ${readiness.pending} more material insight${readiness.pending === 1 ? '' : 's'} to enable the reviewed export.`}</Typography>
        </Brand.Card>
        {packet.insights.map((insight) => <Brand.Card key={insight.insight_id} bordered="outlined" component="article" aria-labelledby={`insight-${insight.insight_id}-title`} sx={{ display: 'grid', gap: 2 }}>
            <Stack direction="row" justifyContent="space-between" gap={2} flexWrap="wrap" alignItems="flex-start">
                <Box>
                    <Typography variant="label" color="text.secondary">Insight {insight.sequence} of {packet.insights.length}</Typography>
                    <Typography id={`insight-${insight.insight_id}-title`} variant="h3">{readable(insight.title)}</Typography>
                </Box>
                <Typography variant="body2" fontWeight={700}>{labelFor(decisionStatusLabels, insight.current_disposition)}</Typography>
            </Stack>
            <NarrativeText text={insight.body} />
            <Brand.Disclosure title={`Cited evidence (${insight.citations.length})`}>
                <Box sx={{ display: 'grid', gap: 1 }}>
                    {insight.citations.map((citation) => <Box key={citation.citation_id} sx={{ px: 1.5, py: 1, borderRadius: radius.card, bgcolor: 'brand.haze', borderLeft: 3, borderColor: 'primary.light' }}>
                        <Typography variant="label">{readable(citation.source_locator)}</Typography>
                        <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{readable(citation.excerpt)}</Typography>
                    </Box>)}
                </Box>
            </Brand.Disclosure>
            <InsightDecision insight={insight} onSave={async (disposition, rationale) => onUpdate(await reviewReportInsight(packet.report_id, insight.insight_id, { disposition, rationale: rationale || undefined }))} />
        </Brand.Card>)}
    </Box>;
}

function BriefingContent() {
    const context = useAnalysisContext();
    const [packet, setPacket] = React.useState<ReportReviewPacket | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const { as_of_week: asOfWeek, client_account: clientAccount, category } = context;

    const generate = async () => {
        setLoading(true); setError(null); setPacket(null);
        try { setPacket(await createSnapshotReview({ as_of_week: asOfWeek, client_account: clientAccount, category, evidence_authorized: false })); }
        catch (err) { setError(err instanceof AnalyticsApiError ? err.message : 'The briefing could not be created.'); }
        finally { setLoading(false); }
    };

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.Breadcrumbs items={[{ label: 'Reports', href: context.hrefWith('/dashboard/reports') }, { label: 'Snapshot briefing' }]} />
        <Brand.PageHeader title="Snapshot briefing" description="A fact-referenced briefing from aggregate snapshot facts. It stays a draft until every material insight is reviewed."
            actions={<Brand.Button onClick={() => void generate()} loading={loading}>Create briefing</Brand.Button>}
            actionHint="Uses aggregate facts only; case-level narrative evidence is not included." />
        <ContextBar fields={['client_account', 'category']} />
        {loading ? <Brand.StateView state="loading" title="Creating the briefing" />
            : error ? <Brand.StateView state="error" title="The briefing could not be created" description={error} onRetry={() => void generate()} />
            : packet ? <InsightsReview packet={packet} onUpdate={setPacket} />
            : <Typography variant="body2" color="text.secondary">Choose the week and optional filters, then create a briefing. It produces review priorities with cited facts, recorded decisions, and HTML exports.</Typography>}
    </Box>;
}

export default function SnapshotBriefingPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading snapshot briefing" />}><BriefingContent /></Suspense>;
}
