import { Box, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import type { StatusBadgeValue } from '../../components/ui';

export type DashboardMetric = {
    name: string;
    status: 'available' | 'proxy' | 'awaiting-source';
    description: string;
};

export const dashboardMetrics: DashboardMetric[] = [
    { name: 'Snapshot workload, aging, and valid duration fields', status: 'available', description: 'Directly derived from the selected case/task/subtask extract.' },
    { name: 'Operational date review and candidate themes', status: 'proxy', description: 'Useful review aids; not SLA, recurrence, or causal findings.' },
    { name: 'Workflow TAT, recurrence, insight quality, contractual SLA/PG, and Finance', status: 'awaiting-source', description: 'Requires governed event, review, rule, or Finance data.' },
];

export default function MetricAvailability({ metrics = dashboardMetrics }: { metrics?: DashboardMetric[] }) {
    return <Box component="section" aria-labelledby="metric-availability" sx={{ display: 'grid', gap: 1.5 }}>
        <Typography id="metric-availability" variant="h2">Metric availability</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            {metrics.map((metric) => <Brand.Card key={metric.name} bordered="outlined" sx={{ height: '100%', display: 'grid', gap: 1, alignContent: 'start' }}>
                <Box><Brand.StatusBadge status={metric.status as StatusBadgeValue} /></Box>
                <Typography variant="h4" component="h3">{metric.name}</Typography>
                <Typography variant="body2" color="text.secondary">{metric.description}</Typography>
            </Brand.Card>)}
        </Box>
    </Box>;
}
