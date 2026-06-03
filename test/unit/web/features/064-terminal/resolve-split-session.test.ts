/**
 * Pure-helper tests for `resolveSplitSession`.
 *
 * The split toggle must attach the inline pane to the session the singleton is
 * currently showing — whether the floating overlay is open OR was opened on
 * this worktree and since closed (overlay state + the parked xterm persist).
 * It must never inherit an auto-picked "first" session or the provider's
 * cross-worktree workspace-default. The original regression was "split shows
 * the FIRST tmux session, not this one".
 *
 * Sessions are named by worktree-folder basename
 * (`sessionNameFromWorktreePath`), so a session "belongs to" a worktree when
 * its cwd derives to the same basename.
 */

import { resolveSplitSession } from '@/features/064-terminal/lib/resolve-split-session';
import { describe, expect, it } from 'vitest';

const WT = '/Users/x/github/higgs-jordo';
const MAIN_REPO = '/Users/x/github/chainglass';

describe('resolveSplitSession — FX015', () => {
  it('float-open.preserves-live-session: keeps the session the user is viewing', () => {
    expect(resolveSplitSession({ isOpen: true, sessionName: 'higgs-jordo', cwd: WT }, WT)).toEqual({
      sessionName: 'higgs-jordo',
      cwd: WT,
    });
  });

  it('float-closed-same-worktree.preserves: keeps a session opened here earlier even after close', () => {
    // The core regression: float was opened on this worktree, then closed.
    // overlay still holds the session + cwd; isOpen is false. Split must NOT
    // fall through to a first-session pick — it preserves the worktree session.
    expect(resolveSplitSession({ isOpen: false, sessionName: 'higgs-jordo', cwd: WT }, WT)).toEqual(
      { sessionName: 'higgs-jordo', cwd: WT }
    );
  });

  it('float-closed-same-worktree.preserves-user-switched-session: honours a non-canonical session in this worktree', () => {
    // User opened the float on this worktree but switched to another session
    // sharing the worktree cwd. cwd derives to this worktree → preserve.
    expect(resolveSplitSession({ isOpen: false, sessionName: 'feature-x', cwd: WT }, WT)).toEqual({
      sessionName: 'feature-x',
      cwd: WT,
    });
  });

  it('cold-default.uses-worktree-canonical: ignores the provider workspace-default (main repo)', () => {
    // Never opened a terminal: overlay still holds the provider defaults, which
    // point at the MAIN REPO (a different cwd), not this worktree. Split must
    // attach to THIS worktree's canonical session, not the main-repo default.
    expect(
      resolveSplitSession({ isOpen: false, sessionName: 'chainglass', cwd: MAIN_REPO }, WT)
    ).toEqual({ sessionName: 'higgs-jordo', cwd: WT });
  });

  it('float-open-other-worktree.preserves-viewed: when open, honours what the user sees even cross-cwd', () => {
    expect(
      resolveSplitSession({ isOpen: true, sessionName: 'other', cwd: '/some/other' }, WT)
    ).toEqual({ sessionName: 'other', cwd: '/some/other' });
  });

  it('no-worktree-path.keeps-overlay: degrades to the overlay session when no name can be derived', () => {
    // Empty/odd worktree path yields no canonical name; don't blank the session.
    expect(resolveSplitSession({ isOpen: false, sessionName: 'fallback', cwd: null }, '')).toEqual({
      sessionName: 'fallback',
      cwd: '',
    });
  });
});
