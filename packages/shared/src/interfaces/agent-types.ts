// Plan 015 Phase 1: Re-export new event types from Zod schemas (DYK-03)
export type {
  AgentThinkingEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '../schemas/agent-event.schema.js';

/**
 * Agent execution status values.
 *
 * Per spec AC-5/AC-6/AC-7:
 * - 'completed': Agent exited with exit code 0
 * - 'failed': Agent exited with non-zero exit code or error
 * - 'killed': Agent was terminated via terminate() method
 */
export type AgentStatus = 'completed' | 'failed' | 'killed';

/**
 * Token usage metrics for context tracking.
 *
 * Per DYK-03: Uses `| null` pattern for unavailable data.
 * When tokens are available, all fields are present.
 * When unavailable (e.g., Copilot), entire object is null.
 */
export interface TokenMetrics {
  /** Tokens used in the current execution turn */
  used: number;
  /** Cumulative tokens for the entire session */
  total: number;
  /** Agent's context window limit */
  limit: number;
}

/**
 * Result object returned from agent execution.
 *
 * Per spec AC-4: Contains output, sessionId, status, exitCode, stderr, tokens.
 */
export interface AgentResult {
  /** Agent output (stdout content) */
  output: string;
  /** Session identifier for resumption */
  sessionId: string;
  /** Execution status */
  status: AgentStatus;
  /** Process exit code (0 for success, >0 for failure) */
  exitCode: number;
  /** Stderr output if present */
  stderr?: string;
  /** Token metrics (null when unavailable, e.g., Copilot) */
  tokens: TokenMetrics | null;
}

/**
 * Options for running a prompt through an agent.
 */
export interface AgentRunOptions {
  /** The prompt to execute */
  prompt: string;
  /** Session ID for resumption (optional - creates new session if omitted) */
  sessionId?: string;
  /** Working directory for the agent (optional) */
  cwd?: string;
  /**
   * Optional callback for real-time events during execution.
   * When provided, adapter will emit events as they arrive.
   * When omitted, run() returns only the final AgentResult.
   */
  onEvent?: AgentEventHandler;
}

// ============================================
// Streaming Event Types
// ============================================

/**
 * Base event properties common to all agent events.
 */
export interface AgentEventBase {
  /** Event timestamp (ISO 8601) */
  timestamp: string;
  /** Event ID (provider-specific, may be generated) */
  eventId?: string;
}

/**
 * Streaming text content from assistant.
 * For Claude: content_block_delta with text_delta
 * For Copilot: assistant.message_delta
 */
export interface AgentTextDeltaEvent extends AgentEventBase {
  type: 'text_delta';
  data: {
    /** Incremental text to append */
    content: string;
    /** Message ID if available */
    messageId?: string;
  };
}

/**
 * Final assistant message (complete, not delta).
 * For Claude: message_stop with accumulated content
 * For Copilot: assistant.message
 */
export interface AgentMessageEvent extends AgentEventBase {
  type: 'message';
  data: {
    /** Complete message content */
    content: string;
    /** Message ID if available */
    messageId?: string;
  };
}

/**
 * Token usage information.
 * For Copilot: assistant.usage, session.usage_info
 * For Claude: message_delta.usage
 */
export interface AgentUsageEvent extends AgentEventBase {
  type: 'usage';
  data: {
    /** Tokens used for input/prompt */
    inputTokens?: number;
    /** Tokens generated for output */
    outputTokens?: number;
    /** Total tokens used */
    totalTokens?: number;
    /** Context window limit */
    tokenLimit?: number;
  };
}

/**
 * Session lifecycle events.
 * For Copilot: session.start, session.idle, session.error
 * For Claude: message_start (mapped to session_start)
 */
export interface AgentSessionEvent extends AgentEventBase {
  type: 'session_start' | 'session_idle' | 'session_error';
  data: {
    /** Session ID if available */
    sessionId?: string;
    /** Error type (for session_error) */
    errorType?: string;
    /** Error message (for session_error) */
    message?: string;
  };
}

/**
 * Raw provider event (passthrough for advanced consumers).
 * Allows access to provider-specific events not mapped above.
 */
export interface AgentRawEvent extends AgentEventBase {
  type: 'raw';
  data: {
    /** Source provider */
    provider: 'copilot' | 'claude';
    /** Original event type from provider */
    originalType: string;
    /** Original event data */
    originalData: unknown;
  };
}

// Plan 015 Phase 1: Import new event types for union extension
import type {
  AgentThinkingEvent,
  AgentToolCallEvent,
  AgentToolResultEvent,
} from '../schemas/agent-event.schema.js';

/**
 * Union of all agent event types.
 *
 * Uses discriminated union pattern for type-safe event handling:
 * ```typescript
 * onEvent: (event) => {
 *   if (event.type === 'text_delta') {
 *     process.stdout.write(event.data.content);
 *   }
 * }
 * ```
 *
 * Plan 015 Phase 1: Extended with tool_call, tool_result, thinking types.
 */
/**
 * User prompt submitted to the agent.
 * Stored as an event so prompts and responses share one ordered list.
 */
export interface AgentUserPromptEvent extends AgentEventBase {
  type: 'user_prompt';
  data: {
    /** The user's prompt text */
    content: string;
  };
}

export type AgentEvent =
  | AgentTextDeltaEvent
  | AgentMessageEvent
  | AgentUsageEvent
  | AgentSessionEvent
  | AgentRawEvent
  // Plan 015: New event types for tool visibility
  | AgentToolCallEvent
  | AgentToolResultEvent
  | AgentThinkingEvent
  | AgentUserPromptEvent;

/**
 * Event handler callback type for streaming.
 * Called during run() execution as events arrive.
 */
export type AgentEventHandler = (event: AgentEvent) => void;
