import React from 'react';
import MuiCard, { CardProps as MuiCardProps } from '@mui/material/Card';

import OptumTheme from '../../../utils/theme';

type CardBorder = 'none' | 'outlined' | 'shadowed';
type CardVariant = 'outlined' | 'subtle';
type CardBackground = keyof typeof OptumTheme.palette.brand;

interface CardProps extends Omit<MuiCardProps, 'color' | 'variant'> {
    /** The approved card surface. Prefer this to legacy appearance props. */
    variant?: CardVariant;
    /** @deprecated Legacy compatibility while existing pages are migrated. */
    bordered?: CardBorder;
    /** @deprecated Legacy compatibility while existing pages are migrated. */
    background?: CardBackground;
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
    variant,
    sx,
    children,
    ...props
}: CardProps) => {
    return (
        <MuiCard
            sx={[
                {
                    padding: '24px',
                    borderRadius: '8px',
                    backgroundColor: brand[background],
                    color: brand.shark,
                    ...(variant === 'outlined' ? borderStyles.outlined : variant === 'subtle'
                        ? { ...borderStyles.none, backgroundColor: brand.haze }
                        : borderStyles[bordered]),
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
export type { CardBackground, CardBorder, CardProps, CardVariant };
