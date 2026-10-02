'use client';

import { Box, Typography } from '@mui/material';
import * as Brand from '../ui';
import type { DataColumn } from '../ui/data-table';
import type { Baselines, BaselineRow } from '../../utils/analytics-api';
import { formatDate } from '../../lib/format';

type Row = { metric_id: string; unit: string; label: BaselineRow['label']; baseline?: BaselineRow; current?: BaselineRow };
const stat = (row?: BaselineRow) => !row ? '—' : row.suppressed ? `Too few cases (${row.n})` : `${row.median ?? '—'} / ${row.p90 ?? '—'} (n ${row.n.toLocaleString()})`;

/** WF-12 baselines: median / 90th percentile and n for the baseline period next to the current period. */
export default function BaselineTable({ baselines, names, title = 'Baseline and current period' }: { baselines: Baselines; names: Record<string, string>; title?: string }) {
  const byMetric = new Map<string, Row>();
  for (const item of baselines.rows) {
    const row = byMetric.get(item.metric_id) ?? { metric_id: item.metric_id, unit: item.unit, label: item.label };
    if (item.period === 'BASELINE') row.baseline = item; else row.current = item;
    byMetric.set(item.metric_id, row);
  }
  const rows = Object.keys(names).map((id) => byMetric.get(id)).filter((row): row is Row => Boolean(row));
  const anyRow = baselines.rows[0];
  const baselineRange = anyRow ? `${formatDate(baselines.rows.find((r) => r.period === 'BASELINE')?.period_from)} – ${formatDate(baselines.rows.find((r) => r.period === 'BASELINE')?.period_to)}` : '';
  const currentRange = anyRow ? `${formatDate(baselines.rows.find((r) => r.period === 'CURRENT')?.period_from)} – ${formatDate(baselines.rows.find((r) => r.period === 'CURRENT')?.period_to)}` : '';
  const columns: DataColumn<Row>[] = [
    { id: 'metric', label: 'Metric', minWidth: 200, render: (row) => <Box><Typography variant="body2" fontWeight={700}>{names[row.metric_id]}</Typography><Typography variant="body2" color="text.secondary">{row.unit}</Typography></Box> },
    { id: 'label', label: 'Label', render: (row) => <Brand.StatusBadge status={row.label} /> },
    { id: 'baseline', label: `Baseline median / p90 (${baselineRange})`, value: (row) => stat(row.baseline) },
    { id: 'current', label: `Current median / p90 (${currentRange})`, value: (row) => stat(row.current) },
  ];
  return <Box component="section" aria-label={title} sx={{ display: 'grid', gap: 1 }}>
    <Typography variant="h3" component="h2">{title}</Typography>
    <Typography variant="body2" color="text.secondary">Cases grouped by the date they opened. Segment: {baselines.segment_type === 'ALL' ? 'all cases' : `${baselines.segment_type.toLowerCase().replace('_', ' ')} ${baselines.segment_value}`}. Median and 90th percentile are hidden below 5 cases. No targets are set yet.{baselines.note ? ` ${baselines.note}` : ''}</Typography>
    <Brand.DataTable rows={rows} columns={columns} getRowId={(row) => row.metric_id} label={title} resultLabel="metric" emptyTitle="No baselines for this selection" emptyDescription="There are no cases in this segment." />
  </Box>;
}
