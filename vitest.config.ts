import { basename, resolve } from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { PROCESS_TEST_TIMEOUT_MS, UNIT_TEST_TIMEOUT_MS } from './test/load-bounds';

const rootDir = import.meta.dirname;
const testDir = resolve(rootDir, 'test');

// Test files that spawn real processes (git fixtures, CLIs, shells). They get the
// process-latency bound from test/load-bounds.ts; everything else gets the unit bound.
// A new test file that spawns processes belongs here.
const PROCESS_TEST_FILES = [
  'test/integration/**/*.test.{ts,tsx}',
  'test/contracts/process-manager.contract.test.ts',
  'test/unit/cli/cg-binary-linkage.test.ts',
  'test/unit/cli/web-command.test.ts',
  'test/unit/event-popper/infrastructure.test.ts',
  'test/unit/mcp-server/stdio-transport.test.ts',
  'test/unit/shared/unix-process-manager.test.ts',
  'test/unit/web/features/041-file-browser/file-list.test.ts',
  'test/unit/web/features/071-pr-view/{content-hash,get-all-diffs,git-branch-service,per-file-diff-stats,pr-view-entrypoints}.test.ts',
  'test/unit/web/features/_platform/git/git-cli.test.ts',
  'test/unit/web/lib/server/git-diff-action.test.ts',
  'test/unit/web/lib/tls-front.test.ts',
];

export default defineConfig({
  plugins: [
    tsconfigPaths({
      root: rootDir,
      // Build output contains relocated tsconfigs, not source projects.
      skip: (dir) => ['.next', 'dist'].includes(basename(dir)),
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
      {
        find: '@chainglass/positional-graph',
        replacement: resolve(rootDir, 'packages/positional-graph/src'),
      },
    ],
  },
  test: {
    // Note: test.root removed to fix coverage path resolution
    // Tests are found via include patterns instead
    globals: true,
    environment: 'node',
    // Exclude standalone E2E scripts (run via npx tsx, not vitest). Each project sets its own
    // `include`: with `extends: true` vitest concatenates arrays, so a root include would put
    // every file in both projects.
    exclude: ['test/e2e/**', '**/node_modules/**'],
    // Use jsdom for React component tests
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom'],
      ['**/web/**/*.test.ts', 'jsdom'],
    ],
    setupFiles: [resolve(testDir, 'setup.ts'), resolve(testDir, 'setup-browser-mocks.ts')],
    // Sequential execution to prevent MCP tests from spawning 20+ parallel processes
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // Both .ts and .tsx test files (relative to project root), minus the process files.
          include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
          exclude: PROCESS_TEST_FILES,
          testTimeout: UNIT_TEST_TIMEOUT_MS,
          hookTimeout: UNIT_TEST_TIMEOUT_MS,
        },
      },
      {
        extends: true,
        test: {
          name: 'process',
          include: PROCESS_TEST_FILES,
          testTimeout: PROCESS_TEST_TIMEOUT_MS,
          hookTimeout: PROCESS_TEST_TIMEOUT_MS,
        },
      },
    ],
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
