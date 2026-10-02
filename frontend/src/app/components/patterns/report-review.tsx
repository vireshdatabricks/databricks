'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { ReportCitation, ReportItem } from '../../lib/api/case-reports';
import { citationRecordLabels, labelFor } from '../../lib/labels';
import { ReviewDecision } from './review-decision';
import CitationChip from './citation-chip';
import { radius } from '../../utils/theme';

export function ReviewProgress({ decided, total }: { decided: number; total: number }) {
  const value = total ? Math.round((decided / total) * 100) : 0;
  return <Box aria-label={`${decided} of ${total} items decided`} sx={{ position: 'sticky', top: 0, zIndex: 2, py: 1.5, px: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: radius.card }}>
    <Stack direction="row" alignItems="center" gap={2}>
      <Typography variant="body2" sx={{ minWidth: 160 }}>{decided} of {total} decided</Typography>
      <Box role="progressbar" aria-label="Review progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={decided} sx={{ height: 8, flex: 1, bgcolor: 'brand.ash', borderRadius: radius.field, overflow: 'hidden' }}><Box sx={{ height: '100%', width: `${value}%`, bgcolor: 'brand.success', transition: 'width 160ms ease' }} /></Box>
      <Typography variant="caption">{value}%</Typography>
    </Stack>
  </Box>;
}

export function CitationPanelContent({ citation, depth = 0 }: { citation: ReportCitation; depth?: number }) {
  return <Box sx={{ display: 'grid', gap: 1.5, pl: depth ? 2 : 0, borderLeft: depth ? 1 : 0, borderColor: 'divider' }}>
    {citation.source_type && <Typography variant="body2"><strong>Source:</strong> {labelFor(citationRecordLabels, citation.source_type)}</Typography>}
    {citation.record && <Typography variant="body2"><strong>Record:</strong> {citation.source_type?.toUpperCase().includes('CASE') ? <Link href={`/dashboard/cases/${encodeURIComponent(citation.record)}`}>{citation.record}</Link> : citation.record}</Typography>}
    {citation.field && <Typography variant="body2"><strong>Field:</strong> {citation.field}</Typography>}
    {citation.file && <Typography variant="body2"><strong>File:</strong> {citation.file}</Typography>}
    {citation.sheet && <Typography variant="body2"><strong>Sheet or page:</strong> {citation.sheet}</Typography>}
    {citation.extract_week && <Typography variant="body2"><strong>Extract week:</strong> {citation.extract_week}</Typography>}
    {citation.quote ? <Box component="blockquote" sx={{ m: 0, p: 1.5, bgcolor: 'brand.ash', borderRadius: radius.card, whiteSpace: 'pre-wrap' }}><Typography variant="body2">“{citation.quote}”</Typography></Box> : <Brand.Notice tone="warning">Citation could not be verified from the imported report.</Brand.Notice>}
    {(citation.children ?? []).map((child, index) => <Box key={`${child.record ?? child.file ?? 'citation'}-${index}`}><Typography variant="caption" color="text.secondary">From linked evidence</Typography><CitationPanelContent citation={child} depth={depth + 1} /></Box>)}
  </Box>;
}

