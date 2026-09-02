'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';

import * as Brand from '../components/ui';
import { BASE_PATH } from '../utils/base-path';

export default function DashboardPage() {
    const handleHealthCheck = async () => {
        try {
            const response = await fetch(`${BASE_PATH}/api/health`, { cache: 'no-store' });
            const data = await response.json();

            alert(JSON.stringify(data, null, 2));
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Unable to fetch health data');
        }
    };

    return (
        <Box
            component="main"
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 4,
                backgroundColor: 'background.default'
            }}
        >
            <Brand.Card bordered="outlined" sx={{ maxWidth: 560, width: '100%', display: 'grid', gap: 3 }}>
                <Typography variant="h4" component="h1">
                    welcome to orx-pbm-case-insights
                </Typography>
                <Brand.Button onClick={handleHealthCheck}>Check backend health</Brand.Button>
            </Brand.Card>
        </Box>
    );
}
