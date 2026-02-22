import { beforeEach, describe, expect, it } from 'vitest';
import { FakeAgentAdapter } from '../../../../packages/shared/src/fakes/fake-agent-adapter.js';
import { AgentInstance } from '../../../../packages/shared/src/features/034-agentic-cli/agent-instance.js';
import type { AgentEvent } from '../../../../packages/shared/src/interfaces/agent-types.js';

describe('AgentInstance', () => {
  const baseConfig = {
    id: 'test-1',
    name: 'test-agent',
    type: 'claude-code' as const,
    workspace: '/tmp/test',
  };

  let adapter: FakeAgentAdapter;
  let instance: AgentInstance;

  beforeEach(() => {
    adapter = new FakeAgentAdapter({ sessionId: 'ses-1', status: 'completed', output: 'done' });
    instance = new AgentInstance(baseConfig, adapter);
  });

  // ── Initial State (AC-03) ────────────────────────────

  it('starts with status stopped', () => {
    expect(instance.status).toBe('stopped');
    expect(instance.isRunning).toBe(false);
  });

  it('starts with null sessionId', () => {
    expect(instance.sessionId).toBeNull();
  });

  it('exposes identity from config', () => {
    expect(instance.id).toBe('test-1');
    expect(instance.name).toBe('test-agent');
    expect(instance.type).toBe('claude-code');
    expect(instance.workspace).toBe('/tmp/test');
  });

  it('initializes with config sessionId if provided', () => {
    const inst = new AgentInstance({ ...baseConfig, sessionId: 'pre-set' }, adapter);
    expect(inst.sessionId).toBe('pre-set');
  });

  // ── run() transitions (AC-04) ────────────────────────

  it('transitions stopped → working → stopped on successful run', async () => {
    const result = await instance.run({ prompt: 'test' });
    expect(instance.status).toBe('stopped');
    expect(result.status).toBe('completed');
  });

  it('updates sessionId from adapter result', async () => {
    await instance.run({ prompt: 'test' });
    expect(instance.sessionId).toBe('ses-1');
  });

  it('passes sessionId to adapter on subsequent runs', async () => {
    await instance.run({ prompt: 'first' });
    expect(instance.sessionId).toBe('ses-1');
    await instance.run({ prompt: 'second' });
    const history = adapter.getRunHistory();
    expect(history[1]?.sessionId).toBe('ses-1');
  });

  // ── Double-run guard (AC-05) ──────────────────────────

  it('throws on double-run (concurrent guard)', async () => {
    const slowAdapter = new FakeAgentAdapter({ runDuration: 100, sessionId: 'ses-1' });
    const inst = new AgentInstance(baseConfig, slowAdapter);
    const firstRun = inst.run({ prompt: 'test' });
    await expect(inst.run({ prompt: 'test2' })).rejects.toThrow(/already running/i);
    await firstRun;
  });

  // ── Event pass-through (AC-06, AC-07, AC-08, AC-09) ──

  it('dispatches adapter events to registered handler', async () => {
    const textEvent: AgentEvent = {
      type: 'text_delta',
      timestamp: new Date().toISOString(),
      data: { content: 'hello' },
    };
    const evAdapter = new FakeAgentAdapter({ sessionId: 'ses-1', events: [textEvent] });
    const inst = new AgentInstance(baseConfig, evAdapter);

    const received: AgentEvent[] = [];
    inst.addEventHandler((e) => received.push(e));
    await inst.run({ prompt: 'test' });

    expect(received).toHaveLength(1);
    expect(received[0]?.type).toBe('text_delta');
  });

  it('dispatches events to multiple handlers (AC-07)', async () => {
    const textEvent: AgentEvent = {
      type: 'text_delta',
      timestamp: new Date().toISOString(),
      data: { content: 'hello' },
    };
    const evAdapter = new FakeAgentAdapter({ sessionId: 'ses-1', events: [textEvent] });
    const inst = new AgentInstance(baseConfig, evAdapter);

    const received1: AgentEvent[] = [];
    const received2: AgentEvent[] = [];
    inst.addEventHandler((e) => received1.push(e));
    inst.addEventHandler((e) => received2.push(e));
    await inst.run({ prompt: 'test' });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
    expect(received1[0]).toBe(received2[0]); // same object reference
  });

  it('removeEventHandler stops delivery (AC-08)', async () => {
    const textEvent: AgentEvent = {
      type: 'text_delta',
      timestamp: new Date().toISOString(),
      data: { content: 'hello' },
    };
    const evAdapter = new FakeAgentAdapter({ sessionId: 'ses-1', events: [textEvent] });
    const inst = new AgentInstance(baseConfig, evAdapter);

    const received: AgentEvent[] = [];
    const handler = (e: AgentEvent) => received.push(e);
    inst.addEventHandler(handler);
    inst.removeEventHandler(handler);
    await inst.run({ prompt: 'test' });

    expect(received).toHaveLength(0);
  });

  it('per-run onEvent receives events alongside handlers (AC-09)', async () => {
    const textEvent: AgentEvent = {
      type: 'text_delta',
      timestamp: new Date().toISOString(),
      data: { content: 'hello' },
    };
    const evAdapter = new FakeAgentAdapter({ sessionId: 'ses-1', events: [textEvent] });
    const inst = new AgentInstance(baseConfig, evAdapter);

    const handlerEvents: AgentEvent[] = [];
    const perRunEvents: AgentEvent[] = [];
    inst.addEventHandler((e) => handlerEvents.push(e));
    await inst.run({ prompt: 'test', onEvent: (e) => perRunEvents.push(e) });

    expect(handlerEvents).toHaveLength(1);
    expect(perRunEvents).toHaveLength(1);
  });

  it('handler throwing does not break other handlers', async () => {
    const textEvent: AgentEvent = {
      type: 'text_delta',
      timestamp: new Date().toISOString(),
      data: { content: 'hello' },
    };
    const evAdapter = new FakeAgentAdapter({ sessionId: 'ses-1', events: [textEvent] });
    const inst = new AgentInstance(baseConfig, evAdapter);

    const received: AgentEvent[] = [];
    inst.addEventHandler(() => {
      throw new Error('handler error');
    });
    inst.addEventHandler((e) => received.push(e));
    await inst.run({ prompt: 'test' });

    expect(received).toHaveLength(1);
  });

  it('removeEventHandler with unregistered handler is no-op', () => {
    const handler = () => {};
    expect(() => instance.removeEventHandler(handler)).not.toThrow();
  });

  // ── Metadata (AC-10) ─────────────────────────────────

  it('metadata is readable after creation', () => {
    const inst = new AgentInstance({ ...baseConfig, metadata: { key: 'value' } }, adapter);
    expect(inst.metadata).toEqual({ key: 'value' });
  });

  it('setMetadata updates key', () => {
    instance.setMetadata('test', 42);
    expect(instance.metadata.test).toBe(42);
  });

  it('setMetadata preserves existing keys', () => {
    instance.setMetadata('a', 1);
    instance.setMetadata('b', 2);
    expect(instance.metadata).toEqual({ a: 1, b: 2 });
  });

  // ── isRunning (AC-11) ────────────────────────────────

  it('isRunning true during run', async () => {
    const slowAdapter = new FakeAgentAdapter({ runDuration: 50, sessionId: 'ses-1' });
    const inst = new AgentInstance(baseConfig, slowAdapter);
    const runPromise = inst.run({ prompt: 'test' });
    // Give it a tick to start
    await new Promise((r) => setTimeout(r, 10));
    expect(inst.isRunning).toBe(true);
    await runPromise;
    expect(inst.isRunning).toBe(false);
  });

  // ── terminate (AC-12) ────────────────────────────────

  it('terminate delegates to adapter and transitions to stopped', async () => {
    await instance.run({ prompt: 'test' }); // establish session
    const result = await instance.terminate();
    expect(instance.status).toBe('stopped');
    expect(result.status).toBe('killed');
    adapter.assertTerminateCalled('ses-1');
  });

  it('terminate with no session returns synthetic result', async () => {
    const result = await instance.terminate();
    expect(instance.status).toBe('stopped');
    expect(result.status).toBe('killed');
    expect(result.exitCode).toBe(0);
    expect(adapter.getTerminateHistory()).toHaveLength(0); // adapter not called
  });

  // ── compact (AC-12a, AC-12b, AC-12c, AC-12d) ────────

  it('compact transitions stopped → working → stopped', async () => {
    const inst = new AgentInstance({ ...baseConfig, sessionId: 'ses-1' }, adapter);
    const result = await inst.compact();
    expect(inst.status).toBe('stopped');
    expect(result.status).toBe('completed');
    adapter.assertCompactCalled('ses-1');
  });

  it('compact throws if no session (AC-12b)', async () => {
    await expect(instance.compact()).rejects.toThrow(/no session/i);
  });

  it('compact throws if working (AC-12c)', async () => {
    const slowAdapter = new FakeAgentAdapter({ runDuration: 100, sessionId: 'ses-1' });
    const inst = new AgentInstance({ ...baseConfig, sessionId: 'ses-1' }, slowAdapter);
    const runPromise = inst.run({ prompt: 'test' });
    await expect(inst.compact()).rejects.toThrow(/already running/i);
    await runPromise;
  });

  it('compact updates token metrics in metadata (AC-12d)', async () => {
    const tokenAdapter = new FakeAgentAdapter({
      sessionId: 'ses-1',
      tokens: { used: 100, total: 500, limit: 200000 },
    });
    const inst = new AgentInstance({ ...baseConfig, sessionId: 'ses-1' }, tokenAdapter);
    await inst.compact();
    expect(inst.metadata.tokens).toEqual({ used: 100, total: 500, limit: 200000 });
  });

  // ── Error paths ──────────────────────────────────────

  it('run() with adapter error transitions to error status', async () => {
    const errorAdapter = new FakeAgentAdapter({ status: 'failed' });
    // Override run to throw
    errorAdapter.run = async () => {
      throw new Error('adapter failure');
    };
    const inst = new AgentInstance(baseConfig, errorAdapter);
    await expect(inst.run({ prompt: 'test' })).rejects.toThrow('adapter failure');
    expect(inst.status).toBe('error');
  });

  it('compact() with adapter error transitions to error status', async () => {
    const errorAdapter = new FakeAgentAdapter({ sessionId: 'ses-1' });
    errorAdapter.compact = async () => {
      throw new Error('compact failure');
    };
    const inst = new AgentInstance({ ...baseConfig, sessionId: 'ses-1' }, errorAdapter);
    await expect(inst.compact()).rejects.toThrow('compact failure');
    expect(inst.status).toBe('error');
  });

  it('sessionId not updated on adapter error', async () => {
    const errorAdapter = new FakeAgentAdapter({ status: 'failed' });
    errorAdapter.run = async () => {
      throw new Error('adapter failure');
    };
    const inst = new AgentInstance(baseConfig, errorAdapter);
    await expect(inst.run({ prompt: 'test' })).rejects.toThrow();
    expect(inst.sessionId).toBeNull();
  });

  // ── onSessionAcquired callback ───────────────────────

  it('calls onSessionAcquired when session first acquired', async () => {
    let acquiredId: string | null = null;
    const inst = new AgentInstance(baseConfig, adapter, (sid) => {
      acquiredId = sid;
    });
    await inst.run({ prompt: 'test' });
    expect(acquiredId).toBe('ses-1');
  });

  it('does not call onSessionAcquired if session was pre-set', async () => {
    let called = false;
    const inst = new AgentInstance({ ...baseConfig, sessionId: 'pre-set' }, adapter, () => {
      called = true;
    });
    await inst.run({ prompt: 'test' });
    expect(called).toBe(false);
  });
});
