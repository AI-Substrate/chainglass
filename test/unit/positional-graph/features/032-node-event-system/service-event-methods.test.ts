/*
Test Doc:
- Why: Verify the three new service methods (raiseNodeEvent, getNodeEvents, stampNodeEvent) on IPositionalGraphService correctly delegate to the event system
- Contract: raiseNodeEvent raises + handles + persists + returns stopsExecution; getNodeEvents loads + filters; stampNodeEvent stamps + persists with E196 on missing
- Usage Notes: These tests use real PositionalGraphService with FakeFileSystem. simulateAgentAccept sets state for methods requiring agent-accepted.
- Quality Contribution: Proves CLI-layer service methods work end-to-end through the event system; catches regression in raise/handle/stamp pipeline
- Worked Example: raiseNodeEvent('node:accepted') → event recorded, status transitions to 'agent-accepted', stopsExecution=false
*/

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { stubWorkUnitLoader, testFixtures } from '../../test-helpers.js';

// ── Test Infrastructure ──────────────────────────────────

function createTestContext(worktreePath = '/workspace/my-project'): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: 'main',
    isMainWorktree: true,
  };
}

function createTestService(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  loader = stubWorkUnitLoader({
    units: [testFixtures.sampleCoder, testFixtures.sampleInput],
    strictMode: true,
  })
): IPositionalGraphService {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

function readState(fs: FakeFileSystem, graphSlug: string, worktreePath = '/workspace/my-project') {
  const statePath = `${worktreePath}/.chainglass/data/workflows/${graphSlug}/state.json`;
  const content = fs.getFile(statePath);
  if (!content) throw new Error('state.json not found');
  return JSON.parse(content);
}

// ── raiseNodeEvent ───────────────────────────────────────

describe('raiseNodeEvent', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();

    // Create graph, add node, start it
    const { lineId } = await service.create(ctx, 'test-graph');
    const addResult = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!addResult.nodeId) throw new Error('nodeId expected');
    nodeId = addResult.nodeId;
    await service.startNode(ctx, 'test-graph', nodeId);
  });

  it('returns event with stamps after handleEvents', async () => {
    const result = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'node:accepted',
      {},
      'agent'
    );

    expect(result.errors).toEqual([]);
    expect(result.event).toBeDefined();
    expect(result.event?.event_type).toBe('node:accepted');
    expect(result.event?.source).toBe('agent');
    expect(result.nodeId).toBe(nodeId);
  });

  it('returns stopsExecution=false for non-stop events', async () => {
    const result = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'node:accepted',
      {},
      'agent'
    );

    expect(result.stopsExecution).toBe(false);
  });

  it('returns stopsExecution=true for stop events (node:completed)', async () => {
    // Accept first, then save outputs, then complete
    await service.raiseNodeEvent(ctx, 'test-graph', nodeId, 'node:accepted', {}, 'agent');

    // Save required outputs
    await fs.writeFile('/workspace/my-project/test.sh', '#!/bin/bash\necho hello');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/test.sh'
    );
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');

    // endNode uses the canEnd guard, but raiseNodeEvent goes directly — skip it here
    // node:completed stopsExecution is true in the registry
    const result = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'node:completed',
      {},
      'agent'
    );

    expect(result.errors).toEqual([]);
    expect(result.stopsExecution).toBe(true);
  });

  it('returns E193 for invalid state transition', async () => {
    // Node is in 'starting' — node:completed requires 'agent-accepted'
    const result = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'node:completed',
      {},
      'agent'
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('E193');
  });

  it('returns E190 for unknown event type', async () => {
    const result = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'nonexistent:type',
      {},
      'agent'
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('E190');
  });

  it('persists events to state', async () => {
    await service.raiseNodeEvent(ctx, 'test-graph', nodeId, 'node:accepted', {}, 'agent');

    const state = readState(fs, 'test-graph');
    const events = state.nodes[nodeId].events;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);

    const acceptedEvent = events.find(
      (e: { event_type: string }) => e.event_type === 'node:accepted'
    );
    expect(acceptedEvent).toBeDefined();
  });
});

