/*
Test Doc:
- Why: Integration tests for the 8 CLI event commands verify multi-step event workflows through the real service — raise, inspect, stamp, shortcuts, and error paths including E190/E193/E196/E197
- Contract: Each command returns correct result types; filters work; error codes match spec; stopsExecution is true for stop events; shortcuts delegate correctly
- Usage Notes: Uses real PositionalGraphService with FakeFileSystem. simulateStart helper sets up graph+node+start. Event lifecycle: start → raise → inspect → stamp.
- Quality Contribution: Catches interaction bugs between raise/handle/persist/stamp pipeline; validates CLI-facing service methods produce correct shapes for JSON output
- Worked Example: Create graph → start node → raiseNodeEvent('node:accepted') → getNodeEvents (list + filter) → stampNodeEvent → verify full lifecycle
*/

import { PositionalGraphService } from '@chainglass/positional-graph';
import { WorkflowEventObserverRegistry, WorkflowEventsService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import { WorkflowEventError } from '@chainglass/shared/workflow-events';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ── Test Infrastructure ──────────────────────────────────

function createTestContext(): WorkspaceContext {
  return {
    workspaceSlug: 'test-workspace',
    workspaceName: 'Test Workspace',
    workspacePath: '/workspace/event-test',
    worktreePath: '/workspace/event-test',
    worktreeBranch: 'main',
    isMainWorktree: true,
  };
}

function createTestService(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver
): IPositionalGraphService {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  // Non-strict loader: accepts any slug with empty I/O
  const loader = {
    async load(_ctx: WorkspaceContext, slug: string) {
      return {
        unit: { slug, type: 'agent' as const, inputs: [], outputs: [] },
        errors: [],
      };
    },
  };
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

/** Sets up a graph with a started node, returning the nodeId. */
async function simulateStart(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<{ nodeId: string; lineId: string }> {
  const { lineId } = await service.create(ctx, graphSlug);
  const addResult = await service.addNode(ctx, graphSlug, lineId, 'sample-agent');
  if (!addResult.nodeId) throw new Error('Expected nodeId from addNode');
  await service.startNode(ctx, graphSlug, addResult.nodeId);
  return { nodeId: addResult.nodeId, lineId };
}

/** Sets up a graph with a started + agent-accepted node (required for Q&A events). */
async function simulateAgentAccepted(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  graphSlug: string
): Promise<{ nodeId: string; lineId: string }> {
  const result = await simulateStart(service, ctx, graphSlug);
  await service.raiseNodeEvent(ctx, graphSlug, result.nodeId, 'node:accepted', {}, 'agent');
  return result;
}

// ── Full Event Lifecycle ─────────────────────────────────

describe('Event CLI Integration — Full Lifecycle', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  const GRAPH = 'event-lifecycle';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  it('should exercise full event lifecycle: raise → list → filter → stamp', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // ── Step 1: raise-event (node:accepted) ──
    const raiseResult = await service.raiseNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      'node:accepted',
      {},
      'agent'
    );
    expect(raiseResult.errors).toEqual([]);
    expect(raiseResult.event).toBeDefined();
    expect(raiseResult.event?.event_type).toBe('node:accepted');
    expect(raiseResult.event?.source).toBe('agent');
    expect(raiseResult.stopsExecution).toBe(false);
    const eventId = raiseResult.event?.event_id;

    // ── Step 2: events (list all) ──
    const listResult = await service.getNodeEvents(ctx, GRAPH, nodeId);
    expect(listResult.errors).toEqual([]);
    expect(listResult.events).toBeDefined();
    expect(listResult.events?.length).toBeGreaterThanOrEqual(1);
    const acceptedEvent = listResult.events?.find((e) => e.event_type === 'node:accepted');
    expect(acceptedEvent).toBeDefined();
    expect(acceptedEvent?.event_id).toBe(eventId);

    // ── Step 3: events (filter by type) ──
    const typeFilterResult = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      types: ['node:accepted'],
    });
    expect(typeFilterResult.errors).toEqual([]);
    expect(typeFilterResult.events?.every((e) => e.event_type === 'node:accepted')).toBe(true);

    // ── Step 4: events (filter by status) ──
    const statusFilterResult = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      status: 'new',
    });
    expect(statusFilterResult.errors).toEqual([]);
    expect(statusFilterResult.events?.every((e) => e.status === 'new')).toBe(true);

    // ── Step 5: events (single event by id) ──
    const singleResult = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      eventId,
    });
    expect(singleResult.errors).toEqual([]);
    expect(singleResult.events?.length).toBe(1);
    expect(singleResult.events?.[0].event_id).toBe(eventId);

    // ── Step 6: stamp-event ──
    const stampResult = await service.stampNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      eventId,
      'my-agent',
      'forwarded',
      { reason: 'task complete' }
    );
    expect(stampResult.errors).toEqual([]);
    expect(stampResult.eventId).toBe(eventId);
    expect(stampResult.subscriber).toBe('my-agent');
    expect(stampResult.stamp).toBeDefined();
    expect(stampResult.stamp?.action).toBe('forwarded');
    expect(stampResult.stamp?.data).toEqual({ reason: 'task complete' });

    // ── Step 7: Verify stamp persisted ──
    const afterStamp = await service.getNodeEvents(ctx, GRAPH, nodeId, { eventId });
    const stampedEvent = afterStamp.events?.[0];
    expect(stampedEvent.stamps).toBeDefined();
    expect(stampedEvent.stamps['my-agent']).toBeDefined();
    expect(stampedEvent.stamps['my-agent'].action).toBe('forwarded');
  });
});

