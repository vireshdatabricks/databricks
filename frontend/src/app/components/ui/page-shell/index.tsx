import React from 'react';
import { Grid } from '@mui/material';

import OptumTheme from '@/app/utils/theme';

interface PageShellProps {
    children: React.ReactNode;
}

const PageShell = ({ children }: PageShellProps) => {
    const { brand } = OptumTheme.palette;
    return (
        <Grid component="main" sx={{ flex: '1 0 auto', p: { xs: 4, md: 8 }, backgroundColor: brand.haze }}>
            {children}
        </Grid>
    );
}

export default PageShell;
