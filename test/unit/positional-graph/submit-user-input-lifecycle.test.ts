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
      if (unit) return { unit, errors: [] };
      return { errors: [{ code: 'E120', message: `Unit '${slug}' not found` } as ResultError] };
    },
  };
}

function createTestService(
  fs: FakeFileSystem,
  pathResolver: FakePathResolver,
  loader: IWorkUnitLoader
) {
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

const userInputUnit: NarrowWorkUnit = {
  slug: 'get-requirements',
  type: 'user-input',
  inputs: [],
  outputs: [{ name: 'requirements', type: 'data', required: true }],
  userInput: {
    prompt: 'Describe your project requirements',
    inputType: 'text',
    outputName: 'requirements',
  },
};

const coderUnit: NarrowWorkUnit = {
  slug: 'sample-coder',
  type: 'agent',
  inputs: [{ name: 'spec', type: 'data', required: true }],
  outputs: [{ name: 'code', type: 'data', required: true }],
};

const challengeUnit: NarrowWorkUnit = {
  slug: 'sample-challenge',
  type: 'user-input',
  inputs: [],
  outputs: [{ name: 'challenge', type: 'data', required: true }],
  userInput: {
    prompt: 'What coding challenge should we solve?',
    inputType: 'text',
    outputName: 'challenge',
  },
};

const languageUnit: NarrowWorkUnit = {
  slug: 'sample-language',
  type: 'user-input',
  inputs: [],
  outputs: [{ name: 'language', type: 'data', required: true }],
  userInput: {
    prompt: 'Which programming language?',
    inputType: 'single',
    outputName: 'language',
    options: [
      { key: 'typescript', label: 'TypeScript' },
      { key: 'python', label: 'Python' },
      { key: 'go', label: 'Go' },
    ],
  },
};

const multiInputCoderUnit: NarrowWorkUnit = {
  slug: 'multi-coder',
  type: 'agent',
  inputs: [
    { name: 'challenge', type: 'data', required: true },
    { name: 'language', type: 'data', required: true },
  ],
  outputs: [{ name: 'code', type: 'data', required: true }],
};

describe('submitUserInput lifecycle', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader([
      userInputUnit,
      coderUnit,
      challengeUnit,
      languageUnit,
      multiInputCoderUnit,
    ]);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
  });

  it('walks startNode → accept → saveOutputData → endNode for user-input node', async () => {
    /*
    Test Doc:
    - Why: Validates the exact lifecycle the submitUserInput server action will call.
    - Contract: startNode → raiseNodeEvent('node:accepted') → saveOutputData → endNode succeeds for user-input.
    - Usage Notes: Exercises real service, not server action wrapper. Proves guard passes after accept.
    - Quality Contribution: Catches lifecycle sequencing bugs (saveOutputData requires agent-accepted).
    - Worked Example: user-input node pending → starting → agent-accepted → complete with data in data.json.
    */
    const { lineId } = await service.create(ctx, 'test-graph');
    const node = await service.addNode(ctx, 'test-graph', lineId, 'get-requirements');
    const nodeId = node.nodeId as string;

    // 1. Start the node (pending → starting)
    const startResult = await service.startNode(ctx, 'test-graph', nodeId);
    expect(startResult.errors).toHaveLength(0);

    // 2. Accept (starting → agent-accepted)
    const acceptResult = await service.raiseNodeEvent(
      ctx,
      'test-graph',
      nodeId,
      'node:accepted',
      {},
      'executor'
    );
    expect(acceptResult.errors).toHaveLength(0);

    // 3. Save output data (guard passes because agent-accepted)
    const saveResult = await service.saveOutputData(
      ctx,
      'test-graph',
      nodeId,
      'requirements',
      'Build a REST API for user management'
    );
    expect(saveResult.errors).toHaveLength(0);

    // 4. End the node (agent-accepted → complete, canEnd validates output exists)
    const endResult = await service.endNode(ctx, 'test-graph', nodeId);
    expect(endResult.errors).toHaveLength(0);

    // Verify final state
    const status = await service.getNodeStatus(ctx, 'test-graph', nodeId);
    expect(status.status).toBe('complete');
  });

  it('downstream node sees available input after user-input completes', async () => {
    /*
    Test Doc:
    - Why: Validates the full data flow — user-input output available to downstream via collateInputs.
    - Contract: After lifecycle, downstream from_unit resolution finds the output.
    - Usage Notes: Tests Format A data compatibility end-to-end with real saveOutputData.
    - Quality Contribution: Proves the Phase 1 Format A fix + Phase 2 lifecycle produce consumable data.
    - Worked Example: user-input saves 'requirements' → downstream coder sees inputsAvailable: true.
    */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    const inputNode = await service.addNode(ctx, 'test-graph', line0, 'get-requirements');
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'sample-coder');
    const inputNodeId = inputNode.nodeId as string;
    const coderNodeId = coderNode.nodeId as string;

    // Wire coder's spec input to user-input's requirements output
    await service.setInput(ctx, 'test-graph', coderNodeId, 'spec', {
      from_unit: 'get-requirements',
      from_output: 'requirements',
    });

    // Walk the lifecycle for the user-input node
    await service.startNode(ctx, 'test-graph', inputNodeId);
    await service.raiseNodeEvent(ctx, 'test-graph', inputNodeId, 'node:accepted', {}, 'executor');
    await service.saveOutputData(
      ctx,
      'test-graph',
      inputNodeId,
      'requirements',
      'Build a REST API'
    );
    await service.endNode(ctx, 'test-graph', inputNodeId);

    // Check downstream node sees the input
    const coderStatus = await service.getNodeStatus(ctx, 'test-graph', coderNodeId);
    expect(coderStatus.readyDetail.inputsAvailable).toBe(true);
    expect(coderStatus.ready).toBe(true);
  });

  it('multi-node composition: 2 user-input nodes → downstream gates open', async () => {
    /*
    Test Doc:
    - Why: Validates the multi-question composition pattern (multiple nodes on a line).
    - Contract: 2 user-input nodes complete → downstream node with 2 wired inputs sees ready: true.
    - Usage Notes: Proves the "one node = one question" design works at scale.
    - Quality Contribution: Catches gate resolution bugs when multiple inputs must all be available.
    - Worked Example: challenge + language complete → multi-coder sees both inputs, ready to run.
    */
    const { lineId: line0 } = await service.create(ctx, 'test-graph');
    const addLine1 = await service.addLine(ctx, 'test-graph');
    const line1 = addLine1.lineId as string;

    // Line 0: two user-input nodes
    const challengeNode = await service.addNode(ctx, 'test-graph', line0, 'sample-challenge');
    const languageNode = await service.addNode(ctx, 'test-graph', line0, 'sample-language');
    const challengeId = challengeNode.nodeId as string;
    const languageId = languageNode.nodeId as string;

    // Line 1: downstream coder wired to both
    const coderNode = await service.addNode(ctx, 'test-graph', line1, 'multi-coder');
    const coderId = coderNode.nodeId as string;

    await service.setInput(ctx, 'test-graph', coderId, 'challenge', {
      from_node: challengeId,
      from_output: 'challenge',
    });
    await service.setInput(ctx, 'test-graph', coderId, 'language', {
      from_node: languageId,
      from_output: 'language',
    });

    // Before submission: downstream not ready (inputs missing)
    const beforeStatus = await service.getNodeStatus(ctx, 'test-graph', coderId);
    expect(beforeStatus.readyDetail.inputsAvailable).toBe(false);
    expect(beforeStatus.ready).toBe(false);

    // Submit challenge (text input)
    await service.startNode(ctx, 'test-graph', challengeId);
    await service.raiseNodeEvent(ctx, 'test-graph', challengeId, 'node:accepted', {}, 'executor');
    await service.saveOutputData(ctx, 'test-graph', challengeId, 'challenge', 'Build a CLI tool');
    await service.endNode(ctx, 'test-graph', challengeId);

    // After first submission: still not ready (language missing)
    const midStatus = await service.getNodeStatus(ctx, 'test-graph', coderId);
    expect(midStatus.readyDetail.inputsAvailable).toBe(false);

    // Submit language (single-choice input)
    await service.startNode(ctx, 'test-graph', languageId);
    await service.raiseNodeEvent(ctx, 'test-graph', languageId, 'node:accepted', {}, 'executor');
    await service.saveOutputData(ctx, 'test-graph', languageId, 'language', 'typescript');
    await service.endNode(ctx, 'test-graph', languageId);

    // After both submissions: downstream ready
    const afterStatus = await service.getNodeStatus(ctx, 'test-graph', coderId);
    expect(afterStatus.readyDetail.inputsAvailable).toBe(true);
    expect(afterStatus.ready).toBe(true);
    expect(afterStatus.status).toBe('ready');
  });
});
