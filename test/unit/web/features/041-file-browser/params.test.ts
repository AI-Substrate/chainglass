/**
 * Tests for fileBrowserParams and fileBrowserPageParamsCache.
 *
 * Purpose: Verify file browser URL param parsing with type-safe defaults.
 * Quality Contribution: Ensures bookmarked URLs restore exact file browser
 *   state — prevents broken deep links and mode confusion.
 * Acceptance Criteria: AC-16, AC-17
 *
 * Domain: Plan-scoped (041-file-browser)
 * Plan: 041-file-browser Phase 2 (T005)
 */

import { fileBrowserPageParamsCache } from '@/features/041-file-browser/params';
import { describe, expect, it } from 'vitest';

describe('fileBrowserPageParamsCache', () => {
  it('provides correct defaults for all params', () => {
    const result = fileBrowserPageParamsCache.parse({});
    expect(result.worktree).toBe('');
    expect(result.dir).toBe('');
    expect(result.file).toBe('');
    expect(result.mode).toBe('preview');
    expect(result.changed).toBe(false);
  });

  it('parses all params when populated', () => {
    const result = fileBrowserPageParamsCache.parse({
      worktree: '/home/jak/project',
      dir: 'src/lib',
      file: 'utils.ts',
      mode: 'edit',
      changed: 'true',
    });
    expect(result.worktree).toBe('/home/jak/project');
    expect(result.dir).toBe('src/lib');
    expect(result.file).toBe('utils.ts');
    expect(result.mode).toBe('edit');
    expect(result.changed).toBe(true);
  });

  it('falls back to preview for invalid mode', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'invalid' });
    expect(result.mode).toBe('preview');
  });

  it('parses changed boolean correctly from string', () => {
    expect(fileBrowserPageParamsCache.parse({ changed: 'true' }).changed).toBe(true);
    expect(fileBrowserPageParamsCache.parse({ changed: 'false' }).changed).toBe(false);
  });

  it('handles diff mode', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'diff' });
    expect(result.mode).toBe('diff');
  });
});
