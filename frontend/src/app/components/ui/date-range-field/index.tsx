'use client';

import { useMemo, useState } from 'react';
import { Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatDate } from '../../../lib/format';
export type DateRangeValue = { from: string; to: string };
export type DateRangePreset = 'last90' | 'lastQuarter' | 'yearToDate' | 'custom';
type Props = { value: DateRangeValue; onChange: (value: DateRangeValue) => void; label?: string; errorText?: string; min?: string; max?: string; initialPreset?: DateRangePreset };
type Preset = DateRangePreset;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const shiftDays = (date: Date, days: number) => { const result = new Date(date); result.setUTCDate(result.getUTCDate() + days); return result; };
export function presetRange(preset: Exclude<Preset, 'custom'>, now = new Date()): DateRangeValue {
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  if (preset === 'last90') return { from: iso(shiftDays(today, -89)), to: iso(today) };
  if (preset === 'yearToDate') return { from: `${today.getUTCFullYear()}-01-01`, to: iso(today) };
  const quarter = Math.floor(today.getUTCMonth() / 3);
  const currentQuarterStart = new Date(Date.UTC(today.getUTCFullYear(), quarter * 3, 1));
  const previousQuarterEnd = shiftDays(currentQuarterStart, -1);
  const previousQuarterStart = new Date(Date.UTC(previousQuarterEnd.getUTCFullYear(), Math.floor(previousQuarterEnd.getUTCMonth() / 3) * 3, 1));
  return { from: iso(previousQuarterStart), to: iso(previousQuarterEnd) };
}
/** Pair initialPreset with value = presetRange(initialPreset) so the shown preset matches the range. */
export default function DateRangeField({ value, onChange, label = 'Period', errorText, min, max, initialPreset = 'custom' }: Props) {
  const [preset, setPreset] = useState<Preset>(initialPreset);
  const invalidOrder = Boolean(value.from && value.to && value.from > value.to);
  const resolved = useMemo(() => value.from && value.to ? `${formatDate(`${value.from}T00:00:00Z`)} – ${formatDate(`${value.to}T00:00:00Z`)}` : 'Choose a start and end date.', [value]);
  return <Stack spacing={1.5}><TextField select fullWidth label={label} value={preset} onChange={(event) => { const next = event.target.value as Preset; setPreset(next); if (next !== 'custom') onChange(presetRange(next)); }}>
    <MenuItem value="last90">Last 90 days</MenuItem><MenuItem value="lastQuarter">Last quarter</MenuItem><MenuItem value="yearToDate">Year to date</MenuItem><MenuItem value="custom">Custom</MenuItem>
  </TextField>
  {preset === 'custom' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}><TextField type="date" label="From" value={value.from} onChange={(event) => onChange({ ...value, from: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ min, max: value.to || max }} /><TextField type="date" label="To" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ min: value.from || min, max }} /></Box>}
  {(invalidOrder || errorText) && <Typography variant="body2" color="error">{errorText ?? 'From date must be on or before the to date.'}</Typography>}
  <Typography variant="body2" color="text.secondary" aria-live="polite">Selected period: {resolved}</Typography></Stack>;
}
