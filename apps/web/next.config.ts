import path from 'node:path';
import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@kyon/core'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;

// Exposes D1, R2, KV and Durable Object bindings to `next dev` through wrangler's local simulator.
// Same state directory as `scripts/dev.ts`, so every Worker shares one local database.
initOpenNextCloudflareForDev({
  persist: { path: path.resolve(process.cwd(), '..', '..', '.wrangler', 'state', 'v3') },
});
