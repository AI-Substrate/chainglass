/**
 * Stub Handlers Tests
 *
 * Tests for the symbol search stub BarHandler.
 * Per Plan 047 Phase 3, FT-009.
 */

import { describe, expect, it } from 'vitest';

import { createSymbolSearchStub } from '../../../../../apps/web/src/features/_platform/panel-layout/stub-handlers';
import type { BarContext } from '../../../../../apps/web/src/features/_platform/panel-layout/types';

function makeContext(overrides: Partial<BarContext> = {}): BarContext {
  return {
    slug: 'test',
    worktreePath: '/tmp/test',
    fileExists: async () => false,
    pathExists: async () => false,
    navigateToFile: () => {},
    navigateToDirectory: () => {},
    showError: () => {},
    ...overrides,
  };
}

describe('createSymbolSearchStub', () => {
  it('returns true for # prefix input', async () => {
    const handler = createSymbolSearchStub();
    const result = await handler('#MyClass', makeContext());
    expect(result).toBe(true);
  });

  it('returns false for non-# input', async () => {
    const handler = createSymbolSearchStub();
    const result = await handler('src/index.ts', makeContext());
    expect(result).toBe(false);
  });
});
