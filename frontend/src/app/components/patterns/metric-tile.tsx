'use client';

import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { MetricDefinition, MetricLabel } from '../../utils/analytics-api';

/**
 * A metric with its reference/51 §2 label. A proxy is titled by what it measures, with the
 * requirement it stands in for as secondary text. Not-available metrics show the reason, never a number.
 */
export default function MetricTile({ title, value, detail, label, definition, reason }: {
  title: string; value?: React.ReactNode; detail?: React.ReactNode; label: MetricLabel; definition?: MetricDefinition; reason?: string;
}) {
  const notAvailable = label === 'NOT_AVAILABLE';
  const threshold = definition && Object.keys(definition.threshold ?? {}).length ? Object.entries(definition.threshold).map(([key, item]) => `${key.replace(/_/g, ' ')}: ${Array.isArray(item) ? item.join(', ') : String(item)}`).join('; ') : null;
  return <Brand.Card bordered="outlined" role="group" aria-label={title} sx={{ display: 'grid', gap: 1, alignContent: 'start', height: '100%' }}>
    <Box><Brand.StatusBadge status={label} /></Box>
    <Typography variant="h4" component="h3">{title}</Typography>
    {definition?.stands_in_for && <Typography variant="body2" color="text.secondary">Stands in for: {definition.stands_in_for}</Typography>}
    {notAvailable
      ? <Typography variant="body2">{reason ?? definition?.measures_what}{definition?.unlock_condition ? ` Unlocked by: ${definition.unlock_condition}` : ''}</Typography>
      : <>
        <Typography variant="metric" component="p" sx={{ m: 0 }}>{value ?? '—'}</Typography>
        {detail && <Typography variant="body2" color="text.secondary">{detail}</Typography>}
      </>}
    {definition && !notAvailable && <Brand.Disclosure title="How this is measured">
      <Stack spacing={0.5}>
        <Typography variant="body2">{definition.measures_what}</Typography>
        <Typography variant="body2" color="text.secondary">Definition version {definition.definition_version}{threshold ? ` · ${threshold}` : ''}</Typography>
        {definition.unlock_condition && <Typography variant="body2" color="text.secondary">Fully measured once: {definition.unlock_condition}</Typography>}
      </Stack>
    </Brand.Disclosure>}
  </Brand.Card>;
}
