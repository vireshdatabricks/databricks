'use client';

import CheckIcon from '@mui/icons-material/Check';
import { Box, ToggleButton, ToggleButtonGroup, Typography, Stack } from '@mui/material';
export type SegmentOption = { value: string; label: string; count?: number };
type Props = { label: string; options: SegmentOption[]; value: string; onChange: (value: string) => void; ariaLabel?: string };

/** Single choice with optional counts (reference/48 S18): 44 px, selected = filled + bold + check, counts subdued. */
export default function SegmentedControl({ label, options, value, onChange, ariaLabel }: Props) {
  const move = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key) || !options.length) return;
    event.preventDefault();
    const currentIndex = Math.max(0, options.findIndex((option) => option.value === value));
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (currentIndex + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + options.length) % options.length;
    onChange(options[nextIndex].value);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-segment-value="${CSS.escape(options[nextIndex].value)}"]`)?.focus());
  };
  return <Stack spacing={0.5}><Typography variant="label">{label}</Typography><ToggleButtonGroup exclusive value={value} role="radiogroup" aria-label={ariaLabel ?? label} onKeyDown={move} onChange={(_, next) => { if (next !== null) onChange(next); }}
    sx={{ flexWrap: 'wrap', '& .MuiToggleButton-root': { textTransform: 'none', minHeight: 44, px: 2, gap: 0.5, borderColor: 'divider', color: 'text.primary', fontWeight: 400,
      '&.Mui-selected': { color: 'primary.main', bgcolor: 'brand.informationLight', fontWeight: 700, borderColor: 'primary.main', '&:hover': { bgcolor: 'brand.informationLight' } },
      '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'brand.hyperlink', outlineOffset: -2 } } }}>
    {options.map((option) => {
      const selected = value === option.value;
      return <ToggleButton key={option.value} value={option.value} role="radio" aria-checked={selected} tabIndex={selected ? 0 : -1} data-segment-value={option.value}
        aria-label={option.count !== undefined ? `${option.label}, ${option.count}` : undefined} sx={option.count === 0 && !selected ? { color: 'text.secondary' } : undefined}>
        {selected && <CheckIcon fontSize="small" aria-hidden />}
        {option.label}
        {option.count !== undefined && <Box component="span" aria-hidden sx={{ color: 'text.secondary', fontWeight: 400 }}>· {option.count}</Box>}
      </ToggleButton>;
    })}
  </ToggleButtonGroup></Stack>;
}
