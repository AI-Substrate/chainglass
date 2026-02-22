/**
 * Plan 034: Agentic CLI — FakeAgentManagerService
 *
 * Test double implementing IAgentManagerService with same-instance
 * guarantee and test helpers. Uses FakeAgentInstance internally.
 */

import type { IAgentInstance } from '../agent-instance.interface.js';
import type { IAgentManagerService } from '../agent-manager-service.interface.js';
import type { AgentFilter, AgentInstanceConfig, CreateAgentParams } from '../types.js';
import { FakeAgentInstance } from './fake-agent-instance.js';
import type { FakeAgentInstanceOptions } from './fake-agent-instance.js';

let _fakeCounter = 0;

export interface FakeAgentManagerServiceOptions {
  /** Default options for FakeAgentInstance created by this manager */
  defaultInstanceOptions?: FakeAgentInstanceOptions;
}

export class FakeAgentManagerService implements IAgentManagerService {
  private readonly _agents = new Map<string, FakeAgentInstance>();
  private readonly _sessionIndex = new Map<string, FakeAgentInstance>();
  private readonly _createdAgents: FakeAgentInstance[] = [];
  private readonly _defaultInstanceOptions: FakeAgentInstanceOptions;

  constructor(options: FakeAgentManagerServiceOptions = {}) {
    this._defaultInstanceOptions = options.defaultInstanceOptions ?? {};
  }

  getNew(params: CreateAgentParams): IAgentInstance {
    const id = `fake-agent-${Date.now()}-${++_fakeCounter}`;

    const config: AgentInstanceConfig = {
      id,
      name: params.name,
      type: params.type,
      workspace: params.workspace,
      metadata: params.metadata,
    };

    const instance = new FakeAgentInstance(config, this._defaultInstanceOptions);
    this._agents.set(id, instance);
    this._createdAgents.push(instance);
    return instance;
  }

  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance {
    const existing = this._sessionIndex.get(sessionId);
    if (existing) {
      return existing;
    }

    const id = `fake-agent-${Date.now()}-${++_fakeCounter}`;

    const config: AgentInstanceConfig = {
      id,
      name: params.name,
      type: params.type,
      workspace: params.workspace,
      sessionId,
      metadata: params.metadata,
    };

    const instance = new FakeAgentInstance(config, this._defaultInstanceOptions);
    this._agents.set(id, instance);
    this._sessionIndex.set(sessionId, instance);
    this._createdAgents.push(instance);
    return instance;
  }

  getAgent(agentId: string): IAgentInstance | null {
    return this._agents.get(agentId) ?? null;
  }

  getAgents(filter?: AgentFilter): IAgentInstance[] {
    const all = Array.from(this._agents.values());
    if (!filter) return all;

    return all.filter((agent) => {
      if (filter.type && agent.type !== filter.type) return false;
      if (filter.workspace && agent.workspace !== filter.workspace) return false;
      return true;
    });
  }

  async terminateAgent(agentId: string): Promise<boolean> {
    const instance = this._agents.get(agentId);
    if (!instance) return false;

    await instance.terminate();

    this._agents.delete(agentId);
    if (instance.sessionId) {
      this._sessionIndex.delete(instance.sessionId);
    }

    return true;
  }

  async initialize(): Promise<void> {
    // No-op
  }

  // ── Test Helpers ────────────────────────────────────

  /** Pre-populate with an existing agent instance */
  addAgent(instance: FakeAgentInstance): void {
    this._agents.set(instance.id, instance);
    if (instance.sessionId) {
      this._sessionIndex.set(instance.sessionId, instance);
    }
  }

  /** Get all agents created via getNew/getWithSessionId */
  getCreatedAgents(): FakeAgentInstance[] {
    return [...this._createdAgents];
  }

  /** Clear all state */
  reset(): void {
    this._agents.clear();
    this._sessionIndex.clear();
    this._createdAgents.length = 0;
  }
}
