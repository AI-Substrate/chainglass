/**
 * File Path BarHandler Tests
 *
 * Purpose: Verify the ExplorerPanel handler that normalizes typed paths,
 * strips worktree prefix, checks existence, and navigates.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import { createFilePathHandler } from '@/features/041-file-browser/services/file-path-handler';
import type { BarContext } from '@/features/_platform/panel-layout/types';
import { describe, expect, it, vi } from 'vitest';

function makeContext(overrides?: Partial<BarContext>): BarContext {
  return {
    slug: 'test-ws',
    worktreePath: '/home/user/project',
    fileExists: vi.fn().mockResolvedValue(true),
    navigateToFile: vi.fn(),
    showError: vi.fn(),
    ...overrides,
  };
}

describe('createFilePathHandler', () => {
  it('navigates to a simple relative path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    const result = await handler('src/utils.ts', ctx);

    expect(ctx.fileExists).toHaveBeenCalledWith('src/utils.ts');
    expect(ctx.navigateToFile).toHaveBeenCalledWith('src/utils.ts');
    expect(result).toBe(true);
  });

  it('strips leading ./ from path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    await handler('./src/utils.ts', ctx);

    expect(ctx.fileExists).toHaveBeenCalledWith('src/utils.ts');
  });

  it('strips leading / from path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    await handler('/src/utils.ts', ctx);

    expect(ctx.fileExists).toHaveBeenCalledWith('src/utils.ts');
  });

  it('strips worktree prefix from absolute path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    await handler('/home/user/project/src/utils.ts', ctx);

    expect(ctx.fileExists).toHaveBeenCalledWith('src/utils.ts');
  });

  it('returns false and shows error when file not found', async () => {
    const ctx = makeContext({ fileExists: vi.fn().mockResolvedValue(false) });
    const handler = createFilePathHandler();
    const result = await handler('nonexistent.ts', ctx);

    expect(result).toBe(false);
    expect(ctx.navigateToFile).not.toHaveBeenCalled();
  });

  it('returns false for empty string', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    const result = await handler('', ctx);

    expect(result).toBe(false);
    expect(ctx.fileExists).not.toHaveBeenCalled();
  });

  it('returns false for whitespace-only string', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    const result = await handler('   ', ctx);

    expect(result).toBe(false);
    expect(ctx.fileExists).not.toHaveBeenCalled();
  });
});
