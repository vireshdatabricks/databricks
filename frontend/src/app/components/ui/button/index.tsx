import MuiButton, { ButtonProps as MuiButtonProps } from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import OptumTheme from '../../../utils/theme';

type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
type ButtonSize = 'regular' | 'compact';

interface ButtonProps extends Omit<MuiButtonProps, 'color' | 'variant' | 'size'> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
    /** Anchor props used by shared button-styled links (for example, report exports). */
    component?: React.ElementType;
    href?: string;
    target?: string;
    rel?: string;
    download?: string | boolean;
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
        backgroundColor: 'transparent',
        color: brand.hyperlink,
        border: '1px solid transparent',
        boxShadow: 'none',
        '&:hover': {
            backgroundColor: brand.informationLight,
            borderColor: 'transparent',
            boxShadow: 'none',
        },
        '&:active': {
            backgroundColor: brand.skyBlue,
            borderColor: 'transparent',
            boxShadow: 'none',
        },
        '&.Mui-disabled': {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            color: brand.shark,
        },
    },
    destructive: {
        backgroundColor: brand.white,
        color: brand.danger,
        border: `1px solid ${brand.danger}`,
        boxShadow: 'none',
        '&:hover': {
            backgroundColor: brand.dangerLight,
            borderColor: brand.danger,
            boxShadow: 'none',
        },
        '&:active': {
            backgroundColor: brand.dangerPressed,
            borderColor: brand.danger,
            boxShadow: 'none',
        },
        '&.Mui-disabled': {
            backgroundColor: brand.ash,
            borderColor: brand.ash,
            color: brand.slate,
        },
    },
};

const sizeStyles: Record<ButtonSize, { minHeight: number; padding: string }> = {
    regular: { minHeight: 44, padding: '12px 20px' },
    compact: { minHeight: 36, padding: '8px 12px' },
};

const Button = ({
    variant = 'primary',
    size = 'regular',
    loading = false,
    disabled,
    sx,
    children,
    startIcon,
    ...props
}: ButtonProps) => (
    <MuiButton
        variant="contained"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        startIcon={loading ? <CircularProgress size={16} color="inherit" aria-hidden="true" /> : startIcon}
        sx={[
            {
                ...sizeStyles[size],
                borderRadius: '999px',
                fontWeight: variant === 'secondary' ? 400 : 700,
                ...variantStyles[variant],
            },
            ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
        {...props}
    >
        {children}
    </MuiButton>
);

export default Button;
