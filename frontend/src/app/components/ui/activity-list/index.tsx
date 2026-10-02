'use client';

import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { formatActor, formatDateTime } from '../../../lib/format';
import Button from '../button';

export type ActivityEntry = { id: string | number; time: string | number | Date; actor: string; action: React.ReactNode; qualifiers?: React.ReactNode };
type Props = { entries: ActivityEntry[]; emptyText?: string; initialVisible?: number };
export default function ActivityList({ entries, emptyText = 'No activity yet.', initialVisible = 5 }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return <Typography variant="body2" color="text.secondary">{emptyText}</Typography>;
  const visible = expanded ? entries : entries.slice(0, initialVisible);
  return <Stack component="ol" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
    {visible.map((entry) => <Box component="li" key={entry.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(150px, 0.7fr) 1fr' }, gap: 0.5 }}>
      <Typography variant="body2" color="text.secondary">{formatDateTime(entry.time)} · {formatActor(entry.actor)}</Typography>
      <Box><Typography variant="body2">{entry.action}</Typography>{entry.qualifiers && <Typography variant="caption" color="text.secondary">{entry.qualifiers}</Typography>}</Box>
    </Box>)}
    {entries.length > initialVisible && <Button variant="tertiary" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} sx={{ alignSelf: 'flex-start', minHeight: 44 }}>{expanded ? 'Show fewer' : `Show all (${entries.length})`}</Button>}
  </Stack>;
}
