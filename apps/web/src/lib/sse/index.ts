/**
 * SSE Multiplexing — Public API
 *
 * Barrel export for the multiplexed SSE infrastructure.
 * Import from '@/lib/sse' for provider, hooks, and types.
 *
 * Plan 072: SSE Multiplexing — Phase 2
 */

export { MultiplexedSSEProvider, useMultiplexedSSE } from './multiplexed-sse-provider';
export { useChannelEvents } from './use-channel-events';
export { useChannelCallback } from './use-channel-callback';
export type {
  MultiplexedSSEMessage,
  MultiplexedSSEContextValue,
  EventSourceFactory,
} from './types';
export type { UseChannelEventsOptions, UseChannelEventsReturn } from './use-channel-events';
export type { UseChannelCallbackReturn } from './use-channel-callback';
