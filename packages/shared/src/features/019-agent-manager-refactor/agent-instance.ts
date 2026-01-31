/**
 * Plan 019: Agent Manager Refactor - Real Agent Instance
 *
 * Self-contained representation of a running agent.
 * Wraps IAgentAdapter, manages status transitions, intent, and event history.
 *
 * Per spec AC-06, AC-07, AC-07a, AC-08, AC-09, AC-10, AC-11, AC-12.
 * Per DYK-01: Receives adapterFactory at construction, not concrete adapter.
 * Per DYK-10: Receives notifier as required parameter (Phase 2).
 * Per DYK-09: Uses _setStatus() and _captureEvent() for storage-first pattern.
 * Per DYK-12: Storage is optional; no storage = in-memory only.
 * Per DYK-13: Static hydrate() factory for restoration from storage.
 * Per DYK-14: Eager load events at hydrate time.
 * Per DYK-15: Working→stopped on restart.
 * Per Critical Finding 02: Session state fragmented - AgentInstance becomes single source of truth.
 * Per Critical Finding 04: Race condition - status guard prevents double-run.
 */

import type { AgentEvent, AgentResult, IAgentAdapter } from '../../interfaces/index.js';
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
import type { IAgentStorageAdapter } from './agent-storage.interface.js';

/**
 * Configuration options for creating an AgentInstance.
 */
export interface AgentInstanceConfig {
  /** Unique agent identifier */
  id: string;
  /** Human-readable agent name */
  name: string;
  /** Agent type (determines adapter) */
  type: AgentType;
  /** Workspace path this agent is associated with */
  workspace: string;
}

/**
 * AgentInstance is the real implementation wrapping IAgentAdapter.
 *
 * Per DYK-01: Adapters are stateless; sessionId is stored by AgentInstance
 * and passed to adapter on each run().
 * Per DYK-10: Requires notifier for SSE broadcasting.
 * Per DYK-12: Storage is optional; no storage = in-memory only.
 * Per DYK-13: Use hydrate() factory for restoration.
 *
 * Usage:
 * ```typescript
 * const adapterFactory = (type) => new FakeAgentAdapter();
 * const notifier = new FakeAgentNotifierService();
 *
 * // Without storage (in-memory only)
 * const instance = new AgentInstance({
 *   id: 'agent-1',
 *   name: 'chat',
 *   type: 'claude-code',
 *   workspace: '/projects/myapp',
 * }, adapterFactory, notifier);
 *
 * // With storage (persistent)
 * const storage = new AgentStorageAdapter(fs, path, basePath);
 * const instance = new AgentInstance({...}, adapterFactory, notifier, storage);
 *
 * // Restore from storage
 * const restored = await AgentInstance.hydrate('agent-1', storage, adapterFactory, notifier);
 *
 * const result = await instance.run({ prompt: 'Hello' });
 * console.log(instance.sessionId); // Session persisted
 * ```
 */
export class AgentInstance implements IAgentInstance {
  // ===== Immutable Properties (from config) =====
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;

  // ===== Mutable State =====
  private _status: AgentInstanceStatus = 'stopped';
  private _intent = '';
  private _sessionId: string | null = null;
  private _events: AgentStoredEvent[] = [];
  private _createdAt: Date;
  private _updatedAt: Date;

  // ===== Adapter, Notifier & Storage =====
  private readonly _adapter: IAgentAdapter;
  private readonly _notifier: IAgentNotifierService;
  private readonly _storage: IAgentStorageAdapter | null;
  private _eventIdCounter = 0;

  /**
   * Create a new AgentInstance.
   *
   * @param config - Instance configuration (id, name, type, workspace)
   * @param adapterFactory - Factory function to create adapter based on type
   * @param notifier - Agent notifier for SSE broadcasting
   * @param storage - Optional storage adapter for persistence (per DYK-12)
   *
   * Per DYK-01: Factory is called immediately to get the adapter.
   * Per DYK-10: Notifier is required for SSE broadcasting.
   * Per DYK-12: Storage is optional.
   */
  constructor(
    config: AgentInstanceConfig,
    adapterFactory: AdapterFactory,
    notifier: IAgentNotifierService,
    storage?: IAgentStorageAdapter
  ) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.workspace = config.workspace;
    this._createdAt = new Date();
    this._updatedAt = new Date();
    this._notifier = notifier;
    this._storage = storage ?? null;

