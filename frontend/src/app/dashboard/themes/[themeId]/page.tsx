'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Chip, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';

import * as Brand from '../../../components/ui';
import { AnalyticsApiError, Envelope, ThemeCaseLink, getThemeCases } from '../../../utils/analytics-api';
import FreshnessBanner from '../../components/freshness-banner';

function ThemeCasesContent() {
    const params = useParams<{ themeId: string }>();
    const searchParams = useSearchParams();
    const themeId = decodeURIComponent(params.themeId);
    const asOfWeek = searchParams.get('as_of_week') ?? undefined;

    const [envelope, setEnvelope] = React.useState<Envelope<ThemeCaseLink[]> | null>(null);
    const [items, setItems] = React.useState<ThemeCaseLink[]>([]);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        getThemeCases(themeId, { as_of_week: asOfWeek, limit: 100 })
            .then((data) => {
                if (cancelled) return;
                setEnvelope(data);
                setItems(data.data);
            })
            .catch((err) => {
                if (!cancelled) setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load case evidence for this theme.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [themeId, asOfWeek]);

    const loadMore = () => {
        if (!envelope?.next_cursor) return;
        getThemeCases(themeId, { as_of_week: asOfWeek, limit: 100, cursor: envelope.next_cursor })
            .then((data) => {
                setEnvelope(data);
                setItems((prev) => [...prev, ...data.data]);
            })
            .catch((err) => setError(err instanceof AnalyticsApiError ? err.message : 'Unable to load more cases.'));
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Typography variant="h4" component="h1">Case evidence</Typography>
            <Typography variant="body2" color="text.secondary">Theme: {themeId}</Typography>

            {loading && <Typography>Loading…</Typography>}
            {error && <Brand.Card bordered="outlined"><Typography color="error">{error}</Typography></Brand.Card>}

            {envelope && !loading && (
                <>
                    <FreshnessBanner asOfWeek={envelope.as_of_week} dataQualityStatus={envelope.data_quality_status} logicVersion={envelope.logic_version} />
                    <TableContainer component={Brand.Card} sx={{ padding: 0 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Case number</TableCell>
                                    <TableCell>Client account</TableCell>
                                    <TableCell>Category</TableCell>
                                    <TableCell>Case type</TableCell>
                                    <TableCell>Subtype</TableCell>
                                    <TableCell>Root cause</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Membership basis</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((link) => (
                                    <TableRow key={link.case_number}>
                                        <TableCell>{link.case_number}</TableCell>
                                        <TableCell>{link.client_account ?? '—'}</TableCell>
                                        <TableCell>{link.category ?? '—'}</TableCell>
                                        <TableCell>{link.case_type ?? '—'}</TableCell>
                                        <TableCell>{link.subtype ?? '—'}</TableCell>
                                        <TableCell>{link.root_cause ?? '—'}</TableCell>
                                        <TableCell>
                                            <Chip size="small" label={link.is_open ? 'Open' : 'Closed'} color={link.is_open ? 'warning' : 'success'} />
                                        </TableCell>
                                        <TableCell>{link.membership_basis}</TableCell>
                                        <TableCell>
                                            <Link
                                                href={`/dashboard/cases/${encodeURIComponent(link.case_number)}${asOfWeek ? `?as_of_week=${encodeURIComponent(asOfWeek)}` : ''}`}
                                            >
                                                View case
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

export default function ThemeCasesPage() {
    return (
        <Suspense fallback={<Typography>Loading…</Typography>}>
            <ThemeCasesContent />
        </Suspense>
    );
}
