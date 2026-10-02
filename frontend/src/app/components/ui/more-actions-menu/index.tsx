'use client';

import { useState } from 'react';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { Menu, MenuItem } from '@mui/material';
import Button from '../button';
export type MoreAction = { label: string; onSelect: () => void; disabled?: boolean };

/** Secondary actions behind a quiet menu button with a chevron (reference/48 S19); never styled like the primary action. */
export default function MoreActionsMenu({ actions, label = 'More actions' }: { actions: MoreAction[]; label?: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  return <><Button variant="tertiary" endIcon={<KeyboardArrowDownIcon aria-hidden />} aria-haspopup="menu" aria-expanded={Boolean(anchor)} onClick={(event) => setAnchor(event.currentTarget)}>{label}</Button><Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} MenuListProps={{ 'aria-label': label }}>
    {actions.map((action) => <MenuItem key={action.label} disabled={action.disabled} onClick={() => { close(); action.onSelect(); }}>{action.label}</MenuItem>)}
  </Menu></>;
}
