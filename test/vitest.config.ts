import { resolve } from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const testDir = resolve(import.meta.dirname);
const rootDir = resolve(testDir, '..');

export default defineConfig({
  plugins: [
    tsconfigPaths({
      root: rootDir,
    }),
  ],
  // Top-level resolve.alias - required for Vitest to pick up aliases
  resolve: {
    alias: [
      // Regex patterns for wildcard subpath imports
      { find: /^@chainglass\/shared\/(.*)$/, replacement: resolve(rootDir, 'packages/shared/src/$1') },
      { find: /^@chainglass\/cli\/(.*)$/, replacement: resolve(rootDir, 'apps/cli/src/$1') },
      { find: /^@chainglass\/mcp-server\/(.*)$/, replacement: resolve(rootDir, 'packages/mcp-server/src/$1') },
      { find: /^@chainglass\/web\/(.*)$/, replacement: resolve(rootDir, 'apps/web/src/$1') },
      { find: /^@test\/(.*)$/, replacement: resolve(testDir, '$1') },
      { find: /^@\/(.*)$/, replacement: resolve(rootDir, 'apps/web/src/$1') },
      // Exact matches (no subpath)
      { find: '@chainglass/shared', replacement: resolve(rootDir, 'packages/shared/src') },
      { find: '@chainglass/cli', replacement: resolve(rootDir, 'apps/cli/src') },
      { find: '@chainglass/mcp-server', replacement: resolve(rootDir, 'packages/mcp-server/src') },
      { find: '@chainglass/web', replacement: resolve(rootDir, 'apps/web/src') },
      { find: '@test', replacement: testDir },
      { find: '@', replacement: resolve(rootDir, 'apps/web/src') },
    ],
  },
  test: {
    root: testDir,
    globals: true,
    environment: 'node',
    // Include both .ts and .tsx test files
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // Use jsdom for React component tests
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/web/**/*.test.ts', 'jsdom'],
    ],
    setupFiles: [resolve(testDir, 'setup.ts')],
    // Sequential execution to prevent MCP tests from spawning 20+ parallel processes
    fileParallelism: false,
    // Coverage configuration (DYK-03: Enforced thresholds, not just reported)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['apps/web/src/hooks/**/*.ts', 'apps/web/src/hooks/**/*.tsx'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/index.ts'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
