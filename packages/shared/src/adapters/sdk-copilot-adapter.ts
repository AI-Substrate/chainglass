import * as path from 'node:path';
import type {
  AgentEvent,
  AgentEventHandler,
  AgentResult,
  AgentRunOptions,
  CopilotSessionEvent,
  CopilotSessionEventLike,
  IAgentAdapter,
  ICopilotClient,
  ILogger,
} from '../interfaces/index.js';

/**
 * Options for creating a SdkCopilotAdapter.
 *
 * Per ClaudeCodeAdapter pattern: Constructor DI for testability.
 */
export interface SdkCopilotAdapterOptions {
  /** Logger for debugging output. */
  logger?: ILogger;
  /**
   * Workspace root directory for cwd validation.
   * If provided, cwd option in run() must be within this directory.
   * If not provided, defaults to process.cwd().
   */
  workspaceRoot?: string;
}

/**
 * Adapter for GitHub Copilot SDK.
 *
 * Implements IAgentAdapter interface for interacting with Copilot
 * via the official @github/copilot-sdk.
 *
 * Per plan Phase 1: This is a skeleton with stub methods.
 * - Phase 2: Implements run() with session management
 * - Phase 3: Implements compact(), terminate() with error handling
 *
 * Per Critical Finding 06: Follows ClaudeCodeAdapter DI pattern.
 * Per DEC-client: One CopilotClient per adapter instance.
 * Per DEC-stateless: Adapter doesn't cache sessions; uses resumeSession().
 *
 * Usage (Phase 2+):
 * ```typescript
 * const client = new CopilotClient();
 * const adapter = new SdkCopilotAdapter(client, { logger });
 * const result = await adapter.run({ prompt: 'Hello' });
 * ```
 */
export class SdkCopilotAdapter implements IAgentAdapter {
  private readonly _client: ICopilotClient;
  private readonly _logger?: ILogger;
  private readonly _workspaceRoot: string;

  /** Maximum prompt length (100k characters) per guardrails - SEC-002 */
  private static readonly MAX_PROMPT_LENGTH = 100_000;

  /**
   * Creates a new SdkCopilotAdapter instance.
   *
   * @param client - The Copilot SDK client (real or fake for testing)
   * @param options - Optional configuration (logger, workspaceRoot)
   */
  constructor(client: ICopilotClient, options?: SdkCopilotAdapterOptions) {
    this._client = client;
    this._logger = options?.logger;
    this._workspaceRoot = options?.workspaceRoot ?? process.cwd();
  }

