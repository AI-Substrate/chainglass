/**
 * dlg-w1-root-refresh Gap B — binds the root/non-root routing split in the SSE
 * tree-refresh effect in browser-client.tsx.
 *
 * Rationale (same as browser-client-view-branch.test.tsx, the repo's precedent
 * for asserting facts about this component): BrowserClient composes ~25 hooks
 * and contexts and is never rendered anywhere in the suite. Mocking those would
 * either violate Constitution P4 (no vi.mock of own-domain internals) or drown
 * the test in mock plumbing. So this asserts the invariant by static source
 * analysis instead.
 *
 * WHAT IT PROTECTS: BrowserClient keeps TWO entry stores. Root rows render from
 * `rootEntries` (the `entries` prop); nested rows render from
 * `childEntries[entry.path]`. `handleRefreshDir` writes only `childEntries`, so
 * `childEntries['']` is a bucket nothing renders. When useTreeDirectoryChanges
 * reports a change in the worktree root it yields '' as the directory — routing
 * that through `handleRefreshDir` fetches the right data and then stores it
 * where the tree never looks, and a file created in the worktree root never
 * appears. That was the shipped bug. `useFileMutations` (use-file-mutations.ts)
 * already makes the same split for the mutation path.
 *
 * WHY STATIC ANALYSIS IS ACCEPTED HERE: the acceptance evidence for this fix is
 * a browser probe, and the browser probe is not in the gates. Without this test
 * nothing in CI would catch a future refactor collapsing the conditional back to
 * an unconditional `handleRefreshDir` — and the whole symptom would return
 * silently. Weak evidence beats no evidence when the alternative is an
 * unprotected regression.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: assert that the string 'handleRefreshRoot'
 * appears somewhere in the file. It is declared at ~:416 and handed to
 * useFileMutations at ~:433, so such an assertion would pass even with this
 * effect fully reverted — vacuous. Every assertion below is scoped to the
 * effect body, and the two branch halves are asserted to contain their own
 * handler and NOT the other one, so an inverted mapping fails too.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BROWSER_CLIENT_PATH = resolve(
  __dirname,
  '../../../../../apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx'
);

describe('browser-client.tsx — tree-refresh effect routes the worktree root to the root store', () => {
  const source = readFileSync(BROWSER_CLIENT_PATH, 'utf8');

  /**
   * The effect body: from the loop over the hook's changedDirs to the clearAll
   * that ends it. Scoping every assertion to this slice is what stops the file's
   * other (legitimate) uses of handleRefreshRoot from satisfying them.
   */
  function effectBody(): string {
    const start = source.indexOf('for (const dir of treeChanges.changedDirs)');
    expect(start).toBeGreaterThan(0);
    const end = source.indexOf('treeChanges.clearAll()', start);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
  }

  it('branches on the root sentinel rather than refreshing every changed dir the same way', () => {
    /**
     * Why: the regression this file exists for is the conditional disappearing —
     *   a "simplification" back to one unconditional handleRefreshDir(dir) call.
     * Contract: the effect body tests `dir === ''` before dispatching.
     * Worked Example: collapse the if/else to `fileNav.handleRefreshDir(dir);`
     *   and this assertion fails.
     */
    const body = effectBody();

    expect(body).toMatch(/if\s*\(\s*dir\s*===\s*''\s*\)/);
    expect(body).toContain('else');
  });

  it('sends the root to handleRefreshRoot and everything else to handleRefreshDir', () => {
    /**
     * Why: a conditional that exists but dispatches the wrong way round is just
     *   as broken as no conditional, and reads as correct at a glance.
     * Contract: the `dir === ''` branch calls handleRefreshRoot and NOT
     *   handleRefreshDir; the else branch calls handleRefreshDir and NOT
     *   handleRefreshRoot.
     * Usage Notes: asserting each half excludes the other handler is what makes
     *   this fail on an inverted mapping — mere ordering would not.
     * Quality Contribution: binds the direction of the split, not its presence.
     * Worked Example: swap the two calls → both halves fail.
     */
    const body = effectBody();

    const elseIdx = body.indexOf('} else {');
    expect(elseIdx).toBeGreaterThan(0);

    const rootBranch = body.slice(body.indexOf("if (dir === '')"), elseIdx);
    const otherBranch = body.slice(elseIdx);

    expect(rootBranch).toContain('handleRefreshRoot(');
    expect(rootBranch).not.toContain('handleRefreshDir(');

    expect(otherBranch).toContain('handleRefreshDir(');
    expect(otherBranch).not.toContain('handleRefreshRoot(');
  });

  it('mirrors the split useFileMutations already makes for the mutation path', () => {
    /**
     * Why: the two paths into the same two stores must not drift apart — if the
     *   mutation path stops making this distinction, the reason for the effect's
     *   conditional stops being self-evident and it becomes a deletion candidate.
     * Contract: use-file-mutations.ts routes '' to refreshRoot too.
     * Quality Contribution: keeps the precedent this fix was modelled on honest.
     */
    const mutationsSource = readFileSync(
      resolve(
        __dirname,
        '../../../../../apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts'
      ),
      'utf8'
    );

    expect(mutationsSource).toMatch(/if\s*\(\s*dirPath\s*===\s*''\s*\)/);
    expect(mutationsSource).toContain('refreshRoot(');
  });
});
