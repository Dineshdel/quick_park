import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import path from 'node:path';

// One .env at the repo root serves both apps. Next has already loaded (and cached) env files from frontend/
// before this runs, so force a reload from the root, otherwise NEXT_PUBLIC_* values never reach the browser.
loadEnvConfig(path.resolve(__dirname, '..'), process.env.NODE_ENV !== 'production', console, true);

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The pnpm monorepo root (stops Next guessing it from unrelated lockfiles higher up the disk).
  outputFileTracingRoot: path.resolve(__dirname, '..'),
  // Lets a production build run next to `next dev` without clobbering its .next folder (NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Lint runs as its own Turbo task (root eslint.config.mjs).
  eslint: { ignoreDuringBuilds: true },
  transpilePackages: ['@qp/types', '@qp/validation'],
  // The browser talks to the API through this same origin, so the refresh cookie is first-party
  // and no CORS is involved. (WebSockets connect to the API directly.)
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default nextConfig;
