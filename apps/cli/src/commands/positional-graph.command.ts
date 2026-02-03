/**
 * Positional Graph command group for the CLI.
 *
 * Per Plan 026 Phase 6: CLI Integration.
 * Provides cg wf <subcommand> commands for positional graph management.
 *
 * Commands:
 * - cg wf create <slug>                              - Create new positional graph
 * - cg wf show <slug>                                - Show graph structure (alias for get)
 * - cg wf get <slug>                                 - Get graph details
 * - cg wf set <slug> [--prop k=v] [--orch k=v]       - Set graph properties/settings
 * - cg wf delete <slug>                              - Delete a graph
 * - cg wf list                                       - List all graphs
 * - cg wf status <slug> [--node <id>] [--line <id>]  - Show status
 * - cg wf trigger <slug> <lineId>                    - Trigger manual transition
 * - cg wf line add|remove|move|get|set|set-label|set-description
 * - cg wf node add|remove|move|show|get|set|set-description|set-input|remove-input|collate
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per ADR-0009: Module registration via registerPositionalGraphServices().
 * Per DYK-P6-I5: Imports shared helpers from command-helpers.ts.
 */

import type { IPositionalGraphService } from '@chainglass/positional-graph';
import { POSITIONAL_GRAPH_DI_TOKENS } from '@chainglass/shared';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';
import {
  createOutputAdapter,
  noContextError,
  resolveOrOverrideContext,
  wrapAction,
} from './command-helpers.js';

// ============================================
// Option Interfaces
// ============================================

interface BaseOptions {
  json?: boolean;
  workspacePath?: string;
}

interface AddLineOptions extends BaseOptions {
  afterLineId?: string;
  beforeLineId?: string;
  atIndex?: string;
  label?: string;
  description?: string;
}

interface AddNodeOptions extends BaseOptions {
  atPosition?: string;
  description?: string;
}

interface MoveNodeOptions extends BaseOptions {
  toPosition?: string;
  toLineId?: string;
}

interface SetInputOptions extends BaseOptions {
  fromUnit?: string;
  fromNode?: string;
  output: string;
}

interface StatusOptions extends BaseOptions {
  node?: string;
  line?: string;
}

interface SetOptions extends BaseOptions {
  prop?: string[];
  orch?: string[];
  description?: string;
  label?: string;
}

// ============================================
// Helpers
// ============================================

