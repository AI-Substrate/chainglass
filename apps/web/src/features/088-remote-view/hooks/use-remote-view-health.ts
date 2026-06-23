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

import { useCallback, useEffect, useState } from 'react';
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

  const refresh = useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch('/api/remote-view/health');
        const body = (await res.json().catch(() => null)) as {
          permissions?: RemoteViewPermissions;
          message?: string;
        } | null;
        if (cancelled) return;
        // Permissions are present on a healthy daemon even when a grant is denied (that IS the
        // preflight case). A non-ok verdict (e.g. bundle missing) carries no permissions → no card.
        setPermissions(body?.permissions ?? null);
        if (!res.ok) setError(body?.message ?? `health request failed (${res.status})`);
      } catch (err) {
        if (!cancelled) {
          setPermissions(null);
          setError(err instanceof Error ? err.message : 'failed to load health');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      const cleanup = refresh();
      return cleanup;
    }
    setPermissions(null);
    setLoading(false);
  }, [enabled, refresh]);

  return { permissions, loading, error, refresh };
}
