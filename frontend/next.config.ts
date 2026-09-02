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
      }
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