// ── Error Code Tests ─────────────────────────────────────

describe('Event CLI Integration — Error Codes', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  const GRAPH = 'error-codes';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  it('E190: unknown event type on raise-event', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    const result = await service.raiseNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      'nonexistent:event-type',
      {},
      'agent'
    );

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('E190');
  });

  it('E193: invalid state transition', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // node:completed requires agent-accepted state, but node is in 'starting'
    const result = await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:completed', {}, 'agent');

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('E193');
  });

  it('E196: unknown event id on getNodeEvents', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    const result = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      eventId: 'nonexistent-event-id',
    });

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E196');
  });

  it('E196: unknown event id on stampNodeEvent', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    const result = await service.stampNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      'nonexistent-event-id',
      'my-agent',
      'forwarded'
    );

    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E196');
  });
});

// ── Stop Events & Agent Instruction ──────────────────────

describe('Event CLI Integration — Stop Events', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  const GRAPH = 'stop-events';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  it('stopsExecution=true for node:completed', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // Accept first (required before complete)
    await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

    // node:completed stops execution
    const result = await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:completed', {}, 'agent');

    expect(result.errors).toEqual([]);
    expect(result.stopsExecution).toBe(true);
  });

  it('stopsExecution=false for non-stop events', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    const result = await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

    expect(result.errors).toEqual([]);
    expect(result.stopsExecution).toBe(false);
  });
});

// ── Shortcut Commands ────────────────────────────────────

describe('Event CLI Integration — Shortcuts', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  const GRAPH = 'shortcuts';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  it('accept shortcut: equivalent to raise-event node:accepted', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // Simulate what the accept shortcut does
    const result = await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

    expect(result.errors).toEqual([]);
    expect(result.event?.event_type).toBe('node:accepted');

    // Verify status transition
    const events = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      types: ['node:accepted'],
    });
    expect(events.events?.length).toBeGreaterThanOrEqual(1);
  });

  it('error shortcut: equivalent to raise-event node:error with payload', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // Accept first
    await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

    // Simulate what the error shortcut does
    const errorPayload = {
      code: 'COMPILE_FAILED',
      message: 'TypeScript compilation error',
      details: { file: 'index.ts', line: 42 },
      recoverable: true,
    };
    const result = await service.raiseNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      'node:error',
      errorPayload,
      'agent'
    );

    expect(result.errors).toEqual([]);
    expect(result.event?.event_type).toBe('node:error');
    expect(result.event?.payload).toEqual(errorPayload);
    expect(result.stopsExecution).toBe(true);
  });

  it('end with message: endNode passes message as payload', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // Accept the node
    await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

    // End with message — endNode routes through the event system
    const endResult = await service.endNode(ctx, GRAPH, nodeId, 'Task completed successfully');

    expect(endResult.errors).toEqual([]);

    // Verify node:completed event was created with message payload
    const events = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      types: ['node:completed'],
    });
    expect(events.events?.length).toBe(1);
    expect(events.events?.[0].payload).toEqual({ message: 'Task completed successfully' });
  });
});

// ── Multi-Event Sequence ─────────────────────────────────

