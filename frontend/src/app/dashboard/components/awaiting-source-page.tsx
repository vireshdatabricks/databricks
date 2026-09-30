'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Box, Typography } from '@mui/material';

import * as Brand from '../../components/ui';

export default function AwaitingSourcePage({ title, summary, needs, availableHref, availableLabel }: { title: string; summary: string; needs: string; availableHref?: string; availableLabel?: string }) {
    const searchParams = useSearchParams();
    const query = searchParams.toString();
    const withContext = (path: string) => `${path}${query ? `${path.includes('?') ? '&' : '?'}${query}` : ''}`;
    return <Box component="main" sx={{ display: 'grid', gap: 3 }}>
        <Box>
            <Typography variant="h4" component="h1">{title}</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>{summary}</Typography>
        </Box>
        <Brand.Card bordered="outlined">
            <Typography variant="h6">Awaiting source</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{needs}</Typography>
        </Brand.Card>
        {availableHref && availableLabel && <Brand.Card bordered="outlined"><Link href={withContext(availableHref)}>{availableLabel}</Link></Brand.Card>}
        <Link href={withContext('/dashboard')}>Back to snapshot overview</Link>
    </Box>;
}
