'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Box } from '@mui/material';

import * as Brand from '../../../components/ui';
import type { DataColumn } from '../../../components/ui/data-table';
import { useAnalysisContext } from '../../../lib/hooks/use-analysis-context';
import { humanizeIdentifier } from '../../../lib/format';
import { AnalyticsApiError, Envelope, ThemeCaseLink, getThemeCases } from '../../../utils/analytics-api';

function ThemeCasesContent() {
    const params = useParams<{ themeId: string }>();
    const context = useAnalysisContext();
    const themeId = decodeURIComponent(params.themeId);
    const asOfWeek = context.as_of_week;
    const [envelope, setEnvelope] = React.useState<Envelope<ThemeCaseLink[]> | null>(null);
    const [items, setItems] = React.useState<ThemeCaseLink[]>([]);
    const [error, setError] = React.useState<{ status: number; message: string } | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [attempt, setAttempt] = React.useState(0);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true); setError(null);
        getThemeCases(themeId, { as_of_week: asOfWeek, limit: 100 })
            .then((data) => { if (!cancelled) { setEnvelope(data); setItems(data.data); } })
            .catch((err) => { if (!cancelled) setError(err instanceof AnalyticsApiError ? { status: err.status, message: err.message } : { status: 0, message: 'Cases for this theme could not be loaded.' }); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [themeId, asOfWeek, attempt]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getThemeCases(themeId, { as_of_week: asOfWeek, limit: 100, cursor: envelope.next_cursor })
            .then((data) => { setEnvelope(data); setItems((prev) => [...prev, ...data.data]); })
            .catch((err) => setError(err instanceof AnalyticsApiError ? { status: err.status, message: err.message } : { status: 0, message: 'More cases could not be loaded.' }));
    };
    const title = humanizeIdentifier(themeId.toLowerCase());
    const columns: DataColumn<ThemeCaseLink>[] = [
        { id: 'case_number', label: 'Case number', sortable: true, value: (row) => row.case_number, render: (row) => <Link href={context.hrefWith(`/dashboard/cases/${encodeURIComponent(row.case_number)}`)}>{row.case_number}</Link> },
        { id: 'client_account', label: 'Client' },
        { id: 'category', label: 'Category' },
        { id: 'case_type', label: 'Case type' },
        { id: 'subtype', label: 'Subtype' },
        { id: 'root_cause', label: 'Root cause' },
        { id: 'is_open', label: 'State', value: (row) => row.is_open ? 'Open' : 'Closed' },
        { id: 'membership_basis', label: 'Why it is in this theme', value: (row) => humanizeIdentifier(row.membership_basis) },
    ];

    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.Breadcrumbs items={[{ label: 'Recurring issues', href: context.hrefWith('/dashboard/recurring-issues') }, { label: title }]} />
        <Brand.PageHeader title={title} description="Cases grouped into this candidate theme for the selected week. Membership is a candidate grouping, not a validated cause."
            details={[{ label: 'Theme ID', value: themeId }, ...(envelope ? [{ label: 'Extract week', value: envelope.as_of_week }, { label: 'Logic version', value: envelope.logic_version }] : [])]} />
        {loading && !envelope ? <Brand.StateView state="loading" title="Loading cases" />
            : error ? <Brand.StateView state={error.status === 404 ? 'not_found' : 'error'} title={error.status === 404 ? 'Theme not found in this week' : 'Cases could not be loaded'} description={error.message} onRetry={error.status === 404 ? undefined : () => setAttempt((value) => value + 1)} />
            : <>
                <Brand.DataTable rows={items} columns={columns} getRowId={(row) => row.case_number} label="Cases in this theme" resultLabel="case" emptyTitle="No cases" emptyDescription="This theme has no cases in the selected week." />
                {envelope?.next_cursor && <Brand.Button variant="secondary" onClick={loadMore} sx={{ justifySelf: 'start' }}>Load more cases</Brand.Button>}
            </>}
    </Box>;
}

export default function ThemeCasesPage() {
    return <Suspense fallback={<Brand.StateView state="loading" title="Loading cases" />}><ThemeCasesContent /></Suspense>;
}
