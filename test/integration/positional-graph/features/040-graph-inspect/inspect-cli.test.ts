/**
 * Plan 040: Graph Inspect CLI — Integration Tests
 *
 * Tests `cg wf inspect` command through the full CLI program.
 * Uses withTestGraph for real workspace setup.
 */

import { createProgram } from '@chainglass/cli/bin/cg';
import type { IPositionalGraphService } from '@chainglass/positional-graph';
import { WorkflowEventType } from '@chainglass/shared/workflow-events';
import type { WorkspaceContext } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTestGraph } from '../../../../../dev/test-graphs/shared/graph-test-runner.js';

// Strip ANSI escape codes so assertions match plain text
const ANSI_RE = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g');
function stripAnsi(str: string): string {
  return str.replace(ANSI_RE, '');
}

// ── Helpers ─────────────────────────────────────────────

async function buildFixtureGraph(
  service: IPositionalGraphService,
  ctx: WorkspaceContext,
  slug: string
) {
  await service.create(ctx, slug, { description: 'inspect test graph' });
  const line0 = await service.addLine(ctx, slug, { position: 0 });
  const line1 = await service.addLine(ctx, slug, { position: 1 });

  const nodeA = await service.addNode(ctx, slug, line0.lineId as string, 'setup');
  const nodeB = await service.addNode(ctx, slug, line1.lineId as string, 'worker');
  const nodeAId = nodeA.nodeId as string;
  const nodeBId = nodeB.nodeId as string;

  await service.setInput(ctx, slug, nodeBId, 'task', {
    from_node: nodeAId,
    from_output: 'instructions',
  });

  // Complete nodeA
  await service.startNode(ctx, slug, nodeAId);
  await service.raiseNodeEvent(ctx, slug, nodeAId, WorkflowEventType.NodeAccepted, {}, 'agent');
  await service.saveOutputData(ctx, slug, nodeAId, 'instructions', 'do the thing');
  await service.endNode(ctx, slug, nodeAId, 'done');

  // Complete nodeB with a long output value for truncation testing
  await service.startNode(ctx, slug, nodeBId);
  await service.raiseNodeEvent(ctx, slug, nodeBId, WorkflowEventType.NodeAccepted, {}, 'agent');
  await service.saveOutputData(
    ctx,
    slug,
    nodeBId,
    'result',
    'This is a very long result string that exceeds forty characters for truncation testing purposes'
  );
  await service.endNode(ctx, slug, nodeBId, 'done');

  return { nodeAId, nodeBId };
}

let capturedOutput: string;
const originalLog = console.log;

beforeEach(() => {
  capturedOutput = '';
  console.log = (...args: unknown[]) => {
    capturedOutput += `${args.map(String).join(' ')}\n`;
  };
});

afterEach(() => {
  console.log = originalLog;
});

// ═══════════════════════════════════════════════════════
// T002: Default mode
// ═══════════════════════════════════════════════════════

describe('cg wf inspect — default mode (T002)', () => {
  it('outputs graph header with slug and status', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        'inspect',
        'test-inspect',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      expect(stripAnsi(capturedOutput)).toContain('Graph: test-inspect');
      expect(capturedOutput).toContain('complete');
      expect(capturedOutput).toContain('2/2');
    });
  });

  it('outputs per-node sections with ━━━ separator', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      const { nodeAId } = await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        'inspect',
        'test-inspect',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      expect(capturedOutput).toContain(`━━━ ${nodeAId} ━━━`);
      expect(capturedOutput).toContain('Unit:');
      expect(capturedOutput).toContain('Status:');
      expect(capturedOutput).toContain('instructions');
    });
  });
});

// ═══════════════════════════════════════════════════════
// T005: --json mode
// ═══════════════════════════════════════════════════════

