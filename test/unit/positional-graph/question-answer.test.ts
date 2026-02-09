/**
 * Question/Answer Protocol Tests (Phase 4: Question/Answer Protocol)
 *
 * Purpose: Tests for askQuestion, answerQuestion, and getAnswer service methods.
 * These enable agents to pause execution for orchestrator input.
 *
 * Test Plan from tasks.md Alignment Brief:
 * - askQuestion: generates timestamp ID, transitions to waiting-question, stores question
 * - answerQuestion: stores answer, transitions to running, E173/E177 for errors
 * - getAnswer: retrieves answer, answered: false if unanswered, E173 for invalid qId
 *
 * State Machine:
 * - running → waiting-question (via askQuestion)
 * - waiting-question → running (via answerQuestion)
 *
 * Critical Insights from /didyouknow:
 * - #1: Use deterministic ID generator for tests (inject via options or mock)
 * - #5: getAnswer on unanswered question returns {answered: false} not E173
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { stubWorkUnitLoader, testFixtures } from './test-helpers.js';

// ============================================
// Test Helpers
// ============================================

/**
 * Simulate agent accepting a node by transitioning its status from 'starting'
 * to 'agent-accepted' in state.json. This completes the two-phase handshake
 * introduced in Plan 032 Phase 2.
 */
async function acceptNodeInState(
  fs: FakeFileSystem,
  graphSlug: string,
  nodeId: string
): Promise<void> {
  const statePath = `/workspace/my-project/.chainglass/data/workflows/${graphSlug}/state.json`;
  const stateContent = await fs.readFile(statePath, 'utf-8');
  const state = JSON.parse(stateContent);
  state.nodes[nodeId].status = 'agent-accepted';
  await fs.writeFile(statePath, JSON.stringify(state));
}

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
  loader = stubWorkUnitLoader({ slugs: ['sample-coder', 'sample-input'] })
): IPositionalGraphService {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

// ============================================
// askQuestion Tests (T001)
// ============================================

describe('PositionalGraphService — askQuestion', () => {
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

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;

    // Start node and simulate agent accepting (two-phase handshake)
    await service.startNode(ctx, 'test-graph', nodeId);
    await acceptNodeInState(fs, 'test-graph', nodeId);
  });

  it('generates timestamp-based question ID', async () => {
    /**
     * Purpose: Proves question ID format matches PL-08 pattern
     * Quality Contribution: Enables sorting and debugging
     * Acceptance Criteria: ID matches ISO timestamp + random suffix pattern
     */
    const result = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Which language?',
      options: ['bash', 'python'],
    });

    expect(result.errors).toEqual([]);
    expect(result.questionId).toBeDefined();
    // ID should match ISO timestamp pattern with random suffix: YYYY-MM-DDTHH:mm:ss.sssZ_xxxxxx
    expect(result.questionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-f0-9]+$/);
  });

  it('transitions to waiting-question', async () => {
    /**
     * Purpose: Proves askQuestion changes node state to waiting-question
     * Quality Contribution: Core Q&A state machine (AC-5)
     * Acceptance Criteria: Node status becomes waiting-question
     */
    await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'text',
      text: 'What is the input?',
    });

    const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);
    expect(status.status).toBe('waiting-question');
  });

  it('stores question in state.questions[]', async () => {
    /**
     * Purpose: Proves question is persisted to state.json
     * Quality Contribution: Data persistence for orchestrator retrieval
     * Acceptance Criteria: Question appears in state.questions array
     */
    const result = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Which language?',
      options: ['bash', 'python'],
    });

    // Read state.json directly to verify question stored
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    expect(state.questions).toBeDefined();
    expect(state.questions.length).toBe(1);
    expect(state.questions[0].question_id).toBe(result.questionId);
    expect(state.questions[0].node_id).toBe(nodeId);
    expect(state.questions[0].type).toBe('single');
    expect(state.questions[0].text).toBe('Which language?');
    expect(state.questions[0].options).toEqual(['bash', 'python']);
    expect(state.questions[0].asked_at).toBeDefined();
  });

  it('sets pending_question_id on node', async () => {
    /**
     * Purpose: Proves node tracks its pending question
     * Quality Contribution: Links question to node for orchestrator UI
     * Acceptance Criteria: nodes[nodeId].pending_question_id === qId
     */
    const result = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'text',
      text: 'Question?',
    });

    // Read state.json directly to verify pending_question_id
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    expect(state.nodes[nodeId].pending_question_id).toBe(result.questionId);
  });

  it('requires running state (E176)', async () => {
    /**
     * Purpose: Prevents questions from non-running nodes
     * Quality Contribution: State machine integrity
     * Acceptance Criteria: E176 NodeNotRunning returned for pending node
     */
    // Create a new node that hasn't been started
    const showResult = await service.show(ctx, 'test-graph');
    const lineId = showResult.lines?.[0]?.id;
    const addResult = await service.addNode(ctx, 'test-graph', lineId as string, 'sample-input');
    const pendingNodeId = addResult.nodeId as string;

    const result = await service.askQuestion(ctx, 'test-graph', pendingNodeId, {
      type: 'text',
      text: 'Question?',
    });

    expect(result.questionId).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E176');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.askQuestion(ctx, 'test-graph', 'nonexistent-node', {
      type: 'text',
      text: 'Question?',
    });

    expect(result.questionId).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });
});

