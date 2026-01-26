import { randomUUID } from 'node:crypto';
import type {
  CopilotAssistantMessageEvent,
  CopilotMessageOptions,
  CopilotSessionEvent,
  CopilotSessionEventHandler,
  CopilotSessionEventLike,
  ICopilotSession,
} from '../interfaces/copilot-sdk.interface.js';

/**
 * Creates a default session.idle event with base fields.
 */
function createDefaultIdleEvent(): CopilotSessionEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    parentId: null,
    ephemeral: true,
    type: 'session.idle',
    data: {},
  };
}

/**
 * Configuration options for FakeCopilotSession.
 *
 * Per DYK-03: Store handler in on(), emit pre-configured events during sendAndWait().
 */
export interface FakeCopilotSessionOptions {
  /**
   * Session ID for this session.
   * Default: auto-generated unique ID
   */
  sessionId?: string;

  /**
   * Pre-configured events to emit during sendAndWait().
   * Events are emitted in order to all registered handlers.
   * Default: [{ type: 'session.idle', data: {} }]
   */
  events?: CopilotSessionEvent[];

  /**
   * Delay in milliseconds before resolving sendAndWait().
   * Used for testing timeout behavior.
   * Default: 0 (immediate)
   */
  sendAndWaitDelay?: number;
}

/**
 * FakeCopilotSession is a test double for ICopilotSession that provides
 * configurable event emission and verification helpers for testing.
 *
 * Per ADR-0002: Fakes only, no mocks. This class implements ICopilotSession
 * with predictable behavior configured via constructor options.
 *
 * Per R-ARCH-001: Imports local interfaces (ICopilotSession), not SDK types.
 *
 * Per DYK-03: The on() method stores the handler, and sendAndWait() triggers
 * events through that handler before resolving. This matches SDK behavior
 * where session.on(handler) registers a callback that receives events during
 * sendAndWait().
 *
 * Usage:
 * ```typescript
 * const session = new FakeCopilotSession({
 *   sessionId: 'test-session',
 *   events: [
 *     { type: 'assistant.message', data: { content: 'Hello!' } },
 *     { type: 'session.idle', data: {} }
 *   ]
 * });
 *
 * session.on((event) => console.log(event.type));
 * const result = await session.sendAndWait({ prompt: 'test' });
 * // Logs: 'assistant.message', 'session.idle'
 * // result.data.content === 'Hello!'
 * ```
 */
export class FakeCopilotSession implements ICopilotSession {
  private readonly _sessionId: string;
  private readonly _events: CopilotSessionEvent[];
  private readonly _sendAndWaitDelay: number;
  private readonly _eventHandlers = new Set<CopilotSessionEventHandler>();
  private readonly _sendHistory: CopilotMessageOptions[] = [];
  private _abortCount = 0;
  private _destroyed = false;

  constructor(options: FakeCopilotSessionOptions = {}) {
    this._sessionId = options.sessionId ?? `fake-session-${Date.now()}`;
    this._events = options.events ?? [createDefaultIdleEvent()];
    this._sendAndWaitDelay = options.sendAndWaitDelay ?? 0;
  }

  /**
   * The unique identifier for this session.
   * Available immediately (no polling needed).
   */
  get sessionId(): string {
    return this._sessionId;
  }

  /**
   * Sends a message to this session and waits until the session becomes idle.
   *
   * Per DYK-03: Emits all pre-configured events to registered handlers,
   * then resolves with the last assistant.message event (or undefined).
   *
   * @param options - The message options including the prompt
   * @param timeout - Timeout in milliseconds (default: 60000)
   * @returns The final assistant message event, or undefined if none received
   * @throws Error if timeout is reached or session.error event occurs
   */
  async sendAndWait(
    options: CopilotMessageOptions,
    timeout?: number
  ): Promise<CopilotAssistantMessageEvent | undefined> {
    this._sendHistory.push({ ...options });

    const effectiveTimeout = timeout ?? 60_000;
    let lastAssistantMessage: CopilotAssistantMessageEvent | undefined;

    // Check if we need to simulate timeout
    if (this._sendAndWaitDelay > 0 && this._sendAndWaitDelay >= effectiveTimeout) {
      await new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`Timeout after ${effectiveTimeout}ms`)),
          effectiveTimeout
        );
      });
    }

    // Apply configured delay
    if (this._sendAndWaitDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._sendAndWaitDelay));
    }

    // Emit events to all handlers (per DYK-03 pattern)
    for (const event of this._events) {
      // Check for error events first
      if (event.type === 'session.error') {
        const errorEvent = event as {
          data: { errorType: string; message: string; stack?: string };
        };
        const error = new Error(errorEvent.data.message);
        if (errorEvent.data.stack) {
          error.stack = errorEvent.data.stack;
        }
        // Store errorType on error for adapter to access
        (error as Error & { errorType?: string }).errorType = errorEvent.data.errorType;
        throw error;
      }

      // Dispatch event to all handlers
      for (const handler of this._eventHandlers) {
        try {
          handler(event);
        } catch {
          // Handler error - ignore per SDK behavior
        }
      }

      // Track assistant messages
      if (event.type === 'assistant.message') {
        lastAssistantMessage = event as CopilotAssistantMessageEvent;
      }
    }

    return lastAssistantMessage;
  }

  /**
   * Subscribes to events from this session.
   *
   * @param handler - Callback function that receives session events
   * @returns Function that unsubscribes the handler when called
   */
  on(handler: CopilotSessionEventHandler): () => void {
    this._eventHandlers.add(handler);
    return () => {
      this._eventHandlers.delete(handler);
    };
  }

  /**
   * Aborts the currently processing message in this session.
   * The session remains valid and can continue to be used.
   */
  async abort(): Promise<void> {
    this._abortCount++;
  }

  /**
   * Destroys this session and releases all associated resources.
   * Clears all event handlers.
   */
  async destroy(): Promise<void> {
    this._destroyed = true;
    this._eventHandlers.clear();
  }

  // ============================================
  // Test helper methods
  // ============================================

  /**
   * Get all sendAndWait() calls made to this session.
   * Useful for verifying what prompts were sent.
   */
  getSendHistory(): CopilotMessageOptions[] {
    return [...this._sendHistory];
  }

  /**
   * Get the number of times abort() was called.
   */
  getAbortCount(): number {
    return this._abortCount;
  }

  /**
   * Check if destroy() was called.
   */
  wasDestroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Clear all call history.
   * Useful for test isolation between test cases.
   */
  reset(): void {
    this._sendHistory.length = 0;
    this._abortCount = 0;
    this._destroyed = false;
    this._eventHandlers.clear();
  }
}
