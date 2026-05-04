'use client';

import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { TerminalSession } from '../types';

interface UseTerminalSessionsOptions {
  currentBranch: string;
}

interface UseTerminalSessionsReturn {
  sessions: TerminalSession[];
  loading: boolean;
  tmuxAvailable: boolean;
  /**
   * The currently-selected tmux session name, or `null` when nothing is
   * selected (no sessions exist, or the user is between selections).
   *
   * URL-backed via `?session=<name>` since FX005 — the value survives
   * page refresh, lazy mount, and the mobile-browser sleep/wake cycle that
   * was the original regression. During the SSR → hydration window the
   * URL hasn't been read yet, so `selectedSession` will briefly be `null`
   * even when `?session=foo` is in the bar. Call sites must conditional-
   * render any children that require a non-null name.
   */
  selectedSession: string | null;
  /**
   * Updates the selected session.
   *
   * Side-effect: writes `?session=<name>` to the URL with
   * `history: 'replace'` (current-state, not navigation — does not push a
   * back-button entry). The URL update is debounced/batched by `nuqs`, so
   * the address bar may lag the local component state by a microtask; the
   * single-source-of-truth is the URL once the batch flushes.
   *
   * Pass an empty string or call with `null`-ish input is treated as
   * "no selection" and clears the URL param entirely.
   */
  setSelectedSession: (name: string) => void;
  refresh: () => void;
}

/**
 * tmux session list + current selection.
 *
 * History (FX005): `selectedSession` was previously local component state
 * which meant on mobile — where the Terminal tab is `lazy: true` and the
 * browser may reclaim the page during sleep — the rehydrated mount lost
 * the user's choice and re-ran the auto-pick fallback. The fallback fell
 * through to `enriched[0]` against an unstably-ordered `tmux list-sessions`
 * response, so the user landed in a different session each wake. The
 * fallback is now stable-sorted (FX005-1) and the selection is URL-backed
 * via the dormant `terminalParams.session` entry that already existed in
 * `terminal.params.ts`.
 *
 * The auto-pick logic also captured `selectedSession` in the
 * `fetchSessions` callback's closure (via the deps array), which on
 * wake-from-sleep created a window where the focus listener saw a stale
 * value. The stored name is now mirrored through a `useRef` that's
 * synced during render, so async fetch callbacks always read the
 * current selection regardless of when the callback was bound.
 */
export function useTerminalSessions({
  currentBranch,
}: UseTerminalSessionsOptions): UseTerminalSessionsReturn {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tmuxAvailable, setTmuxAvailable] = useState(true);

  // FX005: URL-backed selection. Default '' so the param is absent from a
  // clean URL until a session is actually picked. `history: 'replace'`
  // because session pick is current-state, not navigation — every tap
  // creating a back-button entry would be terrible UX.
  const [storedName, setStoredName] = useQueryState(
    'session',
    parseAsString.withDefault('').withOptions({ history: 'replace' })
  );

  // FX005: Mirror the URL value through a ref so the async `fetchSessions`
  // callback (and the focus listener it's attached to) always sees the
  // most recent selection. We mutate the ref during render — that's
  // safe here because the value is purely derived from React state and
  // is only read from event-handler / async-callback code paths, never
  // during render itself. This is the fix for the stale-closure window
  // on wake-from-sleep that was defect (3) in FX005.
  const storedNameRef = useRef<string | null>(null);
  storedNameRef.current = storedName === '' ? null : storedName;

  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/terminal');
      if (!res.ok) return;

      const data = await res.json();
      if (!mountedRef.current) return;

      setTmuxAvailable(data.tmux !== false);

      const enriched: TerminalSession[] = (data.sessions ?? []).map(
        (s: { name: string; attached: number; windows: number; created: number }) => ({
          ...s,
          isCurrentWorktree: s.name === currentBranch,
        })
      );

      setSessions(enriched);

      // Validate-or-fallback the stored selection.
      const stored = storedNameRef.current;
      if (stored) {
        const stillExists = enriched.some((s) => s.name === stored);
        if (stillExists) {
          // Stored name still valid — keep the selection as-is.
          return;
        }
        // Phantom: the stored name doesn't match any live session.
        // Clear the URL param so a refresh doesn't perpetuate the bad
        // name in the address bar, then fall through to the auto-pick
        // path below.
        setStoredName(null);
      }

      if (enriched.length === 0) {
        // No sessions to pick from — leave selection unset and don't
        // write a URL param. The empty-state UI takes over.
        return;
      }

      // Auto-pick: prefer the worktree-name match; otherwise fall through
      // to the first stable-sorted session (sort applied server-side per
      // FX005-1).
      const matchWorktree = enriched.find((s) => s.isCurrentWorktree);
      const next = matchWorktree?.name ?? enriched[0]?.name;
      if (next) {
        setStoredName(next);
      }
    } catch {
      // Network error — leave sessions as-is. The next focus / refresh
      // call will retry.
    } finally {
      if (mountedRef.current) setLoading(false);
    }
    // FX005: `storedName` deliberately NOT in deps — read via ref. Including
    // it would re-create the callback on every URL change, which (a) re-runs
    // the focus-listener wiring for no benefit and (b) was the source of the
    // wake-from-sleep stale-closure bug we're fixing.
  }, [currentBranch, setStoredName]);

  useEffect(() => {
    mountedRef.current = true;
    fetchSessions();

    const onFocus = () => fetchSessions();
    window.addEventListener('focus', onFocus);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [fetchSessions]);

  // Convert the empty-string default to `null` at the public boundary —
  // consumers expect `string | null`, not `string | ''`.
  const selectedSession = storedName === '' ? null : storedName;
  const setSelectedSession = useCallback(
    (name: string) => {
      // Empty string maps to URL-removed (matches the param default).
      setStoredName(name === '' ? null : name);
    },
    [setStoredName]
  );

  return {
    sessions,
    loading,
    tmuxAvailable,
    selectedSession,
    setSelectedSession,
    refresh: fetchSessions,
  };
}
