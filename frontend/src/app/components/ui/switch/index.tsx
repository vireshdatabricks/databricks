'use client';

import { styled } from '@mui/material/styles';
import MuiSwitch, { SwitchProps } from '@mui/material/Switch';

const Switch = styled(MuiSwitch)(({ theme }) => ({
    width: 44,
    height: 24,
    padding: 0,
    marginRight: 10,
    '& .MuiSwitch-switchBase': {
        padding: 0,
        margin: 0,
        transitionDuration: '300ms',
        border: '2px solid', borderColor: theme.palette.brand.enterpriseDarkGray,
        '&.Mui-checked': {
            transform: 'translateX(20px)',
            color: theme.palette.brand.hyperlink,
            border: '2px solid', borderColor: theme.palette.brand.hyperlink,
            '& + .MuiSwitch-track': {
                backgroundColor: theme.palette.brand.white,
                border: '2px solid', borderColor: theme.palette.brand.hyperlink,
                opacity: 1,
            },
            '&.Mui-disabled + .MuiSwitch-track': {
                opacity: 0.5,
                border: '2px solid', borderColor: theme.palette.grey[500],
            },
            '& .MuiSwitch-thumb': {
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'><circle cx='10' cy='10' r='10' fill='%230C55B8'/><path d='M8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z' fill='white'/></svg>")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
            },
        },
        '&.Mui-checked.Mui-disabled': {
            border: '2px solid', borderColor: theme.palette.grey[500],
            '& .MuiSwitch-thumb': {
                backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20' fill='none'><circle cx='10' cy='10' r='10' fill='%23979797'/><path d='M8 15L3 10L4.41 8.59L8 12.17L15.59 4.58L17 6L8 15Z' fill='white'/></svg>")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
            },
        },
        '&.Mui-disabled .MuiSwitch-thumb': {
            color: theme.palette.grey[100],
        },
        '&.Mui-disabled + .MuiSwitch-track': {
            opacity: 0.7,
            border: '2px solid rgb(127, 129, 130)',
        },
    },
    '& .MuiSwitch-thumb': {
        boxSizing: 'border-box',
        width: 20,
        height: 20,
        border: '2px solid transparent',
    },
    '& .MuiSwitch-track': {
        borderRadius: '12px',
        backgroundColor: theme.palette.grey[100],
        opacity: 1,
        border: '2px solid', borderColor: theme.palette.brand.enterpriseDarkGray,
        transition: theme.transitions.create(['background-color'], { duration: 500 }),
    },
}));

export default Switch;
export type { SwitchProps };