  /**
   * Execute a prompt through Copilot SDK.
   *
   * Per DYK-01: Catches sendAndWait exceptions and maps to failed AgentResult.
   * Per DYK-02: Registers event handler BEFORE calling sendAndWait.
   * Per DYK-05: Always destroys session in finally block.
   * Per DYK-06: Passes streaming flag when onEvent is provided.
   *
   * @param options - Prompt and optional session/cwd/onEvent settings
   * @returns AgentResult with output, sessionId, status, exitCode, tokens
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.run() called', { prompt: options.prompt?.slice(0, 50) });

    const { prompt, sessionId, cwd, onEvent } = options;

    // T009: Validate inputs - return failed result instead of throwing
    const validationError = this._validateInputs(prompt, cwd);
    if (validationError) {
      return {
        output: `Validation error: ${validationError}`,
        sessionId: sessionId ?? '',
        status: 'failed',
        exitCode: -1,
        tokens: null,
      };
    }

    // T006/T007: Create or resume session
    // DYK-06: Enable streaming when onEvent callback is provided
    const session = sessionId
      ? await this._client.resumeSession(sessionId)
      : await this._client.createSession({ streaming: !!onEvent });

    try {
      // DYK-02: Register handler BEFORE sendAndWait to avoid race condition
      let output = '';
      let hasStreamedThinking = false;
      let hasStreamedText = false;
      session.on((event: CopilotSessionEventLike) => {
        // Track streaming deltas to suppress post-turn duplicates.
        // The SDK emits deltas during streaming, then re-emits the full
        // consolidated content (assistant.reasoning, assistant.message)
        // after the turn ends. We skip the duplicates.
        if (event.type === 'assistant.reasoning_delta') {
          hasStreamedThinking = true;
        }
        if (event.type === 'assistant.message_delta') {
          hasStreamedText = true;
        }
        if (event.type === 'assistant.reasoning' && hasStreamedThinking) {
          return; // Skip duplicate consolidated thinking
        }
        if (event.type === 'assistant.message' && hasStreamedText) {
          // Still capture output for AgentResult, but don't emit as event
          const data = event.data as { content: string };
          output = data.content;
          return;
        }

        // Translate SDK events to AgentEvent and emit via onEvent
        const agentEvent = this._translateToAgentEvent(event);
        if (agentEvent && onEvent) {
          onEvent(agentEvent);
        }

        // Track final message content for AgentResult
        if (event.type === 'assistant.message') {
          const data = event.data as { content: string };
          output = data.content;
        }
      });

      // T006: Send prompt and wait for response
      await session.sendAndWait({ prompt: prompt.trim() });

      // T006: Return success result
      return {
        output,
        sessionId: session.sessionId,
        status: 'completed',
        exitCode: 0,
        tokens: null, // SDK limitation: tokens not exposed
      };
    } catch (error) {
      // DYK-01/T008: Catch exception and map to failed result
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorType = (error as Error & { errorType?: string }).errorType;
      const outputParts = [errorMessage];
      if (errorType) {
        outputParts.unshift(`[${errorType}]`);
      }

      // Emit session_error event if streaming
      if (onEvent) {
        onEvent({
          type: 'session_error',
          timestamp: new Date().toISOString(),
          data: {
            sessionId: session.sessionId,
            errorType: errorType ?? 'UNKNOWN_ERROR',
            message: errorMessage,
          },
        });
      }

      return {
        output: outputParts.join(' '),
        sessionId: session.sessionId,
        status: 'failed',
        exitCode: 1,
        tokens: null,
      };
    } finally {
      // DYK-05: Always cleanup session to prevent resource leaks
      await session.destroy();
    }
  }

  /**
   * Translate Copilot SDK session event to unified AgentEvent.
   *
   * Event mapping:
   * - assistant.message_delta → text_delta
   * - assistant.message → message
   * - assistant.usage → usage
   * - session.idle → session_idle
   * - session.error → session_error (handled in catch block)
   * - tool.execution_start → tool_call (Phase 2)
   * - tool.execution_complete → tool_result (Phase 2)
   * - assistant.reasoning → thinking (Phase 2)
   * - assistant.reasoning_delta → thinking (Phase 2)
   *
   * Per Phase 2 Critical Discovery 04: Copilot uses dedicated events for tools/reasoning.
   * Per Insight 2: All 4 new event types added to existing switch.
   * Per Insight 5: Additive code paths only.
   */
  private _translateToAgentEvent(event: CopilotSessionEventLike): AgentEvent | null {
    const timestamp = new Date().toISOString();

    switch (event.type) {
      case 'assistant.message_delta': {
        const data = event.data as { deltaContent: string; messageId: string };
        return {
          type: 'text_delta',
          timestamp,
          data: {
            content: data.deltaContent,
            messageId: data.messageId,
          },
        };
      }

      case 'assistant.message': {
        const data = event.data as { content: string; messageId: string };
        return {
          type: 'message',
          timestamp,
          data: {
            content: data.content,
            messageId: data.messageId,
          },
        };
      }

      case 'assistant.usage': {
        const data = event.data as { inputTokens?: number; outputTokens?: number };
        return {
          type: 'usage',
          timestamp,
          data: {
            inputTokens: data.inputTokens,
            outputTokens: data.outputTokens,
          },
        };
      }

      case 'session.idle':
        return {
          type: 'session_idle',
          timestamp,
          data: {},
        };

      case 'session.error':
        // Handled in catch block for proper error context
        return null;

      // Phase 2: Tool execution events
      case 'tool.execution_start': {
        const data = event.data as {
          toolName: string;
          arguments: unknown;
          toolCallId: string;
        };
        return {
          type: 'tool_call',
          timestamp,
          data: {
            toolName: data.toolName,
            input: data.arguments,
            toolCallId: data.toolCallId,
          },
        };
      }

      case 'tool.execution_complete': {
        const data = event.data as {
          toolCallId: string;
          result?: { content?: string };
          success: boolean;
        };
        return {
          type: 'tool_result',
          timestamp,
          data: {
            toolCallId: data.toolCallId,
            output: data.result?.content ?? '',
            isError: !data.success,
          },
        };
      }

      // Phase 2: Reasoning events
      case 'assistant.reasoning': {
        const data = event.data as { content: string; reasoningId?: string };
        return {
          type: 'thinking',
          timestamp,
          data: {
            content: data.content,
          },
        };
      }

      case 'assistant.reasoning_delta': {
        const data = event.data as { deltaContent: string; reasoningId?: string };
        return {
          type: 'thinking',
          timestamp,
          data: {
            content: data.deltaContent,
          },
        };
      }

      // Lifecycle events — not useful for display, skip
      case 'pending_messages.modified':
      case 'user.message':
      case 'assistant.turn_start':
      case 'assistant.turn_end':
      case 'session.usage_info':
        return null;

      default:
        // Unknown event type - return as raw for forward compatibility
        console.log(`[SdkCopilotAdapter] Unhandled event type: "${event.type}"`, JSON.stringify(event).substring(0, 300));
        return {
          type: 'raw',
          timestamp,
          data: {
            provider: 'copilot',
            originalType: event.type,
            originalData: event,
          },
        };
    }
  }

