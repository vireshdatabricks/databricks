'use client';

import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { radius } from '../../../utils/theme';
export type SummaryRow = { label: string; value: React.ReactNode };
type Props = { title?: string; rows?: SummaryRow[]; loading?: boolean; error?: string; matchCount?: number | null; emptyText?: string };
export default function SummaryPanel({ title = 'Summary', rows = [], loading = false, error, matchCount, emptyText = 'No matching records.' }: Props) {
  return <Box component="aside" aria-label={title} sx={{ position: { md: 'sticky' }, top: { md: 16 }, p: 2, border: 1, borderColor: 'divider', borderRadius: radius.card, bgcolor: 'background.paper' }}>
    <Typography variant="h3" component="h2" sx={{ mb: 2 }}>{title}</Typography>
    {loading ? <Stack spacing={1}><LinearProgress aria-label="Loading summary" /><Typography variant="body2">Loading summary…</Typography></Stack> : error ? <Typography role="alert" variant="body2" color="error">{error}</Typography> : matchCount === 0 ? <Typography variant="body2">{emptyText}</Typography> : <Stack component="dl" spacing={1} sx={{ m: 0 }}>{matchCount !== undefined && matchCount !== null && <Row label="Matching cases" value={matchCount.toLocaleString()} />}{rows.map((row) => <Row key={row.label} {...row} />)}</Stack>}
  </Box>;
}
function Row({ label, value }: SummaryRow) { return <Stack component="div" direction="row" justifyContent="space-between" gap={2}><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" fontWeight={700} sx={{ m: 0, textAlign: 'right' }}>{value}</Typography></Stack>; }
