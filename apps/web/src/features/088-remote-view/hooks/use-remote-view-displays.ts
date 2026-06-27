'use client';

/**
 * useRemoteViewDisplays — the picker's display (whole-desktop) source (Plan 088, multi-target
 * capture). The display sibling of `useRemoteViewWindows`: fetches the real catalog from
 * `GET /api/remote-view/displays` (NextAuth-gated; the web-side daemon-control enumerates host
 * displays via `streamd --list-displays`). Same `{ items, loading, error, refresh }` shape so the
 * picker renders a "Whole Desktop" / pick-a-screen section with no new data plumbing.
 */

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';
import { type DisplayDescriptor, DisplayDescriptorSchema } from '../protocol/messages';

export interface UseRemoteViewDisplaysOptions {
  /** Skip loading when the picker isn't shown (a session is active). Default true. */
  enabled?: boolean;
}

export interface RemoteViewDisplaysResult {
  displays: DisplayDescriptor[];
  loading: boolean;
  error: string | null;
  /** The route's stable error CODE (e.g. `E_LOCKED`, `E_PERMISSION`) so callers can flip UI on the
   *  specific cause, not parse the message. `null` when there's no error. */
  code: string | null;
  refresh: () => void;
}

/** `GET /api/remote-view/displays` success body — the route wraps the catalog in `{ displays }`. */
const DisplaysResponseSchema = z.object({ displays: z.array(DisplayDescriptorSchema) });

/** Error carrying the route's stable error code through the try/catch so it reaches `code` state. */
class DisplaysLoadError extends Error {
  constructor(
    message: string,
    readonly code: string | null
  ) {
    super(message);
  }
}

export function useRemoteViewDisplays(
  options: UseRemoteViewDisplaysOptions = {}
): RemoteViewDisplaysResult {
  const enabled = options.enabled ?? true;
  const [displays, setDisplays] = useState<DisplayDescriptor[]>([]);
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
        const res = await fetch('/api/remote-view/displays');
        if (!res.ok) {
          // The route names the cause (AC-14: missing grant, locked host, …); surface its message
          // AND its code, not a bare status.
          const detail = (await res.json().catch(() => null)) as {
            message?: string;
            error?: string;
          } | null;
          throw new DisplaysLoadError(
            detail?.message ?? `displays request failed (${res.status})`,
            detail?.error ?? null
          );
        }
        const parsed = DisplaysResponseSchema.parse(await res.json());
        if (!cancelled) setDisplays(parsed.displays);
      } catch (err) {
        if (!cancelled) {
          setDisplays([]);
          setError(err instanceof Error ? err.message : 'failed to load displays');
          setCode(err instanceof DisplaysLoadError ? err.code : null);
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
    setDisplays([]);
    setLoading(false);
  }, [enabled, refresh]);

  return { displays, loading, error, code, refresh };
}
