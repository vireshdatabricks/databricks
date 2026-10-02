'use client';

import { useEffect, useId, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { ReportItem } from '../../lib/api/case-reports';
import { formatActor, formatDateTime, humanizeIdentifier } from '../../lib/format';
import CitationChip from './citation-chip';
import { DecisionSummary } from './review-decision';

const FIELD_LABELS: Record<string, string> = {
  what_happened: 'What happened', what_failed: 'What failed', where_it_occurred: 'Where it occurred',
  how_detected: 'How it was detected', resolution: 'Resolution', prevention_opportunity: 'Prevention opportunity', likely_causes: 'Likely causes',
};
export type FieldOverride = { item_id: string; disposition: 'REVISED' | 'REJECTED'; revised_text?: string; comment?: string };
export type CaseDecisionValue = { disposition?: 'VALIDATED' | 'REJECTED'; comment: string; fieldOverrides: FieldOverride[] };
type CaseDisposition = 'VALIDATED' | 'REJECTED' | '';

const currentText = (item: ReportItem) => { const latest = item.decisions.at(-1); return latest?.disposition === 'REVISED' && latest.revised_text ? latest.revised_text : item.body_text; };
const fieldLabelOf = (item: ReportItem, caseNumber: string) => { const key = item.item_key.split(':').at(-1) ?? item.title.replace(`${caseNumber} `, ''); return FIELD_LABELS[key] ?? humanizeIdentifier(key); };
/** The case-level answer the records reflect: Reject only when every non-revised field is rejected. */
function recordedDisposition(items: ReportItem[]): CaseDisposition {
  if (items.some((item) => item.current_status === 'UNVALIDATED')) return '';
  const unrevised = items.filter((item) => item.current_status !== 'REVISED');
  return unrevised.length && unrevised.every((item) => item.current_status === 'REJECTED') ? 'REJECTED' : 'VALIDATED';
}

/**
 * Case card (reference/48 S11, S23): one case decision with per-field exceptions. A fully decided
 * case opens on its recorded decision and can save field changes alone; every disabled Save says why.
 */
export default function CaseFindingCard({ caseNumber, items, readOnly, onCitation, onDecide, collapsed = false }: {
  caseNumber: string; items: ReportItem[]; readOnly: boolean; onCitation: (citation: ReportItem['citations'][number], index: number) => void;
  onDecide: (value: CaseDecisionValue) => Promise<void>; collapsed?: boolean;
}) {
  const undecided = items.filter((item) => item.current_status === 'UNVALIDATED').length;
  const recorded = recordedDisposition(items);
  const [expanded, setExpanded] = useState(undecided > 0);
  const [disposition, setDisposition] = useState<CaseDisposition>(recorded);
  const [comment, setComment] = useState('');
  const [overrides, setOverrides] = useState<Record<string, FieldOverride>>({});
  const [exception, setException] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reasonId = useId();
  const latest = items.map((item) => item.decisions.at(-1)).filter(Boolean);
  useEffect(() => { if (collapsed || undecided === 0) setExpanded(false); }, [collapsed, undecided]);
  // Opening (or reopening after a save) starts from what is recorded, never from a blank answer.
  useEffect(() => { if (expanded) { setDisposition(recorded); setComment(''); setOverrides({}); setException(null); } }, [expanded, recorded]);

  const pending = Object.values(overrides);
  const fieldOnly = recorded !== '' && disposition === recorded && pending.length > 0;
  const overrideReason = pending.map((value) => {
    const item = items.find((candidate) => candidate.item_id === value.item_id);
    if (!item) return '';
    const label = fieldLabelOf(item, caseNumber).toLowerCase();
    if (value.disposition === 'REVISED') return !value.revised_text?.trim() || value.revised_text.trim() === currentText(item).trim() ? `Change the text of ${label} to save a revision.` : '';
    return !value.comment?.trim() ? `Add a reason to reject ${label}.` : '';
  }).find(Boolean);
  const reason = !disposition ? 'Choose Validate case findings or Reject case findings to save.'
    : disposition === 'REJECTED' && !comment.trim() && !fieldOnly ? 'Add a reason to reject the case findings.'
    : overrideReason ? overrideReason
    : recorded !== '' && disposition === recorded && pending.length === 0 && !comment.trim() ? 'This is the recorded decision. Change it or a field to save.'
    : '';

  const decide = async () => {
    if (reason || !disposition) return;
    setBusy(true); setError('');
    try {
      await onDecide(fieldOnly ? { comment, fieldOverrides: pending } : { disposition, comment, fieldOverrides: pending });
      setOverrides({}); setException(null); setComment(''); setExpanded(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the case decision.'); }
    finally { setBusy(false); }
  };
  const updateOverride = (id: string, next: FieldOverride | null) => setOverrides((old) => { const copy = { ...old }; if (next) copy[id] = next; else delete copy[id]; return copy; });

  return <Brand.Card id={`review-case-${caseNumber}`} tabIndex={-1} bordered="outlined" sx={{ display: 'grid', gap: 1.5, scrollMarginTop: 150, '&:focus': { outline: '2px solid', outlineColor: 'brand.hyperlink' } }}>
    <Box component="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, minHeight: 44, width: '100%', p: 0, border: 0, bgcolor: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'text.primary', '&:focus-visible': { outline: '2px solid', outlineColor: 'brand.hyperlink' } }}>
      <Box><Typography variant="h4" component="h4">{caseNumber}</Typography><Typography variant="body2" color="text.secondary">{items.length} fields · {undecided ? `${undecided} undecided` : 'all decided'}{!expanded && !readOnly && undecided === 0 ? ' · Change' : ''}</Typography></Box>
      {latest.length > 0 && (undecided ? <Brand.StatusBadge status="unvalidated" /> : latest.at(-1) ? <DecisionSummary decision={latest.at(-1)!} /> : null)}
    </Box>
    {expanded && <Stack spacing={1.5}>
      {items.map((item) => {
        const value = overrides[item.item_id];
        const fieldLabel = fieldLabelOf(item, caseNumber);
        return <Box key={item.item_id} sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography variant="label" component="h5">{fieldLabel}</Typography>{item.current_status !== 'UNVALIDATED' && <Brand.StatusBadge status={item.current_status.toLowerCase() as 'validated' | 'revised' | 'rejected'} />}</Stack>
          <Typography sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>{value?.disposition === 'REVISED' ? value.revised_text : currentText(item)}</Typography>
          {item.citations.length > 0 && <Stack direction="row" gap={1.5} flexWrap="wrap" sx={{ mt: 0.5 }}>{item.citations.map((citation, index) => <CitationChip key={`${citation.record ?? citation.file ?? 'source'}-${index}`} citation={citation} index={index + 1} onOpen={onCitation} />)}</Stack>}
          {item.decisions.length > 0 && <Brand.Disclosure title={`History (${item.decisions.length})`}><Stack spacing={1}>{item.decisions.map((decision) => <Box key={decision.decision_id}><Stack direction="row" spacing={1} alignItems="center"><Brand.StatusBadge status={decision.disposition.toLowerCase() as 'validated' | 'revised' | 'rejected'} /><Typography variant="body2">{formatActor(decision.reviewer_subject)} · {formatDateTime(decision.created_at)}</Typography></Stack>{decision.comment && <Typography variant="body2">{decision.comment}</Typography>}</Box>)}</Stack></Brand.Disclosure>}
          {!readOnly && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
            <Brand.Button variant="tertiary" size="compact" onClick={() => { setException(item.item_id); updateOverride(item.item_id, { item_id: item.item_id, disposition: 'REVISED', revised_text: value?.revised_text ?? currentText(item) }); }}>Revise this field</Brand.Button>
            <Brand.Button variant="tertiary" size="compact" onClick={() => { setException(item.item_id); updateOverride(item.item_id, { item_id: item.item_id, disposition: 'REJECTED', comment: '' }); }}>Reject this field</Brand.Button>
            {value && <Brand.Button variant="tertiary" size="compact" onClick={() => { updateOverride(item.item_id, null); setException(null); }}>Clear exception</Brand.Button>}
          </Stack>}
          {exception === item.item_id && !readOnly && <Stack spacing={1} sx={{ mt: 1 }}>
            {value?.disposition === 'REVISED' && <Brand.Field label={`Revised ${fieldLabel.toLowerCase()}`} kind="textarea" required value={value.revised_text ?? ''} onChange={(event) => updateOverride(item.item_id, { ...value, revised_text: event.target.value })} />}
            {value?.disposition === 'REJECTED' && <Brand.Field label="Reason for rejecting this field" kind="textarea" required value={value.comment ?? ''} onChange={(event) => updateOverride(item.item_id, { ...value, comment: event.target.value })} />}
          </Stack>}
        </Box>;
      })}
      {!readOnly && items.length > 0 && <Stack spacing={1.5} sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
        {recorded && <Typography variant="body2" color="text.secondary">Recorded case decision: {recorded === 'VALIDATED' ? 'Validated' : 'Rejected'}. Change a field on its own, or choose a different case decision.</Typography>}
        <Brand.ChoiceGroup label="Case decision" row value={disposition} onChange={(value) => setDisposition(value as CaseDisposition)} options={[{ value: 'VALIDATED', label: 'Validate case findings' }, { value: 'REJECTED', label: 'Reject case findings' }]} />
        {disposition === 'REJECTED' && !fieldOnly && <Brand.Field label="Reason for rejecting these case findings" kind="textarea" required value={comment} onChange={(event) => setComment(event.target.value)} />}
        {disposition === 'VALIDATED' && !fieldOnly && <Brand.Field label="Comment (optional)" kind="textarea" rows={2} value={comment} onChange={(event) => setComment(event.target.value)} />}
        {error && <Brand.Notice tone="error">{error}</Brand.Notice>}
        <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={1.5} flexWrap="wrap">
          {reason && <Typography id={reasonId} variant="body2" color="text.secondary">{reason}</Typography>}
          <Brand.Button size="compact" disabled={Boolean(reason) || busy} aria-describedby={reason ? reasonId : undefined} loading={busy} onClick={() => void decide()}>{fieldOnly ? `Save field change${pending.length === 1 ? '' : 's'}` : 'Save case decision'}</Brand.Button>
        </Stack>
      </Stack>}
    </Stack>}
  </Brand.Card>;
}
