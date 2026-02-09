/**
 * Execution Lifecycle Tests (Phase 3: Node Lifecycle)
 *
 * Purpose: Tests for startNode, canEnd, and endNode service methods.
 * These enable agents to signal lifecycle transitions via CLI commands.
 *
 * Test Plan from tasks.md Alignment Brief:
 * - startNode: pending→starting, ready→starting, E172 for invalid states
 * - canEnd: checks required outputs, returns missing list
 * - endNode: agent-accepted→complete, E172 for non-accepted, E175 for missing outputs
 *
 * State Machine (two-phase handshake, Plan 032):
 * - pending (implicit) → starting (via startNode)
 * - ready (computed) → starting (via startNode)
 * - starting → agent-accepted (via acceptNode / agent handshake)
 * - agent-accepted → complete (via endNode)
 * - agent-accepted → waiting-question (via askQuestion, Phase 4)
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorkUnit, stubWorkUnitLoader, testFixtures } from './test-helpers.js';

// ============================================
// Test Helpers
// ============================================

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

/**
 * Simulate agent accepting a node that is in 'starting' state.
 *
 * Plan 032 introduced a two-phase handshake: startNode() puts nodes in 'starting',
 * and the agent must accept before doing work. The acceptNode service method is
 * Phase 3-4 functionality (not yet implemented), so tests that need to do work
 * after startNode() use this helper to transition state.json directly.
 */
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

// ============================================
// startNode Tests (T001)
// ============================================

