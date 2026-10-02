'use client';

import { Autocomplete, Chip, Stack, TextField, Typography } from '@mui/material';
import Button from '../button';
type Option = string | { label: string; group?: string };
type Props = {
  label: string; options: Option[]; value: string[]; onChange: (value: string[]) => void; helperText?: string; errorText?: string;
  required?: boolean; recent?: string[]; disabled?: boolean;
  /** What an empty selection means, shown as the placeholder ("All clients"). */
  emptyLabel?: string;
  /** Inside a FilterBar the bar's "Clear filters" replaces the per-control count and Clear. */
  inBar?: boolean;
};
const labelOf = (option: Option) => typeof option === 'string' ? option : option.label;
export default function MultiSelect({ label, options, value, onChange, helperText, errorText, required = false, recent = [], disabled = false, emptyLabel, inBar = false }: Props) {
  const helperId = `multi-select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-helper`;
  const sorted = [...options].sort((a, b) => labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: 'base' }));
  const recentSet = new Set(recent);
  const grouped = sorted.map((option) => ({ label: labelOf(option), group: recentSet.has(labelOf(option)) ? 'Recent' : (typeof option === 'string' ? '' : option.group ?? '') }));
  const helper = errorText ?? helperText;
  return <Stack spacing={0.5}><Typography variant="label" component="label">{label}{required ? ' (required)' : ''}</Typography>
    <Autocomplete multiple disableCloseOnSelect options={grouped} groupBy={(option) => option.group} getOptionLabel={(option) => option.label} value={grouped.filter((option) => value.includes(option.label))} onChange={(_, next) => onChange(next.map((option) => option.label))} disabled={disabled}
      renderTags={(selected, getTagProps) => selected.map((option, index) => <Chip size="small" label={option.label} {...getTagProps({ index })} key={option.label} />)}
      renderInput={(params) => <TextField {...params} placeholder={value.length ? '' : emptyLabel ?? 'Search and select'} error={Boolean(errorText)} helperText={helper} FormHelperTextProps={{ id: helperId }} inputProps={{ ...params.inputProps, 'aria-label': label, 'aria-describedby': helper ? helperId : undefined }} />}
      sx={{ '& .MuiOutlinedInput-root': { minHeight: 44, py: 0.5 } }} />
    {!inBar && value.length > 0 && <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap"><Typography variant="body2" color="text.secondary">Selected ({value.length})</Typography><Button variant="tertiary" size="compact" disabled={disabled} onClick={() => onChange([])}>Clear</Button></Stack>}
  </Stack>;
}