// ============================================
// answerQuestion Tests (T001)
// ============================================

describe('PositionalGraphService — answerQuestion', () => {
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

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;

    // Start node, simulate agent accepting, then ask a question to get to waiting-question state
    await service.startNode(ctx, 'test-graph', nodeId);
    await acceptNodeInState(fs, 'test-graph', nodeId);
    const askResult = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Which language?',
      options: ['bash', 'python'],
    });
    if (!askResult.questionId) throw new Error('questionId expected');
    questionId = askResult.questionId;
  });

  it('stores answer in question', async () => {
    /**
     * Purpose: Proves answer is persisted to the question
     * Quality Contribution: Data persistence (AC-6)
     * Acceptance Criteria: question.answer === provided value
     */
    const result = await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'bash');

    expect(result.errors).toEqual([]);

    // Read state.json directly to verify answer stored
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    const question = state.questions.find(
      (q: { question_id: string }) => q.question_id === questionId
    );
    expect(question.answer).toBe('bash');
  });

  it('sets answered_at timestamp', async () => {
    /**
     * Purpose: Proves audit trail for answer timing
     * Quality Contribution: Debugging and analytics
     * Acceptance Criteria: question.answered_at is ISO timestamp
     */
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'python');

    // Read state.json directly to verify answered_at
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    const question = state.questions.find(
      (q: { question_id: string }) => q.question_id === questionId
    );
    expect(question.answered_at).toBeDefined();
    // Verify ISO format
    expect(new Date(question.answered_at).toISOString()).toBe(question.answered_at);
  });

  it('keeps node in waiting-question (record-only, no status transition)', async () => {
    /**
     * Purpose: Proves answerQuestion records answer without transitioning status
     * Quality Contribution: Two-domain boundary — handler records, ONBAS/ODS decide
     * Acceptance Criteria: Node status stays waiting-question, restart via node:restart event
     */
    const result = await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'bash');

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('waiting-question');

    const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);
    expect(status.status).toBe('waiting-question');
  });

  it('preserves pending_question_id', async () => {
    /**
     * Purpose: Proves pending_question_id stays set after answer (cleared by node:restart handler)
     * Quality Contribution: Two-domain boundary — answer handler is record-only
     * Acceptance Criteria: nodes[nodeId].pending_question_id is still set
     */
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'bash');

    // Read state.json directly to verify pending_question_id preserved
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    // pending_question_id should still be set (cleared by node:restart, not by answer)
    expect(state.nodes[nodeId].pending_question_id).toBe(questionId);
  });

  it('returns E173 for invalid questionId', async () => {
    /**
     * Purpose: Proves error handling for non-existent question (AC-18)
     * Quality Contribution: Clear error messages
     * Acceptance Criteria: E173 QuestionNotFound returned
     */
    const result = await service.answerQuestion(
      ctx,
      'test-graph',
      nodeId,
      'invalid-question-id',
      'bash'
    );

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E173');
  });

  it('returns E195 if question already answered', async () => {
    /**
     * Purpose: Proves duplicate answer is rejected (question already answered)
     * Quality Contribution: Idempotency protection — same question can't be answered twice
     * Acceptance Criteria: E195 AlreadyAnswered returned
     */
    // Answer the question first (node stays waiting-question)
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'bash');

    // Try to answer again — rejected because ask event already has an answer event
    const result = await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'python');

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E195');
  });
});

