'use client';

import { FormControl, FormHelperText, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material/TextField';

type BaseProps = Omit<TextFieldProps, 'variant' | 'type' | 'select' | 'multiline'> & { label: string; required?: boolean; helperText?: string; errorText?: string; kind?: 'text' | 'textarea' | 'number' | 'date' | 'select'; options?: Array<{ value: string; label: string }>; rows?: number };
export default function Field({ label, required, helperText, errorText, kind = 'text', options = [], rows = 4, id, ...props }: BaseProps) {
  const fieldId = id ?? `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const helperId = `${fieldId}-helper`;
  const requiredText = required ? 'Required. ' : '';
  // S17: the field always shows a human label, including the default '' option ("All clients").
  const labelOf = (value: unknown) => options.find((option) => option.value === String(value ?? ''))?.label ?? (value == null || value === '' ? '' : String(value));
  if (kind === 'select') return <FormControl fullWidth error={Boolean(errorText)} required={required}>
    <InputLabel id={`${fieldId}-label`} shrink>{label}</InputLabel><Select labelId={`${fieldId}-label`} id={fieldId} label={label} notched displayEmpty renderValue={labelOf} {...(props as object)}>
      {options.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
    </Select><FormHelperText id={helperId}>{errorText ?? `${requiredText}${helperText ?? ''}`}</FormHelperText>
  </FormControl>;
  return <TextField id={fieldId} fullWidth label={label} required={required} variant="outlined" type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'} multiline={kind === 'textarea'} minRows={kind === 'textarea' ? rows : undefined} error={Boolean(errorText)} helperText={<span id={helperId}>{errorText ?? `${requiredText}${helperText ?? ''}`}</span>} inputProps={{ 'aria-describedby': helperId, 'aria-invalid': Boolean(errorText) }} InputLabelProps={kind === 'date' ? { shrink: true, ...props.InputLabelProps } : props.InputLabelProps} {...props} />;
}
