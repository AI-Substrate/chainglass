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
const WORKFLOWS_DIR = path.join(ROOT, '.chainglass', 'data', 'workflows');

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
// Demo Work Units
// ============================================

const DEMO_UNITS = {
  'demo-agent': {
    slug: 'demo-agent',
    type: 'agent',
    version: '1.0.0',
    description: 'Demo agent unit for UI development',
    inputs: [
      { name: 'task', type: 'data', data_type: 'text', required: true, description: 'Task input' },
    ],
    outputs: [
      {
        name: 'result',
        type: 'data',
        data_type: 'text',
        required: true,
        description: 'Agent result',
      },
    ],
    agent: { type: 'claude-code' },
  },
  'demo-code': {
    slug: 'demo-code',
    type: 'code',
    version: '1.0.0',
    description: 'Demo code unit for UI development',
    inputs: [],
    outputs: [
      {
        name: 'result',
        type: 'data',
        data_type: 'text',
        required: true,
        description: 'Code result',
      },
    ],
    code: { script: 'scripts/noop.sh' },
  },
  'demo-user-input': {
    slug: 'demo-user-input',
    type: 'user-input',
    version: '1.0.0',
    description: 'Demo user-input unit for UI development',
    inputs: [],
    outputs: [
      {
        name: 'answer',
        type: 'data',
        data_type: 'text',
        required: true,
        description: 'User answer',
      },
    ],
    user_input: { question_type: 'text', prompt: 'What would you like to do?' },
  },
} as const;

async function writeDemoUnits(workspacePath: string): Promise<void> {
  const yamlParser = new YamlParserAdapter();
  for (const unit of Object.values(DEMO_UNITS)) {
    const unitDir = path.join(workspacePath, '.chainglass', 'units', unit.slug);
    await fs.mkdir(unitDir, { recursive: true });
    await fs.writeFile(path.join(unitDir, 'unit.yaml'), yamlParser.stringify(unit));
    // Create noop script for code units
    if (unit.type === 'code') {
      const scriptDir = path.join(unitDir, 'scripts');
      await fs.mkdir(scriptDir, { recursive: true });
      await fs.writeFile(path.join(scriptDir, 'noop.sh'), '#!/bin/bash\necho "noop"\n', {
        mode: 0o755,
      });
    }
  }
}

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
    description: 'Two-line serial workflow — agent → code',
    async build(service, ctx) {
      const { lineId: line0 } = await service.create(ctx, 'demo-serial');
      const line1 = await service.addLine(ctx, 'demo-serial');

      const n1 = await service.addNode(ctx, 'demo-serial', line0, 'demo-agent');
      await service.addNode(ctx, 'demo-serial', line1.lineId ?? "", 'demo-code');

      // Wire input: code node takes agent's result
      const nodes = await service.load(ctx, 'demo-serial');
      const line1Nodes = nodes.definition?.lines[1]?.nodes ?? [];
      if (line1Nodes.length > 0 && n1.nodeId) {
        await service.setInput(ctx, 'demo-serial', line1Nodes[0], 'task', {
          from_node: n1.nodeId,
          from_output: 'result',
        });
      }
    },
  },

  {
    slug: 'demo-running',
    description: 'Workflow with one node running (agent-accepted)',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-running');
      const n1 = await service.addNode(ctx, 'demo-running', line0, 'demo-agent');

      await injectState(workspacePath, 'demo-running', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1.nodeId ?? ""]: {
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
      const n1 = await service.addNode(ctx, 'demo-question', line0, 'demo-agent');

      const questionId = 'q-demo-1';
      await injectState(workspacePath, 'demo-question', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1.nodeId ?? ""]: {
            status: 'waiting-question',
            started_at: now(),
            pending_question_id: questionId,
          },
        },
        questions: [
          {
            question_id: questionId,
            node_id: n1.nodeId ?? "",
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
      const n1 = await service.addNode(ctx, 'demo-error', line0, 'demo-code');

      await injectState(workspacePath, 'demo-error', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1.nodeId ?? ""]: {
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

      const n1 = await service.addNode(ctx, 'demo-complete', line0, 'demo-agent');
      const n2 = await service.addNode(ctx, 'demo-complete', line1.lineId ?? "", 'demo-code');

      await injectState(workspacePath, 'demo-complete', {
        graph_status: 'complete',
        updated_at: now(),
        nodes: {
          [n1.nodeId ?? ""]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
          [n2.nodeId ?? ""]: {
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
    description: 'Multi-line workflow with mixed states — running, question, error, complete, pending',
    async build(service, ctx, workspacePath) {
      const { lineId: line0 } = await service.create(ctx, 'demo-complex');
      const line1 = await service.addLine(ctx, 'demo-complex');
      const line2 = await service.addLine(ctx, 'demo-complex');

      // Line 0: two nodes — one complete, one complete
      const n1 = await service.addNode(ctx, 'demo-complex', line0, 'demo-user-input');
      const n2 = await service.addNode(ctx, 'demo-complex', line0, 'demo-agent');

      // Line 1: two nodes — one running, one with question
      const n3 = await service.addNode(ctx, 'demo-complex', line1.lineId ?? "", 'demo-agent');
      const n4 = await service.addNode(ctx, 'demo-complex', line1.lineId ?? "", 'demo-code');

      // Line 2: one node — pending (future line)
      const n5 = await service.addNode(ctx, 'demo-complex', line2.lineId ?? "", 'demo-agent');

      const questionId = 'q-complex-1';
      await injectState(workspacePath, 'demo-complex', {
        graph_status: 'in_progress',
        updated_at: now(),
        nodes: {
          [n1.nodeId ?? ""]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
          [n2.nodeId ?? ""]: {
            status: 'complete',
            started_at: now(),
            completed_at: now(),
          },
          [n3.nodeId ?? ""]: {
            status: 'agent-accepted',
            started_at: now(),
          },
          [n4.nodeId ?? ""]: {
            status: 'waiting-question',
            started_at: now(),
            pending_question_id: questionId,
          },
        },
        transitions: {
          [line0]: { triggered: true, triggered_at: now() },
        },
        questions: [
          {
            question_id: questionId,
            node_id: n4.nodeId ?? "",
            type: 'single',
            text: 'Which database should we use?',
            options: ['PostgreSQL', 'MySQL', 'SQLite'],
            asked_at: now(),
          },
        ],
      });
      // n5 is implicitly pending (no state entry)
      void n5;
    },
  },

  {
    slug: 'demo-from-template',
    description: 'Workflow instantiated from a template — validates template breadcrumb',
    async build(service, ctx, workspacePath) {
      // First create a source graph to save as template
      const { lineId: line0 } = await service.create(ctx, 'demo-template-source');
      await service.addNode(ctx, 'demo-template-source', line0, 'demo-agent');

      // Save as template
      const services = createScriptServices(workspacePath);
      const saveResult = await services.templateService.saveFrom(
        ctx,
        'demo-template-source',
        'demo-template'
      );
      if (saveResult.errors.length > 0) {
        console.error('  Failed to save template:', saveResult.errors);
        return;
      }

      // Instantiate from template
      const instResult = await services.templateService.instantiate(
        ctx,
        'demo-template',
        'demo-from-template'
      );
      if (instResult.errors.length > 0) {
        console.error('  Failed to instantiate template:', instResult.errors);
        return;
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

  // Write demo work units
  await writeDemoUnits(workspacePath);

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
