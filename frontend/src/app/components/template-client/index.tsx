'use client';

import React from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { Grid, ThemeProvider } from '@mui/material';
import { usePathname } from 'next/navigation';

import OptumTheme from '../../utils/theme';
import { BASE_PATH, stripBasePath } from '../../utils/base-path';
import * as Brand from '../ui';
import TimeoutPopup from '../timeout-popup';

interface TemplateClientProps {
  children: React.ReactNode;
  hasSession: boolean;
  authDisabled: boolean;
}

export default function TemplateClient({ children, hasSession, authDisabled }: TemplateClientProps) {
  const pathname = usePathname();
  const routePath = stripBasePath(pathname ?? '/');
  const showHeader = routePath !== '/login' || hasSession || authDisabled;
  const [userName, setUserName] = React.useState<string | null>(null);
  const { brand } = OptumTheme.palette;

  React.useEffect(() => {
    if (!hasSession || authDisabled) return;
    fetch(`${BASE_PATH}/api/user`)
      .then((res) => res.json())
      .then((user) => {
        setUserName(user?.displayName ?? user?.name ?? user?.preferred_username ?? user?.sub ?? null);
      })
      .catch(() => { });
  }, [hasSession, authDisabled]);

  return (
    <ThemeProvider theme={OptumTheme}>
      <CssBaseline />
      <Grid
        sx={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100dvh',
          backgroundColor: showHeader ? brand.white : brand.haze
        }}
      >
        {showHeader && <Brand.Header userName={userName} sub={null} isAuthenticated={hasSession} />}
        <Brand.PageShell>{children}</Brand.PageShell>
        {showHeader && <Brand.Footer />}
        {!authDisabled && hasSession && <TimeoutPopup />}
      </Grid>
    </ThemeProvider>
  );
}