export function ReviewItem({
  item, readOnly, onSave, onCitation, focusRef, collapsed = false,
}: {
  item: ReportItem; readOnly: boolean; onSave: (decision: { disposition: 'VALIDATED' | 'REVISED' | 'REJECTED'; comment: string; revisedText: string }) => Promise<void>;
  onCitation: (citation: ReportCitation, index: number) => void; focusRef?: (node: HTMLDivElement | null) => void; collapsed?: boolean;
}) {
  const [expanded, setExpanded] = useState(item.current_status === 'UNVALIDATED' && !collapsed);
  useEffect(() => { if (collapsed || item.current_status !== 'UNVALIDATED') setExpanded(false); }, [collapsed, item.current_status]);
  const latest = item.decisions.at(-1);
  const currentText = latest?.disposition === 'REVISED' && latest.revised_text ? latest.revised_text : item.body_text;
  const heading: 'h3' | 'h4' = item.kind === 'FINDING' ? 'h4' : 'h3';
  const evidence = item.kind === 'QUERY_RESULT';
  const title = evidence ? item.detail?.question || item.title : item.title.replace(/^Theme:\s*/i, '');
  if (!expanded && (collapsed || latest || item.current_status !== 'UNVALIDATED')) return <Brand.Card bordered="outlined"><Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}><Typography variant="body2">{title}</Typography><Stack direction="row" alignItems="center" gap={1.5}><Brand.StatusBadge status={item.current_status.toLowerCase() as 'unvalidated' | 'validated' | 'revised' | 'rejected'} />{!readOnly && <Brand.Button variant="tertiary" size="compact" onClick={() => setExpanded(true)}>Change</Brand.Button>}</Stack></Stack></Brand.Card>;
  return <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5, borderLeft: item.current_status === 'UNVALIDATED' ? 4 : 1, borderLeftColor: item.current_status === 'UNVALIDATED' ? 'brand.information' : 'divider' }}>
    <Box ref={focusRef} tabIndex={-1} sx={{ scrollMarginTop: 140 }}>
      <Typography variant={heading} component={heading}>{title}</Typography>
      {item.current_status === 'UNVALIDATED' && <Brand.StatusBadge status="unvalidated" />}
    </Box>
    {evidence ? <EvidenceAnswer item={item} bare /> : <Typography sx={{ whiteSpace: 'pre-wrap' }}>{currentText}</Typography>}
    {latest?.disposition === 'REVISED' && <Brand.Disclosure title="Original text"><Typography sx={{ whiteSpace: 'pre-wrap' }}>{item.body_text}</Typography></Brand.Disclosure>}
    {item.citations.length > 0 && <Box><Typography variant="label" sx={{ mb: 0.5, display: 'block' }}>Sources</Typography><Stack direction="row" gap={1.5} flexWrap="wrap">{item.citations.map((value, index) => <CitationChip key={`${value.record ?? value.file ?? 'source'}-${index}`} citation={value} index={index + 1} onOpen={onCitation} />)}</Stack></Box>}
    {/* A computed result cannot be reworded, so evidence answers are validated or rejected only (S21). */}
    <ReviewDecision item={item} readOnly={readOnly} expandedItem={expanded} allowedDispositions={evidence ? ['VALIDATED', 'REJECTED'] : undefined} onSave={async (decision) => { await onSave(decision); setExpanded(false); }} />
    {(latest || item.current_status !== 'UNVALIDATED') && !readOnly && <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Brand.Button variant="tertiary" size="compact" onClick={() => setExpanded(false)}>Collapse</Brand.Button></Box>}
  </Brand.Card>;
}

/** Evidence answer content. `bare` drops the card and question heading when a ReviewItem wraps it. */
export function EvidenceAnswer({ item, bare = false }: { item: ReportItem; bare?: boolean }) {
  const detail = item.detail ?? {};
  const rows = detail.rows ?? [];
  const columns = (detail.result_columns?.length ? detail.result_columns : Object.keys(rows[0] ?? {})).map((id) => ({ id, label: id, value: (row: Record<string, unknown>) => String(row[id] ?? '—') }));
  const content = <>
    <Typography variant="body2">{detail.check_status === 'ACCEPTED' ? 'Check passed' : `Check failed: ${detail.check_detail ?? 'No explanation was provided.'}`}</Typography>
    <Typography variant="caption" color="text.secondary">{detail.row_count ?? rows.length} rows returned</Typography>
    {rows.length ? <Brand.DataTable rows={rows.slice(0, 50)} columns={columns} getRowId={(row) => String(row.id ?? row.case_number ?? JSON.stringify(row))} label="Evidence answer results" emptyTitle="No result rows" /> : <Typography color="text.secondary">No result rows were returned.</Typography>}
    {detail.generated_sql && <Brand.Disclosure title="Show SQL"><Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Brand.Button size="compact" variant="tertiary" onClick={() => void navigator.clipboard?.writeText(detail.generated_sql ?? '')}>Copy SQL</Brand.Button></Box><Box component="pre" sx={{ whiteSpace: 'pre-wrap', overflowX: 'auto', fontFamily: 'monospace', p: 1.5, bgcolor: 'brand.ash', borderRadius: radius.card }}>{detail.generated_sql}</Box></Brand.Disclosure>}
  </>;
  if (bare) return <Box sx={{ display: 'grid', gap: 1.5 }}>{content}</Box>;
  return <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
    <Typography variant="h3" component="h3">{detail.question || item.title}</Typography>
    {content}
  </Brand.Card>;
}
