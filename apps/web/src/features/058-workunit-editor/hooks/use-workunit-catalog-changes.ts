'use client';

/**
 * Hook for tracking work unit catalog changes via SSE events.
 *
 * Subscribes to `/api/events/unit-catalog` SSE channel.
 * Returns whether changes have occurred since last dismiss, with dismiss function.
 *
 * Plan 058, Phase 4, T003.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface UseWorkunitCatalogChangesResult {
  /** Whether unit catalog has changed since last dismiss. */
  changed: boolean;
  /** Dismiss the current change notification (hides until next change). */
  dismiss: () => void;
  /** Timestamp of the last change event (0 if none). */
  lastChanged: number;
}

/**
 * Track work unit catalog file changes via SSE.
 *
 * Returns `changed: true` when an SSE event arrives on the unit-catalog channel.
 * Calling `dismiss()` hides until the next change.
 */
export function useWorkunitCatalogChanges(): UseWorkunitCatalogChangesResult {
  const [lastChanged, setLastChanged] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/events/unit-catalog');
    eventSourceRef.current = es;

    es.onmessage = () => {
      setLastChanged(Date.now());
    };

    es.onerror = () => {
      // SSE reconnects automatically; no action needed
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const changed = lastChanged > 0 && lastChanged > dismissedAt;

  const dismiss = useCallback(() => {
    setDismissedAt(Date.now());
  }, []);

  return { changed, dismiss, lastChanged };
}
