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

  // Process new messages — scan all queued messages for active graph
  useEffect(() => {
    if (messages.length === 0) return;
    if (isMutatingRef.current) {
      clearMessages();
      return;
    }

    const relevant = messages.filter((m) => m.graphSlug === graphSlug);
    if (relevant.length === 0) {
      clearMessages();
      return;
    }

    const hasStructure = relevant.some((m) => m.changeType === 'structure');
    const hasStatus = relevant.some((m) => m.changeType === 'status');

    if (hasStructure) {
      if (structureTimerRef.current) clearTimeout(structureTimerRef.current);
      structureTimerRef.current = setTimeout(() => {
        onStructureChange();
      }, 300);
    }
    if (hasStatus) {
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
