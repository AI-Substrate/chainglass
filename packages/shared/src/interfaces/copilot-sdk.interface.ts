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
 * - assistant.message_delta: Streaming delta content
 * - assistant.usage: Token usage metrics
 * - session.idle: Session finished processing
 * - session.error: Error occurred
 */
export type CopilotSessionEventType =
  | 'assistant.message'
  | 'assistant.message_delta'
  | 'assistant.usage'
  | 'session.idle'
  | 'session.error';

/**
 * Base session event structure.
 *
 * Per SDK: Every event has these base fields for tracking and correlation.
 */
export interface CopilotSessionEventBase {
  /** Unique event identifier */
  id: string;
  /** ISO 8601 timestamp when event was emitted */
  timestamp: string;
  /** ID of parent event for correlation, null for root events */
  parentId: string | null;
  /** If true, event is transient (deltas, usage) vs persistent (messages) */
  ephemeral?: boolean;
  /** Event type discriminator */
  type: CopilotSessionEventType;
}

/**
 * Tool request included in assistant message.
 * Per SDK: When assistant wants to invoke a tool, it includes these in the message.
 */
export interface CopilotToolRequest {
  toolCallId: string;
  name: string;
  arguments?: unknown;
  type?: 'function' | 'custom';
}

/**
 * Assistant message event - the final response from the assistant.
 * Per SDK: Contains the complete message content and optional tool requests.
 */
export interface CopilotAssistantMessageEvent extends CopilotSessionEventBase {
  type: 'assistant.message';
  data: {
    content: string;
    messageId: string;
    toolRequests?: CopilotToolRequest[];
    parentToolCallId?: string;
  };
}

/**
 * Assistant message delta event - streaming content.
 * Per SDK: Emitted during response generation when streaming=true.
 */
export interface CopilotAssistantMessageDeltaEvent extends CopilotSessionEventBase {
  type: 'assistant.message_delta';
  data: {
    /** Incremental content to append */
    deltaContent: string;
    /** Message ID for correlation */
    messageId: string;
  };
}

/**
 * Assistant usage event - token metrics.
 * Per SDK: Emitted after response completion with token usage.
 */
export interface CopilotAssistantUsageEvent extends CopilotSessionEventBase {
  type: 'assistant.usage';
  data: {
    /** Model used for this response */
    model?: string;
    /** Tokens used for input/prompt */
    inputTokens?: number;
    /** Tokens generated for output */
    outputTokens?: number;
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
  | CopilotAssistantMessageDeltaEvent
  | CopilotAssistantUsageEvent
  | CopilotSessionIdleEvent
  | CopilotSessionErrorEvent;

/**
 * Base event shape that all SDK events share.
 * Used for permissive typing to allow real SDK's SessionEvent (30+ types) to pass through.
 */
export interface CopilotSessionEventLike {
  id: string;
  timestamp: string;
  parentId: string | null;
  ephemeral?: boolean;
  type: string;
  data?: unknown;
}

/**
 * Event handler callback type.
 *
 * Accepts CopilotSessionEventLike to be compatible with real SDK's SessionEvent
 * which has 30+ event types. The adapter filters to known types internally.
 */
export type CopilotSessionEventHandler = (event: CopilotSessionEventLike) => void;

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
  /**
   * Enable streaming events (assistant.message_delta, etc.)
   * Per DYK-06: Defaults to false in SDK; must be true for delta events.
   */
  streaming?: boolean;
  /**
   * Permission handler for tool execution (bash, file ops).
   * Per FX006: Required by SDK 0.1.30+ — use approveAll for auto-accept.
   */
  onPermissionRequest?: (
    request: unknown,
    invocation: unknown
  ) => { kind: string } | Promise<{ kind: string }>;
}

/**
 * Configuration for resuming a session.
 * Per FX006: SDK 0.1.30 requires onPermissionRequest on resume too.
 */
export interface CopilotResumeSessionConfig {
  /** Permission handler — required by SDK for resumed sessions */
  onPermissionRequest?: (
    request: unknown,
    invocation: unknown
  ) => { kind: string } | Promise<{ kind: string }>;
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
