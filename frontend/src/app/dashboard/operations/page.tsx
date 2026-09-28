'use client';

import React, { Suspense } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import * as Brand from '../../components/ui';
import FreshnessBanner from '../components/freshness-banner';
import WeekSelect from '../components/week-select';
import { AnalyticsApiError, Envelope, getDataQuality, getDateRisk, getDocumentation, getDurations, getWorkload, OperationRow } from '../../utils/analytics-api';

const tabs = [
    { key: 'workload', label: 'Workload', load: getWorkload, columns: ['case_number', 'age_calendar_days', 'age_band', 'case_assignment_group'] },
    { key: 'risk', label: 'Date risk', load: getDateRisk, columns: ['case_number', 'risk_status', 'risk_reference_type', 'risk_date', 'days_from_as_of'] },
    { key: 'duration', label: 'Duration', load: getDurations, columns: ['case_number', 'tat_calendar_days_derived', 'open_to_acd_calendar_days', 'acd_to_close_calendar_days', 'duration_data_quality_status'] },
    { key: 'documentation', label: 'Documentation', load: getDocumentation, columns: ['case_number', 'documentation_status', 'description_present', 'closure_note_present', 'root_cause_present', 'resolution_present'] },
    { key: 'quality', label: 'Data quality', load: getDataQuality, columns: ['field_name', 'total_record_count', 'populated_record_count', 'populated_rate', 'quality_status'] },
] as const;

function format(value: OperationRow[string]) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}

function OperationsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();
    const tabKey = searchParams.get('tab') ?? 'workload';
    const active = tabs.find((tab) => tab.key === tabKey) ?? tabs[0];
    const [envelope, setEnvelope] = React.useState<Envelope<OperationRow[]> | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);
    const asOfWeek = searchParams.get('as_of_week') ?? undefined;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        active.load({ as_of_week: asOfWeek, limit: 50 })
            .then((result) => { if (!cancelled) setEnvelope(result); })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load Operations data.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [active, asOfWeek]);

    const changeTab = (_event: React.SyntheticEvent, key: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', key); params.delete('cursor');
        router.push(`${pathname}?${params.toString()}`);
    };

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Typography variant="h4" component="h1">Operations</Typography>
        <Box sx={{ minWidth: 220 }}><WeekSelect /></Box>
        <Tabs value={active.key} onChange={changeTab} variant="scrollable" scrollButtons="auto" aria-label="Operations analysis tabs">
            {tabs.map((tab) => <Tab key={tab.key} value={tab.key} label={tab.label} />)}
        </Tabs>
        {loading && <Typography>Loading…</Typography>}
        {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}
        {envelope && !loading && <>
            <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
            <Brand.Card bordered="outlined">
                <Typography variant="body2" sx={{ mb: 2 }}>{envelope.data[0]?.disclaimer ?? 'Direct snapshot values with the displayed data-quality status.'}</Typography>
                <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', '& th, & td': { textAlign: 'left', p: 1, borderBottom: '1px solid', borderColor: 'divider', verticalAlign: 'top' } }}>
                    <thead><tr>{active.columns.map((column) => <th key={column}>{column.replaceAll('_', ' ')}</th>)}</tr></thead>
                    <tbody>{envelope.data.map((row, index) => <tr key={`${row.case_number ?? row.field_name ?? 'row'}-${index}`}>{active.columns.map((column) => <td key={column}>{format(row[column])}</td>)}</tr>)}</tbody>
                </Box>
                {envelope.data.length === 0 && <Typography>No matching records for this extract week.</Typography>}
            </Brand.Card>
        </>}
    </Box>;
}

export default function OperationsPage() {
    return <Suspense fallback={<Typography>Loading…</Typography>}><OperationsContent /></Suspense>;
}
