import type {
  AgentResult,
  AgentRunOptions,
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
   * @param options - Prompt and optional session/cwd settings
   * @returns AgentResult with output, sessionId, status, exitCode, tokens
   *
   * @throws Error - Phase 1 stub; throws "Not implemented"
   *
   * TODO Phase 2: Implement using:
   * - createSession() for new sessions
   * - resumeSession() when sessionId provided
   * - session.sendAndWait() for prompt execution
   * - Event handling for output collection
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    this._logger?.debug('SdkCopilotAdapter.run() called', { prompt: options.prompt?.slice(0, 50) });
    throw new Error('Not implemented: SdkCopilotAdapter.run() - Phase 2');
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
}
