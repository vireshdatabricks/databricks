'use client';

import React from 'react';
import { Box, Menu, MenuItem, ListItemText, Typography, Avatar, useTheme } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useRouter } from 'next/navigation';
// import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';

interface IAvatarWithMenu {
  userName: string;
  isAuthenticated: boolean;
}

export default function AvatarWithMenu({ userName, isAuthenticated }: IAvatarWithMenu) {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const router = useRouter();
  const theme = useTheme();

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => router.push('/login')}
        style={{ background: theme.palette.brand.enterpriseDarkBlue, color: theme.palette.brand.white, border: 'none', borderRadius: '4px', padding: '8px 20px', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
      >
        Login
      </button>
    );
  }

  return (
    <>
      <Box
        component="button"
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => setAnchorEl(e.currentTarget)}
        sx={{ display: 'flex', alignItems: 'center', gap: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Typography sx={{ fontSize: '16px', color: 'brand.enterpriseDarkBlue', fontWeight: 700 }}>{userName}</Typography>
        <KeyboardArrowDownIcon sx={{ color: 'brand.enterpriseDarkBlue' }} />
      </Box>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => router.push('/logout')} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
          <ListItemText className='asdf' sx={{ "& > span": { display: "flex", justifyContent: "center", alignItems: "center", gap: 1 } }}><LogoutOutlinedIcon /> Log out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
