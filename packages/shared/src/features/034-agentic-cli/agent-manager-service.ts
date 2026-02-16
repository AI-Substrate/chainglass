/**
 * Plan 034: Agentic CLI — AgentManagerService Implementation
 *
 * Central registry for agent instances. Provides two creation paths
 * (getNew / getWithSessionId) and a session index with a same-instance
 * guarantee. Constructor accepts only AdapterFactory (AC-21).
 */

import type { IAgentInstance } from './agent-instance.interface.js';
import { AgentInstance } from './agent-instance.js';
import type { IAgentManagerService } from './agent-manager-service.interface.js';
import type {
  AdapterFactory,
  AgentFilter,
  AgentInstanceConfig,
  CreateAgentParams,
} from './types.js';

let _counter = 0;
function generateId(): string {
  return `agent-${Date.now()}-${++_counter}`;
}

export class AgentManagerService implements IAgentManagerService {
  private readonly _adapterFactory: AdapterFactory;
  private readonly _agents = new Map<string, AgentInstance>();
  private readonly _sessionIndex = new Map<string, AgentInstance>();

  constructor(adapterFactory: AdapterFactory) {
    this._adapterFactory = adapterFactory;
  }

  getNew(params: CreateAgentParams): IAgentInstance {
    const id = generateId();
    const adapter = this._adapterFactory(params.type);

    const config: AgentInstanceConfig = {
      id,
      name: params.name,
      type: params.type,
      workspace: params.workspace,
      metadata: params.metadata,
    };

    const instance = new AgentInstance(config, adapter, (sessionId: string) => {
      this._sessionIndex.set(sessionId, instance);
    });

    this._agents.set(id, instance);
    return instance;
  }

  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance {
    const existing = this._sessionIndex.get(sessionId);
    if (existing) {
      return existing;
    }

    const id = generateId();
    const adapter = this._adapterFactory(params.type);

    const config: AgentInstanceConfig = {
      id,
      name: params.name,
      type: params.type,
      workspace: params.workspace,
      sessionId,
      metadata: params.metadata,
    };

    const instance = new AgentInstance(config, adapter);
    this._agents.set(id, instance);
    this._sessionIndex.set(sessionId, instance);
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
    // No-op in base implementation. Subclasses may load persisted state.
  }
}
