'use client';

/**
 * Hook for tracking work unit catalog changes via SSE events.
 *
 * Subscribes to `unit-catalog` SSE channel via multiplexed useChannelEvents hook.
 * Returns whether changes have occurred since last dismiss, with dismiss function.
 *
 * Plan 058, Phase 4, T003.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useChannelEvents } from '@/lib/sse';

interface UnitCatalogSSEMessage {
  unitSlug?: string;
  workspaceSlug?: string;
  [key: string]: unknown;
}

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
  const { messages, clearMessages } = useChannelEvents<UnitCatalogSSEMessage>('unit-catalog', {
    maxMessages: 10,
  });
  const [lastChanged, setLastChanged] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(0);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > prevCountRef.current) {
      setLastChanged(Date.now());
      clearMessages();
    }
    prevCountRef.current = messages.length;
  }, [messages, clearMessages]);

  const changed = lastChanged > 0 && lastChanged > dismissedAt;

  const dismiss = useCallback(() => {
    setDismissedAt(Date.now());
  }, []);

  return { changed, dismiss, lastChanged };
}
