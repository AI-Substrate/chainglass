/**
 * Plan 019: Agent Manager Refactor - Fake Agent Instance
 *
 * Test double for IAgentInstance with state control and assertion helpers.
 *
 * Per AC-27: Provides test helpers for status control, event setup, and assertions.
 * Per DYK-03: Composes FakeAgentAdapter internally for consistent test behavior.
 * Per DYK-05: Used in contract tests alongside real implementation.
 * Per DYK-10: Accepts optional notifier (falls back to no-op for Phase 1 test compatibility).
 */

import { FakeAgentAdapter } from '../../fakes/fake-agent-adapter.js';
import type { AgentEvent, AgentResult } from '../../interfaces/index.js';
import type {
  AdapterFactory,
  AgentInstanceStatus,
  AgentRunOptions,
  AgentStoredEvent,
  AgentType,
  GetEventsOptions,
  IAgentInstance,
} from './agent-instance.interface.js';
import type { IAgentNotifierService } from './agent-notifier.interface.js';

/**
 * No-op notifier for backward compatibility with Phase 1 tests.
 * Per DYK-10: FakeAgentInstance uses this when no notifier is provided.
 */
const noopNotifier: IAgentNotifierService = {
  broadcastStatus: () => {},
  broadcastIntent: () => {},
  broadcastEvent: () => {},
};

/**
 * Configuration options for FakeAgentInstance.
 */
export interface FakeAgentInstanceOptions {
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Agent type */
  type: AgentType;
  /** Workspace path */
  workspace: string;
  /** Initial status (default: 'stopped') */
  status?: AgentInstanceStatus;
  /** Initial intent (default: '') */
  intent?: string;
  /** Initial sessionId (default: null) */
  sessionId?: string | null;
  /** Initial events (default: []) */
  events?: AgentStoredEvent[];
  /** Created timestamp (default: new Date()) */
  createdAt?: Date;
  /** Updated timestamp (default: new Date()) */
  updatedAt?: Date;
  /** Optional notifier for SSE broadcasting (default: no-op) */
  notifier?: IAgentNotifierService;
}

/**
 * Recorded run call for assertions.
 */
export interface RecordedRunCall {
  options: AgentRunOptions;
  timestamp: Date;
}

/**
 * FakeAgentInstance is a test double that implements IAgentInstance
 * with additional helpers for test setup and assertions.
 *
 * Per DYK-03: Composes FakeAgentAdapter internally for consistent test behavior.
 *
 * Usage:
 * ```typescript
 * const fake = new FakeAgentInstance({
 *   id: 'agent-1',
 *   name: 'test',
 *   type: 'claude-code',
 *   workspace: '/workspace',
 * });
 *
 * // Control status for double-run tests
 * fake.setStatus('working');
 *
 * // Pre-populate events
 * fake.setEvents([{ type: 'text_delta', ... }]);
 *
 * // Use as IAgentInstance
 * await fake.run({ prompt: 'test' });
 *
 * // Assert behavior
 * fake.assertRunCalled({ prompt: 'test' });
 * ```
 */
export class FakeAgentInstance implements IAgentInstance {
  // ===== Properties (IAgentInstance) =====
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;

  private _status: AgentInstanceStatus;
  private _intent: string;
  private _sessionId: string | null;
  private _events: AgentStoredEvent[];
  private _createdAt: Date;
  private _updatedAt: Date;

  // Per DYK-03: Internal FakeAgentAdapter for consistent behavior
  private readonly _adapter: FakeAgentAdapter;

  // Per DYK-10: Notifier for SSE broadcasting (may be no-op)
  private readonly _notifier: IAgentNotifierService;

  // Test tracking
  private _runCalls: RecordedRunCall[] = [];
  private _terminateCalls: Date[] = [];
  private _runError: Error | null = null;
  private _eventIdCounter = 0;

  constructor(options: FakeAgentInstanceOptions) {
    this.id = options.id;
    this.name = options.name;
    this.type = options.type;
    this.workspace = options.workspace;
    this._status = options.status ?? 'stopped';
    this._intent = options.intent ?? '';
    this._sessionId = options.sessionId ?? null;
    this._events = options.events ?? [];
    this._createdAt = options.createdAt ?? new Date();
    this._updatedAt = options.updatedAt ?? new Date();
    this._notifier = options.notifier ?? noopNotifier;

    // Create internal fake adapter
    this._adapter = new FakeAgentAdapter({
      sessionId: `fake-session-${this.id}`,
      output: '',
      status: 'completed',
    });
  }

  // ===== Property Getters =====

  get status(): AgentInstanceStatus {
    return this._status;
  }

