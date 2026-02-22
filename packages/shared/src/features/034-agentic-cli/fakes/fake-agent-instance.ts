/**
 * Plan 034: Agentic CLI — FakeAgentInstance
 *
 * Test double implementing IAgentInstance with full lifecycle simulation
 * and test helpers. Enforces the same guards as the real AgentInstance
 * (double-run, compact guards) so contract tests are meaningful.
 */

import type { AgentResult } from '../../../interfaces/agent-types.js';
import type { IAgentInstance } from '../agent-instance.interface.js';
import type {
  AgentCompactOptions,
  AgentEventHandler,
  AgentInstanceConfig,
  AgentInstanceStatus,
  AgentRunOptions,
  AgentType,
} from '../types.js';

export interface FakeAgentInstanceOptions {
  /** Override initial status (default: 'stopped') */
  initialStatus?: AgentInstanceStatus;
  /** Result to return from run() */
  runResult?: AgentResult;
  /** Result to return from compact() */
  compactResult?: AgentResult;
  /** Events to emit during run() */
  events?: Array<{ type: string; timestamp: string; data: unknown }>;
  /** Callback invoked during run() before returning — enables graph state mutation in integration tests */
  onRun?: (options: AgentRunOptions) => Promise<void>;
}

const DEFAULT_RUN_RESULT: AgentResult = {
  output: 'fake output',
  sessionId: 'fake-session-1',
  status: 'completed',
  exitCode: 0,
  tokens: null,
};

const DEFAULT_COMPACT_RESULT: AgentResult = {
  output: '',
  sessionId: 'fake-session-1',
  status: 'completed',
  exitCode: 0,
  tokens: { used: 50, total: 100, limit: 200000 },
};

export class FakeAgentInstance implements IAgentInstance {
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;
  readonly createdAt: Date;

  private _status: AgentInstanceStatus;
  private _sessionId: string | null;
  private _updatedAt: Date;
  private _metadata: Record<string, unknown>;
  private readonly _handlers = new Set<AgentEventHandler>();

  private _runResult: AgentResult;
  private _compactResult: AgentResult;
  private _events: Array<{ type: string; timestamp: string; data: unknown }>;
  private _onRun?: (options: AgentRunOptions) => Promise<void>;
  private _runHistory: AgentRunOptions[] = [];
  private _compactHistory: Array<AgentCompactOptions | undefined> = [];
  private _terminateCount = 0;

  constructor(config: AgentInstanceConfig, options: FakeAgentInstanceOptions = {}) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.workspace = config.workspace;
    this._sessionId = config.sessionId ?? null;
    this._metadata = { ...(config.metadata ?? {}) };
    this._status = options.initialStatus ?? 'stopped';
    this.createdAt = new Date();
    this._updatedAt = this.createdAt;
    this._runResult = options.runResult ?? { ...DEFAULT_RUN_RESULT };
    this._compactResult = options.compactResult ?? { ...DEFAULT_COMPACT_RESULT };
    this._events = options.events ?? [];
    this._onRun = options.onRun;
  }

  get status(): AgentInstanceStatus {
    return this._status;
  }

  get isRunning(): boolean {
    return this._status === 'working';
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return this._metadata;
  }

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
    this._updatedAt = new Date();
  }

  addEventHandler(handler: AgentEventHandler): void {
    this._handlers.add(handler);
  }

  removeEventHandler(handler: AgentEventHandler): void {
    this._handlers.delete(handler);
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    if (this._status === 'working') {
      throw new Error('Agent is already running');
    }

    this._runHistory.push({ ...options });
    this._status = 'working';
    this._updatedAt = new Date();

    // Emit configured events
    for (const event of this._events) {
      for (const handler of this._handlers) {
        try {
          handler(event as never);
        } catch {
          // handler errors don't break dispatch
        }
      }
      if (options.onEvent) {
        try {
          options.onEvent(event as never);
        } catch {
          // per-run handler errors don't break run
        }
      }
    }

    // Execute onRun callback (enables graph state mutation in integration tests)
    if (this._onRun) {
      try {
        await this._onRun(options);
      } catch (err) {
        this._status = 'stopped';
        this._updatedAt = new Date();
        throw err;
      }
    }

    this._sessionId = this._runResult.sessionId;
    this._status = 'stopped';
    this._updatedAt = new Date();
    return { ...this._runResult };
  }

  async compact(options?: AgentCompactOptions): Promise<AgentResult> {
    if (this._sessionId === null) {
      throw new Error('No session to compact');
    }
    if (this._status === 'working') {
      throw new Error('Agent is already running');
    }

    this._compactHistory.push(options);
    this._status = 'working';
    this._updatedAt = new Date();

    if (this._compactResult.tokens) {
      this.setMetadata('tokens', this._compactResult.tokens);
    }

    this._status = 'stopped';
    this._updatedAt = new Date();
    return { ...this._compactResult };
  }

  async terminate(): Promise<AgentResult> {
    this._terminateCount++;
    this._status = 'stopped';
    this._updatedAt = new Date();
    return {
      output: '',
      sessionId: this._sessionId ?? '',
      status: 'killed',
      exitCode: 0,
      tokens: null,
    };
  }

  // ── Test Helpers ────────────────────────────────────

  setStatus(status: AgentInstanceStatus): void {
    this._status = status;
  }

  setSessionId(sessionId: string | null): void {
    this._sessionId = sessionId;
  }

  setNextRunResult(result: AgentResult): void {
    this._runResult = result;
  }

  setNextCompactResult(result: AgentResult): void {
    this._compactResult = result;
  }

  setEventsToEmit(events: Array<{ type: string; timestamp: string; data: unknown }>): void {
    this._events = events;
  }

  setOnRun(fn: ((options: AgentRunOptions) => Promise<void>) | undefined): void {
    this._onRun = fn;
  }

  getRunHistory(): AgentRunOptions[] {
    return [...this._runHistory];
  }

  getCompactHistory(): Array<AgentCompactOptions | undefined> {
    return [...this._compactHistory];
  }

  getTerminateCount(): number {
    return this._terminateCount;
  }

  assertRunCalled(expected?: Partial<AgentRunOptions>): void {
    if (this._runHistory.length === 0) {
      throw new Error('Expected run() to be called, but it was not');
    }
    if (expected) {
      const match = this._runHistory.some((call) =>
        Object.entries(expected).every(
          ([key, value]) => call[key as keyof AgentRunOptions] === value
        )
      );
      if (!match) {
        throw new Error(
          `Expected run() with ${JSON.stringify(expected)}, got: ${JSON.stringify(this._runHistory)}`
        );
      }
    }
  }

  assertCompactCalled(): void {
    if (this._compactHistory.length === 0) {
      throw new Error('Expected compact() to be called, but it was not');
    }
  }

  assertTerminateCalled(): void {
    if (this._terminateCount === 0) {
      throw new Error('Expected terminate() to be called, but it was not');
    }
  }

  reset(): void {
    this._runHistory = [];
    this._compactHistory = [];
    this._terminateCount = 0;
    this._status = 'stopped';
    this._sessionId = null;
    this._metadata = {};
    this._handlers.clear();
  }
}
