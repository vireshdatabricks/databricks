import { Box } from '@mui/material';
import Button from '../button';

/**
 * One bar for all filters of a list (reference/48 S18): labels on top, controls bottom-aligned and
 * wrapping, and one "Clear filters" shown only while a filter is applied.
 */
export default function FilterBar({ children, active = false, onClear, label = 'Filters' }: { children: React.ReactNode; active?: boolean; onClear?: () => void; label?: string }) {
  return <Box role="group" aria-label={label} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 2 }}>
    {children}
    {active && onClear && <Button variant="tertiary" onClick={onClear} sx={{ minHeight: 44 }}>Clear filters</Button>}
  </Box>;
}
