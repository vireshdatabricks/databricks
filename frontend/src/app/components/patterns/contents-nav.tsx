'use client';

import { Box, Typography } from '@mui/material';
import * as Brand from '../ui';

export type ContentsItem = { id: string; label: string; status?: string };

/** Section list with a right-aligned status per entry: a left rail on desktop, a "Contents" select below md (reference/48 S9). */
export default function ContentsNav({ items, activeId, onNavigate, label = 'Contents', sticky = true }: { items: ContentsItem[]; activeId: string; onNavigate: (id: string) => void; label?: string; sticky?: boolean }) {
  return <>
    <Box component="nav" aria-label={label} sx={{ position: { md: sticky ? 'sticky' : 'static' }, top: { md: 150 }, alignSelf: 'start', display: { xs: 'none', md: 'grid' }, gap: 0.5, p: 1.5, borderLeft: 1, borderColor: 'divider', maxHeight: sticky ? 'calc(100vh - 170px)' : undefined, overflowY: 'auto', overflowX: 'hidden' }}>
      <Typography variant="label">{label}</Typography>
      {items.map((item) => {
        const active = activeId === item.id;
        return <Box key={item.id} component="button" type="button" onClick={() => onNavigate(item.id)} aria-current={active ? 'location' : undefined} sx={{ border: 0, borderLeft: 3, borderColor: active ? 'brand.primary' : 'transparent', bgcolor: 'transparent', color: 'text.primary', px: 1.5, py: 1, minHeight: 44, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, width: '100%', textAlign: 'left', fontWeight: active ? 700 : 400, cursor: 'pointer', '&:focus-visible': { outline: '2px solid', outlineColor: 'brand.hyperlink' } }}>
          <Typography variant="body2" fontWeight="inherit" sx={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' }} title={item.label}>{item.label}</Typography>
          {item.status && <Typography variant="caption" color="text.secondary">{item.status}</Typography>}
        </Box>;
      })}
    </Box>
    <Box sx={{ display: { xs: 'block', md: 'none' } }}><Brand.Field label={label} kind="select" value={activeId || items[0]?.id || ''} onChange={(event) => onNavigate(String(event.target.value))} options={items.map((item) => ({ value: item.id, label: item.status ? `${item.label} — ${item.status}` : item.label }))} /></Box>
  </>;
}
