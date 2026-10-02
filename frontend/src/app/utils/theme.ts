import createTheme from '@mui/material/styles/createTheme';

declare module '@mui/material/styles' {
    interface TypographyVariants {
        label: React.CSSProperties;
        metric: React.CSSProperties;
    }
    interface TypographyVariantsOptions {
        label?: React.CSSProperties;
        metric?: React.CSSProperties;
    }
    interface Palette {
        brand: {
            optumOrange: string;
            enterpriseDarkBlue: string;
            hyperlink: string;
            warmWhite: string;
            skyBlue: string;
            skyBlueLighter: string;
            white: string;
            haze: string;
            enterpriseDarkGray: string;
            successLight: string;
            success: string;
            warningLight: string;
            warning: string;
            dangerLight: string;
            danger: string;
            dangerPressed: string;
            informationLight: string;
            information: string;
            blueShadow: string;
            blueNight: string;
            slate: string;
            ash: string;
            shark: string;
            smoke: string;
            chartSeries1: string;
            chartSeries2: string;
        };
    }
    interface PaletteOptions {
        brand?: {
            optumOrange?: string;
            enterpriseDarkBlue?: string;
            hyperlink?: string;
            warmWhite?: string;
            skyBlue?: string;
            skyBlueLighter?: string;
            white?: string;
            haze?: string;
            enterpriseDarkGray?: string;
            successLight?: string;
            success?: string;
            warningLight?: string;
            warning?: string;
            dangerLight?: string;
            danger?: string;
            dangerPressed?: string;
            informationLight?: string;
            information?: string;
            blueShadow?: string;
            blueNight?: string;
            slate?: string;
            ash?: string;
            shark?: string;
            smoke?: string;
            chartSeries1?: string;
            chartSeries2?: string;
        };
    }
}

declare module '@mui/material/Typography' {
    interface TypographyPropsVariantOverrides {
        label: true;
        metric: true;
    }
}

/** reference/39 radii. Use these in `sx` instead of numbers, which MUI multiplies by shape.borderRadius. */
export const radius = { field: '4px', card: '8px', pill: '22px' } as const;

const OptumTheme = createTheme({
    // D13 (reference/48 S24): MUI's 8 px unit. The reference/39 4 px grid is written as half steps
    // (0.5 = 4 px, 1 = 8, 1.5 = 12, 2 = 16, 3 = 24, 4 = 32, 5 = 40, 6 = 48).
    spacing: 8,
    shape: {
        borderRadius: 8,
    },
    palette: {
        primary: { main: '#002677', dark: '#00184D', light: '#0C55B8', contrastText: '#FFFFFF' },
        info: { main: '#224AA0' },
        success: { main: '#007000' },
        warning: { main: '#F5B700', contrastText: '#323334' },
        error: { main: '#C40000' },
        text: { primary: '#323334', secondary: '#4B4D4F' },
        brand: {
            optumOrange: '#FF612B',
            enterpriseDarkBlue: '#002677',
            hyperlink: '#0C55B8',
            warmWhite: '#FAF8F2',
            skyBlue: '#D9F6FA',
            white: '#FFFFFF',
            haze: '#FAFAFA',
            enterpriseDarkGray: '#4B4D4F',
            successLight: '#EFF6EF',
            success: '#007000',
            warningLight: '#FEF9EA',
            warning: '#F5B700',
            dangerLight: '#FCF0F0',
            danger: '#C40000',
            dangerPressed: '#F6D7D7',
            informationLight: '#EEF4FF',
            information: '#224AA0',
            blueShadow: '#001d5b',
            blueNight: '#00184d',
            slate: '#929496',
            ash: '#f3f3f3',
            skyBlueLighter: '#ECFAFC',
            shark: '#323334',
            smoke: '#E5E5E6',
            // Two-series chart palette (blue family), validated with the dataviz palette checks 2026-10-02.
            chartSeries1: '#0C55B8',
            chartSeries2: '#5FA8E8'
        }
    },
    typography: {
        fontFamily: "'Enterprise Sans', Arial, sans-serif",
        caption: { fontSize: '12px', lineHeight: '16px' },
        button: { fontSize: '16px', fontWeight: 700, lineHeight: '20px', textTransform: 'none' },
        h1: { fontSize: '32px', fontWeight: 700, color: '#002677', lineHeight: '40px' },
        h2: { fontSize: '24px', fontWeight: 700, color: '#002677', lineHeight: '32px' },
        h3: { fontSize: '20px', fontWeight: 700, color: '#002677', lineHeight: '28px' },
        h4: { fontSize: '18px', fontWeight: 700, color: '#002677', lineHeight: '24px' },
        h5: { fontSize: '18px', fontWeight: 700, color: '#002677', lineHeight: '24px' },
        h6: { fontSize: '16px', fontWeight: 700, color: '#002677', lineHeight: '24px' },
        subtitle1: { fontSize: '16px', fontWeight: 700, lineHeight: '24px' },
        body1: { fontSize: '16px', lineHeight: '24px' },
        body2: { fontSize: '14px', lineHeight: '20px' },
        subtitle2: { fontSize: '14px', fontWeight: 700, lineHeight: '20px' },
        label: { fontSize: '14px', fontWeight: 700, lineHeight: '20px' },
        metric: { fontSize: '28px', fontWeight: 700, lineHeight: '32px', fontVariantNumeric: 'tabular-nums' }
    },
    components: {
        MuiLink: { styleOverrides: { root: { color: '#0C55B8', '&:visited': { color: '#0C55B8' } } } },
        MuiFormLabel: { styleOverrides: { root: ({ theme }) => ({ ...theme.typography.label, color: '#323334', '&.Mui-focused': { color: '#323334' } }) } },
        MuiRadio: { styleOverrides: { root: { color: '#002677', '&.Mui-checked': { color: '#002677' } } } },
        MuiCheckbox: { styleOverrides: { root: { color: '#002677', '&.Mui-checked': { color: '#002677' } } } },
        MuiSwitch: { styleOverrides: { switchBase: { '&.Mui-checked': { color: '#002677' }, '&.Mui-checked + .MuiSwitch-track': { backgroundColor: '#002677' } } } },
        MuiLinearProgress: { styleOverrides: { root: { backgroundColor: '#EEF4FF' }, bar: { backgroundColor: '#002677' } } },
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: {
                    minHeight: 44,
                    borderRadius: 22,
                    '&.Mui-focusVisible': {
                        outline: '2px solid',
                        outlineColor: 'brand.hyperlink',
                        outlineOffset: 2,
                    },
                },
            },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: { minHeight: 44 },
            },
        },
        MuiTypography: {
            styleOverrides: {
                h1: { '@media (max-width:899.95px)': { fontSize: '28px', lineHeight: '36px' } },
                h2: { '@media (max-width:899.95px)': { fontSize: '22px', lineHeight: '28px' } },
                h3: { '@media (max-width:899.95px)': { fontSize: '18px', lineHeight: '24px' } },
            },
        },
    },
});

export default OptumTheme;
