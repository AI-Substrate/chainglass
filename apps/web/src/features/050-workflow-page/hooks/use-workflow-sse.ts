'use client';

/**
 * useWorkflowSSE — Subscribe to workflow SSE events for the active graph.
 *
 * Filters by graphSlug, distinguishes structural vs status changes,
 * and supports mutation lock for self-event suppression.
 *
 * Phase 6: Real-Time SSE Updates — Plan 050
 */

import { useCallback, useEffect, useRef } from 'react';
import { useSSE } from '../../../hooks/useSSE';

interface WorkflowSSEMessage {
  graphSlug: string;
  changeType: 'structure' | 'status';
}

export interface UseWorkflowSSEOptions {
  graphSlug: string;
  enabled?: boolean;
  onStructureChange: () => void;
  onStatusChange: () => void;
}

export function useWorkflowSSE({
  graphSlug,
  enabled = true,
  onStructureChange,
  onStatusChange,
}: UseWorkflowSSEOptions) {
  const isMutatingRef = useRef(false);
  const structureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { messages, isConnected, clearMessages } = useSSE<WorkflowSSEMessage>(
    '/api/events/workflows',
    undefined,
    { autoConnect: enabled, maxMessages: 50 }
  );

  // Process new messages
  useEffect(() => {
    if (messages.length === 0) return;

    const latest = messages[messages.length - 1];
    if (!latest || latest.graphSlug !== graphSlug) return;
    if (isMutatingRef.current) return;

    if (latest.changeType === 'structure') {
      // Debounce structural changes at 300ms
      if (structureTimerRef.current) clearTimeout(structureTimerRef.current);
      structureTimerRef.current = setTimeout(() => {
        onStructureChange();
      }, 300);
    } else {
      // Debounce status changes at 1500ms (orchestrator writes frequently)
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => {
        onStatusChange();
      }, 1500);
    }

    clearMessages();
  }, [messages, graphSlug, onStructureChange, onStatusChange, clearMessages]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (structureTimerRef.current) clearTimeout(structureTimerRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  /** Call before starting a mutation to suppress self-events */
  const startMutation = useCallback(() => {
    isMutatingRef.current = true;
  }, []);

  /** Call after mutation completes to re-enable SSE processing */
  const endMutation = useCallback(() => {
    // Small delay to let filesystem events from our write pass through
    setTimeout(() => {
      isMutatingRef.current = false;
    }, 300);
  }, []);

  return { isConnected, startMutation, endMutation };
}
