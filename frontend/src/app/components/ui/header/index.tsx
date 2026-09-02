import React from 'react';
import { AppBar, Box, Divider, Toolbar, Typography } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';

import OptumTheme from '../../../utils/theme';
import AvatarWithMenu from './avatar-with-menu';
import TopNavigation from './top-navigation';
import { topNavigationItems } from './config';
import commonlyUsedStrings from '../../../utils/commonly-used-strings';
import { withBasePath } from '../../../utils/base-path';

interface IHeader {
  userName: string | null;
  sub: string | null;
  isAuthenticated: boolean;
  disabledPublicSlugs?: string[];
}

const Header = ({ userName, sub, isAuthenticated, disabledPublicSlugs = [] }: IHeader) => {
  const userLabel = userName ?? sub ?? '';
  const { brand } = OptumTheme.palette;

  return (
    <AppBar
      position="static"
      sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, boxShadow: 'none' }}
    >
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${brand.smoke}`, backgroundColor: brand.white }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Image src={withBasePath('/OptumRx.png')} width={200} height={40} alt="logo" />
          <Divider orientation="vertical" flexItem sx={{ height: 40, borderColor: brand.slate, borderWidth: '1px' }} />
          <Link href="/" style={{ textDecoration: 'none', marginLeft: '16px' }}>
            <Typography variant="h5" color="#002677" width={460}>{commonlyUsedStrings.APP_NAME}</Typography>
          </Link>
        </Box>
        <AvatarWithMenu userName={userLabel} isAuthenticated={isAuthenticated} />
      </Toolbar>
      <Toolbar sx={{ minHeight: 0, px: 0, backgroundColor: brand.haze, borderBottom: `1px solid ${brand.smoke}` }}>
        <TopNavigation
          isAuthenticated={isAuthenticated}
          disabledPublicSlugs={disabledPublicSlugs}
          items={topNavigationItems}
        />
      </Toolbar>
    </AppBar>
  );
};

export default Header;
