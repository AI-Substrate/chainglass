import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type {
  AddNodeResult,
  IPositionalGraphService,
  IWorkUnitLoader,
  NodeShowResult,
} from '@chainglass/positional-graph/interfaces';
import { NodeConfigSchema } from '@chainglass/positional-graph/schemas';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { BaseResult, ResultError } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';

// ============================================
// Test Helpers — Per DYK-P4-I5
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

/**
 * Per DYK-P4-I5: Inline fake IWorkUnitLoader — no YAML fixtures needed.
 * Returns a loader that considers the given slugs as "known" (valid).
 */
function createFakeUnitLoader(knownSlugs: string[]): IWorkUnitLoader {
  const known = new Set(knownSlugs);
  return {
    async load(_ctx: WorkspaceContext, slug: string) {
      if (known.has(slug)) {
        return { unit: { slug, inputs: [], outputs: [] }, errors: [] };
      }
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

/** Assert node ID is present (narrows type from string | undefined to string). */
function expectNodeId(result: AddNodeResult): string {
  expect(result.errors).toEqual([]);
  expect(result.nodeId).toBeTruthy();
  const id = result.nodeId;
  expect(typeof id).toBe('string');
  return id as string;
}

describe('PositionalGraphService — Node Operations', () => {
  let fs: FakeFileSystem;
  let pathResolver: FakePathResolver;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;
  let yamlParser: YamlParserAdapter;

  beforeEach(async () => {
    fs = new FakeFileSystem();
    pathResolver = new FakePathResolver();
    const loader = createFakeUnitLoader(['sample-coder', 'research-concept', 'code-reviewer']);
    service = createTestService(fs, pathResolver, loader);
    ctx = createTestContext();
    yamlParser = new YamlParserAdapter();
  });

  // ============================================
  // addNode
  // ============================================

  describe('addNode', () => {
    it('appends a node to a line', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const result: AddNodeResult = await service.addNode(
        ctx,
        'my-pipeline',
        lineId,
        'sample-coder'
      );

      expect(result.errors).toEqual([]);
      expect(result.nodeId).toBeTruthy();
      expect(result.lineId).toBe(lineId);
      expect(result.position).toBe(0);
    });

    it('inserts a node at a specific position', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder');
      const result = await service.addNode(ctx, 'my-pipeline', lineId, 'research-concept', {
        atPosition: 0,
      });

      expect(result.errors).toEqual([]);
      expect(result.position).toBe(0);

      // Verify ordering: research-concept at 0, sample-coder shifted to 1
      const loaded = await service.load(ctx, 'my-pipeline');
      const line = loaded.definition?.lines.find((l) => l.id === lineId);
      expect(line?.nodes[0]).toBe(result.nodeId);
    });

    it('creates node with description and execution mode', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const result = await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder', {
        description: 'Generate code from spec',
        execution: 'parallel',
      });
      const nodeId = expectNodeId(result);

      // Verify node.yaml has the options
      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/my-pipeline/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      expect(config.description).toBe('Generate code from spec');
      expect(config.execution).toBe('parallel');
    });

    it('generates node ID in <unitSlug>-<hex3> format', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const result = await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder');

      expect(result.nodeId).toMatch(/^sample-coder-[0-9a-f]{3}$/);
    });

    it('creates node.yaml on disk with correct schema', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const result = await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder');
      const nodeId = expectNodeId(result);

      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/my-pipeline/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const parsed = yamlParser.parse(nodeYaml, 'node.yaml');

      // Validate against NodeConfigSchema
      const validated = NodeConfigSchema.safeParse(parsed);
      expect(validated.success).toBe(true);
      if (validated.success) {
        expect(validated.data.id).toBe(nodeId);
        expect(validated.data.unit_slug).toBe('sample-coder');
        expect(validated.data.execution).toBe('serial'); // default
        expect(validated.data.created_at).toBeTruthy();
      }
    });

    it('returns E159 when WorkUnit not found', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const result = await service.addNode(ctx, 'my-pipeline', lineId, 'nonexistent-unit');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E159');
    });

    it('returns E150 when line not found', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.addNode(ctx, 'my-pipeline', 'nonexistent-line', 'sample-coder');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });

    it('returns E157 when graph not found', async () => {
      const result = await service.addNode(ctx, 'nonexistent', 'line-abc', 'sample-coder');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E157');
    });
  });

  // ============================================
  // removeNode
  // ============================================

  describe('removeNode', () => {
    it('removes node from graph and deletes node directory', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const addResult = await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder');
      const nodeId = expectNodeId(addResult);

      const result: BaseResult = await service.removeNode(ctx, 'my-pipeline', nodeId);

      expect(result.errors).toEqual([]);

      // Verify node removed from graph.yaml
      const loaded = await service.load(ctx, 'my-pipeline');
      const line = loaded.definition?.lines.find((l) => l.id === lineId);
      expect(line?.nodes).not.toContain(nodeId);
    });

    it('returns E153 for nonexistent node', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.removeNode(ctx, 'my-pipeline', 'nonexistent-node');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });

    it('updates line nodes[] array correctly', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const node1 = expectNodeId(await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder'));
      const node2 = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'research-concept')
      );

      await service.removeNode(ctx, 'my-pipeline', node1);

      const loaded = await service.load(ctx, 'my-pipeline');
      const line = loaded.definition?.lines.find((l) => l.id === lineId);
      expect(line?.nodes).toEqual([node2]);
    });

    it('cleans up node directory from filesystem', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const nodeId = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder')
      );

      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/my-pipeline/nodes/${nodeId}`;
      expect(await fs.exists(nodeDir)).toBe(true);

      await service.removeNode(ctx, 'my-pipeline', nodeId);

      expect(await fs.exists(nodeDir)).toBe(false);
    });
  });

  // ============================================
  // moveNode
  // ============================================

  describe('moveNode', () => {
    it('repositions node within the same line', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const node1 = expectNodeId(await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder'));
      const node2 = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'research-concept')
      );
      const node3 = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'code-reviewer')
      );

      // Move node3 (position 2) to position 0
      const result = await service.moveNode(ctx, 'my-pipeline', node3, { toPosition: 0 });

      expect(result.errors).toEqual([]);

      const loaded = await service.load(ctx, 'my-pipeline');
      const line = loaded.definition?.lines.find((l) => l.id === lineId);
      expect(line?.nodes).toEqual([node3, node1, node2]);
    });

    it('moves node to another line (append)', async () => {
      const { lineId: line1 } = await service.create(ctx, 'my-pipeline');
      const addLineResult = await service.addLine(ctx, 'my-pipeline');
      const line2 = addLineResult.lineId;
      expect(line2).toBeTruthy();

      const nodeId = expectNodeId(await service.addNode(ctx, 'my-pipeline', line1, 'sample-coder'));

      const result = await service.moveNode(ctx, 'my-pipeline', nodeId, {
        toLineId: line2 as string,
      });

      expect(result.errors).toEqual([]);

      const loaded = await service.load(ctx, 'my-pipeline');
      const srcLine = loaded.definition?.lines.find((l) => l.id === line1);
      const tgtLine = loaded.definition?.lines.find((l) => l.id === line2);
      expect(srcLine?.nodes).toEqual([]);
      expect(tgtLine?.nodes).toEqual([nodeId]);
    });

    it('moves node to another line at a specific position', async () => {
      const { lineId: line1 } = await service.create(ctx, 'my-pipeline');
      const addLineResult = await service.addLine(ctx, 'my-pipeline');
      const line2 = addLineResult.lineId as string;

      const existingNode = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', line2, 'research-concept')
      );
      const movingNode = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', line1, 'sample-coder')
      );

      const result = await service.moveNode(ctx, 'my-pipeline', movingNode, {
        toLineId: line2,
        toPosition: 0,
      });

      expect(result.errors).toEqual([]);

      const loaded = await service.load(ctx, 'my-pipeline');
      const tgtLine = loaded.definition?.lines.find((l) => l.id === line2);
      expect(tgtLine?.nodes[0]).toBe(movingNode);
      expect(tgtLine?.nodes[1]).toBe(existingNode);
    });

    it('updates both source and target line nodes[]', async () => {
      const { lineId: line1 } = await service.create(ctx, 'my-pipeline');
      const addLineResult = await service.addLine(ctx, 'my-pipeline');
      const line2 = addLineResult.lineId as string;

      const node1 = expectNodeId(await service.addNode(ctx, 'my-pipeline', line1, 'sample-coder'));
      const node2 = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', line1, 'research-concept')
      );

      await service.moveNode(ctx, 'my-pipeline', node1, { toLineId: line2 });

      const loaded = await service.load(ctx, 'my-pipeline');
      const srcLine = loaded.definition?.lines.find((l) => l.id === line1);
      const tgtLine = loaded.definition?.lines.find((l) => l.id === line2);
      expect(srcLine?.nodes).toEqual([node2]);
      expect(tgtLine?.nodes).toEqual([node1]);
    });

    it('returns E154 for invalid position', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const nodeId = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder')
      );

      const result = await service.moveNode(ctx, 'my-pipeline', nodeId, { toPosition: 99 });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E154');
    });

    it('returns E153 for nonexistent node', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.moveNode(ctx, 'my-pipeline', 'nonexistent', { toPosition: 0 });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });

    it('returns E150 for nonexistent target line', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const nodeId = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder')
      );

      const result = await service.moveNode(ctx, 'my-pipeline', nodeId, {
        toLineId: 'nonexistent-line',
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E150');
    });
  });

  // ============================================
  // setNodeDescription
  // ============================================

  describe('setNodeDescription', () => {
    it('persists description in node.yaml', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const nodeId = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder')
      );

      const result = await service.setNodeDescription(
        ctx,
        'my-pipeline',
        nodeId,
        'Updated description'
      );

      expect(result.errors).toEqual([]);

      // Verify node.yaml updated
      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/my-pipeline/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      expect(config.description).toBe('Updated description');
    });

    it('returns E153 for nonexistent node', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.setNodeDescription(ctx, 'my-pipeline', 'nonexistent', 'desc');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });
  });

  // ============================================
  // setNodeExecution
  // ============================================

  describe('setNodeExecution', () => {
    it('changes execution from serial to parallel', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const nodeId = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder')
      );

      const result = await service.setNodeExecution(ctx, 'my-pipeline', nodeId, 'parallel');

      expect(result.errors).toEqual([]);

      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/my-pipeline/nodes/${nodeId}`;
      const nodeYaml = await fs.readFile(pathResolver.join(nodeDir, 'node.yaml'));
      const config = yamlParser.parse<Record<string, unknown>>(nodeYaml, 'node.yaml');
      expect(config.execution).toBe('parallel');
    });

    it('returns E153 for nonexistent node', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.setNodeExecution(ctx, 'my-pipeline', 'nonexistent', 'parallel');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });
  });

  // ============================================
  // showNode
  // ============================================

  describe('showNode', () => {
    it('returns full node details with lineId and position', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder');
      const secondNode = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'research-concept', {
          description: 'Research phase',
        })
      );

      const result: NodeShowResult = await service.showNode(ctx, 'my-pipeline', secondNode);

      expect(result.errors).toEqual([]);
      expect(result.nodeId).toBe(secondNode);
      expect(result.unitSlug).toBe('research-concept');
      expect(result.execution).toBe('serial');
      expect(result.description).toBe('Research phase');
      expect(result.lineId).toBe(lineId);
      expect(result.position).toBe(1);
    });

    it('returns E153 for nonexistent node', async () => {
      await service.create(ctx, 'my-pipeline');
      const result = await service.showNode(ctx, 'my-pipeline', 'nonexistent');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('E153');
    });
  });

  // ============================================
  // Invariant Enforcement
  // ============================================

  describe('invariant enforcement', () => {
    it('maintains unique node IDs across graph after multiple adds', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');

      const nodeIds = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const unitSlug = i % 2 === 0 ? 'sample-coder' : 'research-concept';
        const result = await service.addNode(ctx, 'my-pipeline', lineId, unitSlug);
        const nodeId = expectNodeId(result);
        expect(nodeIds.has(nodeId)).toBe(false);
        nodeIds.add(nodeId);
      }

      expect(nodeIds.size).toBe(10);
    });

    it('node belongs to exactly one line after move', async () => {
      const { lineId: line1 } = await service.create(ctx, 'my-pipeline');
      const addLineResult = await service.addLine(ctx, 'my-pipeline');
      const line2 = addLineResult.lineId as string;
      const nodeId = expectNodeId(await service.addNode(ctx, 'my-pipeline', line1, 'sample-coder'));

      await service.moveNode(ctx, 'my-pipeline', nodeId, { toLineId: line2 });

      const loaded = await service.load(ctx, 'my-pipeline');
      expect(loaded.definition).toBeTruthy();
      let nodeCount = 0;
      for (const line of loaded.definition?.lines ?? []) {
        if (line.nodes.includes(nodeId)) {
          nodeCount++;
        }
      }
      expect(nodeCount).toBe(1);
    });

    it('deterministic ordering after add + remove + move', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const n1 = expectNodeId(await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder'));
      const n2 = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'research-concept')
      );
      const n3 = expectNodeId(await service.addNode(ctx, 'my-pipeline', lineId, 'code-reviewer'));

      // Remove middle node
      await service.removeNode(ctx, 'my-pipeline', n2);

      // Move n3 to position 0
      await service.moveNode(ctx, 'my-pipeline', n3, { toPosition: 0 });

      const loaded = await service.load(ctx, 'my-pipeline');
      const line = loaded.definition?.lines.find((l) => l.id === lineId);
      expect(line?.nodes).toEqual([n3, n1]);

      // Read again to verify persistence
      const loaded2 = await service.load(ctx, 'my-pipeline');
      const line2 = loaded2.definition?.lines.find((l) => l.id === lineId);
      expect(line2?.nodes).toEqual([n3, n1]);
    });

    it('no orphan node.yaml after remove', async () => {
      const { lineId } = await service.create(ctx, 'my-pipeline');
      const nodeId = expectNodeId(
        await service.addNode(ctx, 'my-pipeline', lineId, 'sample-coder')
      );

      const nodeDir = `/workspace/my-project/.chainglass/data/workflows/my-pipeline/nodes/${nodeId}`;
      expect(await fs.exists(nodeDir)).toBe(true);

      await service.removeNode(ctx, 'my-pipeline', nodeId);

      expect(await fs.exists(nodeDir)).toBe(false);

      // Verify no reference in graph
      const loaded = await service.load(ctx, 'my-pipeline');
      expect(loaded.definition).toBeTruthy();
      for (const line of loaded.definition?.lines ?? []) {
        expect(line.nodes).not.toContain(nodeId);
      }
    });
  });
});
