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
  // `just prod-serve` serves a copy of the build from `.next-prod-<port>` (CHAINGLASS_DIST_DIR),
  // so a `next build` rewriting `.next` (just fft, just build) can't pull chunks out from under a
  // running prod server. Builds always write `.next`; only `next start` reads the override.
  distDir: process.env.CHAINGLASS_DIST_DIR || '.next',
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
    },
    // Raise proxy body buffering limit to match (default 10MB)
    proxyClientMaxBodySize: '250mb',
  },
  // Enable Turbopack (default in Next.js 16)
  turbopack: {
    resolveAlias: {
      // patches/next-auth*.patch rewrites next-auth's `next/navigation` import to
      // `next/navigation.js` so Node ESM (vitest) can load it. Now that next-auth is bundled
      // (see serverExternalPackages), the `.js` path would skip Next's per-layer alias and pull
      // client router contexts into route handlers, failing the build. Point it back.
      'next/navigation.js': 'next/navigation',
    },
  },
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
    // Not 'next-auth': as an external, `next-auth/react` loads node_modules React during SSR
    // instead of Next's copy, so SessionProvider's hooks are null and the dashboard 500s.
    // Bundled, SessionProvider server-renders and so does every page under it.
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
