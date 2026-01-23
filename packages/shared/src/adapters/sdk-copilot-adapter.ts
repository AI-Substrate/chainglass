import * as path from 'node:path';
import type {
  AgentResult,
  AgentRunOptions,
  CopilotSessionEvent,
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
   *
   * @param options - Prompt and optional session/cwd settings
   * @returns AgentResult with output, sessionId, status, exitCode, tokens
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.run() called', { prompt: options.prompt?.slice(0, 50) });

    const { prompt, sessionId, cwd } = options;

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
    const session = sessionId
      ? await this._client.resumeSession(sessionId)
      : await this._client.createSession();

    try {
      // DYK-02: Register handler BEFORE sendAndWait to avoid race condition
      let output = '';
      session.on((event: CopilotSessionEvent) => {
        if (event.type === 'assistant.message') {
          output = event.data.content;
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
   * Send compact command to reduce context.
   *
   * @param sessionId - Session to compact
   * @returns AgentResult with updated token counts
   *
   * @throws Error - Phase 1 stub; throws "Not implemented"
   *
   * TODO Phase 3: Implement using:
   * - resumeSession(sessionId)
   * - session.sendAndWait({ prompt: '/compact' })
   */
  async compact(sessionId: string): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.compact() called', { sessionId });
    throw new Error('Not implemented: SdkCopilotAdapter.compact() - Phase 3');
  }

  /**
   * Terminate a running agent session.
   *
   * @param sessionId - Session to terminate
   * @returns AgentResult with status='killed'
   *
   * @throws Error - Phase 1 stub; throws "Not implemented"
   *
   * TODO Phase 3: Implement using:
   * - resumeSession(sessionId)
   * - session.abort()
   * - session.destroy()
   */
  async terminate(sessionId: string): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.terminate() called', { sessionId });
    throw new Error('Not implemented: SdkCopilotAdapter.terminate() - Phase 3');
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
   * Validate cwd option to prevent path traversal attacks.
   * SEC-001: Returns error if cwd is outside workspace.
   */
  private _validateCwd(cwd: string | undefined): string | null {
    if (!cwd) {
      return null; // No cwd provided is valid (uses workspace root)
    }

    const resolved = path.resolve(cwd);
    const normalizedRoot = path.resolve(this._workspaceRoot);

    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
      return `cwd must be within workspace. Got: ${cwd}, Expected within: ${normalizedRoot}`;
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
    const hasInvalidChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmed);
    if (hasInvalidChars) {
      return 'Prompt contains invalid control characters';
    }

    return null;
  }
}
