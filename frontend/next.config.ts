import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const serverActionOrigins = (process.env.SERVER_ACTION_ORIGINS ?? 'pbmai-poc-dev.optum.com')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  basePath,
  async redirects() {
    return [
      {
        source: '/',
        destination: `${basePath}/dashboard`,
        permanent: false,
        basePath: false
      },
      // reference/50 §5: retired routes keep their query strings. Temporary during the pilot.
      { source: '/dashboard/overview', destination: '/dashboard', permanent: false },
      { source: '/dashboard/trends', destination: '/dashboard/operations?tab=monthly', permanent: false },
      // reference/45 §3.2: candidate themes live under Recurring issues.
      { source: '/dashboard/themes', destination: '/dashboard/recurring-issues', permanent: false },
      { source: '/dashboard/themes/:themeId', destination: '/dashboard/recurring-issues/:themeId', permanent: false }
    ];
  },
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath
  },
  images: {
    unoptimized: true
  },
  experimental: {
    serverActions: {
      allowedOrigins: serverActionOrigins
    }
  }
};

export default nextConfig;
