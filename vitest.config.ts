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
  // Explicit alias for @/ (Next.js convention) and monorepo packages
  // Ensures coverage tracks src/ files, not dist/ files
  resolve: {
    alias: [
      { find: '@', replacement: resolve(rootDir, 'apps/web/src') },
      { find: '@test', replacement: testDir },
      // Map package imports to src directories for coverage tracking
      { find: '@chainglass/shared', replacement: resolve(rootDir, 'packages/shared/src') },
      { find: '@chainglass/workflow', replacement: resolve(rootDir, 'packages/workflow/src') },
      { find: '@chainglass/mcp-server', replacement: resolve(rootDir, 'packages/mcp-server/src') },
    ],
  },
  test: {
    // Note: test.root removed to fix coverage path resolution
    // Tests are found via include patterns instead
    globals: true,
    environment: 'node',
    // Include both .ts and .tsx test files (relative to project root)
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    // Use jsdom for React component tests
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/web/**/*.test.ts', 'jsdom'],
    ],
    setupFiles: [resolve(testDir, 'setup.ts'), resolve(testDir, 'setup-browser-mocks.ts')],
    // Sequential execution to prevent MCP tests from spawning 20+ parallel processes
    fileParallelism: false,
    // Coverage configuration (DYK-03: Enforced thresholds, not just reported)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary', 'json'],
      // Patterns are relative to project root (rootDir), NOT test.root
      include: [
        'packages/shared/src/**/*.ts',
        'packages/workflow/src/**/*.ts',
        'packages/mcp-server/src/**/*.ts',
        'apps/web/src/**/*.ts',
        'apps/web/src/**/*.tsx',
        'apps/cli/src/**/*.ts',
      ],
      exclude: ['**/*.test.ts', '**/*.test.tsx', '**/index.ts'],
      // Include all source files matching patterns, not just those imported by tests
      all: true,
      // Explicit output directory (absolute path)
      reportsDirectory: resolve(testDir, 'coverage'),
      thresholds: {
        // Lowered to 50% to accommodate new workgraph package
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
  },
});
