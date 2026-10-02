'use client';

import { useId, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { ReportDecision, ReportItem } from '../../lib/api/case-reports';
import { formatActor, formatDateTime } from '../../lib/format';

export type ItemDisposition = 'VALIDATED' | 'REVISED' | 'REJECTED';
type Disposition = ItemDisposition | '';
const OPTION_LABELS: Record<ItemDisposition, string> = { VALIDATED: 'Validate', REVISED: 'Revise', REJECTED: 'Reject' };

/**
 * Item decision (reference/48 S10, S23). No answer starts selected on an undecided item; "Change"
 * starts from the recorded decision; every disabled Save says why.
 */
export function ReviewDecision({ item, readOnly, onSave, expandedItem = false, allowedDispositions = ['VALIDATED', 'REVISED', 'REJECTED'] }: {
  item: ReportItem; readOnly: boolean; expandedItem?: boolean; allowedDispositions?: ItemDisposition[];
  onSave: (decision: { disposition: ItemDisposition; comment: string; revisedText: string }) => Promise<void>;
}) {
  const latest = item.decisions.at(-1);
  const recordedText = latest?.disposition === 'REVISED' && latest.revised_text ? latest.revised_text : item.body_text;
  // Opening an already-decided item shows its recorded decision as the current answer.
  const recordedDisposition: Disposition = latest && allowedDispositions.includes(latest.disposition as ItemDisposition) ? latest.disposition as ItemDisposition : '';
  const startsOpen = !latest || expandedItem;
  const [disposition, setDisposition] = useState<Disposition>(startsOpen ? recordedDisposition : '');
  const [revisedText, setRevisedText] = useState(recordedText);
  const [comment, setComment] = useState(startsOpen ? latest?.comment ?? '' : '');
  const [open, setOpen] = useState(startsOpen);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const reasonId = useId();
  const toggleOpen = () => {
    if (!open) { setDisposition(recordedDisposition); setComment(latest?.comment ?? ''); setRevisedText(recordedText); }
    setOpen(!open);
  };

  const unchanged = Boolean(latest) && disposition === latest!.disposition && comment.trim() === (latest!.comment ?? '').trim()
    && (disposition !== 'REVISED' || revisedText.trim() === recordedText.trim());
  const reason = !disposition ? `Choose ${allowedDispositions.map((value) => OPTION_LABELS[value]).join(', ').replace(/, ([^,]*)$/, ' or $1')} to save.`
    : disposition === 'REVISED' && (!revisedText.trim() || revisedText.trim() === item.body_text.trim()) ? 'Change the text to save a revision.'
    : disposition === 'REJECTED' && !comment.trim() ? 'Add a reason to reject.'
    : unchanged ? 'This is the recorded decision. Change the answer or comment to save.' : '';

  const save = async () => {
    if (!disposition || reason) return;
    setBusy(true); setError(''); setSaved(false);
    try { await onSave({ disposition, comment, revisedText }); setSaved(true); setOpen(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save this decision.'); }
    finally { setBusy(false); }
  };
  return <Box>
    {latest && <DecisionSummary decision={latest} onChange={!readOnly ? toggleOpen : undefined} />}
    {!readOnly && open && <Stack spacing={1} sx={{ mt: 1 }}>
      <Brand.ChoiceGroup label="Decision" name={`decision-${item.item_id}`} row value={disposition} onChange={(value) => setDisposition(value as Disposition)} options={allowedDispositions.map((value) => ({ value, label: OPTION_LABELS[value] }))} />
      {disposition === 'REVISED' && <Brand.Field label="Revised text" kind="textarea" required value={revisedText} onChange={(event) => setRevisedText(event.target.value)} />}
      {disposition === 'REJECTED' && <Brand.Field label="Reason for rejection" kind="textarea" required value={comment} onChange={(event) => setComment(event.target.value)} />}
      {(disposition === 'VALIDATED' || disposition === 'REVISED') && <Brand.Field label="Comment (optional)" kind="textarea" value={comment} onChange={(event) => setComment(event.target.value)} rows={2} />}
      {error && <Brand.Notice tone="error">{error}</Brand.Notice>}{saved && <Typography role="status" aria-live="polite" color="success.main">Decision saved.</Typography>}
      <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={1.5} flexWrap="wrap">
        {reason && <Typography id={reasonId} variant="body2" color="text.secondary">{reason}</Typography>}
        <Brand.Button size="compact" disabled={Boolean(reason) || busy} aria-describedby={reason ? reasonId : undefined} loading={busy} onClick={() => void save()}>Save</Brand.Button>
      </Stack>
    </Stack>}
    {item.decisions.length > 0 && <Box sx={{ mt: 1 }}><Brand.Disclosure title={`History (${item.decisions.length})`}><Stack spacing={1}>
      {item.decisions.map((decision) => <Box key={decision.decision_id}><DecisionSummary decision={decision} />{decision.comment && <Typography variant="body2">{decision.comment}</Typography>}{decision.prefilled_from && <Typography variant="caption">Copied from version {decision.prefilled_from}</Typography>}</Box>)}
    </Stack></Brand.Disclosure></Box>}
  </Box>;
}

export function DecisionSummary({ decision, onChange }: { decision: ReportDecision; onChange?: () => void }) {
  const label = decision.disposition === 'VALIDATED' ? 'Validated' : decision.disposition === 'REVISED' ? 'Revised' : 'Rejected';
  return <Stack direction="row" alignItems="center" spacing={1.5} flexWrap="wrap"><Brand.StatusBadge status={decision.disposition.toLowerCase() as 'validated' | 'revised' | 'rejected'} /><Typography variant="body2">{label} by {formatActor(decision.reviewer_subject)} · {formatDateTime(decision.created_at)}</Typography>{onChange && <Brand.Button variant="tertiary" size="compact" onClick={onChange}>Change</Brand.Button>}</Stack>;
}
