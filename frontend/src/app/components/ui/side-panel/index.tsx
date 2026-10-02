'use client';

import { Box, Dialog as MuiDialog, Drawer, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

type Props = { open: boolean; title: string; onClose: () => void; children: React.ReactNode; };
export default function SidePanel({ open, title, onClose, children }: Props) {
  const theme = useTheme(); const narrow = useMediaQuery(theme.breakpoints.down('md'));
  const content = <Box sx={{ width: narrow ? '100%' : { md: 440, lg: 520 }, maxWidth: '100vw', height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 2, borderBottom: 1, borderColor: 'divider' }}><Typography variant="h3" component="h2">{title}</Typography><IconButton aria-label={`Close ${title}`} onClick={onClose} sx={{ '&:focus-visible': { outline: '2px solid', outlineColor: 'brand.hyperlink' } }}><CloseIcon /></IconButton></Box>
    <Box sx={{ overflow: 'auto', p: 2, flex: 1 }}>{children}</Box>
  </Box>;
  return narrow ? <MuiDialog open={open} onClose={onClose} fullScreen aria-label={title}>{content}</MuiDialog> : <Drawer anchor="right" open={open} onClose={onClose} ModalProps={{ keepMounted: false }} PaperProps={{ sx: { width: { md: 440, lg: 520 }, maxWidth: '100vw' } }}>{content}</Drawer>;
}
