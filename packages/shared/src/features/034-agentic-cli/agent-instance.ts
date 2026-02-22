/**
 * Plan 034: Agentic CLI — AgentInstance Implementation
 *
 * Domain-agnostic agent session wrapper. Delegates to IAgentAdapter for
 * actual agent interaction. Owns identity, status, session, metadata,
 * and event handler dispatch.
 */

import type { IAgentAdapter } from '../../interfaces/agent-adapter.interface.js';
import type {
  AgentRunOptions as AdapterRunOptions,
  AgentEvent,
  AgentResult,
} from '../../interfaces/agent-types.js';
import type { IAgentInstance } from './agent-instance.interface.js';
import type {
  AgentCompactOptions,
  AgentEventHandler,
  AgentInstanceConfig,
  AgentInstanceStatus,
  AgentRunOptions,
  AgentType,
} from './types.js';

export class AgentInstance implements IAgentInstance {
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;
  readonly workspace: string;
  readonly createdAt: Date;

  private _status: AgentInstanceStatus = 'stopped';
  private _sessionId: string | null;
  private _updatedAt: Date;
  private _metadata: Record<string, unknown>;
  private readonly _adapter: IAgentAdapter;
  private readonly _handlers = new Set<AgentEventHandler>();
  private readonly _onSessionAcquired?: (sessionId: string) => void;

  constructor(
    config: AgentInstanceConfig,
    adapter: IAgentAdapter,
    onSessionAcquired?: (sessionId: string) => void
  ) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.workspace = config.workspace;
    this._sessionId = config.sessionId ?? null;
    this._metadata = { ...(config.metadata ?? {}) };
    this._adapter = adapter;
    this._onSessionAcquired = onSessionAcquired;
    this.createdAt = new Date();
    this._updatedAt = this.createdAt;
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

    this._status = 'working';
    this._updatedAt = new Date();

    try {
      const adapterOptions: AdapterRunOptions = {
        prompt: options.prompt,
        sessionId: this._sessionId ?? undefined,
        cwd: options.cwd,
        onEvent: (event: AgentEvent) => this._dispatch(event, options.onEvent),
      };

      const result = await this._adapter.run(adapterOptions);

      const hadNoSession = this._sessionId === null;
      this._sessionId = result.sessionId;
      this._status = 'stopped';
      this._updatedAt = new Date();

      if (hadNoSession && this._sessionId && this._onSessionAcquired) {
        this._onSessionAcquired(this._sessionId);
      }

      return result;
    } catch (error) {
      this._status = 'error';
      this._updatedAt = new Date();
      throw error;
    }
  }

  async compact(options?: AgentCompactOptions): Promise<AgentResult> {
    void options; // timeoutMs enforcement deferred to Phase 3 CLI handler

    if (this._sessionId === null) {
      throw new Error('No session to compact');
    }
    if (this._status === 'working') {
      throw new Error('Agent is already running');
    }

    this._status = 'working';
    this._updatedAt = new Date();

    try {
      const result = await this._adapter.compact(this._sessionId);

      this._status = 'stopped';
      this._updatedAt = new Date();

      if (result.tokens) {
        this.setMetadata('tokens', result.tokens);
      }

      return result;
    } catch (error) {
      this._status = 'error';
      this._updatedAt = new Date();
      throw error;
    }
  }

  async terminate(): Promise<AgentResult> {
    if (this._sessionId === null) {
      this._status = 'stopped';
      this._updatedAt = new Date();
      return {
        output: '',
        sessionId: '',
        status: 'killed',
        exitCode: 0,
        tokens: null,
      };
    }

    try {
      const result = await this._adapter.terminate(this._sessionId);
      return result;
    } finally {
      this._status = 'stopped';
      this._updatedAt = new Date();
    }
  }

  private _dispatch(event: AgentEvent, perRunHandler?: (event: AgentEvent) => void): void {
    for (const handler of this._handlers) {
      try {
        handler(event);
      } catch {
        // A handler throwing must not break other handlers (AC-07 robustness)
      }
    }
    if (perRunHandler) {
      try {
        perRunHandler(event);
      } catch {
        // Per-run handler throwing must not break the run
      }
    }
  }
}
