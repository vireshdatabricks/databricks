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
        caption: { fontSize: '14px' },
        button: { fontSize: '16px', textTransform: 'none' },
        h1: { fontSize: '36.48px', fontWeight: 700, color: '#002677', lineHeight: '48px' },
        h2: { fontSize: '32.43px', fontWeight: 700, color: '#002677', lineHeight: '40px' },
        h3: { fontSize: '28.83px', fontWeight: 700, color: '#002677', lineHeight: '36px' },
        h4: { fontSize: '24.63px', fontWeight: 700, color: '#002677', lineHeight: '32px' },
        h5: { fontSize: '22.78px', fontWeight: 700, color: '#002677', lineHeight: '28px' },
        h6: { fontSize: '20.25px', fontWeight: 700, color: '#002677', lineHeight: '24px' },
        subtitle1: { fontSize: '18px', lineHeight: '24px' },
        body1: { fontSize: '16px', lineHeight: '20px' },
        body2: { fontSize: '14.22px', lineHeight: '18px' },
        subtitle2: { fontSize: '12.64px', lineHeight: '16px' }
    }
});

export default OptumTheme;
