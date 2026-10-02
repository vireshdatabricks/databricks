'use client';

import { FormControl, FormControlLabel, FormHelperText, Radio, RadioGroup, Stack, Typography } from '@mui/material';

export type ChoiceOption = { value: string; label: string; helperText?: string; disabled?: boolean };
type Props = { label: string; options: ChoiceOption[]; value?: string; onChange?: (value: string) => void; row?: boolean; required?: boolean; helperText?: string; errorText?: string; name?: string };

export default function ChoiceGroup({ label, options, value, onChange, row = false, required = false, helperText, errorText, name }: Props) {
  const id = name ?? `choice-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <FormControl component="fieldset" required={required} error={Boolean(errorText)}>
    <Typography component="legend" variant="label" sx={{ mb: 1 }}>{label}{required ? ' (required)' : ''}</Typography>
    <RadioGroup aria-label={label} aria-describedby={errorText || helperText ? `${id}-helper` : undefined} name={id} value={value ?? ''} onChange={(event) => onChange?.(event.target.value)} row={row}>
      <Stack direction={row ? 'row' : 'column'} spacing={row ? 2 : 1}>
        {options.map((option) => <FormControlLabel key={option.value} value={option.value} disabled={option.disabled} control={<Radio />} label={<Stack><Typography variant="body1">{option.label}</Typography>{option.helperText && <Typography variant="body2" color="text.secondary">{option.helperText}</Typography>}</Stack>} sx={{ alignItems: 'flex-start', m: 0, minHeight: 44 }} />)}
      </Stack>
    </RadioGroup>
    {(errorText || helperText) && <FormHelperText id={`${id}-helper`}>{errorText ?? helperText}</FormHelperText>}
  </FormControl>;
}
