/**
 * File Path BarHandler Tests
 *
 * Purpose: Verify the ExplorerPanel handler that normalizes typed paths,
 * strips worktree prefix, checks existence, and navigates.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import { createFilePathHandler } from '@/features/041-file-browser/services/file-path-handler';
import type { BarContext } from '@/features/_platform/panel-layout';
import { describe, expect, it, vi } from 'vitest';

function makeContext(overrides?: Partial<BarContext>): BarContext {
  return {
    slug: 'test-ws',
    worktreePath: '/home/user/project',
    fileExists: vi.fn().mockResolvedValue(true),
    pathExists: vi.fn().mockResolvedValue('file'),
    navigateToFile: vi.fn(),
    navigateToDirectory: vi.fn(),
    showError: vi.fn(),
    ...overrides,
  };
}

describe('createFilePathHandler', () => {
  it('navigates to a file path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    const result = await handler('src/utils.ts', ctx);

    expect(ctx.pathExists).toHaveBeenCalledWith('src/utils.ts');
    expect(ctx.navigateToFile).toHaveBeenCalledWith('src/utils.ts');
    expect(result).toBe(true);
  });

  it('navigates to a directory path', async () => {
    const ctx = makeContext({ pathExists: vi.fn().mockResolvedValue('directory') });
    const handler = createFilePathHandler();
    const result = await handler('src/lib', ctx);

    expect(ctx.pathExists).toHaveBeenCalledWith('src/lib');
    expect(ctx.navigateToDirectory).toHaveBeenCalledWith('src/lib');
    expect(ctx.navigateToFile).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('strips trailing / from directory paths', async () => {
    const ctx = makeContext({ pathExists: vi.fn().mockResolvedValue('directory') });
    const handler = createFilePathHandler();
    await handler('src/lib/', ctx);

    expect(ctx.pathExists).toHaveBeenCalledWith('src/lib');
  });

  it('strips leading ./ from path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    await handler('./src/utils.ts', ctx);

    expect(ctx.pathExists).toHaveBeenCalledWith('src/utils.ts');
  });

  it('strips leading / from path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    await handler('/src/utils.ts', ctx);

    expect(ctx.pathExists).toHaveBeenCalledWith('src/utils.ts');
  });

  it('strips worktree prefix from absolute path', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    await handler('/home/user/project/src/utils.ts', ctx);

    expect(ctx.pathExists).toHaveBeenCalledWith('src/utils.ts');
  });

  it('does not strip worktree prefix from partial match', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    // Path shares prefix but is not a child of worktreePath
    await handler('/home/user/project-other/src/utils.ts', ctx);

    // Should NOT strip — the path starts with worktreePath but not at segment boundary
    expect(ctx.pathExists).toHaveBeenCalledWith('home/user/project-other/src/utils.ts');
  });

  it('returns false when path not found', async () => {
    const ctx = makeContext({ pathExists: vi.fn().mockResolvedValue(false) });
    const handler = createFilePathHandler();
    const result = await handler('nonexistent.ts', ctx);

    expect(result).toBe(false);
    expect(ctx.navigateToFile).not.toHaveBeenCalled();
    expect(ctx.navigateToDirectory).not.toHaveBeenCalled();
  });

  it('returns false for empty string', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    const result = await handler('', ctx);

    expect(result).toBe(false);
    expect(ctx.pathExists).not.toHaveBeenCalled();
  });

  it('returns false for whitespace-only string', async () => {
    const ctx = makeContext();
    const handler = createFilePathHandler();
    const result = await handler('   ', ctx);

    expect(result).toBe(false);
    expect(ctx.fileExists).not.toHaveBeenCalled();
  });
});
