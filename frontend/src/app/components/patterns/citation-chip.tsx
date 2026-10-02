'use client';

import { Link as MuiLink } from '@mui/material';
import type { ReportCitation } from '../../lib/api/case-reports';

export default function CitationChip({ citation, index, onOpen }: { citation: ReportCitation; index: number; onOpen: (citation: ReportCitation, index: number) => void }) {
  const label = citation.record ?? citation.file ?? citation.source_type ?? 'Source';
  return <MuiLink component="button" type="button" underline="hover" onClick={() => onOpen(citation, index)} aria-label={`View source ${index}: ${label}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, border: 0, bgcolor: 'transparent', p: 0, minHeight: 36, font: 'inherit', color: 'brand.hyperlink', cursor: 'pointer' }}>
    [{index}] {label}
  </MuiLink>;
}
