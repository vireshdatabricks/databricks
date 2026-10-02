import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { radius } from '../../../utils/theme';
type Props = { decided: number; total: number; label?: string; compact?: boolean };
/** compact: table-cell variant — 6 px bar and "1 of 22" on one line; put "Decided" in the column header (S20). */
export default function ProgressSummary({ decided, total, label = 'items', compact = false }: Props) {
  const boundedTotal = Math.max(0, total);
  const boundedDecided = Math.min(boundedTotal, Math.max(0, decided));
  const complete = boundedTotal > 0 && boundedDecided === boundedTotal;
  const description = `${boundedDecided} of ${boundedTotal} ${label} decided`;
  const bar = <LinearProgress variant="determinate" value={boundedTotal ? boundedDecided / boundedTotal * 100 : 0} color={complete ? 'success' : 'primary'} aria-label={description} sx={{ flex: 1, height: compact ? 6 : 8, borderRadius: radius.field, minWidth: compact ? 64 : undefined }} />;
  if (compact) return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, whiteSpace: 'nowrap' }}>{bar}<Typography variant="body2" color="text.secondary" aria-hidden>{boundedDecided} of {boundedTotal}</Typography></Box>;
  return <Stack spacing={0.5}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{bar}</Box><Typography variant="body2" color="text.secondary">{description}</Typography></Stack>;
}
