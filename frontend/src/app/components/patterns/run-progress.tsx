'use client';

import { Box, Stack, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { ReportRequestState } from '../../lib/api/case-reports';

const steps: Array<{ state: ReportRequestState; label: string }> = [
  { state: 'QUEUED', label: 'Queued' },
  { state: 'RUNNING', label: 'Running' },
  { state: 'PACKAGED', label: 'Packaged' },
  { state: 'IMPORTED', label: 'Imported' },
];

export default function RunProgress({ state, elapsed }: { state: ReportRequestState; elapsed: string }) {
  const current = steps.findIndex((step) => step.state === state);
  return <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1.5 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1}>
      <Typography component="h2" variant="h3">Report progress</Typography>
      <Brand.StatusBadge status={state} />
    </Stack>
    <Box component="ol" aria-label="Report run progress" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.5, p: 0, m: 0, listStyle: 'none' }}>
      {steps.map((step, index) => {
        const reached = current >= index && current >= 0;
        return <Box component="li" key={step.state} aria-current={state === step.state ? 'step' : undefined} sx={{ borderTop: '3px solid', borderColor: reached ? 'brand.enterpriseDarkBlue' : 'divider', pt: 1 }}>
          <Typography variant="body2" fontWeight={reached ? 700 : 400}>{step.label}</Typography>
        </Box>;
      })}
    </Box>
    <Typography variant="body2" color="text.secondary">Elapsed time: {elapsed}</Typography>
  </Brand.Card>;
}
