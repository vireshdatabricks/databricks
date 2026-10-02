'use client';

import { Accordion, AccordionDetails, AccordionSummary, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
export default function Disclosure({ title, children, defaultExpanded = false }: { title: string; children: React.ReactNode; defaultExpanded?: boolean }) {
  return <Accordion defaultExpanded={defaultExpanded} disableGutters elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: '4px !important', '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="label">{title}</Typography></AccordionSummary><AccordionDetails>{children}</AccordionDetails></Accordion>;
}
