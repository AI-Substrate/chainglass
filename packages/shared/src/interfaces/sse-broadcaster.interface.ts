/**
 * ISSEBroadcaster - minimal abstraction for SSE broadcasting.
 *
 * One method, matching SSEManager.broadcast(). Consumers depend on this rather
 * than on SSEManager directly so they can be tested without a live SSE manager.
 *
 * Introduced by Plan 019 and originally filed under its feature folder; moved
 * here when that surface was removed, because it is generic platform plumbing
 * with consumers across unrelated features (workflow execution, central notify
 * events) and never had anything agent-specific about it.
 *
 * Implementations:
 * - SSEManagerBroadcaster (apps/web/src/lib) - wraps the real SSEManager
 * - FakeSSEBroadcaster (packages/shared/src/fakes) - recording test double
 */
export interface ISSEBroadcaster {
  /**
   * Broadcast a message to all connections on a channel.
   *
   * @param channel - The SSE channel ID (e.g., 'workflow-execution')
   * @param eventType - The SSE event type (e.g., 'execution_status')
   * @param data - The data to broadcast (will be JSON stringified)
   */
  broadcast(channel: string, eventType: string, data: unknown): void;
}
