import type { IAgentAdapter } from '../interfaces/agent-adapter.interface.js';
import type {
  AgentEvent,
  AgentResult,
  AgentRunOptions,
  AgentStatus,
  TokenMetrics,
} from '../interfaces/agent-types.js';

/**
 * Configuration options for FakeAgentAdapter.
 *
 * Per DYK-02: FakeAgentAdapter is stateless internally; it records call history
 * but does not track session state. Test harness manages sessionId consistency.
 */
export interface FakeAgentAdapterOptions {
  /** Session ID to return in results (default: 'fake-session-<uuid>') */
  sessionId?: string;
  /** Output to return from run() */
  output?: string;
  /** Status to return (default: 'completed') */
  status?: AgentStatus;
  /** Exit code to return (default: 0) */
  exitCode?: number;
  /** Stderr output to return */
  stderr?: string;
  /** Token metrics to return (null = unavailable, per DYK-03) */
  tokens?: TokenMetrics | null;
  /**
   * Duration in milliseconds to simulate slow run() operations.
   * Per Phase 5 DYK-03: Enables timeout testing.
   * When set, run() awaits setTimeout before returning.
   * Default: 0 (no delay).
   */
  runDuration?: number;
  /**
   * Events to emit via onEvent callback during run().
   * Per Phase 2: Enables testing of tool_call, tool_result, thinking events.
   * Events are emitted in order before returning the result.
   * Default: [] (no events emitted).
   */
  events?: AgentEvent[];
}

/**
 * FakeAgentAdapter is a test double for IAgentAdapter that captures all method calls
 * and provides configurable responses and assertion helpers for testing.
 *
 * Per DYK-02: Stateless internally - tracks call history but not session state.
 * Per DYK-01: All methods return Promise<T> following async interface pattern.
 *
 * Usage:
 * ```typescript
 * const fake = new FakeAgentAdapter({
 *   sessionId: 'test-session',
 *   tokens: { used: 100, total: 500, limit: 200000 }
 * });
 *
 * const result = await fake.run({ prompt: 'test' });
 * expect(result.sessionId).toBe('test-session');
 *
 * fake.assertRunCalled({ prompt: 'test' });
 * ```
 */
type ResolvedOptions = Required<
  Omit<FakeAgentAdapterOptions, 'runDuration' | 'stderr' | 'events'>
> & {
  stderr?: string;
};

export class FakeAgentAdapter implements IAgentAdapter {
  private readonly _options: ResolvedOptions;
  private readonly _runDuration: number;
  private _events: AgentEvent[];
  private _runHistory: AgentRunOptions[] = [];
  private _terminateHistory: string[] = [];
  private _compactHistory: string[] = [];

  constructor(options: FakeAgentAdapterOptions = {}) {
    this._options = {
      sessionId: options.sessionId ?? `fake-session-${Date.now()}`,
      output: options.output ?? '',
      status: options.status ?? 'completed',
      exitCode: options.exitCode ?? 0,
      stderr: options.stderr,
      tokens: options.tokens === undefined ? { used: 0, total: 0, limit: 200000 } : options.tokens,
    };
    this._runDuration = options.runDuration ?? 0;
    this._events = options.events ?? [];
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    this._runHistory.push({ ...options });

    // Per Phase 5 DYK-03: Simulate slow run() for timeout testing
    if (this._runDuration > 0) {
      await new Promise((resolve) => setTimeout(resolve, this._runDuration));
    }

    // Per Phase 2: Emit configured events via onEvent callback
    if (options.onEvent && this._events.length > 0) {
      for (const event of this._events) {
        options.onEvent(event);
      }
    }

    // If sessionId was provided in options, use it (session resumption)
    const sessionId = options.sessionId ?? this._options.sessionId;

    return {
      output: this._options.output,
      sessionId,
      status: this._options.status,
      exitCode: this._options.exitCode,
      stderr: this._options.stderr,
      tokens: this._options.tokens,
    };
  }

  async compact(sessionId: string): Promise<AgentResult> {
    this._compactHistory.push(sessionId);

    return {
      output: '',
      sessionId,
      status: 'completed',
      exitCode: 0,
      tokens: this._options.tokens ?? null,
    };
  }

  async terminate(sessionId: string): Promise<AgentResult> {
    this._terminateHistory.push(sessionId);

    return {
      output: '',
      sessionId,
      status: 'killed',
      exitCode: 143, // SIGTERM exit code
      tokens: this._options.tokens ?? null,
    };
  }

  // ============================================
  // Test helper methods
  // ============================================

