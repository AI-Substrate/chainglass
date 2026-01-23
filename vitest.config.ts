import { resolve } from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const rootDir = import.meta.dirname;
const testDir = resolve(rootDir, 'test');

export default defineConfig({
  plugins: [
    tsconfigPaths({
      root: rootDir,
    }),
  ],
  // Explicit alias fallback for @/ (Next.js convention)
  resolve: {
    alias: [
      { find: '@', replacement: resolve(rootDir, 'apps/web/src') },
      { find: '@test', replacement: testDir },
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
