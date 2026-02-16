/**
 * Vitest config for E2E tests.
 *
 * Separate from main config because test/e2e/ is excluded from the main test suite.
 * These tests spawn real agent CLI processes and take 60-180 seconds each.
 *
 * Usage: just test-e2e
 */
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const rootDir = resolve(__dirname);

export default defineConfig({
  resolve: {
    alias: {
      '@chainglass/shared': resolve(rootDir, 'packages/shared/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['test/e2e/**/*.test.ts'],
    fileParallelism: false,
  },
});
