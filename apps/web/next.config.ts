import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

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
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  // Point to monorepo root for proper dependency tracing with pnpm
  outputFileTracingRoot: resolve(__dirname, '..', '..'),
  // Shiki uses Node.js-specific APIs and fs module - exclude from standard bundling
  serverExternalPackages: ['shiki', 'vscode-oniguruma', '@shikijs/core', '@shikijs/engine-oniguruma'],
  // Webpack config to handle Shiki's node: protocol imports on client side
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Prevent webpack from trying to bundle shiki on the client
      config.externals = [
        ...(config.externals || []),
        'shiki',
        '@shikijs/core',
        // Handle node: protocol imports - treat as external CommonJS
        ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
          if (request && request.startsWith('node:')) {
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
