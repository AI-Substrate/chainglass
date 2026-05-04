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
