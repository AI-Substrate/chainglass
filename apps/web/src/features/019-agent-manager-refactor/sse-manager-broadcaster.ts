/**
 * Plan 019: Agent Manager Refactor - SSEManagerBroadcaster Adapter
 *
 * Wraps the real SSEManager to implement ISSEBroadcaster.
 * Per DYK-08: Enables AgentNotifierService to receive either real or fake broadcaster.
 *
 * Usage:
 * ```typescript
 * import { sseManager } from '@/lib/sse-manager';
 *
 * const broadcaster = new SSEManagerBroadcaster(sseManager);
 * const notifier = new AgentNotifierService(broadcaster);
 * ```
 */

import type { ISSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor/sse-broadcaster.interface';
import type { SSEManager } from '../../lib/sse-manager';

/**
 * SSEManagerBroadcaster - adapter wrapping SSEManager for ISSEBroadcaster.
 *
 * This adapter allows AgentNotifierService to work with either:
 * - SSEManagerBroadcaster (production) - real SSE broadcasting
 * - FakeSSEBroadcaster (tests) - recorded broadcasts for inspection
 */
export class SSEManagerBroadcaster implements ISSEBroadcaster {
  constructor(private readonly sseManager: SSEManager) {}

  /**
   * Delegate to real SSEManager.broadcast().
   */
  broadcast(channel: string, eventType: string, data: unknown): void {
    this.sseManager.broadcast(channel, eventType, data);
  }
}
