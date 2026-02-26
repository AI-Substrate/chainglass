/**
 * Doping script — Generate demo workflows for UI development.
 *
 * Creates 8 demo workflow scenarios covering all node status states.
 * Each scenario is built imperatively via PositionalGraphService, then
 * state.json is injected for non-pending scenarios.
 *
 * Usage:
 *   npx tsx scripts/dope-workflows.ts              # Generate all
 *   npx tsx scripts/dope-workflows.ts demo-serial   # Generate one
 *   npx tsx scripts/dope-workflows.ts clean          # Remove all demo-* workflows
 *
 * Plan 050 Phase 1 — T005
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { PositionalGraphAdapter, PositionalGraphService } from '@chainglass/positional-graph';
import type { IPositionalGraphService, State } from '@chainglass/positional-graph';
import { NodeFileSystemAdapter, PathResolverAdapter, YamlParserAdapter } from '@chainglass/shared';
import type { WorkspaceContext } from '@chainglass/workflow';
import { InstanceAdapter, TemplateAdapter, TemplateService } from '@chainglass/workflow';

import { buildDiskWorkUnitLoader } from '../dev/test-graphs/shared/helpers.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// ============================================
// Script DI Container
// ============================================

interface ScriptServices {
  graphService: IPositionalGraphService;
  templateService: InstanceType<typeof TemplateService>;
}

/**
 * Create a lightweight DI container for scripts.
 * Does NOT use bootstrap-singleton (web-only).
 */
function createScriptServices(workspacePath: string): ScriptServices {
  const nodeFs = new NodeFileSystemAdapter();
  const pathResolver = new PathResolverAdapter();
  const yamlParser = new YamlParserAdapter();
  const graphAdapter = new PositionalGraphAdapter(nodeFs, pathResolver);
  const loader = buildDiskWorkUnitLoader(workspacePath);
  const graphService = new PositionalGraphService(
    nodeFs,
    pathResolver,
    yamlParser,
    graphAdapter,
    loader
  );
  const templateAdapter = new TemplateAdapter(nodeFs, pathResolver);
  const instanceAdapter = new InstanceAdapter(nodeFs, pathResolver);
  const templateService = new TemplateService(
    nodeFs,
    pathResolver,
    yamlParser,
    templateAdapter,
    instanceAdapter
  );
  return { graphService, templateService };
}

/** Assert a service result field is present, throw with context if not. */
function assertDefined<T>(value: T | undefined | null, label: string): T {
  if (value == null) throw new Error(`Dope assertion failed: ${label} is ${value}`);
  return value;
}

function createCtx(worktreePath: string): WorkspaceContext {
  return {
    workspaceSlug: 'dope-workflows',
    workspaceName: 'Dope Workflows',
    workspacePath: worktreePath,
    worktreePath,
    worktreeBranch: null,
    isMainWorktree: true,
    hasGit: true,
  };
}

// ============================================
// Sample Work Unit Slugs (committed in .chainglass/units/)
// ============================================

// AC-30: Use committed sample-* work units, not generated demo-* units
const UNIT_AGENT = 'sample-coder';
const UNIT_CODE = 'sample-pr-creator';
const UNIT_USER_INPUT = 'sample-input';

// ============================================
// State Injection
// ============================================

function now(): string {
  return new Date().toISOString();
}

