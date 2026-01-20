import { resolve } from 'node:path';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

const testDir = resolve(import.meta.dirname);
const rootDir = resolve(testDir, '..');

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    root: testDir,
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    setupFiles: [resolve(testDir, 'setup.ts')],
    // Sequential execution to prevent MCP tests from spawning 20+ parallel processes
    // Each MCP test spawns a Node.js process via StdioClientTransport
    // See: docs/plans/001-project-setup/tasks/phase-5-mcp-server-package/001-subtask-migrate-mcp-tests-to-sdk-client.md
    fileParallelism: false,
    alias: {
      '@chainglass/shared': resolve(rootDir, 'packages/shared/src'),
      '@chainglass/cli': resolve(rootDir, 'apps/cli/src'),
      '@chainglass/mcp-server': resolve(rootDir, 'packages/mcp-server/src'),
      '@chainglass/web': resolve(rootDir, 'apps/web/src'),
      '@test/': `${testDir}/`,
    },
  },
});
