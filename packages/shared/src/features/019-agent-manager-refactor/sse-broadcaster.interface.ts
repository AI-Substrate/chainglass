/**
 * Plan 019: Agent Manager Refactor - ISSEBroadcaster Interface
 *
 * Minimal abstraction for SSE broadcasting to enable testability.
 * Per DYK-08: AgentNotifierService receives ISSEBroadcaster (not SSEManager directly).
 *
 * This interface has exactly one method matching SSEManager.broadcast() signature.
 * Production uses SSEManagerBroadcaster (wraps SSEManager).
 * Tests use FakeSSEBroadcaster (records calls for inspection).
 */

/**
 * ISSEBroadcaster - minimal interface for SSE broadcasting.
 *
 * Implementations:
 * - SSEManagerBroadcaster (apps/web) - wraps real SSEManager
 * - FakeSSEBroadcaster (packages/shared) - test double
 */
export interface ISSEBroadcaster {
  /**
   * Broadcast a message to all connections on a channel.
   *
   * @param channel - The SSE channel ID (e.g., 'agents')
   * @param eventType - The SSE event type (e.g., 'agent_status')
   * @param data - The data to broadcast (will be JSON stringified)
   */
  broadcast(channel: string, eventType: string, data: unknown): void;
}
