/**
 * Local interfaces for Copilot SDK integration.
 *
 * Per R-ARCH-001: These are LOCAL interfaces - fakes and adapters import these,
 * NOT the actual SDK types. This provides layer isolation and enables testing
 * without SDK runtime dependency.
 *
 * These interfaces mirror the subset of @github/copilot-sdk API we use:
 * - CopilotClient: createSession, resumeSession, stop, getStatus
 * - CopilotSession: sendAndWait, on, abort, destroy, sessionId
 */

/**
 * Session event types emitted by Copilot sessions.
 *
 * Per SDK: 30+ event types exist, but we only model the ones we need:
 * - assistant.message: Final response from assistant
 * - session.idle: Session finished processing
 * - session.error: Error occurred
 */
export type CopilotSessionEventType = 'assistant.message' | 'session.idle' | 'session.error';

/**
 * Base session event structure.
 */
export interface CopilotSessionEventBase {
  type: CopilotSessionEventType;
}

/**
 * Assistant message event - the final response from the assistant.
 */
export interface CopilotAssistantMessageEvent extends CopilotSessionEventBase {
  type: 'assistant.message';
  data: {
    content: string;
    messageId: string;
  };
}

/**
 * Session idle event - session finished processing.
 */
export interface CopilotSessionIdleEvent extends CopilotSessionEventBase {
  type: 'session.idle';
  data?: Record<string, unknown>;
}

/**
 * Session error event - error occurred during processing.
 */
export interface CopilotSessionErrorEvent extends CopilotSessionEventBase {
  type: 'session.error';
  data: {
    errorType: string;
    message: string;
    stack?: string;
  };
}

/**
 * Union of all session event types we handle.
 */
export type CopilotSessionEvent =
  | CopilotAssistantMessageEvent
  | CopilotSessionIdleEvent
  | CopilotSessionErrorEvent;

/**
 * Event handler callback type.
 */
export type CopilotSessionEventHandler = (event: CopilotSessionEvent) => void;

/**
 * Options for sending a message to a session.
 */
export interface CopilotMessageOptions {
  /** The prompt/message to send */
  prompt: string;
}

/**
 * Configuration for creating a session.
 */
export interface CopilotSessionConfig {
  /** Optional custom session ID (server generates one if not provided) */
  sessionId?: string;
  /** Model to use for this session */
  model?: string;
}

/**
 * Configuration for resuming a session.
 */
export interface CopilotResumeSessionConfig {
  /** Optional configuration (tools, etc.) - simplified for our use case */
}

/**
 * Status response from the client.
 */
export interface CopilotStatusResponse {
  /** Package version (e.g., "1.0.0") */
  version: string;
  /** Protocol version for SDK compatibility */
  protocolVersion: number;
}

/**
 * Interface for Copilot session operations.
 *
 * Per SDK CopilotSession class: Represents a single conversation session.
 * Sessions are created via ICopilotClient.createSession() or resumed via
 * ICopilotClient.resumeSession().
 *
 * DYK-03: The on() method stores the handler, and sendAndWait() triggers
 * events through that handler before resolving.
 */
export interface ICopilotSession {
  /**
   * The unique identifier for this session.
   * Available immediately after session creation (no polling needed).
   */
  readonly sessionId: string;

  /**
   * Sends a message to this session and waits until the session becomes idle.
   *
   * Events are delivered to handlers registered via on() while waiting.
   *
   * @param options - The message options including the prompt
   * @param timeout - Timeout in milliseconds (default: 60000)
   * @returns The final assistant message event, or undefined if none received
   * @throws Error if timeout is reached before session becomes idle
   */
  sendAndWait(
    options: CopilotMessageOptions,
    timeout?: number
  ): Promise<CopilotAssistantMessageEvent | undefined>;

  /**
   * Subscribes to events from this session.
   *
   * Events include assistant messages, errors, and session state changes.
   * Multiple handlers can be registered.
   *
   * @param handler - Callback function that receives session events
   * @returns Function that unsubscribes the handler when called
   */
  on(handler: CopilotSessionEventHandler): () => void;

  /**
   * Aborts the currently processing message in this session.
   *
   * The session remains valid and can continue to be used for new messages.
   */
  abort(): Promise<void>;

  /**
   * Destroys this session and releases all associated resources.
   *
   * After calling this method, the session can no longer be used.
   * To continue the conversation, use ICopilotClient.resumeSession().
   */
  destroy(): Promise<void>;
}

/**
 * Interface for Copilot client operations.
 *
 * Per SDK CopilotClient class: Manages connection to Copilot CLI server
 * and provides session management capabilities.
 *
 * Per DEC-client: One CopilotClient instance per adapter instance.
 */
export interface ICopilotClient {
  /**
   * Creates a new conversation session.
   *
   * @param config - Session configuration (model, sessionId, etc.)
   * @returns A new session with immediately available sessionId
   */
  createSession(config?: CopilotSessionConfig): Promise<ICopilotSession>;

  /**
   * Resumes an existing conversation session by its ID.
   *
   * This allows continuing a previous conversation with all history intact.
   *
   * @param sessionId - The ID of the session to resume
   * @param config - Optional configuration for the resumed session
   * @returns The resumed session
   * @throws Error if the session does not exist
   */
  resumeSession(sessionId: string, config?: CopilotResumeSessionConfig): Promise<ICopilotSession>;

  /**
   * Stops the client and closes all connections.
   *
   * @returns Array of errors encountered while stopping (empty if clean shutdown)
   */
  stop(): Promise<Error[]>;

  /**
   * Gets the client status including version information.
   *
   * @returns Status response with version and protocol version
   */
  getStatus(): Promise<CopilotStatusResponse>;
}
