import type { NextConfig } from 'next';
import pkg from './package.json' with { type: 'json' };

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Content Security Policy. PGlite compiles PostgreSQL to WebAssembly, which
 * needs 'wasm-unsafe-eval' (it allows WebAssembly compilation, not JS eval).
 * 'unsafe-inline' for scripts is required by Next.js's inline bootstrap
 * without a nonce setup; the page renders no user-controlled HTML.
 * The browser only talks to this origin: AI calls go through /api/analyze.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // COOP + COEP make the page cross-origin isolated, which lifts the browser's
  // 0.1 ms timer coarsening: PGlite's EXPLAIN ANALYZE timings come from that clock.
  // Safe here because every resource is same-origin.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
];

const nextConfig: NextConfig = {
  /**
   * Versions static asset URLs with ?dpl=<version> where the host supports it
   * (self-hosting / `next start`). On Vercel the asset URLs are not versioned
   * this way, so it does NOT protect returning visitors there: the worker
   * recovery in src/lib/workerLoader.ts does.
   */
  deploymentId: `planproof-${pkg.version.replace(/[^A-Za-z0-9_-]/g, '_')}`,
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
