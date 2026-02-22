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

function createService(fs: FakeFileSystem): {
  service: IPositionalGraphService;
  adapter: PositionalGraphAdapter;
} {
  const pathResolver = new FakePathResolver();
  const yamlParser = new YamlParserAdapter();
  const adapter = new PositionalGraphAdapter(fs, pathResolver);
  const loader = stubWorkUnitLoader({
    units: [
      createWorkUnit({ slug: 'input-node', outputs: [{ name: 'result' }] }),
      createWorkUnit({ slug: 'worker', inputs: [{ name: 'data' }] }),
    ],
  });
  const service = new PositionalGraphService(fs, pathResolver, yamlParser, adapter, loader);
  return { service, adapter };
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
  let adapter: PositionalGraphAdapter;
  let ctx: WorkspaceContext;

  beforeEach(() => {
    fs = new FakeFileSystem();
    const created = createService(fs);
    service = created.service;
    adapter = created.adapter;
    ctx = createCtx();
  });

  // ═══════════════════════════════════════════════════════
  // T003: Complete graph with outputs
  // AC-1, AC-7: Graph topology + per-node sections + JSON schema
  // ═══════════════════════════════════════════════════════

  describe('complete graph (T003)', () => {
    /** Test Doc: Why — validates complete graph returns all nodes with correct status, outputs, inputs, timing. */
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
  // AC-8: Running nodes with elapsed, pending with wait reason
  // ═══════════════════════════════════════════════════════

  describe('in-progress graph (T004)', () => {
    /** Test Doc: Why — validates in-progress states: running node has startedAt but no completedAt, pending nodes detected. */
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
  // AC-9: Failed nodes show error code and message
  // ═══════════════════════════════════════════════════════

  describe('error states (T005)', () => {
    /** Test Doc: Why — validates blocked-error nodes surface error detail in InspectNodeResult. */
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
  // AC-3: File outputs distinguished from data values
  // ═══════════════════════════════════════════════════════

  describe('file output detection (T006)', () => {
    /** Test Doc: Why — validates file output paths (data/outputs/*) preserved in outputs map. */
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

  // ═══════════════════════════════════════════════════════
  // Additional coverage (review fix #3)
  // ═══════════════════════════════════════════════════════

  describe('event counting and questions', () => {
    /** Test Doc: Why — validates eventCount reflects actual state events (AC-7). */
    it('counts events per node from state', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'x');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      // startNode raises node:started, accept raises node:accepted, endNode raises node:completed
      expect(nodeA.eventCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('errors surfaced in result', () => {
    /** Test Doc: Why — validates that blocked-error nodes populate InspectResult.errors (review fix #5). */
    it('populates InspectResult.errors for blocked-error nodes', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.raiseNodeEvent(
        ctx,
        SLUG,
        nodeAId,
        'node:error',
        { code: 'E999', message: 'boom', recoverable: false },
        'agent'
      );

      const result = await service.inspectGraph(ctx, SLUG);

      expect(result.errors.length).toBeGreaterThanOrEqual(1);
      expect(result.errors[0].code).toBe('E999');
    });
  });

  // ═══════════════════════════════════════════════════════
  // ST002: Events array population
  // AC-4: --node event log with timestamps
  // ═══════════════════════════════════════════════════════

  describe('events array (ST002)', () => {
    /**
     * Test Doc
     * - **Why**: Phase 2 formatInspectNode() needs full event objects for numbered event log display.
     * - **Contract**: events[] contains mapped objects with type, actor, timestamp, stamps from nodeState.events.
     * - **AC**: AC-4 (event log with timestamps)
     */
    it('populates events with type, actor, timestamp from state', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'x');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.events.length).toBeGreaterThanOrEqual(2);
      const firstEvent = nodeA.events[0];
      expect(firstEvent.type).toBeDefined();
      expect(firstEvent.actor).toBeDefined();
      expect(firstEvent.timestamp).toBeDefined();
      expect(firstEvent.eventId).toBeDefined();
    });

    it('events.length matches eventCount', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'x');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.events.length).toBe(nodeA.eventCount);
    });

    it('returns empty array when no events', async () => {
      await buildSimpleGraph(service, ctx, SLUG);

      const result = await service.inspectGraph(ctx, SLUG);
      // Pending nodes that were never started have no events
      const pendingNode = result.nodes.find((n) => n.status === 'pending' || n.status === 'ready');
      if (pendingNode) {
        expect(pendingNode.events).toEqual([]);
        expect(pendingNode.eventCount).toBe(0);
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  // ST003: OrchestratorSettings population
  // AC-6: --compact context notes
  // ═══════════════════════════════════════════════════════

  describe('orchestratorSettings (ST003)', () => {
    /**
     * Test Doc
     * - **Why**: Phase 2 formatters need execution mode + context inheritance for Context line.
     * - **Contract**: orchestratorSettings populated from NodeStatusResult fields.
     * - **AC**: AC-6 (compact context notes)
     */
    it('includes execution mode from nodeStatus', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.orchestratorSettings).toBeDefined();
      expect(nodeA.orchestratorSettings.execution).toBe('serial');
    });

    it('defaults noContext to false and contextFrom to undefined', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.orchestratorSettings.noContext).toBeFalsy();
      expect(nodeA.orchestratorSettings.contextFrom).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  // ST004: File metadata population
  // AC-3: File outputs with → arrow, filename, size, extract
  // ═══════════════════════════════════════════════════════

  describe('file metadata (ST004)', () => {
    /**
     * Test Doc
     * - **Why**: Phase 2 formatters need filename, size, extract for → display.
     * - **Contract**: fileMetadata populated for data/outputs/* values; absent for regular values.
     * - **AC**: AC-3 (file outputs with arrow, size, extract)
     */
    it('populates fileMetadata for data/outputs/ values', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      // Write an actual file using adapter-derived path (Fix #6: no hardcoded paths)
      const graphDir = adapter.getGraphDir(ctx, SLUG);
      const outputDir = `${graphDir}/nodes/${nodeAId}/data/outputs`;
      fs.setFile(`${outputDir}/report.md`, '# Report\nThis is a test report\nLine 3');
      await service.saveOutputData(ctx, SLUG, nodeAId, 'report', 'data/outputs/report.md');
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'hello');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.fileMetadata).toHaveProperty('report');
      expect(nodeA.fileMetadata.report.filename).toBe('report.md');
      expect(nodeA.fileMetadata.report.sizeBytes).toBeGreaterThan(0);
      expect(nodeA.fileMetadata.report.isBinary).toBe(false);
      expect(nodeA.fileMetadata.report.extract).toContain('# Report');
    });

    it('does not create fileMetadata for regular string outputs', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      await service.saveOutputData(ctx, SLUG, nodeAId, 'result', 'just a string');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      expect(nodeA.fileMetadata).not.toHaveProperty('result');
    });

    it('blocks path traversal in output values', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      await acceptNode(service, ctx, SLUG, nodeAId);
      // Simulate a malicious output path
      await service.saveOutputData(ctx, SLUG, nodeAId, 'evil', 'data/outputs/../../secret.txt');
      await service.endNode(ctx, SLUG, nodeAId, 'done');

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      // Traversal attempt must not produce fileMetadata
      expect(nodeA.fileMetadata).not.toHaveProperty('evil');
      // Should surface as an enrichment error
      const traversalError = result.errors.find((e) => e.code === 'PATH_TRAVERSAL');
      expect(traversalError).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════
  // Fix #5: OrchestratorSettings enrichment coverage
  // ═══════════════════════════════════════════════════════

  describe('orchestratorSettings enrichment', () => {
    it('enriches waitForPrevious from node config', async () => {
      const { nodeAId } = await buildSimpleGraph(service, ctx, SLUG);

      const result = await service.inspectGraph(ctx, SLUG);
      const nodeA = result.nodes.find((n) => n.nodeId === nodeAId) as NonNullable<
        (typeof result.nodes)[0]
      >;

      // Default serial node has waitForPrevious=true from node config
      expect(nodeA.orchestratorSettings.waitForPrevious).toBe(true);
    });
  });
});