// ── getNodeEvents ────────────────────────────────────────

describe('getNodeEvents', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();

    const { lineId } = await service.create(ctx, 'test-graph');
    const addResult = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!addResult.nodeId) throw new Error('nodeId expected');
    nodeId = addResult.nodeId;

    // Start + accept to create events
    await service.startNode(ctx, 'test-graph', nodeId);
    await service.raiseNodeEvent(ctx, 'test-graph', nodeId, 'node:accepted', {}, 'agent');
  });

  it('returns all events', async () => {
    const result = await service.getNodeEvents(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.events).toBeDefined();
    expect(result.events?.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by type', async () => {
    const result = await service.getNodeEvents(ctx, 'test-graph', nodeId, {
      types: ['node:accepted'],
    });

    expect(result.errors).toEqual([]);
    expect(result.events?.every((e) => e.event_type === 'node:accepted')).toBe(true);
  });

  it('filters by status', async () => {
    const result = await service.getNodeEvents(ctx, 'test-graph', nodeId, {
      status: 'new',
    });

    expect(result.errors).toEqual([]);
    // All events should be 'new' status
    expect(result.events?.every((e) => e.status === 'new')).toBe(true);
  });

  it('returns single event by id', async () => {
    const allResult = await service.getNodeEvents(ctx, 'test-graph', nodeId);
    const firstEvent = allResult.events?.[0];

    const result = await service.getNodeEvents(ctx, 'test-graph', nodeId, {
      eventId: firstEvent.event_id,
    });

    expect(result.errors).toEqual([]);
    expect(result.events?.length).toBe(1);
    expect(result.events?.[0].event_id).toBe(firstEvent.event_id);
  });

  it('returns E196 for unknown event id', async () => {
    const result = await service.getNodeEvents(ctx, 'test-graph', nodeId, {
      eventId: 'nonexistent-event-id',
    });

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E196');
  });
});

// ── stampNodeEvent ───────────────────────────────────────

describe('stampNodeEvent', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;
  let eventId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();

    const { lineId } = await service.create(ctx, 'test-graph');
    const addResult = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!addResult.nodeId) throw new Error('nodeId expected');
    nodeId = addResult.nodeId;

    // Start + accept to create events
    await service.startNode(ctx, 'test-graph', nodeId);
    const raiseResult = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'node:accepted',
      {},
      'agent'
    );
    if (!raiseResult.event) throw new Error('event expected');
    eventId = raiseResult.event.event_id;
  });

  it('writes stamp and persists', async () => {
    const result = await service.stampNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      eventId,
      'my-agent',
      'forwarded'
    );

    expect(result.errors).toEqual([]);
    expect(result.eventId).toBe(eventId);
    expect(result.subscriber).toBe('my-agent');
    expect(result.stamp).toBeDefined();
    expect(result.stamp?.action).toBe('forwarded');
    expect(result.stamp?.stamped_at).toBeDefined();
  });

  it('writes stamp with data', async () => {
    const result = await service.stampNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      eventId,
      'my-agent',
      'processed',
      { reason: 'done' }
    );

    expect(result.errors).toEqual([]);
    expect(result.stamp?.data).toEqual({ reason: 'done' });
  });

  it('persists stamp to state', async () => {
    await service.stampNodeEvent(ctx, 'test-graph', nodeId, eventId, 'my-agent', 'forwarded');

    const state = readState(fs, 'test-graph');
    const event = state.nodes[nodeId].events.find(
      (e: { event_id: string }) => e.event_id === eventId
    );
    expect(event.stamps['my-agent']).toBeDefined();
    expect(event.stamps['my-agent'].action).toBe('forwarded');
  });

  it('returns E196 for unknown event', async () => {
    const result = await service.stampNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'nonexistent-event-id',
      'my-agent',
      'forwarded'
    );

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E196');
  });
});
