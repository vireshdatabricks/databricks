'use client';

import React from 'react';
import { Box, Typography } from '@mui/material';

import * as Brand from '../../components/ui';

interface FreshnessBannerProps {
    asOfWeek: string;
    dataQualityStatus: string;
    logicVersion: string;
}

export default function FreshnessBanner({ asOfWeek, dataQualityStatus, logicVersion }: FreshnessBannerProps) {
    return (
        <Brand.Card bordered="outlined">
            <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Typography variant="body2">
                    <strong>As of week:</strong> {asOfWeek}
                </Typography>
                <Typography variant="body2">
                    <strong>Data quality:</strong> {dataQualityStatus}
                </Typography>
                <Typography variant="body2">
                    <strong>Logic version:</strong> {logicVersion}
                </Typography>
            </Box>
        </Brand.Card>
    );
}
