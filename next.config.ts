import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV !== 'production';

// Security headers (AC-084). Charts and WalletConnect Verify are the only third-party frames (LAB §3.4); nobody may frame Lockabox itself.
// Scripts stay 'self' + inline (Next hydration); a nonce-based CSP would force every page dynamic, revisit before LIVE.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",          // the user's wallet talks to Solana RPC endpoints we don't control
  // WalletConnect Verify: a hidden frame that proves to the wallet which site asked to connect (else wallets see UNKNOWN).
  'frame-src https://dexscreener.com https://www.geckoterminal.com https://verify.walletconnect.org https://verify.walletconnect.com',
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: 'dd.dexscreener.com' }, { protocol: 'https', hostname: 'cdn.dexscreener.com' }] },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'X-Frame-Options', value: 'DENY' },
      ],
    }];
  },
};

export default nextConfig;
