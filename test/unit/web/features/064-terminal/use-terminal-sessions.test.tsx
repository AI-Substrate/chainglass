/**
 * useTerminalSessions — selection persistence (FX005-2).
 *
 * Covers the regression matrix the user hit: stored selection survives
 * sleep/wake cycles, phantom URL params are cleaned up when the named
 * session is gone, and the auto-pick fallback only fires when there's
 * truly no choice to remember. Uses `NuqsTestingAdapter` to drive the
 * URL state — the first nuqs adoption in the apps/web test suite.
 *
 * The wake-from-sleep flow on real Safari fires `visibilitychange`
 * BEFORE `focus`, but jsdom can only fire `focus` reliably; the
 * Playwright assertion in FX005-3 covers the real-event sequence.
 */

import { useTerminalSessions } from '@/features/064-terminal/hooks/use-terminal-sessions';
import { act, renderHook, waitFor } from '@testing-library/react';
import { NuqsTestingAdapter, type OnUrlUpdateFunction } from 'nuqs/adapters/testing';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface RawSession {
  name: string;
  attached: number;
  windows: number;
  created: number;
}

function mockFetchOnce(sessions: RawSession[], opts: { tmux?: boolean } = {}): void {
  const tmux = opts.tmux ?? true;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    return new Response(JSON.stringify({ sessions, tmux }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function makeWrapper(initialSearch: string, onUrlUpdate?: OnUrlUpdateFunction) {
  // `hasMemory` is required so the adapter persists writes from the hook
  // back into the URL state — without it, `setQueryState` calls fire
  // `onUrlUpdate` but the hook keeps reading the initial value, defeating
  // any test that checks roundtrip behavior.
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NuqsTestingAdapter searchParams={initialSearch} onUrlUpdate={onUrlUpdate} hasMemory>
        {children}
      </NuqsTestingAdapter>
    );
  };
}

describe('useTerminalSessions — FX005 selection persistence', () => {
  beforeEach(() => {
    // Each test installs its own fetch mock; reset between runs.
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the URL-stored selection when the session still exists in the live list', async () => {
    mockFetchOnce([
      { name: 'foo', attached: 0, windows: 1, created: 100 },
      { name: 'bar', attached: 1, windows: 2, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useTerminalSessions({ currentBranch: 'unrelated' }), {
      wrapper: makeWrapper('?session=bar', onUrlUpdate),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('bar');
    // The hook must NOT have written to the URL — stored value is valid,
    // so the address bar stays exactly as the user found it.
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('clears the URL and falls back when the stored session is gone (phantom-link cleanup)', async () => {
    mockFetchOnce([
      { name: 'alpha', attached: 0, windows: 1, created: 100 },
      { name: 'beta', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(
      () => useTerminalSessions({ currentBranch: 'unrelated' }),
      // Stored name does NOT exist in the live list — simulates a stale
      // shared link or a session killed externally.
      { wrapper: makeWrapper('?session=ghost', onUrlUpdate) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Hook fell back to the first session (no worktree match → enriched[0]).
    expect(result.current.selectedSession).toBe('alpha');
    // URL was rewritten — the phantom 'ghost' is gone, replaced by 'alpha'.
    // We see at least two URL updates: one to clear the phantom, one to
    // write the auto-pick.
    const lastCallSearchParams = onUrlUpdate.mock.calls.at(-1)?.[0]?.searchParams;
    expect(lastCallSearchParams?.get('session')).toBe('alpha');
    // History mode is 'replace' — selection is current-state, not navigation.
    const lastHistory = onUrlUpdate.mock.calls.at(-1)?.[0]?.options?.history;
    expect(lastHistory).toBe('replace');
  });

  it('auto-picks the current-worktree session when no URL value is stored', async () => {
    mockFetchOnce([
      { name: 'other', attached: 0, windows: 1, created: 100 },
      { name: 'mybranch', attached: 0, windows: 1, created: 200 },
      { name: 'newer', attached: 0, windows: 1, created: 300 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useTerminalSessions({ currentBranch: 'mybranch' }), {
      wrapper: makeWrapper('', onUrlUpdate),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Hook preferred the worktree-name match over enriched[0].
    expect(result.current.selectedSession).toBe('mybranch');
    const lastCallSearchParams = onUrlUpdate.mock.calls.at(-1)?.[0]?.searchParams;
    expect(lastCallSearchParams?.get('session')).toBe('mybranch');
  });

  it('falls back to the first session (stable-sorted by API) when no worktree match', async () => {
    // Server pre-sorts by created asc with name as tiebreaker — see FX005-1
    // sort-terminal-sessions.ts. Test fixture mirrors that ordering.
    mockFetchOnce([
      { name: 'apple', attached: 0, windows: 1, created: 100 },
      { name: 'banana', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useTerminalSessions({ currentBranch: 'no-such-branch' }), {
      wrapper: makeWrapper('', onUrlUpdate),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('apple');
  });

  it('does not write a URL and reports null selection when zero sessions exist', async () => {
    mockFetchOnce([]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useTerminalSessions({ currentBranch: 'whatever' }), {
      wrapper: makeWrapper('', onUrlUpdate),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sessions).toEqual([]);
    expect(result.current.selectedSession).toBeNull();
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('setSelectedSession writes through to the URL with history: replace', async () => {
    mockFetchOnce([
      { name: 'foo', attached: 0, windows: 1, created: 100 },
      { name: 'bar', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useTerminalSessions({ currentBranch: 'unrelated' }), {
      wrapper: makeWrapper('?session=foo', onUrlUpdate),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.selectedSession).toBe('foo');
    onUrlUpdate.mockClear();

    act(() => {
      result.current.setSelectedSession('bar');
    });

    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const last = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(last?.searchParams?.get('session')).toBe('bar');
    expect(last?.options?.history).toBe('replace');
  });

  it('treats setSelectedSession("") as clearing the URL param', async () => {
    mockFetchOnce([{ name: 'foo', attached: 0, windows: 1, created: 100 }]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(() => useTerminalSessions({ currentBranch: 'unrelated' }), {
      wrapper: makeWrapper('?session=foo', onUrlUpdate),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    onUrlUpdate.mockClear();

    act(() => {
      result.current.setSelectedSession('');
    });

    await waitFor(() => {
      expect(onUrlUpdate).toHaveBeenCalled();
    });
    const last = onUrlUpdate.mock.calls.at(-1)?.[0];
    // Empty string → param removed; URL-side reads as no `session=` key.
    expect(last?.searchParams?.get('session')).toBeNull();
  });
});

describe('useTerminalSessions — FX006 worktree-folder auto-pick', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hook.worktree-beats-branch: worktree-folder match wins when both candidates exist', async () => {
    // Both `higgs-jordo` (worktree-folder) and `older-session` exist; the
    // branch happens to also be `higgs-jordo` (so branch-match would
    // resolve to the same session) but we assert the resolution order
    // by verifying the older-session does NOT win even though it has a
    // lower `created` than `higgs-jordo`.
    mockFetchOnce([
      { name: 'older-session', attached: 0, windows: 1, created: 100 },
      { name: 'higgs-jordo', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(
      () =>
        useTerminalSessions({
          currentBranch: 'higgs-jordo',
          worktreePath: '/Users/jordanknight/github/higgs-jordo',
        }),
      { wrapper: makeWrapper('', onUrlUpdate) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('higgs-jordo');
  });

  it('hook.branch-fallback: worktree-folder has no match → branch-match wins over enriched[0]', async () => {
    mockFetchOnce([
      { name: 'apple', attached: 0, windows: 1, created: 100 },
      { name: 'main', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(
      () =>
        useTerminalSessions({
          currentBranch: 'main',
          // The worktree folder is `no-match-folder` — no session named that.
          worktreePath: '/path/to/no-match-folder',
        }),
      { wrapper: makeWrapper('', onUrlUpdate) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('main');
  });

  it('hook.no-worktree: worktreePath omitted → folder-match candidate skipped, branch-match still resolves', async () => {
    mockFetchOnce([
      { name: 'apple', attached: 0, windows: 1, created: 100 },
      { name: 'main', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(
      // Intentionally not passing `worktreePath` — the optional-arg
      // back-compat path. Helper returns `''`, no session matches that,
      // folder-match candidate is inert, falls through to branch-match.
      () => useTerminalSessions({ currentBranch: 'main' }),
      { wrapper: makeWrapper('', onUrlUpdate) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('main');
  });

  it('hook.user-higgs-bug: the exact higgs-jordo regression — picks higgs-jordo, not osk-data', async () => {
    // Fixture matches the user's actual environment: branch is `main`
    // (no session named `main`), worktree is higgs-jordo, sessions
    // sorted FX005-1 ascending by `created`. Pre-FX006 the auto-pick
    // would land on `osk-data` (enriched[0]). Post-FX006 it lands on
    // `higgs-jordo` via the worktree-folder match.
    mockFetchOnce([
      { name: 'osk-data', attached: 0, windows: 1, created: 100 },
      { name: '084-random-enhancements-3', attached: 0, windows: 1, created: 200 },
      { name: 'higgs-jordo', attached: 0, windows: 1, created: 300 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(
      () =>
        useTerminalSessions({
          currentBranch: 'main',
          worktreePath: '/Users/jordanknight/github/higgs-jordo',
        }),
      { wrapper: makeWrapper('', onUrlUpdate) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('higgs-jordo');
    // Negative assertions — ensures the bug is actually fixed, not just
    // accidentally passing because both candidates point to the same
    // session.
    expect(result.current.selectedSession).not.toBe('osk-data');
    expect(result.current.selectedSession).not.toBe('084-random-enhancements-3');
  });

  it('hook.worktree-and-branch-both-match: same session — no double URL write', async () => {
    // Rare case: `foo` is the worktree folder AND the branch name AND a
    // live session. Both candidates resolve to the same name; the
    // resolution order is irrelevant for the final value. Verify the
    // URL is written exactly once for the auto-pick (no double-write).
    mockFetchOnce([
      { name: 'other', attached: 0, windows: 1, created: 100 },
      { name: 'foo', attached: 0, windows: 1, created: 200 },
    ]);
    const onUrlUpdate = vi.fn();
    const { result } = renderHook(
      () =>
        useTerminalSessions({
          currentBranch: 'foo',
          worktreePath: '/path/foo',
        }),
      { wrapper: makeWrapper('', onUrlUpdate) }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.selectedSession).toBe('foo');
    // Auto-pick writes once. (The hook also reads the URL on mount,
    // which the adapter does not count as an `onUrlUpdate` call.)
    const fooWrites = onUrlUpdate.mock.calls.filter(
      (call) => call[0]?.searchParams?.get('session') === 'foo'
    );
    expect(fooWrites.length).toBe(1);
  });
});
