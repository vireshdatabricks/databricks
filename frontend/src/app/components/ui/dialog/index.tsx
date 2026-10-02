'use client';

import { Dialog as MuiDialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import Button from '../button';

type Props = { open: boolean; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void; children?: React.ReactNode; };
export default function Dialog({ open, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive = false, busy = false, onConfirm, onClose, children }: Props) {
  return <MuiDialog open={open} onClose={busy ? undefined : onClose} aria-labelledby="shared-dialog-title" aria-describedby={description ? 'shared-dialog-description' : undefined} fullWidth maxWidth="sm">
    <DialogTitle id="shared-dialog-title">{title}</DialogTitle><DialogContent>{description && <DialogContentText id="shared-dialog-description" sx={{ mb: children ? 2 : 0 }}>{description}</DialogContentText>}{children}</DialogContent>
    <DialogActions disableSpacing sx={{ p: 2, flexWrap: 'wrap', gap: 1.5 }}><Button variant="tertiary" onClick={onClose} disabled={busy}>{cancelLabel}</Button><Button variant={destructive ? 'destructive' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel}</Button></DialogActions>
  </MuiDialog>;
}
