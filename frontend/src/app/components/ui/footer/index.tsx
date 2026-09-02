import React from 'react';
import Link from 'next/link';
import { Box, Divider } from '@mui/material';

import OptumTheme from '../../../utils/theme';

const Footer = () => {
  const { brand } = OptumTheme.palette;
  const footerContent = [
    { text: `© ${new Date().getFullYear()} Optum, Inc. All rights reserved`, link: '#' },
  ];

  return (
    <footer style={{ width: '100%', padding: "16px 0", borderTop: `2px solid ${brand.smoke}`, backgroundColor: brand.haze }}>
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2, gap: '16px', alignItems: 'center' }}>
        {footerContent.map((item, index) => (
          <React.Fragment key={item.text}>
            <Link
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: index === 0 ? 'none' : 'underline', color: index === 0 ? brand.enterpriseDarkGray : brand.hyperlink }}
            >
              {item.text}
            </Link>
            {index !== footerContent.length - 1 && (
              <Divider orientation="vertical" flexItem sx={{ height: 32, mx: 1, borderColor: brand.slate }} />
            )}
          </React.Fragment>
        ))}
      </Box>
    </footer>
  );
};

export default Footer;