    // Create adapter via factory
    this._adapter = adapterFactory(config.type);
  }

  /**
   * Restore an AgentInstance from storage.
   *
   * Per DYK-13: Manager orchestrates, Instance owns restoration logic.
   * Per DYK-14: Eager load all events at hydrate time.
   * Per DYK-15: Working→stopped on restart.
   *
   * @param id - Agent ID to hydrate
   * @param storage - Storage adapter to read from
   * @param adapterFactory - Factory function to create adapter
   * @param notifier - Agent notifier for SSE broadcasting
   * @returns Hydrated AgentInstance or null if not found
   */
  static async hydrate(
    id: string,
    storage: IAgentStorageAdapter,
    adapterFactory: AdapterFactory,
    notifier: IAgentNotifierService
  ): Promise<AgentInstance | null> {
    // Load instance data from storage
    const data = await storage.loadInstance(id);
    if (!data) {
      return null;
    }

    // Create instance with storage
    const instance = new AgentInstance(
      {
        id: data.id,
        name: data.name,
        type: data.type as AgentType,
        workspace: data.workspace,
      },
      adapterFactory,
      notifier,
      storage
    );

    // Restore mutable state
    // Per DYK-15: Working→stopped on restart (can't resume adapter work)
    instance._status = data.status === 'working' ? 'stopped' : (data.status as AgentInstanceStatus);
    instance._intent = data.intent;
    instance._sessionId = data.sessionId;
    instance._createdAt = new Date(data.createdAt);
    instance._updatedAt = new Date(data.updatedAt);

    // Per DYK-14: Eager load all events
    const events = await storage.getEvents(id);
    instance._events = events;

    // Set event ID counter to avoid collisions
    if (events.length > 0) {
      // Extract numeric suffix from last event ID (format: agent-id-evt-N)
      const lastEventId = events[events.length - 1].eventId;
      const match = lastEventId.match(/-evt-(\d+)$/);
      if (match) {
        instance._eventIdCounter = Number.parseInt(match[1], 10);
      }
    }

    return instance;
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

  // ===== Private Helper Methods (Per DYK-09: Storage-First) =====

  /**
   * Set status and broadcast notification.
   * Per PL-01: Status is stored THEN broadcast (storage-first).
   */
  private _setStatus(status: AgentInstanceStatus): void {
    console.log(`[AgentInstance] Status change: ${this.id} ${this._status} → ${status}`);
    this._status = status;
    this._updatedAt = new Date();

    // Per PL-01: Persist BEFORE broadcast
    if (this._storage) {
      // Fire-and-forget - don't await (maintain sync behavior)
      this._persistInstance();
    }

    this._notifier.broadcastStatus(this.id, status);
  }

  /**
   * Capture event and broadcast notification.
   * Per PL-01: Event is stored THEN broadcast (storage-first).
   */
  private _captureEvent(event: AgentEvent): void {
    // Create stored event with unique ID
    const storedEvent: AgentStoredEvent = {
      ...event,
      eventId: `${this.id}-evt-${++this._eventIdCounter}`,
    };

    console.log(
      `[AgentInstance] Event captured: id=${storedEvent.eventId} type="${event.type}" data=${JSON.stringify(event.data).substring(0, 120)}`
    );

    // Storage first (in-memory)
    this._events.push(storedEvent);

    // Per PL-01: Persist BEFORE broadcast
    if (this._storage) {
      // Fire-and-forget - don't await
      this._storage.appendEvent(this.id, storedEvent).catch((err) => {
        console.error(`[AgentInstance] Failed to persist event ${storedEvent.eventId}:`, err);
      });
    }

    // Then broadcast
    this._notifier.broadcastEvent(this.id, storedEvent);
  }

  /**
   * Persist current instance state to storage.
   * Called from _setStatus and setIntent.
   */
  private async _persistInstance(): Promise<void> {
    if (!this._storage) return;

    try {
      await this._storage.saveInstance({
        id: this.id,
        name: this.name,
        type: this.type,
        workspace: this.workspace,
        status: this._status,
        intent: this._intent,
        sessionId: this._sessionId,
        createdAt: this._createdAt.toISOString(),
        updatedAt: this._updatedAt.toISOString(),
      });
    } catch (err) {
      console.error(`[AgentInstance] Failed to persist instance ${this.id}:`, err);
    }
  }

  // ===== IAgentInstance Methods =====

  /**
   * Run a prompt on this agent.
   *
   * Per AC-07: Uses IAgentAdapter for execution
   * Per AC-07a: Guards against double-run with synchronous status check
   * Per AC-08: Updates intent during execution
   *
   * @param options - Run options including prompt and optional cwd
   * @returns Promise resolving to AgentResult
   * @throws Error if agent is already running
   */
  async run(options: AgentRunOptions): Promise<AgentResult> {
    // Per Critical Finding 04: Synchronous status check BEFORE any async work
    if (this._status === 'working') {
      throw new Error('Agent is already running');
    }

    // Transition to working state (storage-first via _setStatus)
    this._setStatus('working');
    this._intent = options.prompt.substring(0, 100); // Use prompt as initial intent
    this._notifier.broadcastIntent(this.id, this._intent);

    console.log(
      `[AgentInstance] run() starting: id=${this.id} adapter=${this.type} sessionId=${this._sessionId ?? '(new)'} cwd=${options.cwd ?? '(none)'}`
    );

    // Capture user prompt as an event so it's part of the ordered event list
    this._captureEvent({
      type: 'user_prompt',
      timestamp: new Date().toISOString(),
      data: { content: options.prompt },
    });

    try {
      // Delegate to adapter with event capture
      const result = await this._adapter.run({
        prompt: options.prompt,
        sessionId: this._sessionId ?? undefined,
        cwd: options.cwd,
        onEvent: (event) => {
          // Per DYK-09: Use _captureEvent for storage-first pattern
          this._captureEvent(event);
        },
      });

      console.log(
        `[AgentInstance] run() finished: id=${this.id} result.status=${result.status} sessionId=${result.sessionId} events=${this._events.length}`
      );

      // Per AC-12: Store adapter sessionId for resumption
      this._sessionId = result.sessionId;

      // Transition to final state based on result (storage-first via _setStatus)
      const finalStatus: AgentInstanceStatus = result.status === 'failed' ? 'error' : 'stopped';
      this._setStatus(finalStatus);

      return result;
    } catch (error) {
      console.error(`[AgentInstance] run() ERROR: id=${this.id}`, error);
      // On error, transition to error state (storage-first via _setStatus)
      this._setStatus('error');
      throw error;
    }
  }

  /**
   * Terminate the running agent.
   *
   * Per AC-11: Delegates to adapter.terminate(sessionId)
   *
   * @returns Promise resolving to AgentResult with status='killed'
   */
  async terminate(): Promise<AgentResult> {
    // If we have a session, terminate via adapter
    if (this._sessionId) {
      const result = await this._adapter.terminate(this._sessionId);
      this._setStatus('stopped');
      return result;
    }

    // No session - just update status
    this._setStatus('stopped');

    return {
      output: '',
      sessionId: '',
      status: 'killed',
      exitCode: 143,
      tokens: null,
    };
  }

  /**
   * Get event history for this agent.
   *
   * Per AC-09: Provides event history
   * Per AC-10: Supports incremental event fetching via sinceId
   *
   * @param options - Optional filter for incremental fetching
   * @returns Array of events (all or since sinceId)
   */
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

  /**
   * Update the agent's intent.
   *
   * Per AC-08: Intent can be updated during execution
   *
   * @param intent - New intent string
   */
  setIntent(intent: string): void {
    this._intent = intent;
    this._updatedAt = new Date();

    // Per PL-01: Persist BEFORE broadcast
    if (this._storage) {
      this._persistInstance();
    }

    this._notifier.broadcastIntent(this.id, intent);
  }
}
