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

  // ─── Plan 083 Phase 5 — ViewerMode rename + legacy URL alias ────────────
  //
  // Context: the ViewerMode union was renamed `edit → source` and gained a new
  // `rich` member. The params literal keeps `'edit'` as a legacy alias so
  // bookmarked URLs (`?mode=edit`) still parse; `browser-client.tsx` then runs a
  // `useEffect` that coerces `params.mode === 'edit'` to `'source'` with
  // `history: 'replace'` BEFORE the scrollToLine auto-switch effect fires
  // (declaration order matters — see browser-client.tsx for the ordering
  // contract). This test locks in the params-layer half of AC-02 / Finding 04;
  // the browser-client effect-order contract is covered by the execution-log
  // grep evidence + TypeScript typecheck (the scrollToLine guard was widened to
  // `!== 'source' && !== 'rich'` in lockstep with the rename).
  //
  // TODO: remove the `'edit'` assertion when the legacy alias is dropped (after
  // 1 release, per TODO comment in file-browser.params.ts).

  it('parses mode="source" (Plan 083 Phase 5)', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'source' });
    expect(result.mode).toBe('source');
  });

  it('parses mode="rich" (Plan 083 Phase 5)', () => {
    const result = fileBrowserPageParamsCache.parse({ mode: 'rich' });
    expect(result.mode).toBe('rich');
  });

  it('accepts mode="edit" as a legacy alias so bookmarked URLs still parse', () => {
    // Bookmarked URLs from before Plan 083 carry `?mode=edit`. The literal
    // MUST keep `'edit'` in its allowed values so the URL parses cleanly —
    // the browser-client useEffect then normalises to `'source'` on load.
    // If this test fails because `'edit'` is no longer accepted, verify that
    // the legacy-coerce effect in browser-client.tsx has also been removed
    // (the two MUST move together per F04 migration plan).
    const result = fileBrowserPageParamsCache.parse({ mode: 'edit' });
    expect(result.mode).toBe('edit');
  });
});
