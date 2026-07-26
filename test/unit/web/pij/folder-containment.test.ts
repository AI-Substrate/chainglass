/**
 * Browser-safe workspace containment — Plan 089 Phase 2 (T002).
 *
 * Test Doc:
 * - Why: `fleet-delta` is broadcast globally on the one shared `pij` channel, so the client re-applies
 *   the server's containment rule before touching its row map. That makes the rule exist TWICE, and
 *   two copies of one rule drift. These tests are the anti-drift device.
 * - Contract: dossier § B (deltas global / snapshots scoped), F-13, T002.
 * - Usage Notes: every case is run through BOTH implementations — the server's `isFolderInWorkspace`
 *   (`node:path`-based) and the browser's `isFolderInWorkspacePath` — and their answers are compared
 *   to each other as well as to the expectation. A divergence fails here, not in production.
 * - Quality Contribution: the hazard table is sibling-with-shared-prefix, trailing slashes, `..`
 *   traversal, the workspace itself, and empty input — the ways a naive prefix test lies.
 * - Worked Example: `/Users/j/chainglass-worktree` is NOT inside `/Users/j/chainglass`, though
 *   `startsWith` says it is. Worktrees are named exactly that way here, so the naive answer would show
 *   another repo's seats as this repo's — plausibly, and without a symptom.
 */
import { describe, expect, it } from 'vitest';
import {
  isFolderInWorkspacePath,
  normalizeFolderPath,
} from '../../../../apps/web/src/features/089-first-class-pij/lib/folder-containment';
import { isFolderInWorkspace } from '../../../../apps/web/src/features/089-first-class-pij/server/join';

const WS = '/Users/fixture/substrate/chainglass';

const CASES: Array<{ folder: string; workspace: string; inside: boolean; why: string }> = [
  { folder: WS, workspace: WS, inside: true, why: 'the workspace is inside itself' },
  { folder: `${WS}/apps/web`, workspace: WS, inside: true, why: 'a descendant' },
  { folder: `${WS}/`, workspace: WS, inside: true, why: 'trailing slash on the folder' },
  { folder: WS, workspace: `${WS}/`, inside: true, why: 'trailing slash on the workspace' },
  {
    folder: '/Users/fixture/substrate/chainglass-worktree',
    workspace: WS,
    inside: false,
    why: 'THE hazard: a sibling sharing the whole prefix',
  },
  {
    folder: '/Users/fixture/substrate/chainglass-worktree/apps',
    workspace: WS,
    inside: false,
    why: 'a descendant of the sibling is still not a descendant of the workspace',
  },
  { folder: '/Users/fixture/substrate', workspace: WS, inside: false, why: 'the parent' },
  { folder: '/Users/fixture/osk/billing', workspace: WS, inside: false, why: 'unrelated' },
  {
    folder: `${WS}/../chainglass-worktree`,
    workspace: WS,
    inside: false,
    why: '`..` escapes, textually',
  },
  {
    folder: `${WS}/apps/../apps/web`,
    workspace: WS,
    inside: true,
    why: '`..` that stays inside is still inside',
  },
  { folder: '', workspace: WS, inside: false, why: 'an absent folder belongs to no workspace' },
  { folder: WS, workspace: '', inside: false, why: 'an absent workspace contains nothing' },
  {
    folder: '/Users/Fixture/substrate/chainglass',
    workspace: WS,
    inside: false,
    why: 'case differences are a real mismatch, not a near miss — surfaced, never smoothed over',
  },
];

describe('isFolderInWorkspacePath (browser-safe containment)', () => {
  for (const { folder, workspace, inside, why } of CASES) {
    it(`${inside ? 'contains' : 'excludes'} ${folder || '(empty)'} — ${why}`, () => {
      expect(isFolderInWorkspacePath(folder, workspace)).toBe(inside);
    });
  }

  it('agrees with the server implementation on every hazard case', () => {
    // The whole point: one rule, two runtimes. Compared pairwise so a future edit to either side
    // fails immediately instead of splitting the fleet view from the fleet snapshot.
    const disagreements = CASES.filter(
      ({ folder, workspace }) =>
        isFolderInWorkspacePath(folder, workspace) !== isFolderInWorkspace(folder, workspace)
    );
    expect(disagreements).toEqual([]);
  });
});

describe('normalizeFolderPath', () => {
  it('collapses separators, drops "." and resolves ".."', () => {
    expect(normalizeFolderPath('/a//b/./c/../d/')).toBe('/a/b/d');
  });

  it('cannot climb above the root', () => {
    expect(normalizeFolderPath('/../../a')).toBe('/a');
  });
});
