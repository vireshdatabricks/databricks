'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import { useAnalysisContext, type AnalysisContextKey } from '../../lib/hooks/use-analysis-context';
import { getFilterOptions, getMetadata, type FilterOptions } from '../../utils/analytics-api';
import { normaliseOptions } from '../../lib/format';
import { radius } from '../../utils/theme';

type BarField = 'client_account' | 'line_of_business' | 'assignment_group' | 'category';
const FIELDS: Record<BarField, { label: string; options: keyof FilterOptions; all: string }> = {
  client_account: { label: 'Client', options: 'client_accounts', all: 'All clients' },
  line_of_business: { label: 'Line of business', options: 'lines_of_business', all: 'All lines of business' },
  assignment_group: { label: 'Assignment group', options: 'assignment_groups', all: 'All assignment groups' },
  category: { label: 'Category', options: 'categories', all: 'All categories' },
};
export type Freshness = { asOfWeek: string; logicVersion: string; dataQualityStatus?: string };

/**
 * Shared analysis context (reference/45 §3.3, reference/50 §3.3): extract week plus selectable
 * dimension filters, kept in the URL through useAnalysisContext so links carry them.
 */
export default function ContextBar({ fields = ['client_account', 'line_of_business', 'assignment_group'], freshness }: { fields?: BarField[]; freshness?: Freshness }) {
  const context = useAnalysisContext();
  const [weeks, setWeeks] = useState<string[]>([]);
  const [options, setOptions] = useState<FilterOptions>();
  const [optionsUnavailable, setOptionsUnavailable] = useState(false);
  const week = context.as_of_week;

  useEffect(() => {
    let active = true;
    getMetadata().then((envelope) => { if (active) setWeeks(envelope.data.available_weeks); }).catch(() => { if (active) setWeeks([]); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setOptionsUnavailable(false);
    getFilterOptions({ as_of_week: week }).then((envelope) => { if (active) setOptions(envelope.data); })
      .catch(() => { if (active) { setOptions(undefined); setOptionsUnavailable(true); } });
    return () => { active = false; };
  }, [week]);

  const applied = fields.filter((field) => context[field]);
  const summary = applied.length ? applied.map((field) => `${FIELDS[field].label}: ${context[field]}`).join(', ') : 'No filters applied';
  const choose = (key: AnalysisContextKey, value: string) => context.set(key, value || null);

  return <Box component="form" aria-label="Analysis context" onSubmit={(event) => event.preventDefault()} sx={{ display: 'grid', gap: 1.5, p: 2, border: 1, borderColor: 'divider', borderRadius: radius.card, bgcolor: 'background.paper' }}>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: `repeat(${fields.length + 1}, minmax(0, 1fr))` }, alignItems: 'start' }}>
      <Brand.Field label="Extract week" kind="select" value={week ?? ''} onChange={(event) => choose('as_of_week', String(event.target.value))}
        options={[{ value: '', label: 'Latest published week' }, ...normaliseOptions(weeks).reverse().map((value) => ({ value, label: value }))]} />
      {options && fields.map((field) => {
        const values = normaliseOptions(options[FIELDS[field].options]);
        const current = context[field];
        const missing = current && !values.includes(current);
        return <Brand.Field key={field} label={FIELDS[field].label} kind="select" value={current ?? ''} onChange={(event) => choose(field, String(event.target.value))}
          errorText={missing ? 'Not found in this week. Choose another value or clear filters.' : undefined}
          options={[{ value: '', label: FIELDS[field].all }, ...(missing ? [{ value: current!, label: `${current} (not found)` }] : []), ...values.map((value) => ({ value, label: value }))]} />;
      })}
    </Box>
    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} justifyContent="space-between" alignItems={{ sm: 'center' }}>
      <Typography variant="body2" color="text.secondary">
        {freshness ? <>Published week {freshness.asOfWeek} · logic {freshness.logicVersion} · </> : null}
        <Link href={context.hrefWith('/dashboard/data-readiness')}>Data limits</Link>
        {optionsUnavailable && ' · Filter values unavailable'}
        <Box component="span" sx={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} aria-live="polite"> {summary}</Box>
      </Typography>
      {applied.length > 0 && <Brand.Button variant="tertiary" size="compact" onClick={() => context.clear(fields)}>Clear filters</Brand.Button>}
    </Stack>
  </Box>;
}
