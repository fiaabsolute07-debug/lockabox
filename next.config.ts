import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'dd.dexscreener.com' }, { protocol: 'https', hostname: 'cdn.dexscreener.com' }] },
};

export default nextConfig;
