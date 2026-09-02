import React from 'react';
import MuiCard, { CardProps as MuiCardProps } from '@mui/material/Card';

import OptumTheme from '../../../utils/theme';

type CardBorder = 'none' | 'outlined' | 'shadowed';
type CardBackground = keyof typeof OptumTheme.palette.brand;

interface CardProps extends Omit<MuiCardProps, 'color'> {
    bordered?: CardBorder;
    background?: CardBackground;
    color?: string;
    borderRadius?: string;

    padding?: string;
}

const { brand } = OptumTheme.palette;

const borderStyles: Record<CardBorder, MuiCardProps['sx']> = {
    none: {
        border: 'none',
        boxShadow: 'none',
    },
    outlined: {
        border: `1px solid ${brand.smoke}`,
        boxShadow: 'none',
    },
    shadowed: {
        border: 'none',
        boxShadow: 3,
    },
};

const Card = ({
    bordered = 'none',
    background = 'white',
    color = brand.shark,
    borderRadius = '16px',
    padding = '24px',
    sx,
    children,
    ...props
}: CardProps) => {
    return (
        <MuiCard
            sx={[
                {
                    padding,
                    borderRadius,
                    backgroundColor: brand[background],
                    color,
                    ...borderStyles[bordered],
                },
                ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
            ]}
            {...props}
        >
            {children}
        </MuiCard>
    );
};

export default Card;
export type { CardBackground, CardBorder, CardProps };