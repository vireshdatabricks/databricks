'use client';

import { useEffect, useState } from 'react';
import type { ReportSection } from '../../lib/api/case-reports';
import ContentsNav from './contents-nav';
import { sectionReviewState } from './review-state';

export default function ReviewToc({ sections, activeId, onActiveChange, onNavigate }: { sections: ReportSection[]; activeId: string; onActiveChange: (id: string) => void; onNavigate: (id: string) => void }) {
  const [current, setCurrent] = useState(activeId);
  useEffect(() => {
    const nodes = sections.map((section) => document.getElementById(`report-section-${section.id}`)).filter((node): node is HTMLElement => Boolean(node));
    if (!nodes.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) { const id = visible.target.id.replace('report-section-', ''); setCurrent(id); onActiveChange(id); }
    }, { rootMargin: '-100px 0px -72% 0px', threshold: 0 });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections, onActiveChange]);
  const items = sections.map((section) => ({
    id: section.id,
    label: `${section.number ? `${section.number}. ` : ''}${section.heading}`,
    status: sectionReviewState(section.review).label,
  }));
  return <ContentsNav label="Contents" items={items} activeId={current} onNavigate={(id) => { setCurrent(id); onActiveChange(id); onNavigate(id); }} />;
}
