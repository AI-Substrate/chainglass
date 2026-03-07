'use client';

/**
 * Plan 067 Phase 5: Question Popper — Hook & Provider
 *
 * Core state management for the Question Popper overlay UI.
 *
 * - SSE subscription to `event-popper` channel for real-time updates
 * - API fetch for item list (notification-fetch pattern)
 * - Outstanding count from SSE event payloads
 * - Overlay open/close with `overlay:close-all` mutual exclusion
 * - Action methods for answer, dismiss, clarify, acknowledge
 *
 * Follows: AgentOverlayProvider pattern (Plan 059)
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { AlertOut, AnswerPayload, QuestionOut } from '@chainglass/shared/question-popper';

// ── Types ──

/** Union of items returned from the list API */
export type EventPopperItem = QuestionOut | AlertOut;

/** Type guard: is item a question? */
export function isQuestionItem(item: EventPopperItem): item is QuestionOut {
  return 'questionId' in item;
}

/** Type guard: is item an alert? */
export function isAlertItem(item: EventPopperItem): item is AlertOut {
  return 'alertId' in item;
}

/** SSE event payload from the EventPopper channel */
interface EventPopperSSEMessage {
  type: string;
  questionId?: string;
  alertId?: string;
  outstandingCount: number;
}

/** Shape of the context value */
export interface QuestionPopperContextValue {
  /** All items (questions + alerts), newest first */
  items: EventPopperItem[];
  /** Outstanding items only (pending questions + unread alerts) */
  outstandingItems: EventPopperItem[];
  /** Count of outstanding items (unanswered questions + unread alerts) */
  outstandingCount: number;
  /** Whether the overlay panel is open */
  isOverlayOpen: boolean;
  /** Whether items are currently being fetched */
  isLoading: boolean;
  /** Current error, if any */
  error: Error | null;
  /** Whether SSE is connected */
  isConnected: boolean;

  /** Open the overlay panel (dispatches overlay:close-all first) */
  openOverlay: () => void;
  /** Close the overlay panel */
  closeOverlay: () => void;
  /** Toggle the overlay panel */
  toggleOverlay: () => void;

  /** Submit an answer for a question */
  answerQuestion: (id: string, answer: AnswerPayload) => Promise<void>;
  /** Dismiss a question without answering */
  dismissQuestion: (id: string) => Promise<void>;
  /** Request clarification on a question */
  requestClarification: (id: string, text: string) => Promise<void>;
  /** Acknowledge (mark read) an alert */
  acknowledgeAlert: (id: string) => Promise<void>;
  /** Manually refetch the item list */
  refetchItems: () => Promise<void>;
}

const QuestionPopperContext = createContext<QuestionPopperContextValue | null>(null);

// ── Helpers ──

function isOutstanding(item: EventPopperItem): boolean {
  if (isQuestionItem(item)) return item.status === 'pending';
  return item.status === 'unread';
}

// ── Provider ──

export function QuestionPopperProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<EventPopperItem[]>([]);
  const [outstandingCount, setOutstandingCount] = useState(0);
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const isOpeningRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  // ── API Fetch ──

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/event-popper/list');
      if (!res.ok) {
        throw new Error(`Failed to fetch items: ${res.status}`);
      }
      const data: { items: EventPopperItem[]; total: number } = await res.json();
      if (!mountedRef.current) return;
      const fetchedOutstanding = data.items.filter(isOutstanding).length;
      setItems(data.items);
      setOutstandingCount(fetchedOutstanding);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err : new Error('Failed to fetch items'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  // ── SSE Connection ──

  const connectSSE = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/events/event-popper');
    eventSourceRef.current = es;

    es.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    es.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg: EventPopperSSEMessage = JSON.parse(event.data);
        // Update outstanding count from SSE payload
        if (typeof msg.outstandingCount === 'number') {
          setOutstandingCount(msg.outstandingCount);
        }
        // Notification-fetch pattern: refetch full list on any event
        fetchItems();
      } catch {
        // Ignore malformed SSE messages
      }
    };

    es.onerror = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      es.close();

      // Reconnect with backoff (max 5 attempts)
      if (reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(2000 * reconnectAttemptsRef.current, 10000);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) connectSSE();
        }, delay);
      }
    };
  }, [fetchItems]);

  const disconnectSSE = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // Initial fetch + SSE connection on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchItems();
    connectSSE();

    return () => {
      mountedRef.current = false;
      disconnectSSE();
    };
  }, [fetchItems, connectSSE, disconnectSSE]);

  // ── Overlay State (Mutual Exclusion) ──

  const openOverlay = useCallback(() => {
    isOpeningRef.current = true;
    window.dispatchEvent(new CustomEvent('overlay:close-all'));
    isOpeningRef.current = false;
    setIsOverlayOpen(true);
  }, []);

  const closeOverlay = useCallback(() => {
    setIsOverlayOpen(false);
  }, []);

  const toggleOverlay = useCallback(() => {
    setIsOverlayOpen((current) => {
      if (current) return false;
      isOpeningRef.current = true;
      window.dispatchEvent(new CustomEvent('overlay:close-all'));
      isOpeningRef.current = false;
      return true;
    });
  }, []);

  // Listen for overlay:close-all (mutual exclusion with agents, terminal, activity-log)
  useEffect(() => {
    const handler = () => {
      if (isOpeningRef.current) return;
      closeOverlay();
    };
    window.addEventListener('overlay:close-all', handler);
    return () => window.removeEventListener('overlay:close-all', handler);
  }, [closeOverlay]);

  // ── Action Methods ──

  const answerQuestion = useCallback(
    async (id: string, answer: AnswerPayload) => {
      const res = await fetch(`/api/event-popper/answer-question/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answer),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.message || data.error || `Failed: ${res.status}`);
      }
      // SSE will trigger refetch, but also refetch immediately for responsiveness
      await fetchItems();
    },
    [fetchItems]
  );

  const dismissQuestion = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/event-popper/dismiss/${id}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.message || data.error || `Failed: ${res.status}`);
      }
      await fetchItems();
    },
    [fetchItems]
  );

  const requestClarification = useCallback(
    async (id: string, text: string) => {
      const res = await fetch(`/api/event-popper/clarify/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.message || data.error || `Failed: ${res.status}`);
      }
      await fetchItems();
    },
    [fetchItems]
  );

  const acknowledgeAlert = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/event-popper/acknowledge/${id}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(data.message || data.error || `Failed: ${res.status}`);
      }
      await fetchItems();
    },
    [fetchItems]
  );

  // ── Derived State ──

  const outstandingItems = items.filter(isOutstanding);

  const value: QuestionPopperContextValue = {
    items,
    outstandingItems,
    outstandingCount,
    isOverlayOpen,
    isLoading,
    error,
    isConnected,
    openOverlay,
    closeOverlay,
    toggleOverlay,
    answerQuestion,
    dismissQuestion,
    requestClarification,
    acknowledgeAlert,
    refetchItems: fetchItems,
  };

  return <QuestionPopperContext.Provider value={value}>{children}</QuestionPopperContext.Provider>;
}

// ── Hook ──

/**
 * Access the Question Popper state from any component inside QuestionPopperProvider.
 * Throws if used outside provider (fail-fast for wiring errors).
 */
export function useQuestionPopper(): QuestionPopperContextValue {
  const ctx = useContext(QuestionPopperContext);
  if (!ctx) {
    throw new Error('useQuestionPopper must be used within QuestionPopperProvider');
  }
  return ctx;
}