  /**
   * Send compact command to reduce context.
   *
   * Per DYK-01: Delegates to run({prompt: '/compact'}) since SDK
   * has no native compact method. This treats /compact as a regular
   * prompt that the Copilot CLI interprets as a command.
   *
   * @param sessionId - Session to compact
   * @returns AgentResult with compaction result
   */
  async compact(sessionId: string): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.compact() called', { sessionId });

    // CRITICAL: Do NOT delegate to run() - run() destroys the session in finally block!
    // compact() must preserve the session so subsequent turns can access compacted context.
    // Per DYK-01: SDK has no native compact; we send /compact as a prompt.
    const session = await this._client.resumeSession(sessionId);

    try {
      let output = '';
      session.on((event: CopilotSessionEventLike) => {
        if (event.type === 'assistant.message') {
          const data = event.data as { content: string };
          output = data.content;
        }
      });

      await session.sendAndWait({ prompt: '/compact' });

      this._logger?.debug('SdkCopilotAdapter.compact() completed', {
        sessionId,
        status: 'completed',
      });

      return {
        output,
        sessionId: session.sessionId,
        status: 'completed',
        exitCode: 0,
        tokens: null,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._logger?.error('SdkCopilotAdapter.compact() failed', new Error(errorMessage), {
        sessionId,
      });

      return {
        output: `Compact failed: ${errorMessage}`,
        sessionId,
        status: 'failed',
        exitCode: 1,
        tokens: null,
      };
    }
    // NOTE: No finally block with destroy() - session must stay alive for subsequent turns
  }

  /**
   * Terminate a running agent session.
   *
   * Per plan: Uses resumeSession() → abort() → destroy() pattern.
   * Per DYK-05: Always calls destroy() even on error paths.
   *
   * @param sessionId - Session to terminate
   * @returns AgentResult with status='killed', exitCode=137
   */
  async terminate(sessionId: string): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.terminate() called', { sessionId });

    // Resume the session to get a handle
    this._logger?.debug('SdkCopilotAdapter.terminate() resuming session', { sessionId });
    const session = await this._client.resumeSession(sessionId);

    try {
      // Abort any running operation
      this._logger?.debug('SdkCopilotAdapter.terminate() calling abort()', { sessionId });
      await session.abort();
    } finally {
      // DYK-05: Always destroy to prevent resource leaks
      this._logger?.debug('SdkCopilotAdapter.terminate() calling destroy()', { sessionId });
      await session.destroy();
    }

    this._logger?.debug('SdkCopilotAdapter.terminate() completed', {
      sessionId,
      status: 'killed',
      exitCode: 137,
    });

    return {
      output: '',
      sessionId,
      status: 'killed',
      exitCode: 137, // Standard SIGKILL exit code
      tokens: null,
    };
  }

  // ============================================
  // Private validation methods (T009)
  // Ported from legacy CopilotAdapter per DYK-04
  // ============================================

  /**
   * Validate all inputs and return error message if invalid.
   */
  private _validateInputs(prompt: string, cwd: string | undefined): string | null {
    const cwdError = this._validateCwd(cwd);
    if (cwdError) return cwdError;

    const promptError = this._validatePrompt(prompt);
    if (promptError) return promptError;

    return null;
  }

  /**
   * Validate cwd option.
   * SEC-001: Logs warning if cwd is outside workspace (but doesn't block).
   * Per DYK-07: Relaxed validation to enable .chainglass/ and scratch/ directories.
   */
  private _validateCwd(cwd: string | undefined): string | null {
    if (!cwd) {
      return null; // No cwd provided is valid (uses workspace root)
    }

    const resolved = path.resolve(cwd);
    const normalizedRoot = path.resolve(this._workspaceRoot);

    // Log warning if outside workspace (but don't block - enables .chainglass/ and other dirs)
    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      this._logger?.debug('cwd is outside workspace root', {
        cwd: resolved,
        workspaceRoot: normalizedRoot,
      });
    }

    return null;
  }

  /**
   * Validate prompt string.
   * SEC-002: Rejects empty, oversized, or malformed prompts.
   */
  private _validatePrompt(prompt: string): string | null {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return 'Prompt cannot be empty or whitespace-only';
    }

    if (trimmed.length > SdkCopilotAdapter.MAX_PROMPT_LENGTH) {
      return `Prompt exceeds maximum length of ${SdkCopilotAdapter.MAX_PROMPT_LENGTH} characters`;
    }

    // Reject control characters except newline, carriage return, and tab
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentional security validation
    const hasInvalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed);
    if (hasInvalidChars) {
      return 'Prompt contains invalid control characters';
    }

    return null;
  }
}
