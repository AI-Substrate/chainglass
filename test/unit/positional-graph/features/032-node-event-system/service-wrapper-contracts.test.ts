/*
Test Doc:
- Why: Verify service method wrappers (endNode, askQuestion, answerQuestion) correctly delegate to INodeEventService.raise() and produce events with stamps after handleEvents
- Contract: Each wrapper raises the correct event type, handleEvents applies handlers producing correct state transitions and stamps
- Usage Notes: These tests exercise the full PositionalGraphService through the event system path. Events are recorded, stamps are written by handlers.
- Quality Contribution: Proves behavioral parity between old direct-mutation path and new event-based path; catches event recording or stamping regressions
- Worked Example: endNode() → node:completed event recorded, status='complete', completed_at set, event stamped by 'cli' subscriber
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

async function simulateAgentAccept(
  fs: FakeFileSystem,
  graphSlug: string,
  nodeId: string,
  worktreePath = '/workspace/my-project'
): Promise<void> {
  const statePath = `${worktreePath}/.chainglass/data/workflows/${graphSlug}/state.json`;
  const content = fs.getFile(statePath);
  if (!content) throw new Error(`state.json not found at ${statePath}`);
  const state = JSON.parse(content);
  if (!state.nodes?.[nodeId]) throw new Error(`Node ${nodeId} not found in state.json`);
  state.nodes[nodeId].status = 'agent-accepted';
  fs.setFile(statePath, JSON.stringify(state, null, 2));
}

function readState(fs: FakeFileSystem, graphSlug: string, worktreePath = '/workspace/my-project') {
  const statePath = `${worktreePath}/.chainglass/data/workflows/${graphSlug}/state.json`;
  const content = fs.getFile(statePath);
  if (!content) throw new Error('state.json not found');
  return JSON.parse(content);
}

// ── T008: endNode service wrapper contract ───────────────

describe('endNode — event service wrapper contract', () => {
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

    // Create graph and add node
    const { lineId } = await service.create(ctx, 'test-graph');
    const addResult = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!addResult.nodeId) throw new Error('nodeId expected');
    nodeId = addResult.nodeId;

    // Start and accept
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);

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
  });

  it('records a node:completed event', async () => {
    const result = await service.endNode(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('complete');

    const state = readState(fs, 'test-graph');
    const events = state.nodes[nodeId].events;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);

    const completedEvent = events.find(
      (e: { event_type: string }) => e.event_type === 'node:completed'
    );
    expect(completedEvent).toBeDefined();
    expect(completedEvent.source).toBe('agent');
    expect(completedEvent.status).toBe('new');
  });

  it('applies stamps after handleEvents', async () => {
    await service.endNode(ctx, 'test-graph', nodeId);

    const state = readState(fs, 'test-graph');
    const events = state.nodes[nodeId].events;
    const completedEvent = events.find(
      (e: { event_type: string }) => e.event_type === 'node:completed'
    );

    expect(completedEvent.stamps).toBeDefined();
    expect(completedEvent.stamps.cli).toBeDefined();
    expect(completedEvent.stamps.cli.action).toBe('state-transition');
    expect(completedEvent.stamps.cli.stamped_at).toBeDefined();
  });

  it('transitions node status to complete with completed_at', async () => {
    const result = await service.endNode(ctx, 'test-graph', nodeId);

    expect(result.status).toBe('complete');
    expect(result.completedAt).toBeDefined();

    const state = readState(fs, 'test-graph');
    expect(state.nodes[nodeId].status).toBe('complete');
    expect(state.nodes[nodeId].completed_at).toBeDefined();
  });
});

// ── T009: askQuestion service wrapper contract ───────────

describe('askQuestion — event service wrapper contract', () => {
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

    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
  });

  it('records a question:ask event with stamps', async () => {
    const result = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Which framework?',
      options: ['React', 'Vue'],
    });

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('waiting-question');
    expect(result.questionId).toBeDefined();

    const state = readState(fs, 'test-graph');
    const events = state.nodes[nodeId].events;
    const askEvent = events.find((e: { event_type: string }) => e.event_type === 'question:ask');

    expect(askEvent).toBeDefined();
    expect(askEvent.source).toBe('agent');
    expect(askEvent.payload.question_id).toBe(result.questionId);
    expect(askEvent.stamps?.cli?.action).toBe('state-transition');
  });

  it('transitions node to waiting-question with pending_question_id', async () => {
    const result = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'text',
      text: 'What name?',
    });

    const state = readState(fs, 'test-graph');
    expect(state.nodes[nodeId].status).toBe('waiting-question');
    expect(state.nodes[nodeId].pending_question_id).toBe(result.questionId);
  });

  it('writes to state.questions for backward compat', async () => {
    const result = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Pick one',
      options: ['A', 'B'],
    });

    const state = readState(fs, 'test-graph');
    expect(state.questions).toBeDefined();
    expect(state.questions.length).toBe(1);
    expect(state.questions[0].question_id).toBe(result.questionId);
    expect(state.questions[0].text).toBe('Pick one');
  });
});

// ── T010: answerQuestion service wrapper contract ────────

describe('answerQuestion — event service wrapper contract', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;
  let questionId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    service = createTestService(fs, pathResolver);
    ctx = createTestContext();

    const { lineId } = await service.create(ctx, 'test-graph');
    const addResult = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!addResult.nodeId) throw new Error('nodeId expected');
    nodeId = addResult.nodeId;

    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);

    const askResult = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Which framework?',
      options: ['React', 'Vue'],
    });
    if (!askResult.questionId) throw new Error('questionId expected');
    questionId = askResult.questionId;
  });

  it('records a question:answer event with stamps', async () => {
    const result = await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'React');

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('waiting-question');

    const state = readState(fs, 'test-graph');
    const events = state.nodes[nodeId].events;
    const answerEvent = events.find(
      (e: { event_type: string }) => e.event_type === 'question:answer'
    );

    expect(answerEvent).toBeDefined();
    expect(answerEvent.source).toBe('human');
    expect(answerEvent.stamps?.cli?.action).toBe('answer-recorded');
  });

  it('keeps node in waiting-question and preserves pending_question_id', async () => {
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'React');

    const state = readState(fs, 'test-graph');
    expect(state.nodes[nodeId].status).toBe('waiting-question');
    expect(state.nodes[nodeId].pending_question_id).toBe(questionId);
  });

  it('cross-stamps the original ask event with answer-linked', async () => {
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'React');

    const state = readState(fs, 'test-graph');
    const events = state.nodes[nodeId].events;
    const askEvent = events.find((e: { event_type: string }) => e.event_type === 'question:ask');

    expect(askEvent.stamps?.cli?.action).toBe('answer-linked');
  });

  it('stores answer in state.questions for backward compat', async () => {
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'React');

    const state = readState(fs, 'test-graph');
    const question = state.questions.find(
      (q: { question_id: string }) => q.question_id === questionId
    );
    expect(question.answer).toBe('React');
    expect(question.answered_at).toBeDefined();
  });
});