  /**
   * Get all run() calls made to this adapter.
   */
  getRunHistory(): AgentRunOptions[] {
    return [...this._runHistory];
  }

  /**
   * Get all session IDs passed to terminate().
   */
  getTerminateHistory(): string[] {
    return [...this._terminateHistory];
  }

  /**
   * Get all session IDs passed to compact().
   */
  getCompactHistory(): string[] {
    return [...this._compactHistory];
  }

  /**
   * Assert that run() was called with matching options.
   * Uses partial matching - all specified fields must match.
   *
   * @throws Error if no matching call found
   */
  assertRunCalled(expected: Partial<AgentRunOptions>): void {
    const match = this._runHistory.some((call) => {
      return Object.entries(expected).every(([key, value]) => {
        return call[key as keyof AgentRunOptions] === value;
      });
    });

    if (!match) {
      const history =
        this._runHistory.length === 0
          ? '(no calls)'
          : this._runHistory.map((c) => JSON.stringify(c)).join('\n  ');

      throw new Error(
        `Expected run() to be called with ${JSON.stringify(expected)}\n` +
          `Actual calls:\n  ${history}`
      );
    }
  }

  /**
   * Assert that terminate() was called with the specified session ID.
   *
   * @throws Error if terminate was not called with that session ID
   */
  assertTerminateCalled(sessionId: string): void {
    if (!this._terminateHistory.includes(sessionId)) {
      const history =
        this._terminateHistory.length === 0 ? '(no calls)' : this._terminateHistory.join(', ');

      throw new Error(
        `Expected terminate() to be called with sessionId "${sessionId}"\n` +
          `Actual terminate calls: ${history}`
      );
    }
  }

  /**
   * Assert that compact() was called with the specified session ID.
   *
   * @throws Error if compact was not called with that session ID
   */
  assertCompactCalled(sessionId: string): void {
    if (!this._compactHistory.includes(sessionId)) {
      const history =
        this._compactHistory.length === 0 ? '(no calls)' : this._compactHistory.join(', ');

      throw new Error(
        `Expected compact() to be called with sessionId "${sessionId}"\n` +
          `Actual compact calls: ${history}`
      );
    }
  }

  /**
   * Clear all call history.
   * Useful for test isolation between test cases.
   */
  reset(): void {
    this._runHistory = [];
    this._terminateHistory = [];
    this._compactHistory = [];
  }

  // ============================================
  // Phase 2: Tool event helper methods
  // ============================================

  /**
   * Configure events to emit on next run() call.
   * Per Phase 2: Enables testing tool_call, tool_result, thinking events.
   *
   * @param events Events to emit via onEvent callback
   */
  setEvents(events: AgentEvent[]): void {
    this._events = [...events];
  }

  /**
   * Add a single event to the event queue.
   * Per Phase 2: Convenience method for building event sequences.
   *
   * @param event Event to add to queue
   */
  addEvent(event: AgentEvent): void {
    this._events.push(event);
  }

  /**
   * Clear all configured events.
   */
  clearEvents(): void {
    this._events = [];
  }

  /**
   * Get currently configured events.
   */
  getEvents(): AgentEvent[] {
    return [...this._events];
  }

  /**
   * Emit a tool_call event on next run().
   * Per Phase 2: Convenience method for common test pattern.
   *
   * @param toolName Name of the tool (e.g., 'Bash', 'Read')
   * @param input Tool input parameters
   * @param toolCallId Unique identifier for correlating with tool_result
   */
  emitToolCall(toolName: string, input: unknown, toolCallId: string): void {
    this._events.push({
      type: 'tool_call',
      timestamp: new Date().toISOString(),
      data: { toolName, input, toolCallId },
    });
  }

  /**
   * Emit a tool_result event on next run().
   * Per Phase 2: Convenience method for common test pattern.
   *
   * @param toolCallId Links to prior tool_call event
   * @param output Tool execution output
   * @param isError True if tool execution failed
   */
  emitToolResult(toolCallId: string, output: string, isError = false): void {
    this._events.push({
      type: 'tool_result',
      timestamp: new Date().toISOString(),
      data: { toolCallId, output, isError },
    });
  }

  /**
   * Emit a thinking event on next run().
   * Per Phase 2: Convenience method for common test pattern.
   *
   * @param content Thinking/reasoning content
   * @param signature Optional cryptographic signature (Claude extended thinking)
   */
  emitThinking(content: string, signature?: string): void {
    this._events.push({
      type: 'thinking',
      timestamp: new Date().toISOString(),
      data: { content, signature },
    });
  }
}
