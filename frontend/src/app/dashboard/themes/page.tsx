'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import { AnalyticsApiError, Envelope, ThemeCandidate, getThemes } from '../../utils/analytics-api';
import FreshnessBanner from '../components/freshness-banner';
import QueryTextFilter from '../components/query-text-filter';
import WeekSelect from '../components/week-select';

function ThemesContent() {
    const searchParams = useSearchParams();
    const [envelope, setEnvelope] = React.useState<Envelope<ThemeCandidate[]> | null>(null);
    const [items, setItems] = React.useState<ThemeCandidate[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    const asOfWeek = searchParams.get('as_of_week') ?? undefined;
    const category = searchParams.get('category') ?? undefined;
    const rootCause = searchParams.get('root_cause') ?? undefined;

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getThemes({ as_of_week: asOfWeek, category, root_cause: rootCause, limit: 100 })
            .then((data) => {
                if (cancelled) return;
                setEnvelope(data);
                setItems(data.data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load themes.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [asOfWeek, category, rootCause]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getThemes({ as_of_week: asOfWeek, category, root_cause: rootCause, limit: 100, cursor: envelope.next_cursor })
            .then((data) => {
                setEnvelope(data);
                setItems((prev) => [...prev, ...data.data]);
            })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load more themes.'));
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Themes</Typography>
            <Typography variant="body2" color="text.secondary">
                Deterministic category / root-cause groupings. These are candidates, not validated findings.
            </Typography>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <Box sx={{ minWidth: 220 }}>
                    <WeekSelect />
                </Box>
                <QueryTextFilter label="Category" paramKey="category" />
                <QueryTextFilter label="Root cause" paramKey="root_cause" />
            </Box>

            {loading && <Typography>Loading…</Typography>}
            {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

            {envelope && !loading && (
                <>
                    <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
                    <TableContainer component={Brand.Card} sx={{ padding: 0 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Theme</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Root cause</TableCell>
                                    <TableCell align="right">Case count</TableCell>
                                    <TableCell align="right">Occurrence rate</TableCell>
                                    <TableCell>Min. support met</TableCell>
                                    <TableCell>Method</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((theme) => (
                                    <TableRow key={theme.theme_id}>
                                        <TableCell>{theme.theme_label}</TableCell>
                                        <TableCell>{theme.category ?? '—'}</TableCell>
                                        <TableCell>{theme.root_cause ?? '—'}</TableCell>
                                        <TableCell align="right">{theme.case_count}</TableCell>
                                        <TableCell align="right">{(theme.occurrence_rate * 100).toFixed(1)}%</TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={theme.meets_min_support ? 'Yes' : 'No'}
                                                color={theme.meets_min_support ? 'success' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell>{theme.method_type}</TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/dashboard/themes/${encodeURIComponent(theme.theme_id)}${asOfWeek ? `?as_of_week=${encodeURIComponent(asOfWeek)}` : ''}`}
                                            >
                                                View cases
                                            </Link>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    {envelope.next_cursor && (
                        <Brand.Button variant="secondary" onClick={loadMore} sx={{ justifySelf: 'start' }}>
                            Load more
                        </Brand.Button>
                    )}
                </>
            )}
        </Box>
    );
}

export default function ThemesPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <ThemesContent />
        </Suspense>
    );
}
