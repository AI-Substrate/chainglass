'use client';

/**
 * useRemoteViewHealth — reads `GET /api/remote-view/health` for the daemon's TCC permission state
 * so the picker can show a preflight card (Plan 088 Phase 6, T004 — AC-14).
 *
 * Permission-only and non-blocking: a health error never stops the picker (it just means "no
 * preflight info to show"), so the window list still loads. Mirrors the `useRemoteViewWindows`
 * fetch shape — `{ permissions, loading, error, refresh }`. The route is NextAuth-gated
 * server-side; the client only reads `{ permissions }` from the verdict.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteViewPermissions } from '../components/permissions-ux';

export interface UseRemoteViewHealthOptions {
  /** Skip fetching when the picker isn't shown (a session is active). Default true. */
  enabled?: boolean;
}

export interface RemoteViewHealthResult {
  permissions: RemoteViewPermissions | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useRemoteViewHealth(
  options: UseRemoteViewHealthOptions = {}
): RemoteViewHealthResult {
  const enabled = options.enabled ?? true;
  const [permissions, setPermissions] = useState<RemoteViewPermissions | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: only the LATEST refresh commits state. The manual Re-check path
  // (PermissionPreflightCard → refresh()) ignores the cleanup, so a slow initial /health could
  // otherwise resolve AFTER a fast Re-check and overwrite the fresh grant state with stale denied
  // data — making the card reappear after the user fixed the grant (companion F001). Bumping the
  // ref on every refresh (and on unmount) invalidates any superseded in-flight request.
  const reqSeqRef = useRef(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    const myReq = ++reqSeqRef.current;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch('/api/remote-view/health');
        const body = (await res.json().catch(() => null)) as {
          permissions?: RemoteViewPermissions;
          message?: string;
        } | null;
        if (myReq !== reqSeqRef.current) return; // a newer refresh (or unmount) superseded this one
        // Permissions are present on a healthy daemon even when a grant is denied (that IS the
        // preflight case). A non-ok verdict (e.g. bundle missing) carries no permissions → no card.
        setPermissions(body?.permissions ?? null);
        setError(res.ok ? null : (body?.message ?? `health request failed (${res.status})`));
        setLoading(false);
      } catch (err) {
        if (myReq !== reqSeqRef.current) return;
        setPermissions(null);
        setError(err instanceof Error ? err.message : 'failed to load health');
        setLoading(false);
      }
    })();
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      refresh();
      // Invalidate any in-flight request on unmount / enabled-change so a late resolve can't commit.
      return () => {
        reqSeqRef.current++;
      };
    }
    setPermissions(null);
    setLoading(false);
  }, [enabled, refresh]);

  return { permissions, loading, error, refresh };
}
