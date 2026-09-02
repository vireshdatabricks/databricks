import MuiButton, { ButtonProps as MuiButtonProps } from '@mui/material/Button';
import OptumTheme from '../../../utils/theme';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary';

interface ButtonProps extends Omit<MuiButtonProps, 'color' | 'variant'> {
    variant?: ButtonVariant;
}

const { brand } = OptumTheme.palette;

const variantStyles = {
    primary: {
        backgroundColor: brand.enterpriseDarkBlue,
        color: brand.white,
        border: `1px solid ${brand.enterpriseDarkBlue}`,
        '&:hover': {
            backgroundColor: brand.blueShadow,
            borderColor: brand.blueShadow,
        },
        '&:active': {
            backgroundColor: brand.blueNight,
            borderColor: brand.blueNight,
        },
        '&.Mui-disabled': {
            backgroundColor: brand.ash,
            borderColor: brand.ash,
            color: brand.slate,
        },
    },
    secondary: {
        backgroundColor: brand.white,
        color: brand.enterpriseDarkBlue,
        border: `1px solid ${brand.enterpriseDarkBlue}`,
        boxShadow: 'none',
        '&:hover': {
            backgroundColor: brand.skyBlueLighter,
            borderColor: brand.enterpriseDarkBlue,
            boxShadow: 'none',
        },
        '&:active': {
            backgroundColor: brand.skyBlue,
            borderColor: brand.enterpriseDarkBlue,
            boxShadow: 'none',
        },
        '&.Mui-disabled': {
            backgroundColor: brand.ash,
            borderColor: brand.ash,
            color: brand.slate,
        },
    },
    tertiary: {
        backgroundColor: brand.white,
        color: brand.shark,
        border: `1px solid ${brand.shark}`,
        boxShadow: 'none',
        '&:hover': {
            backgroundColor: brand.warmWhite,
            borderColor: brand.shark,
            boxShadow: 'none',
        },
        '&:active': {
            backgroundColor: brand.haze,
            borderColor: brand.shark,
            boxShadow: 'none',
        },
        '&.Mui-disabled': {
            backgroundColor: brand.ash,
            borderColor: brand.ash,
            color: brand.slate,
        },
    },
};

const Button = ({ variant = 'primary', sx, ...props }: ButtonProps) => (
    <MuiButton
        variant="contained"
        sx={[
            {
                padding: '12px 24px',
                borderRadius: '999px',
                fontWeight: 700,
                ...variantStyles[variant],
            },
            ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
        {...props}
    />
);

export default Button;
