import type { ReportItem, ReportSection } from '../../lib/api/case-reports';

/** One status rule for section headers, the contents list, and progress (reference/48 S22). */
export function sectionReviewState(review?: { decided: number; total: number } | null): { kind: 'none' | 'done' | 'partial'; label: string } {
  const total = review?.total ?? 0;
  const decided = review?.decided ?? 0;
  if (total === 0) return { kind: 'none', label: 'No review needed' };
  if (decided >= total) return { kind: 'done', label: '✓ Done' };
  return { kind: 'partial', label: `${decided} of ${total} decided` };
}

const KIND_NOUNS: Record<string, [string, string]> = {
  QUERY_RESULT: ['evidence answer', 'evidence answers'],
  FINDING: ['case finding field', 'case finding fields'],
  THEME: ['theme', 'themes'],
  SCOPE_DECISION: ['scope decision', 'scope decisions'],
  SECTION: ['generated section', 'generated sections'],
};
export const itemNoun = (kind: string, count: number) => (KIND_NOUNS[kind] ?? ['item', 'items'])[count === 1 ? 0 : 1];

/** DOM id an undecided item scrolls to: finding fields live inside their case card. */
export const itemTargetId = (item: ReportItem) => item.kind === 'FINDING' && item.case_number ? `review-case-${item.case_number}` : `review-item-${item.item_id}`;

export type RemainingGroup = { key: string; text: string; targetId: string; count: number };

/** Undecided items grouped by section and kind, in document order: "2 evidence answers in Operational context". */
export function remainingGroups(sections: ReportSection[], items: ReportItem[]): RemainingGroup[] {
  const order = new Map(sections.map((section, index) => [section.id, index]));
  const heading = new Map(sections.map((section) => [section.id, section.heading]));
  const groups = new Map<string, { section: string; kind: string; items: ReportItem[] }>();
  for (const item of items) {
    if (item.current_status !== 'UNVALIDATED') continue;
    const key = `${item.section_id}|${item.kind}`;
    const group = groups.get(key) ?? { section: item.section_id, kind: item.kind, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => (order.get(a.section) ?? 999) - (order.get(b.section) ?? 999) || a.items[0].sequence - b.items[0].sequence)
    .map(([key, group]) => ({
      key, count: group.items.length, targetId: itemTargetId(group.items.sort((a, b) => a.sequence - b.sequence)[0]),
      text: `${group.items.length} ${itemNoun(group.kind, group.items.length)} in ${heading.get(group.section) ?? group.section}`,
    }));
}