describe('PositionalGraphService — startNode', () => {
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
  });

  it('transitions from pending to running', async () => {
    /**
     * Purpose: Proves normal start flow from implicit pending state
     * Quality Contribution: Core execution lifecycle
     * Acceptance Criteria: Status becomes running, startedAt set
     */
    const result = await service.startNode(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.nodeId).toBe(nodeId);
    expect(result.status).toBe('starting');
    expect(result.startedAt).toBeDefined();
    // Verify ISO timestamp format
    if (result.startedAt) {
      expect(new Date(result.startedAt).toISOString()).toBe(result.startedAt);
    }
  });

  it('transitions from ready to running', async () => {
    /**
     * Purpose: Proves start works on ready (computed status) nodes
     * Quality Contribution: Flexibility for orchestrator to start ready nodes
     * Acceptance Criteria: Status becomes running even if node was in computed-ready state
     */
    // Node with no inputs is implicitly ready
    const result = await service.startNode(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('starting');
  });

  it('rejects double start with E172', async () => {
    /**
     * Purpose: Prevents state corruption from duplicate start
     * Quality Contribution: State machine integrity (CF-04)
     * Acceptance Criteria: E172 InvalidStateTransition returned
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    const result = await service.startNode(ctx, 'test-graph', nodeId);

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E172');
    expect(result.errors[0].message).toContain('starting');
  });

  it('rejects start on complete node with E172', async () => {
    /**
     * Purpose: Proves terminal state protection
     * Quality Contribution: State machine integrity
     * Acceptance Criteria: E172 returned for complete → running
     */
    // Start, accept, and immediately end the node (need outputs first for sample-coder)
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    // Save required outputs for sample-coder: script and language
    await fs.writeFile('/workspace/my-project/test.sh', '#!/bin/bash\necho hello');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/test.sh'
    );
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');
    await service.endNode(ctx, 'test-graph', nodeId);

    const result = await service.startNode(ctx, 'test-graph', nodeId);

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E172');
    expect(result.errors[0].message).toContain('complete');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.startNode(ctx, 'test-graph', 'nonexistent-node');

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });

  it('returns error for unknown graph', async () => {
    /**
     * Purpose: Proves error handling for invalid graph slug
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: Error returned for non-existent graph
     */
    const result = await service.startNode(ctx, 'nonexistent-graph', nodeId);

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('transitions from restart-pending to starting (Workshop 10)', async () => {
    /**
     * Purpose: Proves startNode works after node:restart handler sets restart-pending
     * Quality Contribution: Convention-based contract — ODS can start restart-pending nodes
     * Acceptance Criteria: Status becomes starting from restart-pending
     */
    // First start and get node into waiting-question via simulated state
    await service.startNode(ctx, 'test-graph', nodeId);
    // Simulate node:restart handler setting restart-pending
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const content = fs.getFile(statePath);
    if (!content) throw new Error('state.json not found');
    const state = JSON.parse(content);
    state.nodes[nodeId].status = 'restart-pending';
    fs.setFile(statePath, JSON.stringify(state, null, 2));

    const result = await service.startNode(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.status).toBe('starting');
    expect(result.startedAt).toBeDefined();
  });

  it('computes restart-pending as ready in getNodeStatus (Workshop 10)', async () => {
    /**
     * Purpose: Proves reality builder maps restart-pending to ready for ONBAS
     * Quality Contribution: Convention-based contract — ONBAS sees ready, returns start-node
     * Acceptance Criteria: getNodeStatus returns ready for a restart-pending node
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    // Simulate node:restart handler setting restart-pending
    const statePath = '/workspace/my-project/.chainglass/data/workflows/test-graph/state.json';
    const content = fs.getFile(statePath);
    if (!content) throw new Error('state.json not found');
    const state = JSON.parse(content);
    state.nodes[nodeId].status = 'restart-pending';
    fs.setFile(statePath, JSON.stringify(state, null, 2));

    const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);

    expect(status.status).toBe('ready');
    expect(status.ready).toBe(true);
  });
});

// ============================================
// canEnd Tests (T001)
// ============================================

describe('PositionalGraphService — canEnd', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    // Use loader with output declarations
    const loader = stubWorkUnitLoader({
      units: [testFixtures.sampleCoder, testFixtures.sampleInput],
      strictMode: true,
    });
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;
  });

  it('returns true when all required outputs are saved', async () => {
    /**
     * Purpose: Proves canEnd checks required outputs
     * Quality Contribution: AC-3 verification
     * Acceptance Criteria: canEnd: true when all required outputs present
     */
    // sample-coder requires: script (file) and language (data)
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    await fs.writeFile('/workspace/my-project/test.sh', '#!/bin/bash\necho hello');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/test.sh'
    );
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');

    const result = await service.canEnd(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.canEnd).toBe(true);
    expect(result.savedOutputs).toContain('script');
    expect(result.savedOutputs).toContain('language');
    expect(result.missingOutputs).toEqual([]);
  });

  it('returns false with missing outputs', async () => {
    /**
     * Purpose: Proves canEnd reports missing required outputs
     * Quality Contribution: AC-3 and AC-17 verification
     * Acceptance Criteria: canEnd: false with missingOutputs list
     */
    // Only save one of two required outputs
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');

    const result = await service.canEnd(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.canEnd).toBe(false);
    expect(result.savedOutputs).toContain('language');
    expect(result.missingOutputs).toContain('script');
  });

  it('returns true when node has no required outputs', async () => {
    /**
     * Purpose: Proves canEnd works for nodes without output declarations
     * Quality Contribution: Handles minimal units
     * Acceptance Criteria: canEnd: true when unit has no required outputs
     */
    // Create node with unit that has no outputs
    const loaderNoOutputs = stubWorkUnitLoader({
      units: [createWorkUnit({ slug: 'no-outputs' })],
    });
    const serviceNoOutputs = createTestService(fs, pathResolver, loaderNoOutputs);

    const { lineId } = await serviceNoOutputs.create(ctx, 'test-graph-2');
    const addResult = await serviceNoOutputs.addNode(ctx, 'test-graph-2', lineId, 'no-outputs');
    if (!addResult.nodeId) throw new Error('nodeId expected');

    await serviceNoOutputs.startNode(ctx, 'test-graph-2', addResult.nodeId);
    const result = await serviceNoOutputs.canEnd(ctx, 'test-graph-2', addResult.nodeId);

    expect(result.errors).toEqual([]);
    expect(result.canEnd).toBe(true);
    expect(result.missingOutputs).toEqual([]);
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.canEnd(ctx, 'test-graph', 'nonexistent-node');

    expect(result.canEnd).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });

  it('ignores optional outputs when checking completion', async () => {
    /**
     * Purpose: Proves canEnd only checks required outputs
     * Quality Contribution: Respects WorkUnit output.required flag
     * Acceptance Criteria: canEnd: true even if optional outputs missing
     */
    // sample-tester has 'success' (required) and 'output' (optional)
    const loader = stubWorkUnitLoader({
      units: [testFixtures.sampleTester],
      strictMode: true,
    });
    const serviceTester = createTestService(fs, pathResolver, loader);

    const { lineId } = await serviceTester.create(ctx, 'test-graph-3');
    const addResult = await serviceTester.addNode(ctx, 'test-graph-3', lineId, 'sample-tester');
    if (!addResult.nodeId) throw new Error('nodeId expected');

    await serviceTester.startNode(ctx, 'test-graph-3', addResult.nodeId);
    await simulateAgentAccept(fs, 'test-graph-3', addResult.nodeId);
    // Only save required output 'success', skip optional 'output'
    await serviceTester.saveOutputData(ctx, 'test-graph-3', addResult.nodeId, 'success', true);

    const result = await serviceTester.canEnd(ctx, 'test-graph-3', addResult.nodeId);

    expect(result.errors).toEqual([]);
    expect(result.canEnd).toBe(true);
    expect(result.savedOutputs).toContain('success');
    // 'output' is optional, so it's not in missingOutputs
    expect(result.missingOutputs).toEqual([]);
  });
});