describe('Event CLI Integration — Multi-Event Sequence', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  const GRAPH = 'multi-event';

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
  });

  it('multiple events accumulate and can be filtered independently', async () => {
    const { nodeId } = await simulateStart(service, ctx, GRAPH);

    // Raise node:accepted
    await service.raiseNodeEvent(ctx, GRAPH, nodeId, 'node:accepted', {}, 'agent');

    // Raise question:ask (requires question_id, type, text per QuestionAskPayloadSchema)
    const questionResult = await service.raiseNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      'question:ask',
      {
        question_id: 'q1',
        type: 'single',
        text: 'Which language?',
        options: ['TypeScript', 'Python'],
      },
      'agent'
    );
    expect(questionResult.errors).toEqual([]);

    // List all events — should have at least 2
    const allEvents = await service.getNodeEvents(ctx, GRAPH, nodeId);
    expect(allEvents.events?.length).toBeGreaterThanOrEqual(2);

    // Filter by type — only question:ask
    const questionEvents = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      types: ['question:ask'],
    });
    expect(questionEvents.events?.length).toBe(1);
    expect(questionEvents.events?.[0].event_type).toBe('question:ask');

    // Stamp the question event
    const questionEventId = questionResult.event?.event_id;
    await service.stampNodeEvent(
      ctx,
      GRAPH,
      nodeId,
      questionEventId,
      'orchestrator',
      'acknowledged'
    );

    // Verify stamp on the specific event
    const stampedEvents = await service.getNodeEvents(ctx, GRAPH, nodeId, {
      eventId: questionEventId,
    });
    expect(stampedEvents.events?.[0].stamps.orchestrator).toBeDefined();
    expect(stampedEvents.events?.[0].stamps.orchestrator.action).toBe('acknowledged');
  });
});

// ── Plan 061 Phase 3 (T007): QnA Integration Tests via WorkflowEventsService ──

describe('WorkflowEventsService — QnA Integration', () => {
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let wfEvents: WorkflowEventsService;

  const GRAPH = 'qna-integration';

  beforeEach(() => {
    const fs = new FakeFileSystem();
    const pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();
    const observers = new WorkflowEventObserverRegistry();
    wfEvents = new WorkflowEventsService(service, () => ctx, observers);
  });

  it('full ask → answer → get-answer cycle', async () => {
    const { nodeId } = await simulateAgentAccepted(service, ctx, GRAPH);

    // 1. Ask a question via WorkflowEvents
    const { questionId } = await wfEvents.askQuestion(GRAPH, nodeId, {
      type: 'confirm',
      text: 'Proceed?',
    });
    expect(questionId).toBeDefined();
    expect(typeof questionId).toBe('string');

    // 2. Verify node is in waiting-question state
    const statusAfterAsk = await service.getNodeStatus(ctx, GRAPH, nodeId);
    expect(statusAfterAsk.status).toBe('waiting-question');

    // 3. Answer the question via WorkflowEvents (includes node:restart)
    await wfEvents.answerQuestion(GRAPH, nodeId, questionId, true);

    // 4. Verify node is no longer waiting-question (DYK-P3-05)
    const statusAfterAnswer = await service.getNodeStatus(ctx, GRAPH, nodeId);
    expect(statusAfterAnswer.status).not.toBe('waiting-question');

    // 5. Get the answer via WorkflowEvents
    const result = await wfEvents.getAnswer(GRAPH, nodeId, questionId);
    expect(result).not.toBeNull();
    expect(result?.answered).toBe(true);
    expect(result?.answer).toBe(true);
    expect(result?.answeredAt).toBeDefined();
  });

  it('getAnswer returns null for unknown questionId', async () => {
    const { nodeId } = await simulateAgentAccepted(service, ctx, GRAPH);
    const result = await wfEvents.getAnswer(GRAPH, nodeId, 'nonexistent-q');
    expect(result).toBeNull();
  });

  it('askQuestion throws WorkflowEventError on wrong state', async () => {
    // Create graph but don't start node — node is in 'ready' state
    const { lineId } = await service.create(ctx, GRAPH);
    const addResult = await service.addNode(ctx, GRAPH, lineId, 'sample-agent');
    if (!addResult.nodeId) throw new Error('Expected nodeId');

    await expect(
      wfEvents.askQuestion(GRAPH, addResult.nodeId, { type: 'confirm', text: 'Proceed?' })
    ).rejects.toThrow(WorkflowEventError);
  });

  it('answerQuestion throws for invalid questionId', async () => {
    const { nodeId } = await simulateAgentAccepted(service, ctx, GRAPH);

    // Ask a real question first to get node into waiting-question
    await wfEvents.askQuestion(GRAPH, nodeId, { type: 'text', text: 'Name?' });

    // Try to answer with wrong questionId
    await expect(
      wfEvents.answerQuestion(GRAPH, nodeId, 'bad-question-id', 'answer')
    ).rejects.toThrow('not found');
  });

  it('ask with choice options round-trips through getAnswer', async () => {
    const { nodeId } = await simulateAgentAccepted(service, ctx, GRAPH);

    const { questionId } = await wfEvents.askQuestion(GRAPH, nodeId, {
      type: 'single',
      text: 'Pick a language',
      options: ['TypeScript', 'Python', 'Rust'],
    });

    await wfEvents.answerQuestion(GRAPH, nodeId, questionId, 'TypeScript');

    const result = await wfEvents.getAnswer(GRAPH, nodeId, questionId);
    expect(result?.answered).toBe(true);
    expect(result?.answer).toBe('TypeScript');
  });
});
