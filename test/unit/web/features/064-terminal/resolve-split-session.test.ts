/**
 * Pure-helper tests for `resolveSplitSession`.
 *
 * FX013: the split toggle must attach the inline pane to the session the
 * floating overlay is *live on*, not a re-derived `termSelectedSession`
 * (which auto-picks `enriched[0]` — the first session — when unset). The
 * regression was "split shows the FIRST tmux session, not this one".
 */

import { resolveSplitSession } from '@/features/064-terminal/lib/resolve-split-session';
import { describe, expect, it } from 'vitest';

describe('resolveSplitSession — FX013', () => {
  it('open-float.carries-live-session: prefers the open overlay session over the fallback', () => {
    // The core regression: float is open on "my-session"; the fallback
    // (auto-picked first session) is "alpha-first". Split must carry the
    // live session, NOT the fallback.
    expect(
      resolveSplitSession(
        { isOpen: true, sessionName: 'my-session', cwd: '/wt/my' },
        'alpha-first',
        '/wt/derived'
      )
    ).toEqual({ sessionName: 'my-session', cwd: '/wt/my' });
  });

  it('open-float.null-cwd: pairs the live session with the fallback cwd when overlay cwd is unset', () => {
    expect(
      resolveSplitSession(
        { isOpen: true, sessionName: 'my-session', cwd: null },
        'alpha-first',
        '/wt/derived'
      )
    ).toEqual({ sessionName: 'my-session', cwd: '/wt/derived' });
  });

  it('closed-float.uses-fallback: falls back to the worktree-derived name when the float is closed', () => {
    // Split toggled from a cold state — the float was never opened, so
    // `overlay.sessionName` may hold the provider's workspace-default
    // (often the main repo). We must NOT carry that; use the worktree name.
    expect(
      resolveSplitSession(
        { isOpen: false, sessionName: 'workspace-default', cwd: '/main/repo' },
        'derived-name',
        '/wt/derived'
      )
    ).toEqual({ sessionName: 'derived-name', cwd: '/wt/derived' });
  });

  it('open-float.empty-session: falls back when the overlay has no session despite being open', () => {
    expect(
      resolveSplitSession(
        { isOpen: true, sessionName: null, cwd: '/wt/my' },
        'derived-name',
        '/wt/derived'
      )
    ).toEqual({ sessionName: 'derived-name', cwd: '/wt/derived' });
  });
});