// ============================================
// endNode Tests (T009)
// ============================================

describe('PositionalGraphService — endNode', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let nodeId: string;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = stubWorkUnitLoader({
      units: [testFixtures.sampleCoder, testFixtures.sampleInput],
      strictMode: true,
    });
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();

    // Create graph and node for testing
    const { lineId } = await service.create(ctx, 'test-graph');
    const result = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    if (!result.nodeId) throw new Error('nodeId expected');
    nodeId = result.nodeId;
  });

  it('transitions from running to complete', async () => {
    /**
     * Purpose: Proves normal end flow
     * Quality Contribution: Core execution lifecycle (AC-2)
     * Acceptance Criteria: Status becomes complete, completedAt set
     */
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

    const result = await service.endNode(ctx, 'test-graph', nodeId);

    expect(result.errors).toEqual([]);
    expect(result.nodeId).toBe(nodeId);
    expect(result.status).toBe('complete');
    expect(result.completedAt).toBeDefined();
    // Verify ISO timestamp format
    if (result.completedAt) {
      expect(new Date(result.completedAt).toISOString()).toBe(result.completedAt);
    }
  });

  it('rejects end on pending node with E172', async () => {
    /**
     * Purpose: Proves AC-4 running state requirement
     * Quality Contribution: Enforces state machine integrity
     * Acceptance Criteria: E172 returned for pending → complete
     */
    // Don't start the node
    const result = await service.endNode(ctx, 'test-graph', nodeId);

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E172');
    expect(result.errors[0].message).toContain('pending');
  });

  it('rejects end on complete node with E172', async () => {
    /**
     * Purpose: Proves terminal state protection
     * Quality Contribution: State machine integrity
     * Acceptance Criteria: E172 returned for complete → complete
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    await fs.writeFile('/workspace/my-project/test.sh', '#!/bin/bash\necho hello');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/test.sh'
    );
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');
    await service.endNode(ctx, 'test-graph', nodeId);

    const result = await service.endNode(ctx, 'test-graph', nodeId);

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E172');
    expect(result.errors[0].message).toContain('complete');
  });

  it('returns E175 when required outputs missing', async () => {
    /**
     * Purpose: Proves AC-17 missing outputs check
     * Quality Contribution: Prevents incomplete node completion
     * Acceptance Criteria: E175 returned with missing output names
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    // Don't save any outputs

    const result = await service.endNode(ctx, 'test-graph', nodeId);

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E175');
    // Error should mention missing outputs
    expect(result.errors[0].message).toContain('script');
    expect(result.errors[0].message).toContain('language');
  });

  it('returns E153 for unknown node', async () => {
    /**
     * Purpose: Proves error handling for invalid node ID
     * Quality Contribution: Clear error messages for debugging
     * Acceptance Criteria: E153 error returned
     */
    const result = await service.endNode(ctx, 'test-graph', 'nonexistent-node');

    expect(result.status).toBeUndefined();
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E153');
  });

  it('updates graph status to in_progress when first node completes', async () => {
    /**
     * Purpose: Proves graph status updates on node completion
     * Quality Contribution: Graph-level progress tracking
     * Acceptance Criteria: graph_status changes from pending to in_progress
     */
    // Add a second node so the graph is not complete when first node finishes
    const showResult = await service.show(ctx, 'test-graph');
    const lineId = showResult.lines?.[0]?.id;
    expect(lineId).toBeDefined();
    await service.addNode(ctx, 'test-graph', lineId as string, 'sample-input');

    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    await fs.writeFile('/workspace/my-project/test.sh', '#!/bin/bash\necho hello');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/test.sh'
    );
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');
    await service.endNode(ctx, 'test-graph', nodeId);

    const status = await service.getStatus(ctx, 'test-graph');
    expect(status.status).toBe('in_progress');
  });
});

