'use client';

/**
 * useRemoteViewWindows — the picker's window-list source (Plan 088 Phase 3, AC-1).
 *
 * NOTE on the data path: this app has **no client-side DI container** — services
 * (`IRemoteViewService`) are resolved server-side (tsyringe child containers in
 * di-container.ts, used by routes/actions). Client components therefore reach the
 * daemon through API routes, which land in Phase 5. Until then this hook is the
 * single **swap point**: Phase 3 returns the frame-replay fake's window
 * (`FAKE_WINDOW`, AC-12, no daemon); Phase 5 replaces the body with
 * `fetch('/api/remote-view/windows')` (+ one-shot thumbnails) and the picker is
 * unchanged.
 */

import { useCallback, useEffect, useState } from 'react';
import type { WindowDescriptor } from '../protocol/messages';
import { FAKE_WINDOW } from '../testing/fixtures';

export interface UseRemoteViewWindowsOptions {
  /** Skip loading when the picker isn't shown (a session is active). Default true. */
  enabled?: boolean;
}

export interface RemoteViewWindowsResult {
  windows: WindowDescriptor[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Phase 3 fake window set — the one window the frame-replay fake can actually stream. */
const PHASE3_FAKE_WINDOWS: WindowDescriptor[] = [FAKE_WINDOW];

export function useRemoteViewWindows(
  options: UseRemoteViewWindowsOptions = {}
): RemoteViewWindowsResult {
  const enabled = options.enabled ?? true;
  const [windows, setWindows] = useState<WindowDescriptor[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    // Phase 5 swap point: replace with `fetch('/api/remote-view/windows')` → setWindows(json),
    // setError on non-2xx. Phase 3 serves the fake window so the picker + smoke run daemon-absent.
    setWindows(PHASE3_FAKE_WINDOWS);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    if (enabled) refresh();
    else {
      setWindows([]);
      setLoading(false);
    }
  }, [enabled, refresh]);

  return { windows, loading, error, refresh };
}
