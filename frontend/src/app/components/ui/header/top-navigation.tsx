'use client';

import React from 'react';
import Link from 'next/link';
import { Box, Menu, MenuItem, useTheme } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { usePathname } from 'next/navigation';
import { styled } from '@mui/material/styles';

import { INavItem } from './config';

const NavButton = styled('button')(({ theme }) => ({
  color: theme.palette.brand.enterpriseDarkGray, fontWeight: 700, fontSize: 14, fontFamily: 'inherit', textTransform: 'none',
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: 4,
}));

interface TopNavigationProps {
  isAuthenticated: boolean;
  disabledPublicSlugs: string[];
  items: INavItem[];
}

export default function TopNavigation({ isAuthenticated, disabledPublicSlugs, items }: TopNavigationProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const pathname = usePathname();
  const theme = useTheme();
  const activeSegments = pathname.split('/').filter(Boolean);
  const disabledSet = new Set(disabledPublicSlugs);

  const visible = items.filter((item) => {
    if (item.access === 'public') return !disabledSet.has(item.pathToMatch);
    return isAuthenticated;
  });

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mx: 3, height: '64px' }}>
      {visible.map((item) =>
        item.children ? (
          <Box
            key={item.label}
            sx={{ display: 'flex', alignItems: 'center', position: 'relative', borderBottom: `3px solid ${activeSegments.includes(item.pathToMatch) ? theme.palette.brand.enterpriseDarkBlue : theme.palette.brand.white}`, height: '100%', px: 1 }}
          >
            <NavButton onClick={(e) => { setAnchorEl(e.currentTarget); setOpenKey(item.label); }}>
              {item.label}
              <KeyboardArrowDownIcon fontSize="small" />
            </NavButton>
            <Menu anchorEl={anchorEl} open={openKey === item.label} onClose={() => setOpenKey(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }} transformOrigin={{ vertical: 'top', horizontal: 'left' }} sx={{ '& ul.MuiList-root': { p: 0 } }}>
              {item.children.map((child) => {
                const isActive = pathname.includes(child.link);
                return (
                  <MenuItem key={child.label} onClick={() => setOpenKey(null)} sx={{ '&:hover': { backgroundColor: 'action.hover' }, fontWeight: isActive ? 700 : 400, color: isActive ? 'brand.enterpriseDarkBlue' : undefined, backgroundColor: isActive ? 'brand.informationLight' : undefined, p: 0 }}>
                    <Link href={child.link} style={{ display: 'block', width: '100%', padding: '8px 16px', color: 'inherit', textDecoration: 'none' }}>{child.label}</Link>
                  </MenuItem>
                );
              })}
            </Menu>
          </Box>
        ) : (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', position: 'relative', borderBottom: `3px solid ${activeSegments.includes(item.pathToMatch) ? theme.palette.brand.enterpriseDarkBlue : theme.palette.brand.white}`, height: '100%', px: 1 }}>
            <Link href={item.link} style={{ textDecoration: 'none', color: activeSegments.includes(item.pathToMatch) ? theme.palette.brand.enterpriseDarkBlue : theme.palette.brand.enterpriseDarkGray, fontWeight: 600, padding: '0 12px', display: 'flex', alignItems: 'center', height: '100%' }}>{item.label}</Link>
          </Box>
        )
      )}
    </Box>
  );
}
