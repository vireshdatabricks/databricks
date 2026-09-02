import { Box, CircularProgress, Typography } from '@mui/material';
import React from 'react';

interface ILoaderProps {
    message?: string;
}

const Loader = (props: ILoaderProps) => {
    const { message = 'Loading' } = props;

    return (
        <Box
            sx={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                bgcolor: 'rgba(255,255,255,0.8)',
                zIndex: 1300,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                gap: 2
            }}
        >
            <CircularProgress size={64} sx={{ color: "#002677" }} />
            <Typography variant="h5" sx={{ color: "#002677" }}>
                {message}
            </Typography>
        </Box>
    );
}

export default Loader;