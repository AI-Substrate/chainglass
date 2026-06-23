import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Hosts allowed to invoke Server Actions / send dev requests when the app is
// reached through a proxy whose Host header differs from localhost (VS Code dev
// tunnels, Codespaces, LAN). Without these, Next.js rejects POSTs with
// "Invalid Server Actions request".
//
// Matching quirks (see next/dist/server/app-render/csrf-protection.js):
//  - The value matched is `new URL(originHeader).host`, which INCLUDES the port
//    (e.g. "abc.aue.devtunnels.ms:3000"). Next's wildcard matcher splits on "."
//    and is port-blind, so the port rides along in the LAST label — a pattern
//    must therefore embed the port too ("**.devtunnels.ms:3000"), and a port-
//    less pattern only matches when the tunnel serves on the default 443.
//  - A single "*" matches exactly ONE label; dev-tunnel hosts have a region
//    label (e.g. "<id>.aue.devtunnels.ms"), so we need "**" (recursive) to span
//    a variable number of subdomain labels.
//
// EXTRA_ALLOWED_ORIGINS (comma-separated) lets you allow a one-off host without
// a code edit, e.g. EXTRA_ALLOWED_ORIGINS="myhost:8080".
const DEV_PORT = process.env.PORT ?? '3000';
const extraAllowedOrigins = (process.env.EXTRA_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const crossOriginAllowList = [
  '192.168.1.*',
  // VS Code dev tunnels (default 443 and the dev-server port)
  '**.devtunnels.ms',
  `**.devtunnels.ms:${DEV_PORT}`,
  '*.devtunnels.ms',
  `*.devtunnels.ms:${DEV_PORT}`,
  // GitHub Codespaces
  '**.app.github.dev',
  `**.app.github.dev:${DEV_PORT}`,
  '*.app.github.dev',
  ...extraAllowedOrigins,
];

/**
 * Next.js Configuration
 *
 * output: 'standalone' creates a minimal production build that can be
 * deployed without node_modules. The CLI bundles this standalone output
 * for portable execution via npx.
 *
 * Important: Standalone doesn't include public/ or .next/static/ folders.
 * These must be copied separately during CLI build (see packages/cli/package.json).
 *
 * outputFileTracingRoot: Points to the monorepo root to ensure all dependencies
 * are properly traced and included in the standalone output.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'standalone',
  // TypeScript type-checking is handled by `just fft` / `pnpm exec tsc --noEmit`.
  // Next.js build worker has limited heap and OOMs on large codebases.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Cache headers for generated icon assets (Plan 073).
  // Uses max-age with must-revalidate (not immutable) because icon URLs
  // are not content-addressed — upgrading the icon theme reuses the same paths.
  async headers() {
    return [
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, must-revalidate',
          },
        ],
      },
    ];
  },
  experimental: {
    // Raise server action body size limit for file uploads (default 1MB)
    serverActions: {
      bodySizeLimit: '250mb',
      // Allow Server Actions when reached through a dev tunnel / proxy whose
      // Host differs from localhost (otherwise "Invalid Server Actions request").
      allowedOrigins: crossOriginAllowList,
    },
    // Raise proxy body buffering limit to match (default 10MB)
    proxyClientMaxBodySize: '250mb',
  },
  // Enable Turbopack (default in Next.js 16)
  turbopack: {},
  // Allow cross-origin requests from local network + dev tunnels during development
  allowedDevOrigins: crossOriginAllowList,
  // Point to monorepo root for proper dependency tracing with pnpm
  outputFileTracingRoot: resolve(__dirname, '..', '..'),
  // Shiki uses Node.js-specific APIs and fs module - exclude from standard bundling
  serverExternalPackages: [
    'shiki',
    'vscode-oniguruma',
    '@shikijs/core',
    '@shikijs/engine-oniguruma',
    '@github/copilot-sdk',
    '@github/copilot',
    'node-pty',
    'next-auth',
    '@auth/core',
    'yaml',
  ],
  // Webpack config to handle Shiki's node: protocol imports on client side
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent webpack from trying to bundle shiki on the client
      config.externals = [
        ...(config.externals || []),
        'shiki',
        '@shikijs/core',
        // Handle node: protocol imports - treat as external CommonJS
        ({ request }, callback) => {
          if (request?.startsWith('node:')) {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
      // Fallback for Node.js built-in modules - tell webpack not to bundle them
      config.resolve = {
        ...config.resolve,
        fallback: {
          ...config.resolve?.fallback,
          fs: false,
          path: false,
          net: false,
          tls: false,
        },
      };
    }
    return config;
  },
};

export default nextConfig;
