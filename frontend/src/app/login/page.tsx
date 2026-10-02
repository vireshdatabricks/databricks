'use client';

import React from 'react';
// LOCAL DEVELOPMENT ONLY — restore this import before committing.
// import { idpLogin } from '@uhg-optum-coreplatform/security-as-a-service-pkg';
import { Box, Typography } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';

import { getMSIDSettings } from './actions';
import * as Brand from '../components/ui';
import commonlyUsedStrings from '../utils/commonly-used-strings';
import { withBasePath } from '../utils/base-path';

const idpLogin = () => window.location.assign(withBasePath('/dashboard'));

const Card = styled(Brand.Card)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  border: 1px solid ${({ theme }) => theme.palette.brand.smoke};
  border-radius: 24px;
  padding: 40px 36px;
  gap: 20px;
  width: min(92vw, 560px);
`;

export default function LoginPage() {
  const [noAccess, setNoAccess] = React.useState(false);
  const searchParams = useSearchParams();

  React.useEffect(() => {
    if (searchParams.get('unauthorized') === 'true') setNoAccess(true);
  }, [searchParams]);

  const onClickLogin = async () => {
    await getMSIDSettings();
    idpLogin();
  };

  const centerCss = { position: 'absolute' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  if (noAccess) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          ...centerCss
        }}
      >
        <Typography variant="h1" component="h1">You don&apos;t have access to this application.</Typography>
        <Typography>Please contact your administrator for access.</Typography>
      </Box>
    );
  }

  return (
    <Card sx={centerCss} background='ash'>
      <Box sx={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <Image src={withBasePath('/OptumRx.png')} width={300} height={60} alt="logo" priority />
      </Box>
      <Typography variant="h2" sx={{ fontWeight: 700, maxWidth: '460px' }}>
        {commonlyUsedStrings.APP_NAME}
      </Typography>
      <Typography variant="body1">Sign in to access this platform.</Typography>
      <Brand.Button onClick={onClickLogin}>Sign in as an Optum Employee</Brand.Button>
    </Card>
  );
}
