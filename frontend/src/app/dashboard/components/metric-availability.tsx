import { Box, Chip, Grid, Typography } from '@mui/material';

import * as Brand from '../../components/ui';

export type DashboardMetric = {
    name: string;
    status: 'Available now' | 'Partial / proxy' | 'Awaiting source';
    description: string;
};

export const dashboardMetrics: DashboardMetric[] = [
    { name: 'Snapshot workload, aging, and valid duration fields', status: 'Available now', description: 'Directly derived from the selected case/task/subtask extract.' },
    { name: 'Operational date review and candidate themes', status: 'Partial / proxy', description: 'Useful review aids; not SLA, recurrence, or causal findings.' },
    { name: 'Workflow TAT, recurrence, insight quality, contractual SLA/PG, and Finance', status: 'Awaiting source', description: 'Requires governed event, review, rule, or Finance data.' },
];

const colorFor = (status: DashboardMetric['status']) => status === 'Available now' ? 'success' : status === 'Partial / proxy' ? 'warning' : 'default';

export default function MetricAvailability({ metrics = dashboardMetrics }: { metrics?: DashboardMetric[] }) {
    return <Box>
        <Typography variant="h6" sx={{ mb: 1.5 }}>Metric availability</Typography>
        <Grid container spacing={2}>
            {metrics.map((metric) => <Grid item xs={12} md={4} key={metric.name}>
                <Brand.Card bordered="outlined" sx={{ height: '100%' }}>
                    <Chip size="small" label={metric.status} color={colorFor(metric.status)} />
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>{metric.name}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>{metric.description}</Typography>
                </Brand.Card>
            </Grid>)}
        </Grid>
    </Box>;
}
