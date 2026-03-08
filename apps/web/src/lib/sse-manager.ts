/**
 * SSEManager - Server-Sent Events Connection Manager
 *
 * Manages SSE connections for broadcasting real-time updates to clients.
 * Uses a singleton pattern (via globalThis) to survive Next.js hot-module reload.
 *
 * DYK-01: globalThis pattern ensures singleton survives HMR during development.
 * DYK-02: Uses ReadableStreamDefaultController with enqueue(), not WritableStream.
 */

/** Type alias for stream controller (matching what Next.js provides) */
type StreamController = ReadableStreamDefaultController<Uint8Array>;

/**
 * SSEManager class for managing SSE connections by channel
 */
export class SSEManager {
  /** Map of channel IDs to sets of connected controllers */
  private connections: Map<string, Set<StreamController>> = new Map();

  /** TextEncoder for converting strings to Uint8Array */
  private encoder = new TextEncoder();

  /**
   * Add a connection to a channel
   * @param channelId - The channel to add the connection to
   * @param controller - The ReadableStreamDefaultController for this connection
   */
  addConnection(channelId: string, controller: StreamController): void {
    let channelSet = this.connections.get(channelId);
    if (!channelSet) {
      channelSet = new Set();
      this.connections.set(channelId, channelSet);
    }
    channelSet.add(controller);
  }

  /**
   * Remove a connection from a channel
   * @param channelId - The channel to remove the connection from
   * @param controller - The controller to remove
   */
  removeConnection(channelId: string, controller: StreamController): void {
    const channelConnections = this.connections.get(channelId);
    if (channelConnections) {
      channelConnections.delete(controller);
      // Clean up empty channels to prevent memory leaks
      if (channelConnections.size === 0) {
        this.connections.delete(channelId);
      }
    }
  }

  /**
   * Broadcast a message to all connections on a channel
   * @param channelId - The channel to broadcast to
   * @param eventType - The SSE event type (e.g., 'workflow_status')
   * @param data - The data to send (will be JSON stringified)
   */
  broadcast(channelId: string, eventType: string, data: unknown): void {
    // Validate eventType to prevent SSE injection (allow alphanumeric, underscore, hyphen)
    if (!/^[a-zA-Z0-9_-]+$/.test(eventType)) {
      throw new Error(`Invalid SSE event type: ${eventType}`);
    }

    const channelConnections = this.connections.get(channelId);
    if (!channelConnections) {
      return; // No connections on this channel
    }

    // Format as SSE message with type and channel embedded in data payload.
    // Uses unnamed events (no "event:" line) so EventSource.onmessage receives them.
    // Named SSE events require addEventListener() which useSSE doesn't use.
    // channel is authoritative — overwrites any caller-provided value
    const payload =
      typeof data === 'object' && data !== null
        ? { ...(data as Record<string, unknown>), type: eventType, channel: channelId }
        : { type: eventType, data, channel: channelId };
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    const encoded = this.encoder.encode(message);

    // Send to all connections on the channel (iterate snapshot to avoid iterator invalidation)
    const controllers = Array.from(channelConnections);
    for (const controller of controllers) {
      try {
        controller.enqueue(encoded);
      } catch {
        // Controller might be closed, remove it
        this.removeConnection(channelId, controller);
      }
    }
  }

  /**
   * Remove a controller from ALL channels it belongs to.
   * Used by the mux route for atomic cleanup on disconnect.
   * O(channels) scan — acceptable for ~6 active channels.
   * @param controller - The controller to remove from all channels
   * @returns Array of channel IDs the controller was removed from
   */
  removeControllerFromAllChannels(controller: StreamController): string[] {
    const removed: string[] = [];
    // Snapshot channel entries to avoid mutation during iteration
    const entries = Array.from(this.connections.entries());
    for (const [channelId, channelSet] of entries) {
      if (channelSet.has(controller)) {
        channelSet.delete(controller);
        removed.push(channelId);
        if (channelSet.size === 0) {
          this.connections.delete(channelId);
        }
      }
    }
    return removed;
  }

  /**
   * Get the number of connections on a channel
   * @param channelId - The channel to check
   * @returns The number of connections, or 0 if channel doesn't exist
   */
  getConnectionCount(channelId: string): number {
    return this.connections.get(channelId)?.size ?? 0;
  }

  /**
   * Check if a channel exists (has at least one connection)
   * @param channelId - The channel to check
   * @returns true if channel exists with connections
   */
  hasChannel(channelId: string): boolean {
    return this.connections.has(channelId);
  }

  /**
   * Send a heartbeat comment to keep connection alive
   * @param channelId - The channel to send heartbeat to
   */
  sendHeartbeat(channelId: string): void {
    const channelConnections = this.connections.get(channelId);
    if (!channelConnections) {
      return;
    }

    // SSE comment format for heartbeat
    const message = ': heartbeat\n\n';
    const encoded = this.encoder.encode(message);

    // Iterate snapshot to avoid iterator invalidation
    const controllers = Array.from(channelConnections);
    for (const controller of controllers) {
      try {
        controller.enqueue(encoded);
      } catch {
        this.removeConnection(channelId, controller);
      }
    }
  }
}

/**
 * Singleton instance using globalThis pattern (DYK-01)
 * This survives Next.js hot-module reload during development
 */
const globalForSSE = globalThis as typeof globalThis & { sseManager?: SSEManager };
if (!globalForSSE.sseManager) {
  globalForSSE.sseManager = new SSEManager();
}
export const sseManager = globalForSSE.sseManager;
