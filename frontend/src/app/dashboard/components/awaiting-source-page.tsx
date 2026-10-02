'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Box, Stack, Typography } from '@mui/material';

import * as Brand from '../../components/ui';
import { useAnalysisContext } from '../../lib/hooks/use-analysis-context';

type Props = { title: string; summary: string; needs: string; availableHref?: string; availableLabel?: string; children?: React.ReactNode };

export default function AwaitingSourcePage(props: Props) {
    return <Suspense fallback={<Brand.StateView state="loading" title={`Loading ${props.title.toLowerCase()}`} />}><AwaitingSourceContent {...props} /></Suspense>;
}

function AwaitingSourceContent({ title, summary, needs, availableHref, availableLabel, children }: Props) {
    const context = useAnalysisContext();
    return <Box sx={{ display: 'grid', gap: 3 }}>
        <Brand.PageHeader title={title} description={summary} />
        <Brand.Card bordered="outlined" sx={{ display: 'grid', gap: 1 }}>
            <Stack direction="row" gap={1} alignItems="center"><Typography variant="h3" component="h2">What this needs</Typography><Brand.StatusBadge status="awaiting-source" /></Stack>
            <Typography variant="body2" color="text.secondary">{needs}</Typography>
            {availableHref && availableLabel && <Typography variant="body2">Available now: <Link href={context.hrefWith(availableHref)}>{availableLabel}</Link></Typography>}
        </Brand.Card>
        {children}
        <Link href={context.hrefWith('/dashboard')}>Back to Overview</Link>
    </Box>;
}
