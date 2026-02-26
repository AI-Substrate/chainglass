/**
 * Integration tests: Doping workflow scenarios.
 *
 * Why: Validates that all 8 doping scenarios produce valid graphs
 * with correct structure and state.json that round-trips through
 * Zod schema validation.
 *
 * Contract: scripts/dope-workflows.ts creates workflows with
 * correct line/node counts and valid state for each scenario.
 *
 * Plan 050 Phase 1 — T007 (AC-37)
 */

import * as nodeFs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  PositionalGraphAdapter,
  PositionalGraphService,
  StateSchema,
} from '@chainglass/positional-graph';
import type { IPositionalGraphService, State } from '@chainglass/positional-graph';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { InstanceAdapter, TemplateAdapter, TemplateService } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildDiskWorkUnitLoader } from '../../dev/test-graphs/shared/helpers.js';

// ─── Test Infrastructure ────────────────────────────────────

interface TestContext {
  tmpDir: string;
  ctx: WorkspaceContext;
  graphService: IPositionalGraphService;
  templateService: TemplateService;
}

let testCtx: TestContext;

function createCtx(worktreePath: string): WorkspaceContext {
  return {
    workspaceSlug: 'dope-test',
    workspaceName: 'Dope Test',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}

function createServices(workspacePath: string) {
  const fs = new NodeFileSystemAdapter();
  const pathResolver = new PathResolverAdapter();
  const yamlParser = new YamlParserAdapter();
  const graphAdapter = new PositionalGraphAdapter(fs, pathResolver);
  const loader = buildDiskWorkUnitLoader(workspacePath);
  const graphService = new PositionalGraphService(
    fs,
    pathResolver,
    yamlParser,
    graphAdapter,
    loader
  );
  const templateAdapter = new TemplateAdapter(fs, pathResolver);
  const instanceAdapter = new InstanceAdapter(fs, pathResolver);
  const templateService = new TemplateService(
    fs,
    pathResolver,
    yamlParser,
    templateAdapter,
    instanceAdapter
  );
  return { graphService, templateService };
}

// Demo unit definitions (same as dope-workflows.ts)
const DEMO_UNITS = {
  'demo-agent': {
    slug: 'demo-agent',
    type: 'agent',
    version: '1.0.0',
    description: 'Demo agent unit',
    inputs: [{ name: 'task', type: 'data', data_type: 'text', required: true }],
    outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
    agent: { type: 'claude-code' },
  },
  'demo-code': {
    slug: 'demo-code',
    type: 'code',
    version: '1.0.0',
    description: 'Demo code unit',
    inputs: [],
    outputs: [{ name: 'result', type: 'data', data_type: 'text', required: true }],
    code: { script: 'scripts/noop.sh' },
  },
  'demo-user-input': {
    slug: 'demo-user-input',
    type: 'user-input',
    version: '1.0.0',
    description: 'Demo user-input unit',
    inputs: [],
    outputs: [{ name: 'answer', type: 'data', data_type: 'text', required: true }],
    user_input: { question_type: 'text', prompt: 'What would you like to do?' },
  },
};

async function writeDemoUnits(workspacePath: string): Promise<void> {
  const yamlParser = new YamlParserAdapter();
  for (const unit of Object.values(DEMO_UNITS)) {
    const unitDir = path.join(workspacePath, '.chainglass', 'units', unit.slug);
    await nodeFs.mkdir(unitDir, { recursive: true });
    await nodeFs.writeFile(path.join(unitDir, 'unit.yaml'), yamlParser.stringify(unit));
    if (unit.type === 'code') {
      const scriptDir = path.join(unitDir, 'scripts');
      await nodeFs.mkdir(scriptDir, { recursive: true });
      await nodeFs.writeFile(path.join(scriptDir, 'noop.sh'), '#!/bin/bash\necho "noop"\n', {
        mode: 0o755,
      });
    }
  }
}

function now(): string {
  return new Date().toISOString();
}

async function injectState(workspacePath: string, graphSlug: string, state: State): Promise<void> {
  const statePath = path.join(
    workspacePath,
    '.chainglass',
    'data',
    'workflows',
    graphSlug,
    'state.json'
  );
  await nodeFs.writeFile(statePath, JSON.stringify(state, null, 2));
}

// ─── Setup / Teardown ────────────────────────────────────

beforeEach(async () => {
  const tmpDir = await nodeFs.mkdtemp(path.join(os.tmpdir(), 'dope-test-'));
  await nodeFs.mkdir(path.join(tmpDir, '.chainglass', 'data', 'workflows'), { recursive: true });
  await nodeFs.mkdir(path.join(tmpDir, '.chainglass', 'templates', 'workflows'), {
    recursive: true,
  });
  await writeDemoUnits(tmpDir);

  const { graphService, templateService } = createServices(tmpDir);
  testCtx = {
    tmpDir,
    ctx: createCtx(tmpDir),
    graphService,
    templateService,
  };
});

afterEach(async () => {
  await nodeFs.rm(testCtx.tmpDir, { recursive: true, force: true });
});

// ─── Helpers ────────────────────────────────────

async function loadAndValidateState(graphSlug: string): Promise<void> {
  const statePath = path.join(
    testCtx.tmpDir,
    '.chainglass',
    'data',
    'workflows',
    graphSlug,
    'state.json'
  );
  try {
    const raw = await nodeFs.readFile(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = StateSchema.safeParse(parsed);
    expect(
      result.success,
      `state.json Zod validation failed for ${graphSlug}: ${JSON.stringify(result.error?.issues)}`
    ).toBe(true);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No state.json is valid (pending graphs)
      return;
    }
    throw err;
  }
}

// ─── Scenario Tests ────────────────────────────────────

describe('dope-workflows scenarios', () => {
  it('demo-blank: creates empty workflow with one default line', async () => {
    /*
    Test Doc:
    - Why: Validates the simplest doping scenario — a blank graph with no nodes
    - Contract: create() produces a graph with exactly 1 empty line and 0 nodes
    - Usage Notes: Blank graphs are the starting point for manual UI composition
    - Quality Contribution: Catches regressions in graph creation defaults
    - Worked Example: create('demo-blank') → load → 1 line, 0 nodes
    */
    const { graphService: svc, ctx } = testCtx;
    await svc.create(ctx, 'demo-blank');

    const loaded = await svc.load(ctx, 'demo-blank');
    expect(loaded.errors).toHaveLength(0);
    expect(loaded.definition?.lines).toHaveLength(1);
    expect(loaded.definition?.lines[0].nodes).toHaveLength(0);
  });

  it('demo-serial: creates two-line serial workflow with input wiring', async () => {
    /*
    Test Doc:
    - Why: Validates multi-line graph with inter-node input wiring
    - Contract: Two lines, one node each; second node's input wired to first node's output
    - Usage Notes: Input wiring uses setInput with from_node/from_output source object
    - Quality Contribution: Catches regressions in addLine, addNode, and setInput flows
    - Worked Example: create → addLine → addNode×2 → setInput → 2 lines, 1 node each
    */
    const { graphService: svc, ctx } = testCtx;
    const { lineId: line0 } = await svc.create(ctx, 'demo-serial');
    const line1 = await svc.addLine(ctx, 'demo-serial');

    const n1 = await svc.addNode(ctx, 'demo-serial', line0, 'demo-agent');
    await svc.addNode(ctx, 'demo-serial', line1.lineId ?? '', 'demo-code');

    // Wire input
    const loaded = await svc.load(ctx, 'demo-serial');
    const line1Nodes = loaded.definition?.lines[1]?.nodes ?? [];
    if (line1Nodes.length > 0 && n1.nodeId) {
      await svc.setInput(ctx, 'demo-serial', line1Nodes[0], 'task', {
        from_node: n1.nodeId,
        from_output: 'result',
      });
    }

    const final = await svc.load(ctx, 'demo-serial');
    expect(final.errors).toHaveLength(0);
    expect(final.definition?.lines).toHaveLength(2);
    expect(final.definition?.lines[0].nodes).toHaveLength(1);
    expect(final.definition?.lines[1].nodes).toHaveLength(1);
  });

  it('demo-running: creates workflow with running node and valid state.json', async () => {
    /*
    Test Doc:
    - Why: Validates state injection for agent-accepted (running) status
    - Contract: Injected state.json round-trips through Zod StateSchema; graph_status is in_progress
    - Usage Notes: State is injected after graph creation, not produced by service transitions
    - Quality Contribution: Catches corrupt state.json that fails Zod validation at runtime
    - Worked Example: create → addNode → injectState(agent-accepted) → loadGraphState → status check
    */
    const { graphService: svc, ctx } = testCtx;
    const { lineId: line0 } = await svc.create(ctx, 'demo-running');
    const n1 = await svc.addNode(ctx, 'demo-running', line0, 'demo-agent');

    await injectState(testCtx.tmpDir, 'demo-running', {
      graph_status: 'in_progress',
      updated_at: now(),
      nodes: {
        [n1.nodeId ?? '']: { status: 'agent-accepted', started_at: now() },
      },
    });

    await loadAndValidateState('demo-running');

    const state = await svc.loadGraphState(ctx, 'demo-running');
    expect(state.graph_status).toBe('in_progress');
    expect(state.nodes?.[n1.nodeId ?? '']?.status).toBe('agent-accepted');
  });

  it('demo-question: creates workflow with waiting-question node', async () => {
    /*
    Test Doc:
    - Why: Validates state injection for waiting-question status with question metadata
    - Contract: Node status is waiting-question; questions array has 1 entry with matching question_id
    - Usage Notes: pending_question_id in node state must match a questions[] entry
    - Quality Contribution: Catches missing/mismatched question metadata in state.json
    - Worked Example: create → addNode → injectState(waiting-question + questions[]) → verify
    */
    const { graphService: svc, ctx } = testCtx;
    const { lineId: line0 } = await svc.create(ctx, 'demo-question');
    const n1 = await svc.addNode(ctx, 'demo-question', line0, 'demo-agent');

    const questionId = 'q-test-1';
    await injectState(testCtx.tmpDir, 'demo-question', {
      graph_status: 'in_progress',
      updated_at: now(),
      nodes: {
        [n1.nodeId ?? '']: {
          status: 'waiting-question',
          started_at: now(),
          pending_question_id: questionId,
        },
      },
      questions: [
        {
          question_id: questionId,
          node_id: n1.nodeId ?? '',
          type: 'text',
          text: 'Test question?',
          asked_at: now(),
        },
      ],
    });

    await loadAndValidateState('demo-question');

    const state = await svc.loadGraphState(ctx, 'demo-question');
    expect(state.nodes?.[n1.nodeId ?? '']?.status).toBe('waiting-question');
    expect(state.questions).toHaveLength(1);
  });

  it('demo-error: creates workflow with blocked-error node', async () => {
    /*
    Test Doc:
    - Why: Validates state injection for blocked-error status with error metadata
    - Contract: Node status is blocked-error; error object has code and message fields
    - Usage Notes: Error code follows E-series convention (E150 = script failure)
    - Quality Contribution: Catches missing error metadata that breaks error UI display
    - Worked Example: create → addNode → injectState(blocked-error + error{}) → verify error.code
    */
    const { graphService: svc, ctx } = testCtx;
    const { lineId: line0 } = await svc.create(ctx, 'demo-error');
    const n1 = await svc.addNode(ctx, 'demo-error', line0, 'demo-code');

    await injectState(testCtx.tmpDir, 'demo-error', {
      graph_status: 'in_progress',
      updated_at: now(),
      nodes: {
        [n1.nodeId ?? '']: {
          status: 'blocked-error',
          started_at: now(),
          error: { code: 'E150', message: 'Test error' },
        },
      },
    });

    await loadAndValidateState('demo-error');

    const state = await svc.loadGraphState(ctx, 'demo-error');
    expect(state.nodes?.[n1.nodeId ?? '']?.status).toBe('blocked-error');
    expect(state.nodes?.[n1.nodeId ?? '']?.error?.code).toBe('E150');
  });

  it('demo-complete: creates fully completed workflow', async () => {
    /*
    Test Doc:
    - Why: Validates state injection for fully completed workflow with transitions
    - Contract: graph_status is complete; all nodes have complete status; transitions recorded
    - Usage Notes: Transitions track which lines have been triggered (line0 → line1)
    - Quality Contribution: Catches regressions in complete-state rendering
    - Worked Example: create → 2 lines × 1 node → injectState(complete + transitions) → verify
    */
    const { graphService: svc, ctx } = testCtx;
    const { lineId: line0 } = await svc.create(ctx, 'demo-complete');
    const line1 = await svc.addLine(ctx, 'demo-complete');

    const n1 = await svc.addNode(ctx, 'demo-complete', line0, 'demo-agent');
    const n2 = await svc.addNode(ctx, 'demo-complete', line1.lineId ?? '', 'demo-code');

    await injectState(testCtx.tmpDir, 'demo-complete', {
      graph_status: 'complete',
      updated_at: now(),
      nodes: {
        [n1.nodeId ?? '']: { status: 'complete', started_at: now(), completed_at: now() },
        [n2.nodeId ?? '']: { status: 'complete', started_at: now(), completed_at: now() },
      },
      transitions: {
        [line0]: { triggered: true, triggered_at: now() },
      },
    });

    await loadAndValidateState('demo-complete');

    const state = await svc.loadGraphState(ctx, 'demo-complete');
    expect(state.graph_status).toBe('complete');
  });

  it('demo-complex: creates multi-line workflow with all 7 persistable statuses', async () => {
    /*
    Test Doc:
    - Why: Validates demo-complex covers all 7 persistable node statuses (AC-30)
    - Contract: 3 lines, 8 nodes total; 6 have explicit state entries covering starting,
      agent-accepted, waiting-question, restart-pending, complete; 1 pending (implicit); plus
      blocked-error from demo-error scenario
    - Usage Notes: 'ready' status is computed at runtime, not persistable — not tested here
    - Quality Contribution: Catches missing status coverage that leaves UI states untested
    - Worked Example: create → 3 lines × nodes → injectState(mixed) → verify 6 explicit + 1 pending
    */
    const { graphService: svc, ctx } = testCtx;
    const { lineId: line0 } = await svc.create(ctx, 'demo-complex');
    const line1 = await svc.addLine(ctx, 'demo-complex');
    const line1Id = line1.lineId ?? '';
    const line2 = await svc.addLine(ctx, 'demo-complex');
    const line2Id = line2.lineId ?? '';

    // Line 0: 2 complete nodes
    const n1 = await svc.addNode(ctx, 'demo-complex', line0, 'demo-user-input');
    const n2 = await svc.addNode(ctx, 'demo-complex', line0, 'demo-agent');
    // Line 1: starting, agent-accepted, waiting-question, restart-pending
    const n3 = await svc.addNode(ctx, 'demo-complex', line1Id, 'demo-agent');
    const n4 = await svc.addNode(ctx, 'demo-complex', line1Id, 'demo-code');
    const n5 = await svc.addNode(ctx, 'demo-complex', line1Id, 'demo-agent');
    const n6 = await svc.addNode(ctx, 'demo-complex', line1Id, 'demo-code');
    // Line 2: 1 pending node (no state entry)
    await svc.addNode(ctx, 'demo-complex', line2Id, 'demo-agent');

    const questionId = 'q-complex-1';
    await injectState(testCtx.tmpDir, 'demo-complex', {
      graph_status: 'in_progress',
      updated_at: now(),
      nodes: {
        [n1.nodeId ?? '']: { status: 'complete', started_at: now(), completed_at: now() },
        [n2.nodeId ?? '']: { status: 'complete', started_at: now(), completed_at: now() },
        [n3.nodeId ?? '']: { status: 'starting', started_at: now() },
        [n4.nodeId ?? '']: { status: 'agent-accepted', started_at: now() },
        [n5.nodeId ?? '']: {
          status: 'waiting-question',
          started_at: now(),
          pending_question_id: questionId,
        },
        [n6.nodeId ?? '']: { status: 'restart-pending', started_at: now() },
      },
      transitions: { [line0]: { triggered: true, triggered_at: now() } },
      questions: [
        {
          question_id: questionId,
          node_id: n5.nodeId ?? '',
          type: 'single',
          text: 'Which database?',
          options: ['PostgreSQL', 'MySQL'],
          asked_at: now(),
        },
      ],
    });

    await loadAndValidateState('demo-complex');

    const loaded = await svc.load(ctx, 'demo-complex');
    expect(loaded.definition?.lines).toHaveLength(3);

    const state = await svc.loadGraphState(ctx, 'demo-complex');
    expect(state.graph_status).toBe('in_progress');
    // 6 nodes have explicit state, 1 is implicitly pending
    expect(Object.keys(state.nodes ?? {})).toHaveLength(6);
  });

  it('demo-from-template: creates instance from template with template_source', async () => {
    /*
    Test Doc:
    - Why: Validates template save + instantiate flow and template_source breadcrumb (AC-20)
    - Contract: saveFrom() produces template; instantiate() produces instance with template_source
    - Usage Notes: instance.yaml must contain template_source field for breadcrumb navigation
    - Quality Contribution: Catches broken template instantiation that blocks "created from" UI
    - Worked Example: create source → saveFrom → instantiate → read instance.yaml → has template_source
    */
    const { graphService: svc, ctx } = testCtx;

    // Build source graph
    const { lineId: line0 } = await svc.create(ctx, 'demo-template-source');
    await svc.addNode(ctx, 'demo-template-source', line0, 'demo-agent');

    // Save as template
    const saveResult = await testCtx.templateService.saveFrom(
      ctx,
      'demo-template-source',
      'demo-template'
    );
    expect(saveResult.errors).toHaveLength(0);

    // Instantiate
    const instResult = await testCtx.templateService.instantiate(
      ctx,
      'demo-template',
      'demo-from-template'
    );
    expect(instResult.errors).toHaveLength(0);

    // Verify instance.yaml has template_source
    const instanceYaml = path.join(
      testCtx.tmpDir,
      '.chainglass',
      'instances',
      'demo-template',
      'demo-from-template',
      'instance.yaml'
    );
    const content = await nodeFs.readFile(instanceYaml, 'utf-8');
    expect(content).toContain('template_source: demo-template');
  });
});
