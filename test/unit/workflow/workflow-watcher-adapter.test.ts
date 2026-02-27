import { describe, expect, it, vi } from 'vitest';
import { WorkflowWatcherAdapter } from '@chainglass/workflow';
import type { WatcherEvent } from '@chainglass/workflow';

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
  it('has correct name', () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    expect(adapter.name).toBe('workflow-watcher');
  });

  it('emits structure event for graph.yaml changes', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const callback = vi.fn();
    adapter.onStructureChanged(callback);

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));

    // Zero debounce — fires on next tick
    await new Promise((r) => setTimeout(r, 10));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toMatchObject({
      graphSlug: 'my-graph',
      changeType: 'structure',
    });
  });

  it('emits structure event for node.yaml changes', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const callback = vi.fn();
    adapter.onStructureChanged(callback);

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/nodes/node-abc/node.yaml'));

    await new Promise((r) => setTimeout(r, 10));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toMatchObject({
      graphSlug: 'my-graph',
      changeType: 'structure',
    });
  });

  it('emits status event for state.json changes', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const callback = vi.fn();
    adapter.onStatusChanged(callback);

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/state.json'));

    await new Promise((r) => setTimeout(r, 10));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toMatchObject({
      graphSlug: 'my-graph',
      changeType: 'status',
    });
  });

  it('ignores unrelated paths', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const structCb = vi.fn();
    const statusCb = vi.fn();
    adapter.onStructureChanged(structCb);
    adapter.onStatusChanged(statusCb);

    adapter.handleEvent(makeEvent('/data/work-graphs/old-graph/state.json'));
    adapter.handleEvent(makeEvent('/data/workflows/my-graph/output.txt'));

    await new Promise((r) => setTimeout(r, 10));
    expect(structCb).not.toHaveBeenCalled();
    expect(statusCb).not.toHaveBeenCalled();
  });

  it('debounces rapid events', async () => {
    const adapter = new WorkflowWatcherAdapter(50, 50);
    const callback = vi.fn();
    adapter.onStructureChanged(callback);

    // Fire 5 rapid events
    for (let i = 0; i < 5; i++) {
      adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));
    }

    await new Promise((r) => setTimeout(r, 100));
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe removes callback', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const callback = vi.fn();
    const unsub = adapter.onStructureChanged(callback);
    unsub();

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));

    await new Promise((r) => setTimeout(r, 10));
    expect(callback).not.toHaveBeenCalled();
  });

  it('isolates errors between subscribers', async () => {
    const adapter = new WorkflowWatcherAdapter(0, 0);
    const throwing = vi.fn(() => { throw new Error('boom'); });
    const working = vi.fn();
    adapter.onStructureChanged(throwing);
    adapter.onStructureChanged(working);

    adapter.handleEvent(makeEvent('/data/workflows/my-graph/graph.yaml'));

    await new Promise((r) => setTimeout(r, 10));
    expect(throwing).toHaveBeenCalled();
    expect(working).toHaveBeenCalled();
  });
});
