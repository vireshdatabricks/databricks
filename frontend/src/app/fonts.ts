import localFont from 'next/font/local';

// next/font emits these under Next's own asset pipeline, so basePath is applied automatically.
export const enterpriseSans = localFont({
    src: [
        { path: '../../public/fonts/EnterpriseSans/EnterpriseSans-Regular.woff2', weight: '400', style: 'normal' },
        { path: '../../public/fonts/EnterpriseSans/EnterpriseSans-Bold.woff2', weight: '700', style: 'normal' },
    ],
    variable: '--font-enterprise-sans',
    display: 'swap',
});
