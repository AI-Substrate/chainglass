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
    alias: {
      '@chainglass/shared': resolve(rootDir, 'packages/shared/src'),
      '@chainglass/cli': resolve(rootDir, 'packages/cli/src'),
      '@chainglass/mcp-server': resolve(rootDir, 'packages/mcp-server/src'),
      '@chainglass/web': resolve(rootDir, 'apps/web/src'),
      '@test/': `${testDir}/`,
    },
  },
});
