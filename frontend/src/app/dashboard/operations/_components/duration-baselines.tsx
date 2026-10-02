'use client';

import React from 'react';
import * as Brand from '../../../components/ui';
import BaselineTable from '../../../components/patterns/baseline-table';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { AnalyticsApiError, Baselines, getBaselines } from '../../../utils/analytics-api';

const NAMES: Record<string, string> = {
    'WF-03': 'Open to actual completion', 'WF-04': 'Actual completion to close', 'WF-05': 'Open to close',
    'WF-05-BD': 'Open to close (ServiceNow business days)', 'WF-11-TASK': 'Task turnaround', 'WF-11-SUBTASK': 'Subtask turnaround',
};

/** Duration tab: WF-03 to WF-05 and WF-11 baselines next to the current period (reference/51 §6). */
export default function DurationBaselines() {
    const context = useAnalysisContext();
    const [data, setData] = React.useState<Baselines | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const { as_of_week: asOfWeek, client_account: clientAccount, category, assignment_group: assignmentGroup } = context;
    React.useEffect(() => {
        let cancelled = false;
        setError(null);
        getBaselines(Object.keys(NAMES), { as_of_week: asOfWeek, client_account: clientAccount, category, case_assignment_group: assignmentGroup })
            .then((result) => { if (!cancelled) setData(result.data); })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Baselines could not be loaded.'); });
        return () => { cancelled = true; };
    }, [asOfWeek, clientAccount, category, assignmentGroup]);
    if (error) return <Brand.Notice tone="warning" title="Baselines unavailable">{error}</Brand.Notice>;
    if (!data) return <Brand.StateView state="loading" title="Loading baselines" />;
    return <BaselineTable baselines={data} names={NAMES} title="Turnaround baselines" />;
}
