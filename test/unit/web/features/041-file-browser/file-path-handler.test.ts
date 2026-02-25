/**
 * File Path BarHandler Tests
 *
 * Purpose: Verify the ExplorerPanel handler that normalizes typed paths,
 * strips worktree prefix, checks existence, and navigates.
 *
 * Phase 3: Wire Into BrowserClient — Plan 043
 */

import {
  createFilePathHandler,
  parseLineSuffix,
} from '@/features/041-file-browser/services/file-path-handler';
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

  // Phase 6: Go-to-line handler tests (FT-008)

  it('calls onLineDetected with line number from :42 syntax', async () => {
    const onLineDetected = vi.fn();
    // pathExists returns false for full string, 'file' for cleaned path
    const ctx = makeContext({
      pathExists: vi.fn().mockImplementation((path: string) => {
        if (path === 'src/index.ts') return Promise.resolve('file');
        return Promise.resolve(false);
      }),
    });
    const handler = createFilePathHandler(onLineDetected);
    const result = await handler('src/index.ts:42', ctx);

    expect(result).toBe(true);
    expect(ctx.navigateToFile).toHaveBeenCalledWith('src/index.ts');
    expect(onLineDetected).toHaveBeenCalledWith(42);
  });

  it('calls onLineDetected with line number from #L42 syntax', async () => {
    const onLineDetected = vi.fn();
    const ctx = makeContext({
      pathExists: vi.fn().mockImplementation((path: string) => {
        if (path === 'src/index.ts') return Promise.resolve('file');
        return Promise.resolve(false);
      }),
    });
    const handler = createFilePathHandler(onLineDetected);
    const result = await handler('src/index.ts#L42', ctx);

    expect(result).toBe(true);
    expect(ctx.navigateToFile).toHaveBeenCalledWith('src/index.ts');
    expect(onLineDetected).toHaveBeenCalledWith(42);
  });

  it('uses path-first resolution — full path with colon navigates without line parse', async () => {
    const onLineDetected = vi.fn();
    // Full string including ":42" exists as a file
    const ctx = makeContext({
      pathExists: vi.fn().mockResolvedValue('file'),
    });
    const handler = createFilePathHandler(onLineDetected);
    const result = await handler('src/index.ts:42', ctx);

    expect(result).toBe(true);
    expect(ctx.navigateToFile).toHaveBeenCalledWith('src/index.ts:42');
    expect(onLineDetected).not.toHaveBeenCalled();
  });

  it('returns false for non-numeric suffix path:abc', async () => {
    const ctx = makeContext({ pathExists: vi.fn().mockResolvedValue(false) });
    const handler = createFilePathHandler();
    const result = await handler('src/index.ts:abc', ctx);

    expect(result).toBe(false);
  });
});

// Phase 6: parseLineSuffix tests (FT-003)

describe('parseLineSuffix', () => {
  it('parses :42 suffix', () => {
    expect(parseLineSuffix('src/index.ts:42')).toEqual({
      cleanPath: 'src/index.ts',
      line: 42,
    });
  });

  it('parses #L42 suffix', () => {
    expect(parseLineSuffix('src/index.ts#L42')).toEqual({
      cleanPath: 'src/index.ts',
      line: 42,
    });
  });

  it('returns null for no suffix', () => {
    expect(parseLineSuffix('src/index.ts')).toBeNull();
  });

  it('returns null for non-numeric colon suffix', () => {
    expect(parseLineSuffix('src/index.ts:abc')).toBeNull();
  });

  it('parses :0 suffix (line 0 — handled by caller)', () => {
    const result = parseLineSuffix('src/index.ts:0');
    expect(result).toEqual({ cleanPath: 'src/index.ts', line: 0 });
  });

  it('parses timestamp with numeric suffix (caller uses path-first resolution)', () => {
    // "2024-01-15T10:30:00.log" — :00 is numeric, but path-first resolves this
    const result = parseLineSuffix('2024-01-15T10:30:00.log');
    // parseLineSuffix only sees the last :NN — "00.log" is NOT purely numeric
    expect(result).toBeNull();
  });

  it('prefers #L over : syntax', () => {
    expect(parseLineSuffix('file:1#L99')).toEqual({
      cleanPath: 'file:1',
      line: 99,
    });
  });
});
