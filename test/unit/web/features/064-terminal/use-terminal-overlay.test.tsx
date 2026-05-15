/**
 * useTerminalOverlay regression test (FX006-4).
 *
 * Covers the toggle-from-URL path that was historically a source of
 * inline session-derivation logic. Pre-FX006 the overlay derived the
 * session name via a one-liner `sanitizeSessionName(worktree.split('/').pop() ?? '') || null`;
 * post-FX006 it calls the shared helper. This test fixes the user-visible
 * contract — pressing backtick on `/workspaces/higgs-jordo` resolves to
 * the `higgs-jordo` session — so a future refactor can't quietly break
 * byte-identity by dropping the `|| null`.
 */

import {
  TerminalOverlayProvider,
  useTerminalOverlay,
} from '@/features/064-terminal/hooks/use-terminal-overlay';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

function Wrapper({ children }: { children: ReactNode }) {
  return <TerminalOverlayProvider>{children}</TerminalOverlayProvider>;
}

function setLocationSearch(search: string): void {
  // The overlay reads `window.location.search` directly inside
  // toggleTerminal. `history.replaceState` is the jsdom-friendly way to
  // mutate that without triggering a navigation.
  window.history.replaceState({}, '', `/${search}`);
}

describe('useTerminalOverlay — FX006 toggleTerminal session derivation', () => {
  beforeEach(() => {
    setLocationSearch('');
  });

  afterEach(() => {
    setLocationSearch('');
  });

  it('overlay.toggle-from-worktree: derives session name from ?worktree= via the shared helper', () => {
    setLocationSearch('?worktree=/Users/jordanknight/github/higgs-jordo');

    const { result } = renderHook(() => useTerminalOverlay(), {
      wrapper: Wrapper,
    });

    act(() => {
      // No explicit args — exercise the URL-derivation branch.
      result.current.toggleTerminal();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.sessionName).toBe('higgs-jordo');
    // Cwd falls back to the raw worktree path.
    expect(result.current.cwd).toBe('/Users/jordanknight/github/higgs-jordo');
  });

  it('overlay.toggle-from-worktree-trailing-slash: empty basename → null → no open', () => {
    // Trailing-slash paths produce an empty basename via the helper.
    // The `|| null` post-conversion at the call site is critical here:
    // without it, the empty string would flow as a valid session name
    // and the overlay would dispatch an open with `sessionName: ''`.
    setLocationSearch('?worktree=/Users/jordanknight/github/higgs-jordo/');

    const { result } = renderHook(() => useTerminalOverlay(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.toggleTerminal();
    });

    // No open: helper returned '' → '|| null' → no resolvedSession →
    // toggleTerminal early-returns with the warn() branch.
    expect(result.current.isOpen).toBe(false);
  });
});
