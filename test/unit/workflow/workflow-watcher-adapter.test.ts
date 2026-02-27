import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';
import type { WorkflowChangedEvent } from '@chainglass/workflow';

function makeEvent(path: string, overrides: Partial<WatcherEvent> = {}): WatcherEvent {
  return {
    path,
    workspaceSlug: 'test-ws',
    worktreePath: '/tmp/test',
    eventType: 'change',
    ...overrides,
  } as WatcherEvent;
}

describe('WorkflowWatcherAdapter', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('has correct name', () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    expect(adapter.name).toBe('workflow-watcher');
  });

  it('emits structure event for graph.yaml changes', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const calls: WorkflowChangedEvent[] = [];
    adapter.onStructureChanged((e) => calls.push(e));

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ graphSlug: 'my-graph', changeType: 'structure' });
  });

  it('emits structure event for node.yaml changes', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const calls: WorkflowChangedEvent[] = [];
    adapter.onStructureChanged((e) => calls.push(e));

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/nodes/node-abc/node.yaml'));
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ graphSlug: 'my-graph', changeType: 'structure' });
  });

  it('emits status event for state.json changes', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const calls: WorkflowChangedEvent[] = [];
    adapter.onStatusChanged((e) => calls.push(e));

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/state.json'));
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ graphSlug: 'my-graph', changeType: 'status' });
  });

  it('ignores unrelated paths', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const structCalls: WorkflowChangedEvent[] = [];
    const statusCalls: WorkflowChangedEvent[] = [];
    adapter.onStructureChanged((e) => structCalls.push(e));
    adapter.onStatusChanged((e) => statusCalls.push(e));

    adapter.handleEvent(makeEvent('/data/work-graphs/old-graph/state.json'));
    adapter.handleEvent(makeEvent('/data/workflows/my-graph/output.txt'));
    await vi.advanceTimersByTimeAsync(10);

    expect(structCalls).toHaveLength(0);
    expect(statusCalls).toHaveLength(0);
  });

  it('debounces rapid events', async () => {
    const adapter = new WorkflowWatcherAdapter(50, 50);
    const calls: WorkflowChangedEvent[] = [];
    adapter.onStructureChanged((e) => calls.push(e));

    for (let i = 0; i < 5; i++) {
      adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));
    }

    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(1);
  });

  it('unsubscribe removes callback', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const calls: WorkflowChangedEvent[] = [];
    const unsub = adapter.onStructureChanged((e) => calls.push(e));
    unsub();

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));
    await vi.advanceTimersByTimeAsync(10);

    expect(calls).toHaveLength(0);
  });

  it('isolates errors between subscribers', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const workingCalls: WorkflowChangedEvent[] = [];
    adapter.onStructureChanged(() => { throw new Error('boom'); });
    adapter.onStructureChanged((e) => workingCalls.push(e));

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));
    await vi.advanceTimersByTimeAsync(10);

    expect(workingCalls).toHaveLength(1);
  });
});