describe('cg wf inspect --json (T005)', () => {
  it('outputs valid JSON with CommandResponse envelope', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        '--json',
        'inspect',
        'test-inspect',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      const parsed = JSON.parse(capturedOutput.trim());
      expect(parsed.success).toBe(true);
      expect(parsed.command).toBe('wf.inspect');
      expect(parsed.data).toBeDefined();
      expect(parsed.data.nodes).toBeInstanceOf(Array);
      expect(parsed.data.nodes.length).toBe(2);
      expect(parsed.data.graphSlug).toBe('test-inspect');
    });
  });
});

// ═══════════════════════════════════════════════════════
// T006: --node mode
// ═══════════════════════════════════════════════════════

describe('cg wf inspect --node (T006)', () => {
  it('outputs single node with full values', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      const { nodeAId } = await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        'inspect',
        'test-inspect',
        '--node',
        nodeAId,
        '--workspace-path',
        tgc.workspacePath,
      ]);

      expect(capturedOutput).toContain(`━━━ ${nodeAId} ━━━`);
      expect(capturedOutput).toContain('do the thing');
      expect(capturedOutput).toContain('Events');
    });
  });
});

// ═══════════════════════════════════════════════════════
// T007: --outputs mode
// ═══════════════════════════════════════════════════════

describe('cg wf inspect --outputs (T007)', () => {
  it('outputs grouped by node', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      const { nodeAId, nodeBId } = await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        'inspect',
        'test-inspect',
        '--outputs',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      expect(stripAnsi(capturedOutput)).toContain(`${nodeAId}:`);
      expect(stripAnsi(capturedOutput)).toContain(`${nodeBId}:`);
      expect(capturedOutput).toContain('instructions');
      expect(capturedOutput).toContain('result');
    });
  });

  it('truncates output values at 40 chars', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        'inspect',
        'test-inspect',
        '--outputs',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      // The long result value (93 chars) should be truncated at 40
      expect(capturedOutput).toContain('…');
      expect(capturedOutput).toContain('chars)');
    });
  });
});

// ═══════════════════════════════════════════════════════
// T008: --compact mode
// ═══════════════════════════════════════════════════════

describe('cg wf inspect --compact (T008)', () => {
  it('outputs one line per node with correct header ratio', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      const { nodeAId, nodeBId } = await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        'inspect',
        'test-inspect',
        '--compact',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      expect(capturedOutput).toContain('2/2 nodes');
      expect(capturedOutput).toContain('✅');
      // Both nodes should appear
      expect(capturedOutput).toContain(nodeAId);
      expect(capturedOutput).toContain(nodeBId);
    });
  });
});

// ═══════════════════════════════════════════════════════
// Fix #6: Stronger JSON content assertions
// ═══════════════════════════════════════════════════════

describe('cg wf inspect --json content (fix #6)', () => {
  it('JSON contains node output values', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      await program.parseAsync([
        'node',
        'cg',
        'wf',
        '--json',
        'inspect',
        'test-inspect',
        '--workspace-path',
        tgc.workspacePath,
      ]);

      const parsed = JSON.parse(capturedOutput.trim());
      const nodeA = parsed.data.nodes.find(
        (n: { outputs: { instructions?: string } }) => n.outputs.instructions
      );
      expect(nodeA).toBeDefined();
      expect(nodeA.outputs.instructions).toBe('do the thing');
    });
  });
});

// ═══════════════════════════════════════════════════════
// Fix #7: Negative-path tests
// ═══════════════════════════════════════════════════════

describe('cg wf inspect — negative paths (fix #7)', () => {
  it('exits with error for invalid --node target', async () => {
    await withTestGraph('simple-serial', async (tgc) => {
      await buildFixtureGraph(tgc.service, tgc.ctx, 'test-inspect');

      const program = createProgram({ testMode: true });
      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit');
      });

      try {
        await program.parseAsync([
          'node',
          'cg',
          'wf',
          'inspect',
          'test-inspect',
          '--node',
          'nonexistent-node',
          '--workspace-path',
          tgc.workspacePath,
        ]);
      } catch {
        // Expected — process.exit throws
      }

      expect(mockExit).toHaveBeenCalledWith(1);
      expect(capturedOutput).toContain('E040');
      mockExit.mockRestore();
    });
  });
});
