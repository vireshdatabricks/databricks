'use client';

import { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { ReportItem } from '../../lib/api/case-reports';
import type { CaseDecisionValue } from './case-finding-card';
import CaseFindingCard from './case-finding-card';
import { ReviewDecision } from './review-decision';
import CitationChip from './citation-chip';

type ThemeGroupBlock = { theme_item_id?: string | null; cases: Array<{ case_number: string; item_ids: string[]; summary: { undecided: number; validated: number; revised: number; rejected: number } }> };
export default function ThemeGroup({ block, items, readOnly, filter, onSaveItem, onDecideCase, onCitation, onBulk }: {
  block: ThemeGroupBlock; items: ReportItem[]; readOnly: boolean; filter: string;
  onSaveItem: (item: ReportItem, decision: { disposition: 'VALIDATED' | 'REVISED' | 'REJECTED'; comment: string; revisedText: string }) => Promise<void>;
  onDecideCase: (caseNumber: string, value: CaseDecisionValue) => Promise<void>;
  onCitation: (citation: ReportItem['citations'][number], index: number) => void;
  onBulk: (theme: ReportItem, cases: ThemeGroupBlock['cases']) => void;
}) {
  const theme = items.find((item) => item.item_id === block.theme_item_id)!;
  const cases = block.cases.map((group) => ({ ...group, items: group.item_ids.map((id) => items.find((item) => item.item_id === id)).filter((item): item is ReportItem => Boolean(item)) }));
  const undecided = cases.filter((group) => group.items.some((item) => item.current_status === 'UNVALIDATED'));
  const matches = filter === 'ALL' || (filter === 'UNDECIDED' ? theme.current_status === 'UNVALIDATED' : theme.current_status !== 'UNVALIDATED');
  const [themeExpanded, setThemeExpanded] = useState(matches);
  useEffect(() => { if (!matches) setThemeExpanded(false); }, [matches]);
  const [problem = '', actionLine = ''] = theme.body_text.split(/\nKey systemic action:\s*/i);
  return <Box sx={{ display: 'grid', gap: 2 }}>
    <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5, borderLeft: theme.current_status === 'UNVALIDATED' ? 4 : 1, borderLeftColor: theme.current_status === 'UNVALIDATED' ? 'brand.information' : 'divider' }}>
      <Typography variant="h3" component="h3">{theme.title.replace(/^Theme:\s*/i, '')}</Typography>
      {theme.current_status === 'UNVALIDATED' && <Brand.StatusBadge status="unvalidated" />}
      {!themeExpanded && <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="body2">Theme statement and decision</Typography><Brand.Button variant="tertiary" size="compact" onClick={() => setThemeExpanded(true)}>Change</Brand.Button></Stack>}
      {themeExpanded && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr)' }, gap: 1 }}><Typography variant="label">Problem</Typography><Typography sx={{ whiteSpace: 'pre-wrap' }}>{problem}</Typography><Typography variant="label">Key action</Typography><Typography sx={{ whiteSpace: 'pre-wrap' }}>{actionLine}</Typography></Box>
        {theme.citations.length > 0 && <Box><Typography variant="label">Sources</Typography><Stack direction="row" gap={1.5}>{theme.citations.map((citation, index) => <CitationChip key={index} citation={citation} index={index + 1} onOpen={onCitation} />)}</Stack></Box>}
      </>}
      <Typography variant="h4" component="h4">Supporting cases ({cases.length})</Typography>
      {cases.length ? cases.map((group) => {
        const caseMatches = filter === 'ALL' || (filter === 'UNDECIDED' ? group.items.some((item) => item.current_status === 'UNVALIDATED') : group.items.some((item) => item.current_status !== 'UNVALIDATED'));
        return <CaseFindingCard key={group.case_number} caseNumber={group.case_number} items={group.items} readOnly={readOnly} collapsed={!caseMatches} onCitation={onCitation} onDecide={(value) => onDecideCase(group.case_number, value)} />;
      }) : <Typography variant="body2">No supporting case findings were included.</Typography>}
      {themeExpanded && <ReviewDecision item={theme} readOnly={readOnly} onSave={async (decision) => { await onSaveItem(theme, decision); setThemeExpanded(false); }} />}
      {!readOnly && undecided.length > 0 && <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Brand.Button variant="secondary" size="compact" onClick={() => onBulk(theme, undecided)}>Validate remaining {undecided.length} case findings</Brand.Button></Box>}
    </Brand.Card>
  </Box>;
}