// ============================================
// saveOutputData/saveOutputFile with running state requirement (T011)
// ============================================

describe('PositionalGraphService — output storage requires running state', () => {
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

    // Create a source file for saveOutputFile tests
    await fs.writeFile('/workspace/my-project/script.sh', '#!/bin/bash\necho "hello"');
  });

  it('saveOutputData returns E176 when node not running', async () => {
    /**
     * Purpose: Proves AC-4 running state requirement for outputs
     * Quality Contribution: Enforces state machine integrity
     * Acceptance Criteria: E176 NodeNotRunning returned
     */
    // Don't start the node
    const result = await service.saveOutputData(ctx, 'test-graph', nodeId, 'spec', 'hello');

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E176');
  });

  it('saveOutputFile returns E176 when node not running', async () => {
    /**
     * Purpose: Proves AC-4 running state requirement for file outputs
     * Quality Contribution: Enforces state machine integrity
     * Acceptance Criteria: E176 NodeNotRunning returned
     */
    // Don't start the node
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/script.sh'
    );

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E176');
  });

  it('saveOutputData works when node is running', async () => {
    /**
     * Purpose: Proves normal output save after start
     * Quality Contribution: Core workflow
     * Acceptance Criteria: Output saved successfully
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    const result = await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');

    expect(result.saved).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('saveOutputFile works when node is running', async () => {
    /**
     * Purpose: Proves normal file output save after start
     * Quality Contribution: Core workflow
     * Acceptance Criteria: File output saved successfully
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    const result = await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/script.sh'
    );

    expect(result.saved).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('saveOutputData returns E176 when node is complete', async () => {
    /**
     * Purpose: Proves outputs cannot be saved after completion
     * Quality Contribution: Enforces state machine integrity
     * Acceptance Criteria: E176 returned for complete node
     */
    await service.startNode(ctx, 'test-graph', nodeId);
    await simulateAgentAccept(fs, 'test-graph', nodeId);
    await fs.writeFile('/workspace/my-project/test.sh', '#!/bin/bash\necho hello');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      nodeId,
      'script',
      '/workspace/my-project/test.sh'
    );
    await service.saveOutputData(ctx, 'test-graph', nodeId, 'language', 'bash');
    await service.endNode(ctx, 'test-graph', nodeId);

    const result = await service.saveOutputData(ctx, 'test-graph', nodeId, 'extra', 'value');

    expect(result.saved).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].code).toBe('E176');
  });
});