async function injectState(
  workspacePath: string,
  graphSlug: string,
  state: State
): Promise<void> {
  const statePath = path.join(
    workspacePath,
    '.chainglass',
    'data',
    'workflows',
    graphSlug,
    'state.json'
  );
  await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

// ============================================
// Scenario Definitions
// ============================================

interface Scenario {
  slug: string;
  description: string;
  build: (
    service: IPositionalGraphService,
    ctx: WorkspaceContext,
    workspacePath: string
  ) => Promise<void>;
}

const SCENARIOS: Scenario[] = [
  {
    slug: 'demo-blank',
    description: 'Empty workflow — no nodes, just the default line',
    async build(service, ctx) {
      await service.create(ctx, 'demo-blank');
    },
  },

  {
    slug: 'demo-serial',
    description: 'Two-line serial workflow — user-input → coder',
    async build(service, ctx) {
      const { lineId: line0 } = await service.create(ctx, 'demo-serial');
      const line1 = await service.addLine(ctx, 'demo-serial');
      const line1Id = assertDefined(line1.lineId, 'demo-serial addLine lineId');

      const n1 = await service.addNode(ctx, 'demo-serial', line0, UNIT_USER_INPUT);
      const n1Id = assertDefined(n1.nodeId, 'demo-serial addNode n1 nodeId');
      await service.addNode(ctx, 'demo-serial', line1Id, UNIT_AGENT);

      // Wire input: coder takes user-input's spec output
      const nodes = await service.load(ctx, 'demo-serial');
      const line1Nodes = nodes.definition?.lines[1]?.nodes ?? [];
      if (line1Nodes.length > 0) {
        await service.setInput(ctx, 'demo-serial', line1Nodes[0], 'spec', {
          from_node: n1Id,
          from_output: 'spec',
        });
      }
    },
  },

  {
    slug: 'demo-running',
    description: 'Workflow with one node running (agent-accepted)',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-running');
      const n1 = await service.addNode(ctx, 'demo-running', line0, UNIT_AGENT);
      const n1Id = assertDefined(n1.nodeId, 'demo-running addNode nodeId');

      await injectState(workspacePath, 'demo-running', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1Id]: {
            status: 'agent-accepted',
            started_at: now(),
          },
        },
      });
    },
  },

  {
    slug: 'demo-question',
    description: 'Workflow with a node waiting for user input',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-question');
      const n1 = await service.addNode(ctx, 'demo-question', line0, UNIT_AGENT);
      const n1Id = assertDefined(n1.nodeId, 'demo-question addNode nodeId');

      const questionId = 'q-demo-1';
      await injectState(workspacePath, 'demo-question', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1Id]: {
            status: 'waiting-question',
            started_at: now(),
            pending_question_id: questionId,
          },
        },
        questions: [
          {
            question_id: questionId,
            node_id: n1Id,
            type: 'text',
            text: 'What approach should I take for implementing the authentication system?',
            asked_at: now(),
          },
        ],
      });
    },
  },

  {
    slug: 'demo-error',
    description: 'Workflow with a node in blocked-error state',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-error');
      const n1 = await service.addNode(ctx, 'demo-error', line0, UNIT_CODE);
      const n1Id = assertDefined(n1.nodeId, 'demo-error addNode nodeId');

      await injectState(workspacePath, 'demo-error', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1Id]: {
            status: 'blocked-error',
            started_at: now(),
            error: {
              code: 'E150',
              message: 'Script exited with code 1: permission denied',
            },
          },
        },
      });
    },
  },

  {
    slug: 'demo-complete',
    description: 'Fully completed workflow — all nodes done',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-complete');
      const line1 = await service.addLine(ctx, 'demo-complete');
      const line1Id = assertDefined(line1.lineId, 'demo-complete addLine lineId');

      const n1 = await service.addNode(ctx, 'demo-complete', line0, UNIT_USER_INPUT);
      const n1Id = assertDefined(n1.nodeId, 'demo-complete addNode n1 nodeId');
      const n2 = await service.addNode(ctx, 'demo-complete', line1Id, UNIT_AGENT);
      const n2Id = assertDefined(n2.nodeId, 'demo-complete addNode n2 nodeId');

      await injectState(workspacePath, 'demo-complete', {
        graph_status: 'complete',
        updated_at: now(),
        nodes: {
          [n1Id]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
          [n2Id]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
        },
        transitions: {
          [line0]: { triggered: true, triggered_at: now() },
        },
      });
    },
  },

  {
    slug: 'demo-complex',
    description: 'Multi-line workflow with mixed states — all 8 UI statuses represented',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-complex');
      const line1 = await service.addLine(ctx, 'demo-complex');
      const line1Id = assertDefined(line1.lineId, 'demo-complex addLine line1 lineId');
      const line2 = await service.addLine(ctx, 'demo-complex');
      const line2Id = assertDefined(line2.lineId, 'demo-complex addLine line2 lineId');

      // Line 0: two nodes — both complete
      const n1 = await service.addNode(ctx, 'demo-complex', line0, UNIT_USER_INPUT);
      const n1Id = assertDefined(n1.nodeId, 'demo-complex n1 nodeId');
      const n2 = await service.addNode(ctx, 'demo-complex', line0, UNIT_AGENT);
      const n2Id = assertDefined(n2.nodeId, 'demo-complex n2 nodeId');

      // Line 1: four nodes — starting, agent-accepted, waiting-question, restart-pending
      const n3 = await service.addNode(ctx, 'demo-complex', line1Id, UNIT_AGENT);
      const n3Id = assertDefined(n3.nodeId, 'demo-complex n3 nodeId');
      const n4 = await service.addNode(ctx, 'demo-complex', line1Id, UNIT_CODE);
      const n4Id = assertDefined(n4.nodeId, 'demo-complex n4 nodeId');
      const n5 = await service.addNode(ctx, 'demo-complex', line1Id, UNIT_AGENT);
      const n5Id = assertDefined(n5.nodeId, 'demo-complex n5 nodeId');
      const n6 = await service.addNode(ctx, 'demo-complex', line1Id, UNIT_CODE);
      const n6Id = assertDefined(n6.nodeId, 'demo-complex n6 nodeId');

      // Line 2: one node — pending (no state entry = 'pending' status)
      // Note: 'ready' is the 8th status, computed at runtime by getNodeStatus()
      // when a node's prerequisites are met. Line 0 nodes in demo-serial demonstrate
      // this (first node on line 0 with no preceding lines = ready).
      await service.addNode(ctx, 'demo-complex', line2Id, UNIT_AGENT);

      const questionId = 'q-complex-1';
      await injectState(workspacePath, 'demo-complex', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1Id]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
          [n2Id]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
          [n3Id]: {
            status: 'starting',
            started_at: now(),
          },
          [n4Id]: {
            status: 'agent-accepted',
            started_at: now(),
          },
          [n5Id]: {
            status: 'waiting-question',
            started_at: now(),
            pending_question_id: questionId,
          },
          [n6Id]: {
            status: 'restart-pending',
            started_at: now(),
          },
        },
        transitions: {
          [line0]: { triggered: true, triggered_at: now() },
        },
        questions: [
          {
            question_id: questionId,
            node_id: n5Id,
            type: 'single',
            text: 'Which database should we use?',
            options: ['PostgreSQL', 'MySQL', 'SQLite'],
            asked_at: now(),
          },
        ],
      });
    },
  },

  {
    slug: 'demo-from-template',
    description: 'Workflow instantiated from a template — validates template breadcrumb',
    async build(service, ctx, workspacePath) {
      // First create a source graph to save as template
      const { lineId: line0 } = await service.create(ctx, 'demo-template-source');
      await service.addNode(ctx, 'demo-template-source', line0, UNIT_AGENT);

      // Save as template
      const services = createScriptServices(workspacePath);
      const saveResult = await services.templateService.saveFrom(
        ctx,
        'demo-template-source',
        'demo-template'
      );
      if (saveResult.errors.length > 0) {
        throw new Error(`Failed to save template: ${JSON.stringify(saveResult.errors)}`);
      }

      // Instantiate from template
      const instResult = await services.templateService.instantiate(
        ctx,
        'demo-template',
        'demo-from-template'
      );
      if (instResult.errors.length > 0) {
        throw new Error(`Failed to instantiate template: ${JSON.stringify(instResult.errors)}`);
      }

      // Clean up source graph
      await service.delete(ctx, 'demo-template-source');
    },
  },
];