function parseIntOrUndefined(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Parse key=value pairs into a Record. Values are JSON-parsed for type coercion.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function parseKeyValuePairs(pairs: string[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!pairs) return result;

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key && !FORBIDDEN_KEYS.has(key) && valueParts.length > 0) {
      const value = valueParts.join('=');
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Get the PositionalGraphService from DI container.
 */
function getPositionalGraphService(): IPositionalGraphService {
  const container = createCliProductionContainer();
  return container.resolve<IPositionalGraphService>(
    POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
  );
}

// ============================================
// Graph Command Handlers
// ============================================

async function handleWfCreate(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { graphSlug: '', lineId: '', errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.create', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.create(ctx, slug);
  console.log(adapter.format('wf.create', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleWfShow(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.show', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.show(ctx, slug);
  console.log(adapter.format('wf.show', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleWfSet(slug: string, options: SetOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.set', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const props = parseKeyValuePairs(options.prop);
  const orch = parseKeyValuePairs(options.orch);

  if (Object.keys(props).length > 0) {
    const result = await service.updateGraphProperties(ctx, slug, props);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.set', result));
      process.exit(1);
    }
  }

  if (Object.keys(orch).length > 0) {
    const result = await service.updateGraphOrchestratorSettings(ctx, slug, orch);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.set', result));
      process.exit(1);
    }
  }

  if (options.description !== undefined) {
    // Graph doesn't have a dedicated setDescription, update via properties for now
    // or load+persist. For now, treat as property.
    const result = await service.updateGraphProperties(ctx, slug, {
      description: options.description,
    });
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.set', result));
      process.exit(1);
    }
  }

  console.log(adapter.format('wf.set', { errors: [] }));
}

async function handleWfDelete(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.delete', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.delete(ctx, slug);
  console.log(adapter.format('wf.delete', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleWfList(options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { slugs: [], errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.list', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.list(ctx);
  console.log(adapter.format('wf.list', result));

  if (result.errors.length > 0) process.exit(1);
}

// ============================================
// Line Command Handlers
// ============================================

async function handleLineAdd(graphSlug: string, options: AddLineOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.line.add', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.addLine(ctx, graphSlug, {
    afterLineId: options.afterLineId,
    beforeLineId: options.beforeLineId,
    atIndex: parseIntOrUndefined(options.atIndex),
    label: options.label,
    description: options.description,
  });
  console.log(adapter.format('wf.line.add', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleLineRemove(
  graphSlug: string,
  lineId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.line.remove', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.removeLine(ctx, graphSlug, lineId);
  console.log(adapter.format('wf.line.remove', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleLineMove(
  graphSlug: string,
  lineId: string,
  toIndex: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.line.move', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.moveLine(ctx, graphSlug, lineId, parseIntOrUndefined(toIndex) ?? 0);
  console.log(adapter.format('wf.line.move', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleLineSet(
  graphSlug: string,
  lineId: string,
  options: SetOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.line.set', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const props = parseKeyValuePairs(options.prop);
  const orch = parseKeyValuePairs(options.orch);

  if (Object.keys(props).length > 0) {
    const result = await service.updateLineProperties(ctx, graphSlug, lineId, props);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.line.set', result));
      process.exit(1);
    }
  }

  if (Object.keys(orch).length > 0) {
    const result = await service.updateLineOrchestratorSettings(ctx, graphSlug, lineId, orch);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.line.set', result));
      process.exit(1);
    }
  }

  if (options.label !== undefined) {
    const result = await service.setLineLabel(ctx, graphSlug, lineId, options.label);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.line.set', result));
      process.exit(1);
    }
  }

  if (options.description !== undefined) {
    const result = await service.setLineDescription(ctx, graphSlug, lineId, options.description);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.line.set', result));
      process.exit(1);
    }
  }

  console.log(adapter.format('wf.line.set', { errors: [] }));
}

async function handleLineSetLabel(
  graphSlug: string,
  lineId: string,
  label: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.line.set-label', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.setLineLabel(ctx, graphSlug, lineId, label);
  console.log(adapter.format('wf.line.set-label', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleLineSetDescription(
  graphSlug: string,
  lineId: string,
  description: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.line.set-description', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.setLineDescription(ctx, graphSlug, lineId, description);
  console.log(adapter.format('wf.line.set-description', result));

  if (result.errors.length > 0) process.exit(1);
}

// ============================================
// Node Command Handlers
// ============================================

async function handleNodeAdd(
  graphSlug: string,
  lineId: string,
  unitSlug: string,
  options: AddNodeOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.add', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.addNode(ctx, graphSlug, lineId, unitSlug, {
    atPosition: parseIntOrUndefined(options.atPosition),
    description: options.description,
  });
  console.log(adapter.format('wf.node.add', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeRemove(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.remove', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.removeNode(ctx, graphSlug, nodeId);
  console.log(adapter.format('wf.node.remove', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeMove(
  graphSlug: string,
  nodeId: string,
  options: MoveNodeOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.move', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.moveNode(ctx, graphSlug, nodeId, {
    toPosition: parseIntOrUndefined(options.toPosition),
    toLineId: options.toLineId,
  });
  console.log(adapter.format('wf.node.move', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeShow(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.show', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.showNode(ctx, graphSlug, nodeId);
  console.log(adapter.format('wf.node.show', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeSet(
  graphSlug: string,
  nodeId: string,
  options: SetOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.set', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const props = parseKeyValuePairs(options.prop);
  const orch = parseKeyValuePairs(options.orch);

  if (Object.keys(props).length > 0) {
    const result = await service.updateNodeProperties(ctx, graphSlug, nodeId, props);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.node.set', result));
      process.exit(1);
    }
  }

  if (Object.keys(orch).length > 0) {
    const result = await service.updateNodeOrchestratorSettings(ctx, graphSlug, nodeId, orch);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.node.set', result));
      process.exit(1);
    }
  }

  if (options.description !== undefined) {
    const result = await service.setNodeDescription(ctx, graphSlug, nodeId, options.description);
    if (result.errors.length > 0) {
      console.log(adapter.format('wf.node.set', result));
      process.exit(1);
    }
  }

  console.log(adapter.format('wf.node.set', { errors: [] }));
}

async function handleNodeSetDescription(
  graphSlug: string,
  nodeId: string,
  description: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.set-description', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.setNodeDescription(ctx, graphSlug, nodeId, description);
  console.log(adapter.format('wf.node.set-description', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeSetInput(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: SetInputOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.set-input', result));
    process.exit(1);
  }

  // Require at least one source option
  if (!options.fromUnit && !options.fromNode) {
    const result = {
      errors: [
        {
          code: 'E074',
          message: 'Missing input source',
          action: 'Provide either --from-unit <slug> or --from-node <nodeId>',
        },
      ],
    };
    console.log(adapter.format('wf.node.set-input', result));
    process.exit(1);
  }

  // Build source — either from_unit or from_node
  const source = options.fromNode
    ? { from_node: options.fromNode, from_output: options.output }
    : { from_unit: options.fromUnit ?? '', from_output: options.output };

  const service = getPositionalGraphService();
  const result = await service.setInput(ctx, graphSlug, nodeId, inputName, source);
  console.log(adapter.format('wf.node.set-input', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeRemoveInput(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.remove-input', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.removeInput(ctx, graphSlug, nodeId, inputName);
  console.log(adapter.format('wf.node.remove-input', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeCollate(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { inputs: {}, ok: false, errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.collate', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const inputPack = await service.collateInputs(ctx, graphSlug, nodeId);
  // Wrap InputPack into a BaseResult-compatible shape for the adapter
  const result = { ...inputPack, errors: [] as { code: string; message: string }[] };
  console.log(adapter.format('wf.node.collate', result));

  if (!inputPack.ok) {
    process.exit(1);
  }
}

// ============================================
// Status + Trigger Handlers
// ============================================

async function handleWfStatus(slug: string, options: StatusOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.status', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();

  // Scope narrowing: --node takes priority over --line
  if (options.node) {
    const result = await service.getNodeStatus(ctx, slug, options.node);
    console.log(adapter.format('wf.status.node', result));
    return;
  }

  if (options.line) {
    const result = await service.getLineStatus(ctx, slug, options.line);
    console.log(adapter.format('wf.status.line', result));
    return;
  }

  const result = await service.getStatus(ctx, slug);
  console.log(adapter.format('wf.status', result));

  if (result.readyNodes.length === 0 && result.status !== 'complete') {
    // Not an error, but no ready nodes — informational
  }
}

async function handleWfTrigger(slug: string, lineId: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.trigger', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.triggerTransition(ctx, slug, lineId);
  console.log(adapter.format('wf.trigger', result));

  if (result.errors.length > 0) process.exit(1);
}

// ============================================
// Command Registration
// ============================================

/**
 * Register the positional-graph command group with the Commander program.
 *
 * Creates the cg wf command group with subcommands for graph, line, and node operations.
 * Per DYK-P6-I2: cg wf is the primary graph command namespace (cg wg is being deprecated).
 *
 * @param program - Commander.js program instance
 */
export function registerPositionalGraphCommands(program: Command): void {
  const wf = program
    .command('wf')
    .description('Manage positional graphs (workflows)')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context');

  // ==================== Graph Commands ====================

  wf.command('create <slug>')
    .description('Create a new positional graph')
    .action(
      wrapAction(async (slug: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfCreate(slug, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  wf.command('show <slug>')
    .description('Show graph structure')
    .action(
      wrapAction(async (slug: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfShow(slug, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  // get = alias for show
  wf.command('get <slug>')
    .description('Get graph details (alias for show)')
    .action(
      wrapAction(async (slug: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfShow(slug, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  wf.command('set <slug>')
    .description('Set graph properties or orchestrator settings')
    .option(
      '--prop <key=value>',
      'Set a property (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option(
      '--orch <key=value>',
      'Set an orchestrator setting (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option('--description <desc>', 'Set graph description')
    .action(
      wrapAction(async (slug: string, options: SetOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfSet(slug, {
          ...options,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  wf.command('delete <slug>')
    .description('Delete a positional graph')
    .action(
      wrapAction(async (slug: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfDelete(slug, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  wf.command('list')
    .description('List all positional graphs')
    .action(
      wrapAction(async (_options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfList({ json: parentOpts.json, workspacePath: parentOpts.workspacePath });
      })
    );

  // ==================== Status + Trigger Commands ====================

  wf.command('status <slug>')
    .description('Show graph/node/line status')
    .option('--node <nodeId>', 'Show status for a specific node')
    .option('--line <lineId>', 'Show status for a specific line')
    .action(
      wrapAction(async (slug: string, options: StatusOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfStatus(slug, {
          ...options,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  wf.command('trigger <slug> <lineId>')
    .description('Trigger a manual line transition')
    .action(
      wrapAction(async (slug: string, lineId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        await handleWfTrigger(slug, lineId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  // ==================== Line Commands ====================

  const line = wf.command('line').description('Line operations');

  line
    .command('add <graph>')
    .description('Add a new line to the graph')
    .option('--after-line-id <id>', 'Insert after this line')
    .option('--before-line-id <id>', 'Insert before this line')
    .option('--at-index <index>', 'Insert at specific index')
    .option('--label <label>', 'Line label')
    .option('--description <desc>', 'Line description')
    .action(
      wrapAction(async (graph: string, options: AddLineOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleLineAdd(graph, {
          ...options,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  line
    .command('remove <graph> <lineId>')
    .description('Remove a line from the graph')
    .action(
      wrapAction(async (graph: string, lineId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleLineRemove(graph, lineId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  line
    .command('move <graph> <lineId> <toIndex>')
    .description('Move a line to a new position')
    .action(
      wrapAction(
        async (
          graph: string,
          lineId: string,
          toIndex: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleLineMove(graph, lineId, toIndex, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  // get = show line details (delegates to wf show with line filter)
  line
    .command('get <graph> <lineId>')
    .description('Get line details')
    .action(
      wrapAction(async (graph: string, lineId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleWfStatus(graph, {
          line: lineId,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  line
    .command('set <graph> <lineId>')
    .description('Set line properties, orchestrator settings, label, or description')
    .option(
      '--prop <key=value>',
      'Set a property (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option(
      '--orch <key=value>',
      'Set an orchestrator setting (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option('--label <label>', 'Set line label')
    .option('--description <desc>', 'Set line description')
    .action(
      wrapAction(async (graph: string, lineId: string, options: SetOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleLineSet(graph, lineId, {
          ...options,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  line
    .command('set-label <graph> <lineId> <label>')
    .description('Set line label')
    .action(
      wrapAction(
        async (
          graph: string,
          lineId: string,
          label: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleLineSetLabel(graph, lineId, label, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  line
    .command('set-description <graph> <lineId> <description>')
    .description('Set line description')
    .action(
      wrapAction(
        async (
          graph: string,
          lineId: string,
          description: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleLineSetDescription(graph, lineId, description, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  // ==================== Node Commands ====================

  const node = wf.command('node').description('Node operations');

  node
    .command('add <graph> <lineId> <unitSlug>')
    .description('Add a node to a line')
    .option('--at-position <pos>', 'Insert at specific position')
    .option('--description <desc>', 'Node description')
    .action(
      wrapAction(
        async (
          graph: string,
          lineId: string,
          unitSlug: string,
          options: AddNodeOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeAdd(graph, lineId, unitSlug, {
            ...options,
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('remove <graph> <nodeId>')
    .description('Remove a node from the graph')
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeRemove(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  node
    .command('move <graph> <nodeId>')
    .description('Move a node to a new position or line')
    .option('--to-position <pos>', 'Target position in line')
    .option('--to-line-id <lineId>', 'Target line ID')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: MoveNodeOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeMove(graph, nodeId, {
          ...options,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  node
    .command('show <graph> <nodeId>')
    .description('Show node details')
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeShow(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  // get = alias for show
  node
    .command('get <graph> <nodeId>')
    .description('Get node details (alias for show)')
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeShow(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  node
    .command('set <graph> <nodeId>')
    .description('Set node properties, orchestrator settings, or description')
    .option(
      '--prop <key=value>',
      'Set a property (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option(
      '--orch <key=value>',
      'Set an orchestrator setting (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option('--description <desc>', 'Set node description')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: SetOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeSet(graph, nodeId, {
          ...options,
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  node
    .command('set-description <graph> <nodeId> <description>')
    .description('Set node description')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          description: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeSetDescription(graph, nodeId, description, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('set-input <graph> <nodeId> <inputName>')
    .description('Wire an input to a source (--from-unit or --from-node + --output)')
    .option('--from-unit <slug>', 'Source unit slug (backward search)')
    .option('--from-node <nodeId>', 'Source node ID (direct reference)')
    .requiredOption('--output <name>', 'Source output name')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          inputName: string,
          options: SetInputOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeSetInput(graph, nodeId, inputName, {
            ...options,
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('remove-input <graph> <nodeId> <inputName>')
    .description('Remove an input wiring')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          inputName: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeRemoveInput(graph, nodeId, inputName, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('collate <graph> <nodeId>')
    .description('Show resolved inputs for a node')
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeCollate(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );
}
