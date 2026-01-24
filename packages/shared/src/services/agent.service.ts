import { AgentConfigType } from '../config/index.js';
import type { AgentResult, IAgentAdapter, IConfigService, ILogger } from '../interfaces/index.js';

/**
 * Allowed agent types for validation.
 * Per FIX-004/SEC-001: Validate agentType before calling factory.
 */
const ALLOWED_AGENT_TYPES = new Set(['claude-code', 'copilot']);

/**
 * Factory function type for creating adapters by agent type.
 *
 * Per DYK-02: AgentService needs both adapters but DI injects one.
 * Factory function pattern allows lazy resolution while keeping
 * selection logic in AgentService.
 *
 * @param agentType - The type of agent ('claude-code' | 'copilot')
 * @returns The appropriate IAgentAdapter instance
 * @throws Error if agentType is unknown
 */
export type AdapterFactory = (agentType: string) => IAgentAdapter;

/**
 * Options for running a prompt through the agent service.
 */
export interface AgentServiceRunOptions {
  /** The prompt to execute */
  prompt: string;
  /** The type of agent to use ('claude-code' | 'copilot') */
  agentType: string;
  /** Session ID for resumption (optional - creates new session if omitted) */
  sessionId?: string;
  /** Working directory for the agent (optional) */
  cwd?: string;
}

/**
 * AgentService orchestrates AI coding agent adapters.
 *
 * Per Discovery 10: Service is stateless externally - tracks only active
 * session→adapter mappings for terminate(), no session history retention.
 *
 * Per DYK-02: Uses factory function injection for adapter selection.
 * Per DYK-05: Config loaded via require(AgentConfigType) in constructor.
 * Per DYK-01: Timeout uses Promise.race() + terminate() + catch suppression.
 *
 * Responsibilities:
 * - Select appropriate adapter based on agentType parameter
 * - Enforce configurable timeout limits (default 10 minutes)
 * - Delegate run/compact/terminate to adapters
 * - Track active sessions for termination
 *
 * Usage:
 * ```typescript
 * const service = new AgentService(adapterFactory, configService, logger);
 * const result = await service.run({
 *   prompt: 'Write hello world',
 *   agentType: 'claude-code'
 * });
 * ```
 */
export class AgentService {
  private readonly _adapterFactory: AdapterFactory;
  private readonly _timeout: number;
  private readonly _logger: ILogger;

  // Track active sessions for termination per Discovery 10
  // Map: sessionId → { adapter, agentType }
  private readonly _activeSessions = new Map<
    string,
    { adapter: IAgentAdapter; agentType: string }
  >();

  constructor(adapterFactory: AdapterFactory, configService: IConfigService, logger: ILogger) {
    this._adapterFactory = adapterFactory;
    this._logger = logger;

    // Per DYK-05: Load config in constructor (fail-fast)
    const agentConfig = configService.require(AgentConfigType);
    this._timeout = agentConfig.timeout;

    this._logger.info('AgentService initialized', {
      timeout: this._timeout,
    });
  }