// ============================================
// getAnswer Tests (T001)
// ============================================

describe('PositionalGraphService — getAnswer', () => {
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

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;

    // Start node, simulate agent accepting, then ask a question
    await service.startNode(ctx, 'test-graph', nodeId);
    await acceptNodeInState(fs, 'test-graph', nodeId);
    const askResult = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'Which language?',
      options: ['bash', 'python'],
    });
    if (!askResult.questionId) throw new Error('questionId expected');
    questionId = askResult.questionId;
  });

  it('returns answered: true with answer', async () => {
    /**
     * Purpose: Proves getAnswer returns answer after answering (AC-7)
     * Quality Contribution: Core retrieval functionality
     * Acceptance Criteria: {answered: true, answer: value}
     */
    await service.answerQuestion(ctx, 'test-graph', nodeId, questionId, 'bash');

    const result = await service.getAnswer(ctx, 'test-graph', nodeId, questionId);

    expect(result.errors).toEqual([]);
    expect(result.answered).toBe(true);
    expect(result.answer).toBe('bash');
  });

  it('returns answered: false if unanswered', async () => {
    /**
     * Purpose: Proves getAnswer returns helpful status for pending questions
     * Quality Contribution: Actionable response per Critical Insight #5
     * Acceptance Criteria: {answered: false} (not E173 error)
     */
    // Don't answer the question
    const result = await service.getAnswer(ctx, 'test-graph', nodeId, questionId);

    expect(result.errors).toEqual([]);
    expect(result.answered).toBe(false);
    expect(result.answer).toBeUndefined();
  });

  it('returns E173 for invalid questionId', async () => {
    /**
     * Purpose: Proves error handling for non-existent question (AC-18)
     * Quality Contribution: Clear error messages
     * Acceptance Criteria: E173 QuestionNotFound returned
     */
    const result = await service.getAnswer(ctx, 'test-graph', nodeId, 'invalid-question-id');

    expect(result.answered).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E173');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.getAnswer(ctx, 'test-graph', 'nonexistent-node', questionId);

    expect(result.answered).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });
});

// ============================================
// Multiple Questions Test (T001)
// ============================================

describe('PositionalGraphService — multiple questions', () => {
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

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;

    await service.startNode(ctx, 'test-graph', nodeId);
    await acceptNodeInState(fs, 'test-graph', nodeId);
  });

  it('stores multiple questions from same node', async () => {
    /**
     * Purpose: Proves sequential questions from same node are preserved
     * Quality Contribution: Supports multi-question workflows
     * Acceptance Criteria: All questions stored in state.questions array
     */
    // Ask first question
    const q1 = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'single',
      text: 'First question?',
      options: ['a', 'b'],
    });

    // Answer first question (transitions back to starting via two-phase handshake)
    await service.answerQuestion(ctx, 'test-graph', nodeId, q1.questionId as string, 'a');

    // Simulate agent re-accepting after answer (required for two-phase handshake)
    await acceptNodeInState(fs, 'test-graph', nodeId);

    // Ask second question
    const q2 = await service.askQuestion(ctx, 'test-graph', nodeId, {
      type: 'text',
      text: 'Second question?',
    });

    // Verify both questions stored
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const stateContent = await fs.readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent);

    expect(state.questions.length).toBe(2);
    expect(state.questions[0].question_id).toBe(q1.questionId);
    expect(state.questions[0].answer).toBe('a');
    expect(state.questions[1].question_id).toBe(q2.questionId);
    expect(state.questions[1].answer).toBeUndefined();
  });
});
