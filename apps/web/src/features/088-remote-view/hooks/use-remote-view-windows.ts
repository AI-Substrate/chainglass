'use client';

/**
 * useRemoteViewWindows — the picker's window-list source (Plan 088 Phase 3, AC-1).
 *
 * NOTE on the data path: this app has **no client-side DI container** — services
 * (`IRemoteViewService`) are resolved server-side (tsyringe child containers in
 * di-container.ts, used by routes/actions). Client components therefore reach the
 * daemon through API routes. As of Phase 5 (T004) this hook fetches the real catalog
 * from `GET /api/remote-view/windows` (NextAuth-gated; the web-side daemon-control
 * enumerates host windows via `streamd --list-windows`). The picker is unchanged —
 * same `{ windows, loading, error, refresh }` shape it consumed against the fake.
 */

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { type WindowDescriptor, WindowDescriptorSchema } from '../protocol/messages';

export interface UseRemoteViewWindowsOptions {
  /** Skip loading when the picker isn't shown (a session is active). Default true. */
  enabled?: boolean;
}

export interface RemoteViewWindowsResult {
  windows: WindowDescriptor[];
  loading: boolean;
  error: string | null;
  /** The route's stable error CODE (e.g. `E_LOCKED`, `E_PERMISSION`) so callers can flip UI on the
   *  specific cause, not parse the message. `null` when there's no error. */
  code: string | null;
  refresh: () => void;
}

/** `GET /api/remote-view/windows` success body — the route wraps the catalog in `{ windows }`. */
const WindowsResponseSchema = z.object({ windows: z.array(WindowDescriptorSchema) });

/** Error carrying the route's stable error code through the try/catch so it reaches `code` state. */
class WindowsLoadError extends Error {
  constructor(
    message: string,
    readonly code: string | null
  ) {
    super(message);
  }
}

export function useRemoteViewWindows(
  options: UseRemoteViewWindowsOptions = {}
): RemoteViewWindowsResult {
  const enabled = options.enabled ?? true;
  const [windows, setWindows] = useState<WindowDescriptor[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCode(null);
    void (async () => {
      try {
        const res = await fetch('/api/remote-view/windows');
        if (!res.ok) {
          // The route names the cause (AC-14: missing grant, locked host, …); surface its message
          // AND its code, not a bare status.
          const detail = (await res.json().catch(() => null)) as {
            message?: string;
            error?: string;
          } | null;
          throw new WindowsLoadError(
            detail?.message ?? `windows request failed (${res.status})`,
            detail?.error ?? null
          );
        }
        const parsed = WindowsResponseSchema.parse(await res.json());
        if (!cancelled) setWindows(parsed.windows);
      } catch (err) {
        if (!cancelled) {
          setWindows([]);
          setError(err instanceof Error ? err.message : 'failed to load windows');
          setCode(err instanceof WindowsLoadError ? err.code : null);
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
    setWindows([]);
    setLoading(false);
  }, [enabled, refresh]);

  return { windows, loading, error, code, refresh };
}
