'use client';

import React from 'react';
import { Box, Menu, MenuItem, ListItemText, Typography, Avatar } from '@mui/material';
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

  if (!isAuthenticated) {
    return (
      <button
        onClick={() => router.push('/login')}
        style={{ background: '#002677', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
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
        <Typography sx={{ fontSize: '16px', color: '#002677', fontWeight: 700 }}>{userName}</Typography>
        <KeyboardArrowDownIcon sx={{ color: '#002677' }} />
      </Box>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => router.push('/logout')} sx={{ '&:hover': { backgroundColor: '#B8B8B8' } }}>
          <ListItemText className='asdf' sx={{ "& > span": { display: "flex", justifyContent: "center", alignItems: "center", gap: 1 } }}><LogoutOutlinedIcon /> Log out</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
}
