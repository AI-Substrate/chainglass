/**
 * Input Retrieval Tests (Phase 5: Input Retrieval)
 *
 * Purpose: Tests for getInputData and getInputFile service methods.
 * These enable agents to retrieve data from completed upstream nodes
 * using the existing collateInputs algorithm for resolution.
 *
 * Test Plan from tasks.md Alignment Brief:
 * - getInputData: resolves via collateInputs, E178 source incomplete, E175 output missing, E160 unwired, E153 unknown
 * - getInputFile: same error paths plus relative → absolute path resolution
 *
 * Critical Insight #2 (from /didyouknow):
 * The loadNodeData function in input-resolution.ts had a bug where it read data.json
 * as a flat object, but saveOutputData stores in { outputs: {...} } wrapper.
 * These tests verify the fix by ensuring data flows through correctly.
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  IPositionalGraphService,
  IWorkUnitLoader,
  NarrowWorkUnit,
} from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ============================================
// Test Helpers
// ============================================

/**
 * Simulate agent accepting a node that is in 'starting' state.
 *
 * Plan 032 introduced a two-phase handshake: startNode() puts nodes in 'starting',
 * and the agent must accept before doing work. The acceptNode service method is
 * not yet implemented, so tests that need to do work after startNode() use this
 * helper to transition state.json directly.
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

function createFakeUnitLoader(units: NarrowWorkUnit[]): IWorkUnitLoader {
  const unitMap = new Map(units.map((u) => [u.slug, u]));
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      const unit = unitMap.get(slug);
      if (unit) {
        return { unit, errors: [] };
      }
      return { errors: [{ code: 'E120', message: `Unit '${slug}' not found` } as ResultError] };
    },
  };
}

function createTestService(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  loader: IWorkUnitLoader
): IPositionalGraphService {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

// WorkUnit definitions
const sampleInput: NarrowWorkUnit = {
  slug: 'sample-input',
  type: 'user-input',
  inputs: [],
  outputs: [
    { name: 'spec', type: 'data', required: true },
    { name: 'notes', type: 'data', required: false },
    { name: 'config', type: 'file', required: false },
  ],
};

const sampleCoder: NarrowWorkUnit = {
  slug: 'sample-coder',
  type: 'agent',
  inputs: [
    { name: 'spec', type: 'data', required: true },
    { name: 'config', type: 'file', required: false },
    { name: 'optionalData', type: 'data', required: false },
  ],
  outputs: [
    { name: 'code', type: 'data', required: true },
    { name: 'script', type: 'file', required: true },
  ],
};

const sampleTester: NarrowWorkUnit = {
  slug: 'sample-tester',
  type: 'agent',
  inputs: [
    { name: 'language', type: 'data', required: true },
    { name: 'script', type: 'file', required: true },
  ],
  outputs: [{ name: 'result', type: 'data', required: true }],
};

// ============================================
// getInputData Tests
// ============================================

describe('PositionalGraphService — getInputData', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([sampleInput, sampleCoder, sampleTester]);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
  });

  it('should resolve input from complete upstream node', async () => {
    /**
     * Purpose: Proves end-to-end data flow works using actual service methods
     * Quality Contribution: Core pipeline functionality
     * Acceptance Criteria: Returns value from source node saved via saveOutputData
     *
     * This test verifies Critical Insight #2 fix: saveOutputData uses { outputs: {...} }
     * wrapper, and getInputData correctly retrieves through that wrapper.
     */
    // Setup: line0 = sample-input, line1 = sample-coder wired to sample-input.spec
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire coder's spec input to sample-input.spec
    await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
      from_unit: 'sample-input',
      from_output: 'spec',
    });

    // Complete upstream node using service methods (not raw file writes)
    await service.startNode(ctx, 'test-graph', inputNodeId);
    await simulateAgentAccept(fs, 'test-graph', inputNodeId);
    await service.saveOutputData(ctx, 'test-graph', inputNodeId, 'spec', 'The spec content');
    await service.endNode(ctx, 'test-graph', inputNodeId);

    // Now retrieve input from downstream node
    const result = await service.getInputData(ctx, 'test-graph', coderNodeId, 'spec');

    expect(result.errors).toEqual([]);
    expect(result.nodeId).toBe(coderNodeId);
    expect(result.inputName).toBe('spec');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sourceNodeId).toBe(inputNodeId);
    expect(result.sources[0].sourceOutput).toBe('spec');
    expect(result.sources[0].value).toBe('The spec content');
    expect(result.complete).toBe(true);
  });

  it('should return E178 when source node is incomplete (running)', async () => {
    /**
     * Purpose: Proves that input retrieval requires complete upstream nodes
     * Quality Contribution: Data integrity — prevents reading incomplete data
     * Acceptance Criteria: E178 InputNotAvailable returned
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire coder to sample-input
    await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
      from_unit: 'sample-input',
      from_output: 'spec',
    });

    // Start upstream node but don't complete it
    await service.startNode(ctx, 'test-graph', inputNodeId);

    // Try to get input — should fail with E178
    const result = await service.getInputData(ctx, 'test-graph', coderNodeId, 'spec');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E178');
    expect(result.errors[0].message).toContain('not available');
  });

  it('should return E175 when source complete but output missing', async () => {
    /**
     * Purpose: Proves that source node completion isn't enough — output must exist
     * Quality Contribution: Data integrity — ensures outputs are actually saved
     * Acceptance Criteria: E175 OutputNotFound returned when output not saved
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire to a different output that won't be saved
    await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
      from_unit: 'sample-input',
      from_output: 'notes', // notes output not saved
    });

    // Complete upstream node with only spec output (not notes)
    await service.startNode(ctx, 'test-graph', inputNodeId);
    await simulateAgentAccept(fs, 'test-graph', inputNodeId);
    await service.saveOutputData(ctx, 'test-graph', inputNodeId, 'spec', 'spec content');
    await service.endNode(ctx, 'test-graph', inputNodeId);

    // Try to get notes input — should fail with E175
    const result = await service.getInputData(ctx, 'test-graph', coderNodeId, 'spec');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E175');
    expect(result.errors[0].message).toContain('notes');
  });

  it('should return E160 when input is not wired', async () => {
    /**
     * Purpose: Proves unwired inputs are properly detected
     * Quality Contribution: Clear error for missing configuration
     * Acceptance Criteria: E160 InputNotWired returned
     */
    const { lineId } = await service.create(ctx, 'test-graph');
    const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');
    const coderNodeId = coderNode.nodeId as string;

    // Don't wire any inputs — spec is required but unwired

    // Try to get input — should fail with E160
    const result = await service.getInputData(ctx, 'test-graph', coderNodeId, 'spec');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E160');
    expect(result.errors[0].message).toContain('not wired');
  });

  it('should return E153 for unknown node', async () => {
    /**
     * Purpose: Proves node existence is validated
     * Quality Contribution: Clear error for nonexistent nodes
     * Acceptance Criteria: E153 NodeNotFound returned
     */
    await service.create(ctx, 'test-graph');

    const result = await service.getInputData(ctx, 'test-graph', 'nonexistent-node', 'spec');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E153');
  });

  it('should resolve input with from_node wiring', async () => {
    /**
     * Purpose: Proves direct node ID wiring works
     * Quality Contribution: Supports both wiring modes
     * Acceptance Criteria: Input resolved when wired to specific node ID
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire using from_node (direct reference)
    await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
      from_node: inputNodeId,
      from_output: 'spec',
    });

    // Complete upstream node
    await service.startNode(ctx, 'test-graph', inputNodeId);
    await simulateAgentAccept(fs, 'test-graph', inputNodeId);
    await service.saveOutputData(ctx, 'test-graph', inputNodeId, 'spec', {
      version: 1,
      data: 'test',
    });
    await service.endNode(ctx, 'test-graph', inputNodeId);

    const result = await service.getInputData(ctx, 'test-graph', coderNodeId, 'spec');

    expect(result.errors).toEqual([]);
    expect(result.sources[0].value).toEqual({ version: 1, data: 'test' });
  });

  it('should return multiple sources when from_unit matches multiple nodes', async () => {
    /**
     * Purpose: Proves multi-source resolution (per Critical Insight #4)
     * Quality Contribution: Supports fan-in patterns with multiple upstream nodes
     * Acceptance Criteria: sources[] contains all matching complete nodes
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    // Two sample-input nodes on line0
    const input1 = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const input2 = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');

    const input1Id = input1.nodeId as string;
    const input2Id = input2.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire to from_unit (matches both)
    await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
      from_unit: 'sample-input',
      from_output: 'spec',
    });

    // Complete both upstream nodes with different data
    await service.startNode(ctx, 'test-graph', input1Id);
    await simulateAgentAccept(fs, 'test-graph', input1Id);
    await service.saveOutputData(ctx, 'test-graph', input1Id, 'spec', 'from-input-1');
    await service.endNode(ctx, 'test-graph', input1Id);

    await service.startNode(ctx, 'test-graph', input2Id);
    await simulateAgentAccept(fs, 'test-graph', input2Id);
    await service.saveOutputData(ctx, 'test-graph', input2Id, 'spec', 'from-input-2');
    await service.endNode(ctx, 'test-graph', input2Id);

    const result = await service.getInputData(ctx, 'test-graph', coderNodeId, 'spec');

    expect(result.errors).toEqual([]);
    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((s) => s.value)).toContain('from-input-1');
    expect(result.sources.map((s) => s.value)).toContain('from-input-2');
    expect(result.complete).toBe(true);
  });
});

// ============================================
// getInputFile Tests
// ============================================

describe('PositionalGraphService — getInputFile', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([sampleInput, sampleCoder, sampleTester]);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
  });

  it('should resolve file input from complete upstream node', async () => {
    /**
     * Purpose: Proves file path retrieval works through the full stack
     * Quality Contribution: Core file input functionality
     * Acceptance Criteria: Returns absolute path to source file
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire coder's config input to sample-input.config
    await service.setInput(ctx, 'test-graph', coderNodeId, 'config', {
      from_unit: 'sample-input',
      from_output: 'config',
    });

    // Create source file and complete upstream node
    const sourceFile = '/workspace/my-project/config.yaml';
    await fs.writeFile(sourceFile, 'key: value\n');

    await service.startNode(ctx, 'test-graph', inputNodeId);
    await simulateAgentAccept(fs, 'test-graph', inputNodeId);
    await service.saveOutputData(ctx, 'test-graph', inputNodeId, 'spec', 'spec content'); // Required output
    await service.saveOutputFile(ctx, 'test-graph', inputNodeId, 'config', sourceFile);
    const endResult = await service.endNode(ctx, 'test-graph', inputNodeId);
    expect(endResult.errors).toEqual([]); // Verify node actually completed

    // Retrieve file input
    const result = await service.getInputFile(ctx, 'test-graph', coderNodeId, 'config');

    expect(result.errors).toEqual([]);
    expect(result.nodeId).toBe(coderNodeId);
    expect(result.inputName).toBe('config');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].sourceNodeId).toBe(inputNodeId);
    expect(result.sources[0].filePath).toContain('config.yaml'); // Absolute path
    expect(result.sources[0].filePath).toMatch(/^\/workspace/); // Must be absolute
    expect(result.complete).toBe(true);
  });

  it('should return E178 when source node is incomplete', async () => {
    /**
     * Purpose: Proves file input retrieval requires complete upstream nodes
     * Quality Contribution: Data integrity
     * Acceptance Criteria: E178 InputNotAvailable returned
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    await service.setInput(ctx, 'test-graph', coderNodeId, 'config', {
      from_unit: 'sample-input',
      from_output: 'config',
    });

    // Start but don't complete upstream node
    await service.startNode(ctx, 'test-graph', inputNodeId);

    const result = await service.getInputFile(ctx, 'test-graph', coderNodeId, 'config');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E178');
  });

  it('should return E175 when source complete but file output missing', async () => {
    /**
     * Purpose: Proves output must be saved, not just node complete
     * Quality Contribution: Data integrity
     * Acceptance Criteria: E175 OutputNotFound returned
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    await service.setInput(ctx, 'test-graph', coderNodeId, 'config', {
      from_unit: 'sample-input',
      from_output: 'config',
    });

    // Complete upstream node without saving config output
    await service.startNode(ctx, 'test-graph', inputNodeId);
    await simulateAgentAccept(fs, 'test-graph', inputNodeId);
    await service.saveOutputData(ctx, 'test-graph', inputNodeId, 'spec', 'some spec');
    await service.endNode(ctx, 'test-graph', inputNodeId);

    const result = await service.getInputFile(ctx, 'test-graph', coderNodeId, 'config');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E175');
  });

  it('should return E160 when file input is not wired', async () => {
    /**
     * Purpose: Proves unwired file inputs are detected
     * Quality Contribution: Clear error messaging
     * Acceptance Criteria: E160 InputNotWired returned
     */
    const { lineId } = await service.create(ctx, 'test-graph');
    const coderNode = await service.addNode(ctx, 'test-graph', lineId, 'sample-coder');

    // Don't wire config input
    const result = await service.getInputFile(
      ctx,
      'test-graph',
      coderNode.nodeId as string,
      'config'
    );

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E160');
  });

  it('should return E153 for unknown node', async () => {
    /**
     * Purpose: Proves node existence validation
     * Quality Contribution: Clear error for bad node ID
     * Acceptance Criteria: E153 NodeNotFound returned
     */
    await service.create(ctx, 'test-graph');

    const result = await service.getInputFile(ctx, 'test-graph', 'nonexistent-node', 'config');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E153');
  });

  it('should return multiple file sources when from_unit matches multiple nodes', async () => {
    /**
     * Purpose: Proves multi-source file resolution (per Critical Insight #4)
     * Quality Contribution: Supports fan-in patterns for files
     * Acceptance Criteria: sources[] contains file paths from all matching nodes
     */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    // Two sample-input nodes
    const input1 = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const input2 = await service.addNode(ctx, 'test-graph', line0, 'sample-input');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');

    const input1Id = input1.nodeId as string;
    const input2Id = input2.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    await service.setInput(ctx, 'test-graph', coderNodeId, 'config', {
      from_unit: 'sample-input',
      from_output: 'config',
    });

    // Create source files
    await fs.writeFile('/workspace/my-project/config1.yaml', 'one');
    await fs.writeFile('/workspace/my-project/config2.yaml', 'two');

    // Complete both upstream nodes (must save required 'spec' output too)
    await service.startNode(ctx, 'test-graph', input1Id);
    await simulateAgentAccept(fs, 'test-graph', input1Id);
    await service.saveOutputData(ctx, 'test-graph', input1Id, 'spec', 'spec1');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      input1Id,
      'config',
      '/workspace/my-project/config1.yaml'
    );
    await service.endNode(ctx, 'test-graph', input1Id);

    await service.startNode(ctx, 'test-graph', input2Id);
    await simulateAgentAccept(fs, 'test-graph', input2Id);
    await service.saveOutputData(ctx, 'test-graph', input2Id, 'spec', 'spec2');
    await service.saveOutputFile(
      ctx,
      'test-graph',
      input2Id,
      'config',
      '/workspace/my-project/config2.yaml'
    );
    await service.endNode(ctx, 'test-graph', input2Id);

    const result = await service.getInputFile(ctx, 'test-graph', coderNodeId, 'config');

    expect(result.errors).toEqual([]);
    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((s) => s.filePath)).toContainEqual(
      expect.stringContaining('config1.yaml')
    );
    expect(result.sources.map((s) => s.filePath)).toContainEqual(
      expect.stringContaining('config2.yaml')
    );
    expect(result.complete).toBe(true);
  });
});
