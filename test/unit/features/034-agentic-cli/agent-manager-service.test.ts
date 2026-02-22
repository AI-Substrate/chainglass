import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAgentAdapter } from '../../../../packages/shared/src/fakes/fake-agent-adapter.js';
import { AgentManagerService } from '../../../../packages/shared/src/features/034-agentic-cli/agent-manager-service.js';
import type { AdapterFactory } from '../../../../packages/shared/src/features/034-agentic-cli/types.js';

describe('AgentManagerService', () => {
  const defaultParams = {
    name: 'test-agent',
    type: 'claude-code' as const,
    workspace: '/tmp/test',
  };

  let manager: AgentManagerService;
  let adapterFactory: AdapterFactory;
  let lastAdapter: FakeAgentAdapter;

  beforeEach(() => {
    adapterFactory = () => {
      lastAdapter = new FakeAgentAdapter({ sessionId: 'ses-1', status: 'completed' });
      return lastAdapter;
    };
    manager = new AgentManagerService(adapterFactory);
  });

  // ── getNew (AC-14) ───────────────────────────────────

  it('getNew creates instance with null sessionId', () => {
    const instance = manager.getNew(defaultParams);
    expect(instance.sessionId).toBeNull();
    expect(instance.name).toBe('test-agent');
    expect(instance.type).toBe('claude-code');
    expect(instance.workspace).toBe('/tmp/test');
  });

  it('getNew generates unique IDs', () => {
    const a = manager.getNew(defaultParams);
    const b = manager.getNew(defaultParams);
    expect(a.id).not.toBe(b.id);
  });

  // ── getWithSessionId (AC-15, AC-16, AC-17) ──────────

  it('getWithSessionId creates instance with pre-set sessionId', () => {
    const instance = manager.getWithSessionId('ses-existing', defaultParams);
    expect(instance.sessionId).toBe('ses-existing');
  });

  it('getWithSessionId same session returns same object (AC-16)', () => {
    const a = manager.getWithSessionId('ses-1', defaultParams);
    const b = manager.getWithSessionId('ses-1', defaultParams);
    expect(a).toBe(b); // === equality
  });

  it('getWithSessionId different session returns different object (AC-17)', () => {
    const a = manager.getWithSessionId('ses-1', defaultParams);
    const b = manager.getWithSessionId('ses-2', defaultParams);
    expect(a).not.toBe(b);
  });

  // ── getAgent (AC-18) ─────────────────────────────────

  it('getAgent returns instance by ID', () => {
    const instance = manager.getNew(defaultParams);
    const found = manager.getAgent(instance.id);
    expect(found).toBe(instance);
  });

  it('getAgent returns null for unknown ID', () => {
    expect(manager.getAgent('nonexistent')).toBeNull();
  });

  // ── getAgents (AC-19) ────────────────────────────────

  it('getAgents returns all agents', () => {
    manager.getNew(defaultParams);
    manager.getNew(defaultParams);
    expect(manager.getAgents()).toHaveLength(2);
  });

  it('getAgents filters by type', () => {
    manager.getNew({ ...defaultParams, type: 'claude-code' });
    manager.getNew({ ...defaultParams, type: 'copilot' });
    const claudeOnly = manager.getAgents({ type: 'claude-code' });
    expect(claudeOnly).toHaveLength(1);
    expect(claudeOnly[0]?.type).toBe('claude-code');
  });

  it('getAgents filters by workspace', () => {
    manager.getNew({ ...defaultParams, workspace: '/a' });
    manager.getNew({ ...defaultParams, workspace: '/b' });
    const aOnly = manager.getAgents({ workspace: '/a' });
    expect(aOnly).toHaveLength(1);
    expect(aOnly[0]?.workspace).toBe('/a');
  });

  // ── terminateAgent (AC-20) ───────────────────────────

  it('terminateAgent removes from agents map', async () => {
    const instance = manager.getNew(defaultParams);
    const result = await manager.terminateAgent(instance.id);
    expect(result).toBe(true);
    expect(manager.getAgent(instance.id)).toBeNull();
  });

  it('terminateAgent removes from session index', async () => {
    const instance = manager.getWithSessionId('ses-remove', defaultParams);
    await manager.terminateAgent(instance.id);
    // Creating with same session should give a NEW instance (old one removed)
    const fresh = manager.getWithSessionId('ses-remove', defaultParams);
    expect(fresh).not.toBe(instance);
  });

  it('terminateAgent returns false for unknown ID', async () => {
    const result = await manager.terminateAgent('nonexistent');
    expect(result).toBe(false);
  });

  // ── Session index update after run (AC-22) ───────────

  it('session index updated when getNew instance acquires sessionId after run', async () => {
    const instance = manager.getNew(defaultParams);
    expect(instance.sessionId).toBeNull();

    await instance.run({ prompt: 'hello' });
    expect(instance.sessionId).toBe('ses-1');

    // Now getWithSessionId should return the same instance
    const same = manager.getWithSessionId('ses-1', defaultParams);
    expect(same).toBe(instance);
  });

  // ── initialize ───────────────────────────────────────

  it('initialize is a no-op', async () => {
    await expect(manager.initialize()).resolves.toBeUndefined();
  });
});
