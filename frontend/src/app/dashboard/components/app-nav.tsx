'use client';

import React from 'react';
import MenuIcon from '@mui/icons-material/Menu';
import { Box, Drawer, IconButton, List, ListItemButton, ListItemText, Tooltip, Typography } from '@mui/material';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import * as Brand from '../../components/ui';
import { radius } from '../../utils/theme';

/** Implements reference/45 D2/D7: grouped, context-preserving dashboard navigation. */
const groups = [
    { label: 'Analyse', items: [
        ['Overview', '/dashboard'], ['Operations', '/dashboard/operations'], ['Recurring issues', '/dashboard/recurring-issues'], ['Ticket evidence', '/dashboard/ticket-evidence'],
    ] },
    { label: 'Report', items: [['Reports', '/dashboard/reports'], ['Promptbook', '/dashboard/promptbook']] },
    { label: 'Data', items: [['Risk & SLA', '/dashboard/risk-sla', 'awaiting-source'], ['Data readiness', '/dashboard/data-readiness', 'awaiting-source']] },
] as const;

const AppNav = () => {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [open, setOpen] = React.useState(false);
    const withContext = (path: string) => {
        const query = searchParams.toString();
        return `${path}${query ? `?${query}` : ''}`;
    };
    const content = (
        <Box component="nav" aria-label="Dashboard navigation" sx={{ width: 248, p: 2 }}>
            {groups.map((group) => <Box key={group.label} sx={{ mb: 3 }}>
                <Typography variant="label" color="text.secondary" sx={{ px: 1 }}>{group.label}</Typography>
                <List disablePadding sx={{ mt: 0.5 }}>
                    {group.items.map(([label, href, status]) => {
                        const selected = pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
                        return <ListItemButton key={href} component={Link} href={withContext(href)} selected={selected} onClick={() => setOpen(false)} sx={{ borderRadius: radius.card, my: 0.5 }}>
                            <ListItemText primary={label} primaryTypographyProps={{ variant: 'body2', fontWeight: selected ? 700 : 400 }} />
                            {status && <Brand.StatusBadge status="awaiting-source" />}
                        </ListItemButton>;
                    })}
                </List>
            </Box>)}
        </Box>
    );

    return <>
        <Box sx={{ display: { xs: 'none', md: 'block' }, borderRight: 1, borderColor: 'divider', alignSelf: 'stretch' }}>{content}</Box>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, px: 1, py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Tooltip title="Open navigation"><IconButton aria-label="Open dashboard navigation" onClick={() => setOpen(true)}><MenuIcon /></IconButton></Tooltip>
        </Box>
        <Drawer open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: 280 } }}>{content}</Drawer>
    </>;
};

export default AppNav;
