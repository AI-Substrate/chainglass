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
  experimental: {
    // Raise server action body size limit for file uploads (default 1MB)
    serverActions: {
      bodySizeLimit: '250mb',
    },
  },
  // Enable Turbopack (default in Next.js 16) - empty config acknowledges migration
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
    'node-pty',
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
