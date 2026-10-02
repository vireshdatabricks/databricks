import React from 'react';
import { Box } from '@mui/material';

import AppNav from './components/app-nav';

/** Dashboard pages share the application navigation; PageShell remains the single main landmark. */
export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    return <Box sx={{ display: 'flex', flex: 1, mx: { xs: -2, md: -4 }, my: { xs: -2, md: -4 } }}>
        <AppNav />
        {/* reference/48 S20: content column at most 1200 px (plus 32 px padding each side). */}
        <Box sx={{ minWidth: 0, flex: 1, p: { xs: 2, md: 4 }, maxWidth: 1264, mx: 'auto' }}>{children}</Box>
    </Box>;
}
