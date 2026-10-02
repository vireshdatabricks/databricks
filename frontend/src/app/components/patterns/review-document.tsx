'use client';

import { Box, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { ReportBlock, ReportItem, ReportSection } from '../../lib/api/case-reports';
import { ReviewItem } from './report-review';
import { sectionReviewState } from './review-state';
import ThemeGroup from './theme-group';
import type { CaseDecisionValue } from './case-finding-card';

export default function ReviewDocument({ sections, items, filter, readOnly, onSaveItem, onDecideCase, onCitation, onBulk, sectionRef }: {
  sections: ReportSection[]; items: ReportItem[]; filter: string; readOnly: boolean;
  onSaveItem: (item: ReportItem, decision: { disposition: 'VALIDATED' | 'REVISED' | 'REJECTED'; comment: string; revisedText: string }) => Promise<void>;
  onDecideCase: (caseNumber: string, value: CaseDecisionValue) => Promise<void>;
  onCitation: (citation: ReportItem['citations'][number], index: number) => void;
  onBulk: (theme: ReportItem, cases: Array<{ case_number: string; item_ids: string[]; summary: { undecided: number; validated: number; revised: number; rejected: number } }>) => void;
  sectionRef: (id: string, node: HTMLDivElement | null) => void;
}) {
  const itemById = new Map(items.map((item) => [item.item_id, item]));
  const fallbackSections = sections.every((section) => section.blocks == null);
  // S25: blocks use the full content column; only running text keeps a ~72-character reading measure.
  return <Box sx={{ minWidth: 0, display: 'grid', gap: 4 }}>
    {sections.map((section) => {
      const sectionItems = items.filter((item) => item.section_id === section.id);
      const blocks: ReportBlock[] = section.blocks ?? sectionItems.map((item) => ({ type: 'item', item_id: item.item_id }));
      return <Box key={section.id} id={`report-section-${section.id}`} ref={(node: HTMLDivElement | null) => sectionRef(section.id, node)} sx={{ display: 'grid', gap: 2, scrollMarginTop: 150, contentVisibility: 'auto', containIntrinsicSize: '900px' }}>
        <Box><Typography variant="h2" component="h2">{section.number ? `${section.number}. ` : ''}{section.heading}</Typography>{section.origin_note && <Typography variant="body2" color="text.secondary">{section.origin_note}</Typography>}<Typography variant="body2" color="text.secondary">{sectionReviewState(section.review).label}</Typography></Box>
        {blocks.map((block, index) => {
          if (block.type === 'text') {
            const defaultOrigin = section.origin_note?.startsWith('Generated') ? 'MODEL' : section.origin_note?.startsWith('Computed') ? 'COMPUTED' : 'TEMPLATE';
            return <Box key={`${section.id}-text-${index}`} sx={{ whiteSpace: 'pre-wrap' }}><Typography sx={{ maxWidth: '72ch' }}>{block.text}</Typography>{block.origin !== defaultOrigin && (block.origin === 'COMPUTED' ? <Brand.StatusBadge status="computed-fact" /> : <Typography variant="caption">Template content</Typography>)}</Box>;
          }
          if (block.type === 'facts') return <Brand.SummaryPanel key={`${section.id}-facts-${index}`} title="Report facts" rows={block.rows.map((row) => ({ label: row.label, value: row.value }))} />;
          if (block.type === 'theme_group') {
            const theme = itemById.get(block.theme_item_id ?? '');
            if (!theme) return <Brand.Notice key={`${section.id}-theme-${index}`} tone="warning">Theme details are not available in this report version.</Brand.Notice>;
            return <ThemeGroup key={theme.item_id} block={block} items={items} readOnly={readOnly} filter={filter} onSaveItem={(item, decision) => onSaveItem(item, decision)} onDecideCase={onDecideCase} onCitation={onCitation} onBulk={onBulk} />;
          }
          if (block.type === 'item' || block.type === 'evidence_answer') {
            const item = itemById.get(block.item_id ?? '');
            if (!item) return <Typography key={`${section.id}-missing-${index}`} variant="body2" color="text.secondary">This report content has no reviewable item.</Typography>;
            const matches = filter === 'ALL' || (filter === 'UNDECIDED' ? item.current_status === 'UNVALIDATED' : item.current_status !== 'UNVALIDATED');
            return <Box key={item.item_id} id={`review-item-${item.item_id}`} sx={{ contentVisibility: 'auto', containIntrinsicSize: '360px' }}><ReviewItem item={item} readOnly={readOnly} collapsed={!matches} onSave={(decision) => onSaveItem(item, decision)} onCitation={onCitation} /></Box>;
          }
          return null;
        })}
        {fallbackSections && sectionItems.length === 0 && <Typography variant="body2" color="text.secondary">No reviewable items.</Typography>}
      </Box>;
    })}
    {sections.length === 0 && <Brand.StateView state="empty" title="This report has no content" description="No sections were included in this report version." />}
  </Box>;
}
