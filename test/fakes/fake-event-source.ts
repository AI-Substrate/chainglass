/**
 * FakeEventSource - Test double for browser EventSource API
 *
 * Provides an in-memory implementation of the EventSource interface
 * for testing SSE hooks without browser or network dependencies.
 *
 * Follows the FakeLocalStorage exemplar pattern from Phase 2.
 *
 * @example
 * const fake = new FakeEventSource('/api/events');
 * fake.simulateOpen();
 * fake.simulateMessage('{"type":"update"}');
 * expect(hook.messages).toContain({ type: 'update' });
 */

/** EventSource ready states */
export const EventSourceReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSED: 2,
} as const;

export class FakeEventSource implements Partial<EventSource> {
  readonly url: string;
  readonly withCredentials: boolean;
  readyState: number = EventSourceReadyState.CONNECTING;

  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  // Store registered event listeners
  private eventListeners: Map<string, Set<EventListener>> = new Map();

  constructor(url: string, options?: EventSourceInit) {
    this.url = url;
    this.withCredentials = options?.withCredentials ?? false;
  }

  /**
   * Add an event listener for a specific event type.
   */
  addEventListener(type: string, listener: EventListener): void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, new Set());
    }
    this.eventListeners.get(type)!.add(listener);
  }

  /**
   * Remove an event listener.
   */
  removeEventListener(type: string, listener: EventListener): void {
    this.eventListeners.get(type)?.delete(listener);
  }

  /**
   * Close the EventSource connection.
   */
  close(): void {
    this.readyState = EventSourceReadyState.CLOSED;
  }

  // ============ Test Helpers ============

  /**
   * Simulate the connection opening successfully.
   */
  simulateOpen(): void {
    this.readyState = EventSourceReadyState.OPEN;
    const event = new Event('open');
    this.onopen?.(event);
    this.dispatchToListeners('open', event);
  }

  /**
   * Simulate receiving a message from the server.
   * @param data - The message data (typically JSON string)
   * @param eventType - Optional custom event type (default: 'message')
   */
  simulateMessage(data: string, eventType = 'message'): void {
    const event = new MessageEvent(eventType, {
      data,
      origin: this.url,
      lastEventId: '',
    });

    if (eventType === 'message') {
      this.onmessage?.(event);
    }
    this.dispatchToListeners(eventType, event);
  }

  /**
   * Simulate a connection error.
   */
  simulateError(): void {
    this.readyState = EventSourceReadyState.CLOSED;
    const event = new Event('error');
    this.onerror?.(event);
    this.dispatchToListeners('error', event);
  }

  /**
   * Dispatch an event to all registered listeners for that type.
   */
  private dispatchToListeners(type: string, event: Event): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
  }

  // Required EventSource constants
  readonly CONNECTING = EventSourceReadyState.CONNECTING;
  readonly OPEN = EventSourceReadyState.OPEN;
  readonly CLOSED = EventSourceReadyState.CLOSED;

  // Stub for dispatchEvent (not typically used but required by interface)
  dispatchEvent(_event: Event): boolean {
    return true;
  }
}

/**
 * Factory function for creating FakeEventSource instances.
 * Use this with useSSE's eventSourceFactory parameter for testing.
 *
 * @example
 * const factory = createFakeEventSourceFactory();
 * const { result } = renderHook(() => useSSE('/api/events', factory.create));
 * factory.lastInstance?.simulateMessage('{"type":"update"}');
 */
export function createFakeEventSourceFactory() {
  let lastInstance: FakeEventSource | null = null;
  let instanceCount = 0;

  return {
    create: (url: string, options?: EventSourceInit): FakeEventSource => {
      lastInstance = new FakeEventSource(url, options);
      instanceCount++;
      return lastInstance;
    },
    get lastInstance() {
      return lastInstance;
    },
    /** Number of EventSource instances created (useful for reconnect tests) */
    get instanceCount() {
      return instanceCount;
    },
  };
}
