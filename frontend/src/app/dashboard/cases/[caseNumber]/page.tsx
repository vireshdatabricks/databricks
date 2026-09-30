'use client';

import React, { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Alert, Box, Checkbox, Divider, FormControlLabel, Grid, TextField, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import { AnalyticsApiError, CaseDetail, CaseDiagnosticContext, DiagnosticDisposition, Envelope, createCaseDiagnostic, getCase, getCaseDiagnosticContext, reviewCaseDiagnostic } from '../../../utils/analytics-api';
import FreshnessBanner from '../../components/freshness-banner';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Grid item xs={12} sm={6} md={4}>
            <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
            <Typography variant="body1">{value ?? '—'}</Typography>
        </Grid>
    );
}

const statusLabel = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

function DiagnosticPanel({ caseNumber, asOfWeek }: { caseNumber: string; asOfWeek: string }) {
    const [context, setContext] = React.useState<CaseDiagnosticContext | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [saving, setSaving] = React.useState(false);
    const [selectedEvidence, setSelectedEvidence] = React.useState<string[]>([]);
    const [observedIssue, setObservedIssue] = React.useState('');
    const [contributingFactor, setContributingFactor] = React.useState('');
    const [detectionGap, setDetectionGap] = React.useState('');
    const [owner, setOwner] = React.useState('');
    const [action, setAction] = React.useState('');
    const [rationale, setRationale] = React.useState<Record<string, string>>({});

    const load = React.useCallback(() => {
        setLoading(true);
        setError(null);
        return getCaseDiagnosticContext(caseNumber, { as_of_week: asOfWeek })
            .then(setContext)
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load diagnostic review.'))
            .finally(() => setLoading(false));
    }, [caseNumber, asOfWeek]);

    React.useEffect(() => { void load(); }, [load]);

    const toggleEvidence = (segmentId: string) => {
        setSelectedEvidence((ids) => ids.includes(segmentId) ? ids.filter((id) => id !== segmentId) : [...ids, segmentId]);
    };

    const create = async () => {
        if (!observedIssue.trim() || selectedEvidence.length === 0) {
            setError('Enter the observed issue and select at least one description or closing-note excerpt.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await createCaseDiagnostic(caseNumber, asOfWeek, {
                observed_issue: observedIssue,
                candidate_contributing_factor: contributingFactor,
                detection_gap: detectionGap,
                candidate_owner: owner,
                proposed_action: action,
                evidence_segment_ids: selectedEvidence,
            });
            setObservedIssue(''); setContributingFactor(''); setDetectionGap(''); setOwner(''); setAction(''); setSelectedEvidence([]);
            await load();
        } catch (err) {
            setError(err instanceof AnalyticsApiError ? err.message : 'Unable to create the diagnostic candidate.');
        } finally { setSaving(false); }
    };

    const review = async (diagnosticId: string, disposition: DiagnosticDisposition) => {
        const reviewerRationale = rationale[diagnosticId] ?? '';
        if (disposition !== 'VALIDATED' && !reviewerRationale.trim()) {
            setError('Add a rationale before rejecting, revising, marking duplicate, or requesting evidence.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await reviewCaseDiagnostic(diagnosticId, { disposition, rationale: reviewerRationale });
            await load();
        } catch (err) {
            setError(err instanceof AnalyticsApiError ? err.message : 'Unable to record the review.');
        } finally { setSaving(false); }
    };

    return (
        <Brand.Card bordered="outlined">
            <Typography variant="h6">Diagnostic review</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Create a candidate from selected delivered descriptions and closing notes. It remains a hypothesis until an individual reviewer validates it.
            </Typography>
            {loading && <Typography sx={{ mt: 2 }}>Loading diagnostic review…</Typography>}
            {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
            {context && <>
                <Alert severity="warning" sx={{ mt: 2 }}>{context.identity_notice}</Alert>
                <Box sx={{ display: 'grid', gap: 2, mt: 3 }}>
                    <Typography variant="subtitle1">Create diagnostic candidate</Typography>
                    <TextField label="Observed issue" value={observedIssue} onChange={(event) => setObservedIssue(event.target.value)} required multiline minRows={2} />
                    <TextField label="Candidate contributing factor" value={contributingFactor} onChange={(event) => setContributingFactor(event.target.value)} multiline minRows={2} helperText="Hypothesis only — do not state this as a confirmed root cause." />
                    <TextField label="What may not have caught it" value={detectionGap} onChange={(event) => setDetectionGap(event.target.value)} multiline minRows={2} />
                    <TextField label="Candidate owner" value={owner} onChange={(event) => setOwner(event.target.value)} />
                    <TextField label="Proposed action" value={action} onChange={(event) => setAction(event.target.value)} multiline minRows={2} />
                    <Box>
                        <Typography variant="subtitle2">Evidence to cite</Typography>
                        <Typography variant="body2" color="text.secondary">Select one or more source excerpts. The server resolves these by segment ID and stores bounded citations.</Typography>
                        <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
                            {context.evidence.map((item) => <Box key={item.segment_id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, px: 1 }}>
                                <FormControlLabel control={<Checkbox checked={selectedEvidence.includes(item.segment_id)} onChange={() => toggleEvidence(item.segment_id)} />} label={`${item.record_level}${item.task_number ? ` · ${item.task_number}` : ''} · ${statusLabel(item.segment_type)}`} />
                                <Typography variant="body2" sx={{ pb: 1, whiteSpace: 'pre-wrap' }}>{item.excerpt}</Typography>
                            </Box>)}
                        </Box>
                    </Box>
                    <Brand.Button onClick={create} loading={saving}>Create candidate</Brand.Button>
                </Box>
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle1">Recorded diagnostics</Typography>
                {context.diagnostics.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No diagnostic candidates have been recorded for this case and extract week.</Typography>}
                <Box sx={{ display: 'grid', gap: 2, mt: 2 }}>
                    {context.diagnostics.map((diagnostic) => <Box key={diagnostic.diagnostic_id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                        <Typography variant="subtitle2">{statusLabel(diagnostic.status)}</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}><strong>Observed issue:</strong> {diagnostic.observed_issue}</Typography>
                        {diagnostic.candidate_contributing_factor && <Typography variant="body2"><strong>Candidate contributing factor:</strong> {diagnostic.candidate_contributing_factor}</Typography>}
                        {diagnostic.detection_gap && <Typography variant="body2"><strong>Detection gap:</strong> {diagnostic.detection_gap}</Typography>}
                        {diagnostic.candidate_owner && <Typography variant="body2"><strong>Candidate owner:</strong> {diagnostic.candidate_owner}</Typography>}
                        {diagnostic.proposed_action && <Typography variant="body2"><strong>Proposed action:</strong> {diagnostic.proposed_action}</Typography>}
                        <Typography variant="caption" display="block" sx={{ mt: 1 }}>{diagnostic.evidence.length} cited excerpt(s) · created by {diagnostic.created_by_subject}</Typography>
                        <TextField fullWidth label="Review rationale" value={rationale[diagnostic.diagnostic_id] ?? ''} onChange={(event) => setRationale((current) => ({ ...current, [diagnostic.diagnostic_id]: event.target.value }))} multiline minRows={2} sx={{ mt: 2 }} />
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                            <Brand.Button size="compact" onClick={() => review(diagnostic.diagnostic_id, 'VALIDATED')} loading={saving}>Validate</Brand.Button>
                            <Brand.Button size="compact" variant="destructive" onClick={() => review(diagnostic.diagnostic_id, 'REJECTED')} disabled={saving}>Reject</Brand.Button>
                            <Brand.Button size="compact" variant="secondary" onClick={() => review(diagnostic.diagnostic_id, 'REVISED')} disabled={saving}>Revise</Brand.Button>
                            <Brand.Button size="compact" variant="secondary" onClick={() => review(diagnostic.diagnostic_id, 'ADDITIONAL_EVIDENCE_REQUIRED')} disabled={saving}>Need evidence</Brand.Button>
                        </Box>
                        {diagnostic.decisions.length > 0 && <Box sx={{ mt: 2 }}><Typography variant="subtitle2">Review history</Typography>{diagnostic.decisions.map((decision) => <Typography key={decision.decision_id} variant="body2">{statusLabel(decision.disposition)} by {decision.reviewer_subject}: {decision.rationale}</Typography>)}</Box>}
                    </Box>)}
                </Box>
            </>}
        </Brand.Card>
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

                    <DiagnosticPanel caseNumber={caseNumber} asOfWeek={envelope.as_of_week} />

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
