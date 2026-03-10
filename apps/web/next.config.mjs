import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  // Immutable cache headers for generated icon assets (Plan 073)
  async headers() {
    return [
      {
        source: '/icons/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, immutable, max-age=31536000',
          },
        ],
      },
    ];
  },
  experimental: {
    // Raise server action body size limit for file uploads (default 1MB)
    serverActions: {
      bodySizeLimit: '250mb',
    },
    // Raise proxy body buffering limit to match (default 10MB)
    proxyClientMaxBodySize: '250mb',
  },
  // Enable Turbopack (default in Next.js 16)
  turbopack: {},
  // Allow cross-origin requests from local network during development
  allowedDevOrigins: ['192.168.1.*'],
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
