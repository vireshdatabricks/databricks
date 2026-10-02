import { Typography } from '@mui/material';
import * as Brand from '../ui';

/** One count with its label; `scope` completes the accessible name (e.g. "in extract week 2026-09-21"). */
export default function MetricCard({ label, value, scope }: { label: string; value: number | null | undefined; scope?: string }) {
  const shown = value === null || value === undefined ? '—' : value.toLocaleString();
  return <Brand.Card bordered="outlined" sx={{ height: '100%' }} aria-label={`${label}: ${shown}${scope ? `, ${scope}` : ''}`} role="group">
    <Typography variant="metric" component="p" sx={{ m: 0 }}>{shown}</Typography>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
  </Brand.Card>;
}
