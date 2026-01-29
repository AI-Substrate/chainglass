/**
 * useWorkGraphSSE - SSE subscription hook for WorkGraph real-time updates
 *
 * Part of Plan 022: WorkGraph UI - Phase 4
 *
 * Per ADR-0007: Uses notification-fetch pattern
 * - SSE carries notification only: {type: 'graph-updated', graphSlug}
 * - On matching event, calls instance.refresh() to fetch latest state via REST
 *
 * Per Critical Discovery 05: SSE is notification layer, REST is data layer
 *
 * Phase 4 T006: Includes polling fallback when SSE unavailable
 */

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { EventSourceFactory } from '@/hooks/useSSE';
import { useSSE } from '@/hooks/useSSE';
import type { IWorkGraphUIInstance } from './workgraph-ui.types';

/** SSE event payload per ADR-0007 */
interface WorkGraphSSEEvent {
  type: string;
  graphSlug: string;
}

/** Default polling interval in ms */
const DEFAULT_POLLING_INTERVAL = 2000;

/** Options for useWorkGraphSSE hook */
export interface UseWorkGraphSSEOptions {
  /** The graph slug to filter events for */
  graphSlug: string;
  /** The WorkGraphUIInstance to refresh on external changes */
  instance: IWorkGraphUIInstance;
  /** Optional EventSource factory for testing (uses browser EventSource by default) */
  eventSourceFactory?: EventSourceFactory;
  /** Optional callback when external change is detected and refresh completed */
  onExternalChange?: () => void;
  /** Enable polling fallback when SSE fails (default: false) */
  enablePolling?: boolean;
  /** Polling interval in ms (default: 2000) */
  pollingInterval?: number;
}

/** Return type for useWorkGraphSSE hook */
export interface UseWorkGraphSSEReturn {
  /** Whether connected to SSE endpoint */
  isConnected: boolean;
  /** Current error, if any */
  error: Error | null;
}

/**
 * Hook for subscribing to WorkGraph SSE updates.
 *
 * Connects to /api/events/workgraphs channel and filters events by graphSlug.
 * When a matching 'graph-updated' event is received, calls instance.refresh()
 * to fetch the latest state via REST (notification-fetch pattern per ADR-0007).
 *
 * When enablePolling is true and SSE fails, falls back to polling at the
 * specified interval (default 2s).
 *
 * @example
 * ```tsx
 * const { isConnected } = useWorkGraphSSE({
 *   graphSlug: 'my-workflow',
 *   instance,
 *   onExternalChange: () => toast('Graph updated externally'),
 *   enablePolling: true, // Fallback to polling if SSE fails
 * });
 * ```
 */
export function useWorkGraphSSE({
  graphSlug,
  instance,
  eventSourceFactory,
  onExternalChange,
  enablePolling = false,
  pollingInterval = DEFAULT_POLLING_INTERVAL,
}: UseWorkGraphSSEOptions): UseWorkGraphSSEReturn {
  // Track if we're currently processing an event to prevent duplicate refreshes
  const isRefreshing = useRef(false);
  // Track polling interval ID
  const pollingIntervalId = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to workgraphs SSE channel
  const { isConnected, messages, error, clearMessages } = useSSE<WorkGraphSSEEvent>(
    '/api/events/workgraphs',
    eventSourceFactory
  );

  // Handle incoming SSE messages
  const handleMessages = useCallback(async () => {
    if (messages.length === 0 || isRefreshing.current) {
      return;
    }

    // Find matching events for this graph
    const matchingEvents = messages.filter(
      (msg) => msg.type === 'graph-updated' && msg.graphSlug === graphSlug
    );

    if (matchingEvents.length === 0) {
      // Clear non-matching messages to prevent accumulation
      clearMessages();
      return;
    }

    // Process matching event - refresh instance
    isRefreshing.current = true;
    try {
      await instance.refresh();
      onExternalChange?.();
    } finally {
      isRefreshing.current = false;
      clearMessages();
    }
  }, [messages, graphSlug, instance, onExternalChange, clearMessages]);

  // Process messages when they arrive
  useEffect(() => {
    handleMessages();
  }, [handleMessages]);

  // Polling fallback: start/stop based on SSE connection status
  useEffect(() => {
    // Clear any existing polling
    if (pollingIntervalId.current) {
      clearInterval(pollingIntervalId.current);
      pollingIntervalId.current = null;
    }

    // Start polling if SSE failed and polling is enabled
    if (enablePolling && !isConnected && error) {
      pollingIntervalId.current = setInterval(async () => {
        if (!isRefreshing.current) {
          isRefreshing.current = true;
          try {
            await instance.refresh();
            onExternalChange?.();
          } finally {
            isRefreshing.current = false;
          }
        }
      }, pollingInterval);
    }

    // Cleanup on unmount
    return () => {
      if (pollingIntervalId.current) {
        clearInterval(pollingIntervalId.current);
        pollingIntervalId.current = null;
      }
    };
  }, [enablePolling, isConnected, error, instance, onExternalChange, pollingInterval]);

  return {
    isConnected,
    error,
  };
}
