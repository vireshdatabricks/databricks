'use client';

import React, { Suspense } from 'react';
import { Box } from '@mui/material';
import { useSearchParams } from 'next/navigation';

import * as Brand from '../../components/ui';
import ContextBar, { type Freshness } from '../../components/patterns/context-bar';
import type { Envelope } from '../../utils/analytics-api';
import MonthlyTrendTab from './_components/monthly-trend-tab';
import OperationsTab, { OPERATION_TABS } from './_components/operations-tab';
import WorkflowTab from './_components/workflow-tab';

const TAB_OPTIONS = [...OPERATION_TABS.map((tab) => ({ value: tab.key, label: tab.label })), { value: 'workflow', label: 'Workflow' }, { value: 'monthly', label: 'Monthly trend' }];

function OperationsContent() {
    const search = useSearchParams();
    const [freshness, setFreshness] = React.useState<Freshness>();
    const tabKey = search.get('tab') ?? 'workload';
    const operationTab = OPERATION_TABS.find((tab) => tab.key === tabKey) ?? (tabKey === 'monthly' || tabKey === 'workflow' ? undefined : OPERATION_TABS[0]);
    const onEnvelope = React.useCallback((envelope: Envelope<unknown>) => setFreshness({ asOfWeek: envelope.as_of_week, logicVersion: envelope.logic_version }), []);
    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.PageHeader title="Operations" description="Workload, ageing, operational dates, documentation, data quality, and the monthly trend for the selected week." />
        {/* Monthly trend applies its own case/task filters (reference/50 §4.3); the bar keeps only the week there. */}
        <ContextBar fields={tabKey === 'monthly' ? [] : ['client_account', 'line_of_business', 'assignment_group']} freshness={freshness} />
        <Brand.Tabs options={TAB_OPTIONS} />
        {operationTab ? <OperationsTab key={operationTab.key} tab={operationTab} onEnvelope={onEnvelope} /> : tabKey === 'workflow' ? <WorkflowTab /> : <MonthlyTrendTab />}
    </Box>;
}

export default function OperationsPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading operations" />}><OperationsContent /></Suspense>;
}