  /**
   * Execute a prompt through the selected agent.
   *
   * @param options - Run options including prompt, agentType, and optional sessionId/cwd
   * @returns AgentResult with output, sessionId, status, tokens
   *
   * Per DYK-01: Uses Promise.race() for timeout with .catch(() => {}) for late errors.
   * Per AC-1: Returns sessionId for session resumption
   * Per AC-20: Enforces timeout from config
   */
  async run(options: AgentServiceRunOptions): Promise<AgentResult> {
    const { prompt, agentType, sessionId, cwd } = options;

    // FIX-004/SEC-001: Validate agentType before calling factory
    if (!ALLOWED_AGENT_TYPES.has(agentType)) {
      throw new Error(
        `Invalid agent type: ${agentType}. Allowed: ${[...ALLOWED_AGENT_TYPES].join(', ')}`
      );
    }

    this._logger.debug('AgentService.run() called', {
      agentType,
      hasSessionId: !!sessionId,
      hasCwd: !!cwd,
      promptLength: prompt.length,
    });

    // Get adapter via factory
    const adapter = this._adapterFactory(agentType);

    // FIX-001/COR-001: Create cancellable timeout promise
    const timeout = this._createTimeoutPromise(this._timeout);

    // Run with timeout race
    const runPromise = adapter.run({ prompt, sessionId, cwd });

    // Per DYK-01: Promise.race() + terminate on timeout + catch suppression
    let result: AgentResult;
    let timedOut = false;

    try {
      result = await Promise.race([runPromise, timeout.promise]);
      // FIX-001: Clear timer on success
      timeout.cancel();
    } catch (error) {
      // Timeout fired - cancel not needed but harmless
      timeout.cancel();
      timedOut = true;

      this._logger.warn('Agent execution timed out', {
        agentType,
        timeout: this._timeout,
        sessionId,
      });

      // FIX-002/COR-002: Always terminate on timeout, even without sessionId
      // Use provided sessionId or empty string - adapter handles the termination
      await adapter.terminate(sessionId ?? '').catch(() => {
        // Per DYK-01: Suppress late errors
      });

      // Return failed result with timeout message
      result = {
        output: `Timeout after ${this._timeout}ms`,
        sessionId: sessionId ?? '',
        status: 'failed',
        exitCode: -1,
        tokens: null,
      };
    }

    // Suppress late errors from raced promise per DYK-01
    if (timedOut) {
      // Suppress late result from runPromise
      runPromise.catch(() => {
        // Intentionally empty - suppress late errors
      });
    }

    // FIX-003/PERF-001: Don't track completed sessions
    // Only in-progress sessions need tracking for terminate() calls
    // Completed sessions are done - no need to track them

    return result;
  }

  /**
   * Send compact command to reduce context.
   *
   * @param sessionId - Session to compact
   * @param agentType - Type of agent ('claude-code' | 'copilot')
   * @returns AgentResult with updated token counts
   *
   * Per AC-12: Sends /compact command
   * Per AC-13: Returns new token metrics
   * Per Discovery 11: Caller should build context before calling
   */
  async compact(sessionId: string, agentType: string): Promise<AgentResult> {
    this._logger.debug('AgentService.compact() called', {
      sessionId,
      agentType,
    });

    // Try to get adapter from active sessions first
    const session = this._activeSessions.get(sessionId);
    const adapter = session?.adapter ?? this._adapterFactory(agentType);

    const result = await adapter.compact(sessionId);

    this._logger.debug('Compact completed', {
      sessionId,
      tokens: result.tokens,
    });

    return result;
  }

  /**
   * Terminate a running agent session.
   *
   * @param sessionId - Session to terminate
   * @param agentType - Type of agent (optional if session is tracked)
   * @returns AgentResult with status='killed'
   *
   * Per AC-7: Returns status='killed'
   * Per AC-14: Completes within termination budget
   */
  async terminate(sessionId: string, agentType?: string): Promise<AgentResult> {
    this._logger.debug('AgentService.terminate() called', {
      sessionId,
      agentType,
    });

    // Try to get adapter from active sessions
    const session = this._activeSessions.get(sessionId);

    if (session) {
      const result = await session.adapter.terminate(sessionId);
      this._activeSessions.delete(sessionId);
      return result;
    }

    // If not tracked, need agentType to create adapter
    if (!agentType) {
      return {
        output: 'Session not found and agentType not provided',
        sessionId,
        status: 'failed',
        exitCode: -1,
        tokens: null,
      };
    }

    const adapter = this._adapterFactory(agentType);
    return adapter.terminate(sessionId);
  }

  /**
   * Create a cancellable timeout promise that rejects after specified milliseconds.
   * Per DYK-01: Used with Promise.race() for timeout enforcement.
   * Per FIX-001/COR-001: Returns cancel function to clear timer on success.
   *
   * @returns Object with promise and cancel function
   */
  private _createTimeoutPromise(timeoutMs: number): {
    promise: Promise<never>;
    cancel: () => void;
  } {
    let timeoutId: ReturnType<typeof setTimeout>;
    const promise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return {
      promise,
      cancel: () => clearTimeout(timeoutId),
    };
  }
}
