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

  // ─── Plan 088 Phase 3 — remote-view content-area mode URL contract ───────
  it('parses view="remote" and the rv session param, preserving recent-feed (Plan 088 Phase 3)', () => {
    /*
    Test Doc:
    - Why: T001 extended the `view` literal with `'remote'` and composed remote-view's `rv` into this cache; without a guard a later edit could silently drop `'remote'` or stop parsing `rv`, breaking the deep-link contract — caught only by typecheck today (companion F001).
    - Contract: parse({view:'remote', rv:'ses_abc123'}) → view==='remote' & rv==='ses_abc123'; legacy 'recent-feed' still parses; unknown view → null; rv parses standalone (the inert-without-view rule is render-time, not a parse coupling); rv absent → null.
    - Usage Notes: rv is `parseAsString` (nullable) from remoteViewParams, composed business→business via the remote-view contract; this is the params-layer half of AC-8 that T007's smoke exercises end-to-end.
    - Quality Contribution: locks the cross-domain URL contract the deep-link + browser smoke depend on, so a regression fails here in milliseconds instead of in the browser.
    - Worked Example: ?view=remote&rv=ses_abc123 → { view:'remote', rv:'ses_abc123' }.
    */
    const remote = fileBrowserPageParamsCache.parse({ view: 'remote', rv: 'ses_abc123' });
    expect(remote.view).toBe('remote');
    expect(remote.rv).toBe('ses_abc123');

    // recent-feed preserved (the change is additive)
    expect(fileBrowserPageParamsCache.parse({ view: 'recent-feed' }).view).toBe('recent-feed');

    // unknown view → null (no default on the literal)
    expect(fileBrowserPageParamsCache.parse({ view: 'bogus' }).view).toBeNull();

    // rv parses standalone — inert-without-view is enforced at render (browser-client), not here
    const rvOnly = fileBrowserPageParamsCache.parse({ rv: 'ses_solo' });
    expect(rvOnly.rv).toBe('ses_solo');
    expect(rvOnly.view).toBeNull();

    // rv absent → null
    expect(fileBrowserPageParamsCache.parse({}).rv).toBeNull();
  });
});