// ============================================
// CLI
// ============================================

async function cleanDemoWorkflows(workspacePath: string): Promise<void> {
  const workflowsDir = path.join(workspacePath, '.chainglass', 'data', 'workflows');
  try {
    const entries = await fs.readdir(workflowsDir);
    const demos = entries.filter((e) => e.startsWith('demo-'));
    for (const demo of demos) {
      await fs.rm(path.join(workflowsDir, demo), { recursive: true, force: true });
    }
    console.log(`Cleaned ${demos.length} demo workflow(s)`);
  } catch {
    console.log('No workflows directory to clean');
  }

  // Also clean demo templates and instances
  const templatesDir = path.join(workspacePath, '.chainglass', 'templates', 'workflows');
  try {
    const entries = await fs.readdir(templatesDir);
    const demos = entries.filter((e) => e.startsWith('demo-'));
    for (const demo of demos) {
      await fs.rm(path.join(templatesDir, demo), { recursive: true, force: true });
    }
    if (demos.length > 0) console.log(`Cleaned ${demos.length} demo template(s)`);
  } catch {
    // OK
  }

  const instancesDir = path.join(workspacePath, '.chainglass', 'instances');
  try {
    const entries = await fs.readdir(instancesDir);
    const demos = entries.filter((e) => e.startsWith('demo-'));
    for (const demo of demos) {
      await fs.rm(path.join(instancesDir, demo), { recursive: true, force: true });
    }
    if (demos.length > 0) console.log(`Cleaned ${demos.length} demo instance(s)`);
  } catch {
    // OK
  }
}

async function buildScenario(scenario: Scenario, workspacePath: string): Promise<void> {
  console.log(`  ${scenario.slug}: ${scenario.description}`);

  const { graphService } = createScriptServices(workspacePath);
  const ctx = createCtx(workspacePath);

  await scenario.build(graphService, ctx, workspacePath);
}

async function main(): Promise<void> {
  const startTime = performance.now();
  const args = process.argv.slice(2);
  const command = args[0] ?? 'all';

  // Use repo root as workspace path (doping is for local dev)
  const workspacePath = ROOT;

  if (command === 'clean') {
    await cleanDemoWorkflows(workspacePath);
    return;
  }

  // Ensure directories exist
  await fs.mkdir(path.join(workspacePath, '.chainglass', 'data', 'workflows'), { recursive: true });
  await fs.mkdir(path.join(workspacePath, '.chainglass', 'templates', 'workflows'), {
    recursive: true,
  });

  const scenarios =
    command === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.slug === command);

  if (scenarios.length === 0) {
    console.error(
      `Unknown scenario: ${command}. Available: ${SCENARIOS.map((s) => s.slug).join(', ')}`
    );
    process.exit(1);
  }

  console.log(`Dope Workflows — generating ${scenarios.length} scenario(s)\n`);

  for (const scenario of scenarios) {
    await buildScenario(scenario, workspacePath);
  }

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s. Workflows at .chainglass/data/workflows/`);
}

main().catch((err) => {
  console.error('Dope failed:', err);
  process.exit(1);
});
