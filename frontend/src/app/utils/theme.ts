import createTheme from '@mui/material/styles/createTheme';

declare module '@mui/material/styles' {
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
            informationLight: string;
            information: string;
            blueShadow: string;
            blueNight: string;
            slate: string;
            ash: string;
            shark: string;
            smoke: string;
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
            informationLight?: string;
            information?: string;
            blueShadow?: string;
            blueNight?: string;
            slate?: string;
            ash?: string;
            shark?: string;
            smoke?: string;
        };
    }
}

const OptumTheme = createTheme({
    spacing: 4,
    shape: {
        borderRadius: 8,
    },
    palette: {
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
            informationLight: '#EEF4FF',
            information: '#224AA0',
            blueShadow: '#001d5b',
            blueNight: '#00184d',
            slate: '#929496',
            ash: '#f3f3f3',
            skyBlueLighter: '#ECFAFC',
            shark: '#323334',
            smoke: '#E5E5E6'
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
        subtitle2: { fontSize: '14px', fontWeight: 700, lineHeight: '20px' }
    },
    components: {
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: {
                    minHeight: 44,
                    borderRadius: 22,
                    '&.Mui-focusVisible': {
                        outline: '2px solid #0C55B8',
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
    },
});

export default OptumTheme;
