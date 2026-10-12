'use client';

/**
 * Open a file in the host OS's default app (e.g. PowerPoint for a `.pptx`) via
 * POST /api/workspaces/[slug]/files/open. Only offered when the browser runs on the
 * machine that hosts the server, the only place a server-side "open" makes sense.
 *
 * Plan 046: Binary File Viewers (T008); shared by the binary placeholder and Office previews.
 */

import { useCallback, useEffect, useState } from 'react';

/** Loopback hostnames — the only place a server-side "open" makes sense. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** `rawFileUrl` is the file's raw-route URL; the open endpoint takes the same query string. */
export function useOpenOnHost(rawFileUrl: string) {
  // Detect localhost on the client only (avoids SSR hydration mismatch).
  const [isLocal, setIsLocal] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    setIsLocal(LOCAL_HOSTNAMES.has(window.location.hostname));
  }, []);

  const open = useCallback(async () => {
    setOpening(true);
    setOpenError(null);
    try {
      const res = await fetch(rawFileUrl.replace('/files/raw', '/files/open'), { method: 'POST' });
      if (!res.ok) {
        throw new Error(`open failed (${res.status})`);
      }
    } catch (err) {
      console.error('[open-on-host] open failed', err);
      setOpenError('Could not open on host');
    } finally {
      setOpening(false);
    }
  }, [rawFileUrl]);

  return { isLocal, opening, openError, open };
}