  get intent(): string {
    return this._intent;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get createdAt(): Date {
    return this._createdAt;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  // ===== IAgentInstance Methods =====

  async run(options: AgentRunOptions): Promise<AgentResult> {
    // Check for injected error
    if (this._runError) {
      throw this._runError;
    }

    // Per AC-07a: Guard against double-run
    if (this._status === 'working') {
      throw new Error('Agent is already running');
    }

    // Record the call
    this._runCalls.push({ options, timestamp: new Date() });

    // Update status
    this._status = 'working';
    this._updatedAt = new Date();

    // Delegate to internal adapter
    const result = await this._adapter.run({
      prompt: options.prompt,
      sessionId: this._sessionId ?? undefined,
      cwd: options.cwd,
      onEvent: (event) => {
        // Capture events with unique IDs
        const storedEvent: AgentStoredEvent = {
          ...event,
          eventId: `evt-${++this._eventIdCounter}`,
        };
        this._events.push(storedEvent);
      },
    });

    // Update state from result
    this._sessionId = result.sessionId;
    this._status = result.status === 'failed' ? 'error' : 'stopped';
    this._updatedAt = new Date();

    return result;
  }

  async terminate(): Promise<AgentResult> {
    this._terminateCalls.push(new Date());

    // If we have a session, terminate via adapter
    if (this._sessionId) {
      const result = await this._adapter.terminate(this._sessionId);
      this._status = 'stopped';
      this._updatedAt = new Date();
      return result;
    }

    // No session - just update status
    this._status = 'stopped';
    this._updatedAt = new Date();

    return {
      output: '',
      sessionId: '',
      status: 'killed',
      exitCode: 143,
      tokens: null,
    };
  }

  getEvents(options?: GetEventsOptions): AgentStoredEvent[] {
    if (!options?.sinceId) {
      return [...this._events];
    }

    // Find index of sinceId and return events after it
    const sinceIndex = this._events.findIndex((e) => e.eventId === options.sinceId);
    if (sinceIndex === -1) {
      return [...this._events]; // sinceId not found, return all
    }

    return this._events.slice(sinceIndex + 1);
  }

  setIntent(intent: string): void {
    this._intent = intent;
    this._updatedAt = new Date();
  }

  // ===== Test Helpers =====

  /**
   * Set the agent status directly.
   * Useful for testing double-run guard.
   */
  setStatus(status: AgentInstanceStatus): void {
    this._status = status;
  }

  /**
   * Set events directly.
   * Useful for testing getEvents behavior.
   */
  setEvents(events: AgentStoredEvent[]): void {
    this._events = [...events];
  }

  /**
   * Add a single event.
   */
  addEvent(event: AgentEvent): void {
    const storedEvent: AgentStoredEvent = {
      ...event,
      eventId: `evt-${++this._eventIdCounter}`,
    };
    this._events.push(storedEvent);
  }

  /**
   * Set error to be thrown on next run() call.
   */
  setRunError(error: Error | null): void {
    this._runError = error;
  }

  /**
   * Assert that run() was called with matching options.
   *
   * @throws Error if no matching call found
   */
  assertRunCalled(expected: Partial<AgentRunOptions>): void {
    const match = this._runCalls.some((call) => {
      return Object.entries(expected).every(([key, value]) => {
        return call.options[key as keyof AgentRunOptions] === value;
      });
    });

    if (!match) {
      const history =
        this._runCalls.length === 0
          ? '(no calls)'
          : this._runCalls.map((c) => JSON.stringify(c.options)).join('\n  ');

      throw new Error(
        `Expected run() to be called with ${JSON.stringify(expected)}\n` +
          `Actual calls:\n  ${history}`
      );
    }
  }

  /**
   * Assert that terminate() was called.
   *
   * @throws Error if terminate was not called
   */
  assertTerminateCalled(): void {
    if (this._terminateCalls.length === 0) {
      throw new Error('Expected terminate() to be called, but it was not');
    }
  }

  /**
   * Get all recorded run() calls.
   */
  getRunCalls(): RecordedRunCall[] {
    return [...this._runCalls];
  }

  /**
   * Get terminate call count.
   */
  getTerminateCallCount(): number {
    return this._terminateCalls.length;
  }

  /**
   * Clear all call history.
   */
  reset(): void {
    this._runCalls = [];
    this._terminateCalls = [];
    this._runError = null;
    this._events = [];
    this._eventIdCounter = 0;
  }

  /**
   * Configure the internal FakeAgentAdapter.
   * Useful for customizing run() return values.
   */
  configureAdapter(options: {
    output?: string;
    sessionId?: string;
    status?: 'completed' | 'failed' | 'killed';
    events?: AgentEvent[];
  }): void {
    if (options.events) {
      this._adapter.setEvents(options.events);
    }
    // Note: FakeAgentAdapter is created at construction, so we can't easily
    // change output/sessionId/status after construction. For those, tests
    // should create a new FakeAgentInstance with the desired configuration.
  }
}
