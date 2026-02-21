/**
 * Plan 040: Graph Inspect CLI — inspectGraph() Unit Tests
 *
 * ## Test Doc
 * - **Why**: Validates that inspectGraph() returns a unified InspectResult
 *   from composed service reads (getStatus, loadGraphState, canEnd, getOutputData).
 * - **Contract**: inspectGraph(ctx, slug) returns InspectResult with per-node
 *   status, timing, inputs, outputs, events, and questions.
 * - **Usage Notes**: Tests use createTestServiceStack() with real filesystem in
 *   temp dir. Graphs built via service API (create, addLine, addNode, etc.).
 * - **Quality Contribution**: Prevents regressions in graph inspection data model.
 *   Catches missing fields, wrong durations, lost outputs.
 * - **Worked Example**: Create a 3-node graph, complete some nodes with outputs,
 *   call inspectGraph(), assert structure and values.
 */

import { PositionalGraphService } from '@chainglass/positional-graph';
import { PositionalGraphAdapter } from '@chainglass/positional-graph/adapter';
import type { IPositionalGraphService } from '@chainglass/positional-graph/interfaces';
import { FakeFileSystem, FakePathResolver, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { createWorkUnit, stubWorkUnitLoader } from '../../test-helpers.js';

// ── Setup ───────────────────────────────────────────────

const SLUG = 'test-inspect';

function createCtx(): WorkspaceContext {
  return {
    workspaceSlug: 'test',
    workspaceName: 'Test',
    workspacePath: '/workspace',
    worktreePath: '/workspace',
    worktreeBranch: 'main',
    isMainWorktree: true,
  };
}

function createService(fs: FakeFileSystem): IPositionalGraphService {
  const pathResolver = new FakePathResolver();
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  const loader = stubWorkUnitLoader({
    units: [
      createWorkUnit({ slug: 'input-node', outputs: [{ name: 'result' }] }),
      createWorkUnit({ slug: 'worker', inputs: [{ name: 'data' }] }),
    ],
  });
  return new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
}

async function buildSimpleGraph(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  slug: string
) {
  await service.create(ctx, slug, { description: 'test graph' });
  const line0 = await service.addLine(ctx, slug, { position: 0 });
  const line1 = await service.addLine(ctx, slug, { position: 1 });

  const nodeA = await service.addNode(ctx, slug, line0.lineId as string, 'input-node');
  const nodeB = await service.addNode(ctx, slug, line1.lineId as string, 'worker');

  // Wire input: nodeB.data ← nodeA.result
  await service.setInput(ctx, slug, nodeB.nodeId as string, 'data', {
    from_node: nodeA.nodeId as string,
    from_output: 'result',
  });

  return {
    nodeAId: nodeA.nodeId as string,
    nodeBId: nodeB.nodeId as string,
  };
}

async function acceptNode(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  slug: string,
  nodeId: string
) {
  await service.startNode(ctx, slug, nodeId);
  await service.raiseNodeEvent(ctx, slug, nodeId, 'node:accepted', {}, 'agent');
}

// ── Tests ───────────────────────────────────────────────

describe('inspectGraph', () => {
  let fs: FakeFileSystem;
  let service: IPositionalGraphService;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fs = new FakeFileSystem();
    service = createService(fs);
    ctx = createCtx();
  });

  // ═══════════════════════════════════════════════════════
  // T003: Complete graph with outputs
  // ═══════════════════════════════════════════════════════

  describe('complete graph (T003)', () => {
    it('returns all nodes with status complete', async () => {
      const { nodeAId, nodeBId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'hello world');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      await acceptNode(service, ctx, SLUG, nodeBId);
      await service.saveOutputData(ctx, SLUG, nodeBId, 'output', 42);
      await service.endNode(ctx, SLUG, nodeBId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);

      expect(result.graphSlug).toBe(SLUG);
      expect(result.totalNodes).toBe(2);
      expect(result.completedNodes).toBe(2);
      expect(result.failedNodes).toBe(0);
      expect(result.nodes).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('returns output values from data.json', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'hello world');
      await service.saveOutputData(ctx, SLUG, nodeAId, 'count', 42);
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.outputs).toEqual({ result: 'hello world', count: 42 });
      expect(nodeA.outputCount).toBe(2);
    });

    it('returns input wiring from node config', async () => {
      const { nodeAId, nodeBId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'data');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      await acceptNode(service, ctx, SLUG, nodeBId);
      await service.endNode(ctx, SLUG, nodeBId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeB = result.nodes.find((n) => n.nodeId === nodeBId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeB.inputs).toHaveProperty('data');
      expect(nodeB.inputs.data.fromNode).toBe(nodeAId);
      expect(nodeB.inputs.data.fromOutput).toBe('result');
    });

    it('computes durationMs from timestamps', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'x');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.startedAt).toBeDefined();
      expect(nodeA.completedAt).toBeDefined();
      expect(nodeA.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('returns graph-level totals', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'x');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);

      expect(result.totalNodes).toBe(2);
      expect(result.completedNodes).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T004: In-progress graph
  // ═══════════════════════════════════════════════════════

  describe('in-progress graph (T004)', () => {
    it('returns running node with startedAt, no completedAt', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.startedAt).toBeDefined();
      expect(nodeA.completedAt).toBeUndefined();
      expect(nodeA.durationMs).toBeUndefined();
    });

    it('returns pending node with status pending', async () => {
      await buildSimpleGraph(service, ctx, SLUG);

      const result = await service.inspectGraph(ctx, SLUG);
      const pendingNodes = result.nodes.filter(
        (n) => n.status === 'pending' || n.status === 'ready'
      );

      expect(pendingNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T005: Error states
  // ═══════════════════════════════════════════════════════

  describe('error states (T005)', () => {
    it('returns blocked-error node with error detail', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.raiseNodeEvent(
        ctx,
        SLUG,
        nodeAId,
        'node:error',
        { code: 'E999', message: 'Something broke', recoverable: false },
        'agent'
      );

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.status).toBe('blocked-error');
      expect(nodeA.error).toBeDefined();
      expect(nodeA.error?.code).toBe('E999');
      expect(nodeA.error?.message).toBe('Something broke');
    });

    it('handles mix of complete and failed nodes', async () => {
      const { nodeAId, nodeBId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'x');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      await acceptNode(service, ctx, SLUG, nodeBId);
      await service.raiseNodeEvent(
        ctx,
        SLUG,
        nodeBId,
        'node:error',
        { code: 'E500', message: 'crash', recoverable: false },
        'agent'
      );

      const result = await service.inspectGraph(ctx, SLUG);

      expect(result.completedNodes).toBe(1);
      expect(result.failedNodes).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  // T006: File output detection
  // ═══════════════════════════════════════════════════════

  describe('file output detection (T006)', () => {
    it('preserves file output paths in outputs map', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'report', 'data/outputs/report.md');
      await service.saveOutputData(ctx, SLUG, nodeAId, 'status', 'pass');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.outputs.report).toBe('data/outputs/report.md');
      expect(nodeA.outputs.status).toBe('pass');
      expect(nodeA.outputCount).toBe(2);
    });
  });
});
