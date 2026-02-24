/**
 * Tests for fileBrowserParams and fileBrowserPageParamsCache.
 *
 * Purpose: Verify file browser URL param parsing with type-safe defaults.
 * Plan 043 Phase 3: Replaced `changed` boolean with `panel` string literal.
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
    expect(result.panel).toBe('tree');
  });

  it('parses all params when populated', () => {
    const result = fileBrowserPageParamsCache.parse({
      worktree: '/home/jak/project',
      dir: 'src/lib',
      file: 'utils.ts',
      mode: 'edit',
      panel: 'changes',
    });
    expect(result.worktree).toBe('/home/jak/project');
    expect(result.dir).toBe('src/lib');
    expect(result.file).toBe('utils.ts');
    expect(result.mode).toBe('edit');
    expect(result.panel).toBe('changes');
  });

  it('falls back to preview for invalid mode', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'invalid' });
    expect(result.mode).toBe('preview');
  });

  it('falls back to tree for invalid panel', () => {
    const result = fileBrowserPageParamsCache.parse({ panel: 'invalid' });
    expect(result.panel).toBe('tree');
  });

  it('handles diff mode', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'diff' });
    expect(result.mode).toBe('diff');
  });
});
