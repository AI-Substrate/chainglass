/**
 * SSEManagerBroadcaster - adapter wrapping the real SSEManager as ISSEBroadcaster.
 *
 * Lives beside sse-manager.ts because wrapping it is its whole job. Introduced by
 * Plan 019 and originally filed under its feature folder; moved here when that
 * surface was removed, since its consumers (workflow execution, central notify
 * events) have nothing to do with agents.
 *
 * Usage:
 * ```typescript
 * import { sseManager } from '@/lib/sse-manager';
 *
 * const broadcaster = new SSEManagerBroadcaster(sseManager);
 * const notifier = new CentralEventNotifierService(broadcaster);
 * ```
 */

import type { ISSEBroadcaster } from '@chainglass/shared/interfaces';
import type { SSEManager } from './sse-manager';

/**
 * Production implementation; pair with FakeSSEBroadcaster in tests.
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
