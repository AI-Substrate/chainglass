/**
 * SSE Multiplexing — Public Contracts
 *
 * Type definitions for the multiplexed SSE infrastructure.
 * Defined here (not imported from useSSE.ts) to keep the new
 * sse/ module independent of the legacy hooks/ module it supersedes.
 *
 * Plan 072: SSE Multiplexing — Phase 2
 */

/**
 * Wire format for messages arriving on the multiplexed SSE stream.
 * Every message from `/api/events/mux` includes a `channel` field
 * (added authoritatively by SSEManager.broadcast).
 */
export type MultiplexedSSEMessage = {
  /** SSE channel this event was broadcast on, e.g. 'event-popper', 'file-changes' */
  channel: string;
  /** Event type within the channel, e.g. 'question-asked', 'file-changed' */
  type: string;
  /** Domain-specific payload fields */
  [key: string]: unknown;
};

/**
 * Factory for creating EventSource instances.
 * Inject a fake factory in tests to avoid real network connections.
 *
 * Intentionally re-declared here (identical to useSSE.ts EventSourceFactory)
 * to avoid coupling the new sse/ module to the legacy hooks/ module.
 * See DYK #5 from Phase 2 dossier.
 */
export type EventSourceFactory = (url: string, options?: EventSourceInit) => EventSource;

/**
 * Context value exposed by MultiplexedSSEProvider.
 * Consumers use `subscribe()` to receive per-channel events.
 */
export type MultiplexedSSEContextValue = {
  /**
   * Subscribe to events on a specific channel.
   * Returns an unsubscribe function. Call it on cleanup/unmount.
   */
  subscribe(channel: string, callback: (event: MultiplexedSSEMessage) => void): () => void;
  /** Whether the EventSource connection is currently open */
  isConnected: boolean;
  /** Current connection error, if any (null when connected) */
  error: Error | null;
};
