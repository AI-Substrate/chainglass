/**
 * useSSE - Server-Sent Events connection hook
 *
 * Manages SSE connections with automatic reconnection, message parsing,
 * and cleanup on unmount.
 *
 * DYK-01: Parameter injection pattern - hook receives EventSource factory
 * as parameter for testability. Components use useContainer() to resolve
 * the factory, then pass it to this hook.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

/** Type for the EventSource factory function */
export type EventSourceFactory = (url: string, options?: EventSourceInit) => EventSource;

/** Default factory using browser's EventSource */
const defaultEventSourceFactory: EventSourceFactory = (url, options) =>
  new EventSource(url, options);

export interface UseSSEOptions {
  /** Auto-connect on mount (default: true) */
  autoConnect?: boolean;
  /** Reconnect delay in ms (default: 5000) */
  reconnectDelay?: number;
  /** Max reconnect attempts (default: 5, 0 = unlimited) */
  maxReconnectAttempts?: number;
  /** Maximum messages to retain (default: 1000, 0 = unlimited) - FIX-004 */
  maxMessages?: number;
}

export interface UseSSEReturn<T = unknown> {
  /** Whether connected to SSE endpoint */
  isConnected: boolean;
  /** Accumulated messages from server */
  messages: T[];
  /** Current error, if any */
  error: Error | null;
  /** Manually disconnect from SSE */
  disconnect: () => void;
  /** Manually reconnect to SSE */
  connect: () => void;
  /** Clear accumulated messages */
  clearMessages: () => void;
}

/**
 * Hook for managing Server-Sent Events connections.
 *
 * @param url - SSE endpoint URL
 * @param eventSourceFactory - Factory for creating EventSource (inject for testing)
 * @param options - Connection options
 * @returns SSE state and control functions
 *
 * @example
 * // In tests (with fake factory):
 * const factory = createFakeEventSourceFactory();
 * const { messages, isConnected } = useSSE('/api/events', factory.create);
 *
 * // In production:
 * const { messages, isConnected } = useSSE('/api/events');
 */
export function useSSE<T = unknown>(
  url: string,
  eventSourceFactory: EventSourceFactory = defaultEventSourceFactory,
  options: UseSSEOptions = {}
): UseSSEReturn<T> {
  const { autoConnect = true, reconnectDelay = 5000, maxReconnectAttempts = 5, maxMessages = 1000 } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<T[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Create a new EventSource connection.
   */
  const connect = useCallback(() => {
    // Clear any pending reconnect timeout (FIX-003)
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = eventSourceFactory(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        setMessages((prev) => {
          const updated = [...prev, data];
          // Prune to maxMessages if set (FIX-004)
          if (maxMessages > 0 && updated.length > maxMessages) {
            return updated.slice(-maxMessages);
          }
          return updated;
        });
      } catch {
        // Non-JSON message - store as raw or ignore based on use case
        // For now, we silently ignore parse errors
        console.warn('useSSE: Failed to parse message as JSON:', event.data);
      }
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      setError(new Error('SSE connection error'));
      eventSource.close();

      // Attempt reconnection
      if (maxReconnectAttempts === 0 || reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectDelay);
      }
    };
  }, [url, eventSourceFactory, reconnectDelay, maxReconnectAttempts, maxMessages]);

  /**
   * Disconnect from SSE endpoint.
   */
  const disconnect = useCallback(() => {
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

  /**
   * Clear accumulated messages.
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    isConnected,
    messages,
    error,
    disconnect,
    connect,
    clearMessages,
  };
}
