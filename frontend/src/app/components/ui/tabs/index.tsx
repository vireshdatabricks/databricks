'use client';

import { Tabs as MuiTabs, Tab } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
type TabOption = { value: string; label: string; disabled?: boolean };
export default function Tabs({ options, param = 'tab', value: controlledValue, onChange }: { options: TabOption[]; param?: string; value?: string; onChange?: (value: string) => void }) {
  const router = useRouter(); const pathname = usePathname(); const search = useSearchParams();
  const value = controlledValue ?? search.get(param) ?? options[0]?.value ?? false;
  const select = (_: React.SyntheticEvent, next: string) => { onChange?.(next); if (controlledValue === undefined) { const query = new URLSearchParams(search.toString()); query.set(param, next); router.replace(`${pathname}?${query.toString()}`, { scroll: false }); } };
  return <MuiTabs value={value} onChange={select} variant="scrollable" allowScrollButtonsMobile aria-label="Page sections">{options.map((option) => <Tab key={option.value} value={option.value} label={option.label} disabled={option.disabled} sx={{ minHeight: 44, textTransform: 'none', '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'brand.hyperlink', outlineOffset: -2 } }} />)}</MuiTabs>;
}
