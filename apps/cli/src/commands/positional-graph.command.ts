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
 * - cg wf node save-output-data|save-output-file|get-output-data|get-output-file
 * - cg wf node start|can-end|end (Phase 3 lifecycle commands)
 * - cg wf node ask|answer|get-answer (Phase 4 Q&A protocol)
 * - cg wf node get-input-data|get-input-file (Phase 5 input retrieval)
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per ADR-0009: Module registration via registerPositionalGraphServices().
 * Per DYK-P6-I5: Imports shared helpers from command-helpers.ts.
 */

import type {
  AskQuestionOptions,
  EventSource,
  IPositionalGraphService,
} from '@chainglass/positional-graph';
import {
  type IWorkUnitService,
  isReservedInputParam,
  workunitTypeMismatchError,
} from '@chainglass/positional-graph';
import type { IOrchestrationService } from '@chainglass/positional-graph';
import { ORCHESTRATION_DI_TOKENS, POSITIONAL_GRAPH_DI_TOKENS } from '@chainglass/shared';
import type { Command } from 'commander';
import { cliDriveGraph } from '../features/036-cli-orchestration-driver/cli-drive-handler.js';
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

interface AskOptions extends BaseOptions {
  type: string;
  text: string;
  options?: string[];
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

/**
 * Get the WorkUnitService from DI container.
 * Per Plan 029 Phase 3: Used for reserved parameter routing.
 */
function getWorkUnitService(): IWorkUnitService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkUnitService>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE);
}

/**
 * Get the OrchestrationService from DI container.
 * Per Plan 036 Phase 5: Used by cg wf run command.
 */
function getOrchestrationService(): IOrchestrationService {
  const container = createCliProductionContainer();
  return container.resolve<IOrchestrationService>(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE);
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
// Output Storage Handlers (Phase 2, Plan 028)
// ============================================

async function handleSaveOutputData(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  valueJson: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { saved: false, errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.save-output-data', result));
    process.exit(1);
  }

  // Parse the JSON value
  let value: unknown;
  try {
    value = JSON.parse(valueJson);
  } catch {
    const result = {
      saved: false,
      errors: [{ code: 'E001', message: `Invalid JSON value: ${valueJson}` }],
    };
    console.log(adapter.format('wf.node.save-output-data', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.saveOutputData(ctx, graphSlug, nodeId, outputName, value);
  console.log(adapter.format('wf.node.save-output-data', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleSaveOutputFile(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  sourcePath: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { saved: false, errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.save-output-file', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.saveOutputFile(ctx, graphSlug, nodeId, outputName, sourcePath);
  console.log(adapter.format('wf.node.save-output-file', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleGetOutputData(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.get-output-data', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.getOutputData(ctx, graphSlug, nodeId, outputName);
  console.log(adapter.format('wf.node.get-output-data', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleGetOutputFile(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.get-output-file', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.getOutputFile(ctx, graphSlug, nodeId, outputName);
  console.log(adapter.format('wf.node.get-output-file', result));

  if (result.errors.length > 0) process.exit(1);
}

// ============================================
// Node Lifecycle Handlers (Phase 3, Plan 028)
// ============================================

async function handleNodeStart(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.start', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.startNode(ctx, graphSlug, nodeId);
  console.log(adapter.format('wf.node.start', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeCanEnd(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      canEnd: false,
      savedOutputs: [],
      missingOutputs: [],
      errors: noContextError(options.workspacePath),
    };
    console.log(adapter.format('wf.node.can-end', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.canEnd(ctx, graphSlug, nodeId);
  console.log(adapter.format('wf.node.can-end', result));

  // canEnd returns canEnd: false with missingOutputs when not ready, but that's not an error
  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeEnd(
  graphSlug: string,
  nodeId: string,
  options: EndOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.end', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.endNode(ctx, graphSlug, nodeId, options.message);
  console.log(adapter.format('wf.node.end', result));

  if (result.errors.length > 0) process.exit(1);
}

// ============================================
// Question/Answer Handlers (Phase 4, Plan 028)
// ============================================

async function handleNodeAsk(
  graphSlug: string,
  nodeId: string,
  options: AskOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.ask', result));
    process.exit(1);
  }

  // Validate type
  const validTypes = ['text', 'single', 'multi', 'confirm'];
  if (!validTypes.includes(options.type)) {
    const result = {
      errors: [
        {
          code: 'E100',
          message: `Invalid question type '${options.type}'. Must be one of: ${validTypes.join(', ')}`,
          action: 'Use --type text|single|multi|confirm',
        },
      ],
    };
    console.log(adapter.format('wf.node.ask', result));
    process.exit(1);
  }

  const askOptions: AskQuestionOptions = {
    type: options.type as 'text' | 'single' | 'multi' | 'confirm',
    text: options.text,
  };
  if (options.options && options.options.length > 0) {
    askOptions.options = options.options;
  }

  const service = getPositionalGraphService();
  const result = await service.askQuestion(ctx, graphSlug, nodeId, askOptions);
  console.log(adapter.format('wf.node.ask', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeAnswer(
  graphSlug: string,
  nodeId: string,
  questionId: string,
  answer: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.answer', result));
    process.exit(1);
  }

  // Parse answer as JSON if possible, otherwise use as string
  let parsedAnswer: unknown = answer;
  try {
    parsedAnswer = JSON.parse(answer);
  } catch {
    // Keep as string if not valid JSON
  }

  const service = getPositionalGraphService();
  const result = await service.answerQuestion(ctx, graphSlug, nodeId, questionId, parsedAnswer);
  console.log(adapter.format('wf.node.answer', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeGetAnswer(
  graphSlug: string,
  nodeId: string,
  questionId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { answered: false, errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.get-answer', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.getAnswer(ctx, graphSlug, nodeId, questionId);
  console.log(adapter.format('wf.node.get-answer', result));

  if (result.errors.length > 0) process.exit(1);
}

// ============================================
// Input Retrieval Handlers (Phase 5, Plan 028)
// ============================================

async function handleNodeGetInputData(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.get-input-data', result));
    process.exit(1);
  }

  // Per Plan 029 Phase 3: Reserved parameter routing
  // Reserved params (main-prompt, main-script) route to WorkUnitService
  if (isReservedInputParam(inputName)) {
    const pgService = getPositionalGraphService();
    const workUnitService = getWorkUnitService();

    // First, get the node to determine its unit slug
    const nodeResult = await pgService.showNode(ctx, graphSlug, nodeId);
    if (nodeResult.errors.length > 0) {
      console.log(adapter.format('wf.node.get-input-data', nodeResult));
      process.exit(1);
    }

    // Load the work unit
    const loadResult = await workUnitService.load(ctx, nodeResult.unitSlug);
    if (loadResult.errors.length > 0 || !loadResult.unit) {
      console.log(
        adapter.format('wf.node.get-input-data', { errors: loadResult.errors, value: undefined })
      );
      process.exit(1);
    }

    const unit = loadResult.unit;

    // Route based on reserved param type and verify unit type
    if (inputName === 'main-prompt') {
      if (unit.type !== 'agent') {
        const error = workunitTypeMismatchError('main-prompt', 'agent', unit.type);
        console.log(
          adapter.format('wf.node.get-input-data', { errors: [error], value: undefined })
        );
        process.exit(1);
      }
      // Get prompt content from AgenticWorkUnitInstance
      const content = await unit.getPrompt(ctx);
      console.log(
        adapter.format('wf.node.get-input-data', {
          errors: [],
          value: content,
          templateType: 'prompt',
          templatePath: unit.agent.prompt_template,
        })
      );
      return;
    }

    if (inputName === 'main-script') {
      if (unit.type !== 'code') {
        const error = workunitTypeMismatchError('main-script', 'code', unit.type);
        console.log(
          adapter.format('wf.node.get-input-data', { errors: [error], value: undefined })
        );
        process.exit(1);
      }
      // Get script content from CodeUnitInstance
      const content = await unit.getScript(ctx);
      console.log(
        adapter.format('wf.node.get-input-data', {
          errors: [],
          value: content,
          templateType: 'script',
          templatePath: unit.code.script,
        })
      );
      return;
    }
  }

  // Non-reserved inputs: route to normal getInputData
  const service = getPositionalGraphService();
  const result = await service.getInputData(ctx, graphSlug, nodeId, inputName);
  console.log(adapter.format('wf.node.get-input-data', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeGetInputFile(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.get-input-file', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.getInputFile(ctx, graphSlug, nodeId, inputName);
  console.log(adapter.format('wf.node.get-input-file', result));

  if (result.errors.length > 0) process.exit(1);
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
    // Wrap in BaseResult structure for adapter compatibility
    console.log(adapter.format('wf.status.node', { ...result, errors: [] }));
    return;
  }

  if (options.line) {
    const result = await service.getLineStatus(ctx, slug, options.line);
    // Wrap in BaseResult structure for adapter compatibility
    console.log(adapter.format('wf.status.line', { ...result, errors: [] }));
    return;
  }

  const result = await service.getStatus(ctx, slug);
  // Wrap in BaseResult structure for adapter compatibility
  console.log(adapter.format('wf.status', { ...result, errors: [] }));
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
// Node Event System Handlers (Phase 6, Plan 032)
// ============================================

interface RaiseEventOptions extends BaseOptions {
  payload?: string;
  source?: string;
}

interface EventsOptions extends BaseOptions {
  id?: string;
  type?: string[];
  status?: string;
}

interface StampEventOptions extends BaseOptions {
  subscriber: string;
  action: string;
  data?: string;
}

interface ErrorShortcutOptions extends BaseOptions {
  code: string;
  message: string;
  details?: string;
  recoverable?: boolean;
}

interface EndOptions extends BaseOptions {
  message?: string;
}

/**
 * Walk the Commander parent chain to find the --json flag.
 * Discovery commands are 4 levels deep (cg wf node event list-types),
 * so we can't assume a fixed depth.
 */
function getJsonFlag(cmd: Command): boolean {
  let current: Command | null = cmd;
  while (current) {
    const opts = current.opts();
    if (opts.json !== undefined) return !!opts.json;
    current = current.parent ?? null;
  }
  return false;
}

/**
 * Walk the Commander parent chain to find --workspace-path.
 */
function getWorkspacePath(cmd: Command): string | undefined {
  let current: Command | null = cmd;
  while (current) {
    const opts = current.opts();
    if (opts.workspacePath !== undefined) return opts.workspacePath as string;
    current = current.parent ?? null;
  }
  return undefined;
}

function parseJsonPayload(
  jsonStr: string,
  adapter: { format: (cmd: string, result: unknown) => string },
  command: string
): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      const result = {
        errors: [
          {
            code: 'E197',
            message: 'Invalid JSON payload: must be a JSON object',
            action: `Received: ${jsonStr.length > 100 ? `${jsonStr.slice(0, 100)}...` : jsonStr}`,
          },
        ],
      };
      console.log(adapter.format(command, result));
      process.exit(1);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    const result = {
      errors: [
        {
          code: 'E197',
          message: `Invalid JSON payload: ${e instanceof Error ? e.message : String(e)}`,
          action: `Ensure the payload is valid JSON. Received: ${jsonStr.length > 100 ? `${jsonStr.slice(0, 100)}...` : jsonStr}`,
        },
      ],
    };
    console.log(adapter.format(command, result));
    process.exit(1);
  }
}

async function handleNodeRaiseEvent(
  graphSlug: string,
  nodeId: string,
  eventType: string,
  options: RaiseEventOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.raise-event', result));
    process.exit(1);
  }

  // Parse payload JSON if provided (parseJsonPayload exits on invalid JSON, null never reached)
  const payload = options.payload
    ? (parseJsonPayload(options.payload, adapter, 'wf.node.raise-event') ?? {})
    : {};

  const source = (options.source ?? 'agent') as EventSource;

  const service = getPositionalGraphService();
  const result = await service.raiseNodeEvent(ctx, graphSlug, nodeId, eventType, payload, source);

  // For stop-execution events, add agent instruction to output
  if (result.errors.length === 0 && result.stopsExecution) {
    const augmented = {
      ...result,
      agentInstruction:
        '[AGENT INSTRUCTION] This event stops execution. Do not continue processing this node.',
    };
    console.log(adapter.format('wf.node.raise-event', augmented));
  } else {
    console.log(adapter.format('wf.node.raise-event', result));
  }

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeEvents(
  graphSlug: string,
  nodeId: string,
  options: EventsOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.events', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.getNodeEvents(ctx, graphSlug, nodeId, {
    eventId: options.id,
    types: options.type,
    status: options.status,
  });
  console.log(adapter.format('wf.node.events', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeStampEvent(
  graphSlug: string,
  nodeId: string,
  eventId: string,
  options: StampEventOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.stamp-event', result));
    process.exit(1);
  }

  // Parse optional data JSON (parseJsonPayload exits on invalid JSON, null never reached)
  const data = options.data
    ? (parseJsonPayload(options.data, adapter, 'wf.node.stamp-event') ?? undefined)
    : undefined;

  const service = getPositionalGraphService();
  const result = await service.stampNodeEvent(
    ctx,
    graphSlug,
    nodeId,
    eventId,
    options.subscriber,
    options.action,
    data
  );
  console.log(adapter.format('wf.node.stamp-event', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeAccept(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.accept', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  const result = await service.raiseNodeEvent(ctx, graphSlug, nodeId, 'node:accepted', {}, 'agent');
  console.log(adapter.format('wf.node.accept', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeError(
  graphSlug: string,
  nodeId: string,
  options: ErrorShortcutOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.error', result));
    process.exit(1);
  }

  const payload: Record<string, unknown> = {
    code: options.code,
    message: options.message,
    recoverable: options.recoverable ?? false,
  };

  if (options.details) {
    const parsed = parseJsonPayload(options.details, adapter, 'wf.node.error');
    if (parsed) payload.details = parsed;
  }

  const service = getPositionalGraphService();
  const result = await service.raiseNodeEvent(
    ctx,
    graphSlug,
    nodeId,
    'node:error',
    payload,
    'agent'
  );

  // node:error stopsExecution — always show agent instruction
  if (result.errors.length === 0 && result.stopsExecution) {
    const augmented = {
      ...result,
      agentInstruction:
        '[AGENT INSTRUCTION] This event stops execution. Do not continue processing this node.',
    };
    console.log(adapter.format('wf.node.error', augmented));
  } else {
    console.log(adapter.format('wf.node.error', result));
  }

  if (result.errors.length > 0) process.exit(1);
}

async function handleNodeEventListTypes(
  _graphSlug: string,
  _nodeId: string,
  options: BaseOptions & { domain?: string }
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Discovery commands query the registry, not state — but we keep the
  // <graph> <nodeId> pattern for CLI consistency (DYK #4)
  const { NodeEventRegistry, registerCoreEventTypes } = await import(
    '@chainglass/positional-graph/features/032-node-event-system'
  );
  const registry = new NodeEventRegistry();
  registerCoreEventTypes(registry);

  const types = options.domain ? registry.listByDomain(options.domain) : registry.list();

  const result = {
    types: types.map((t) => ({
      type: t.type,
      displayName: t.displayName,
      description: t.description,
      domain: t.domain,
      stopsExecution: t.stopsExecution,
      allowedSources: [...t.allowedSources],
    })),
    errors: [] as { code: string; message: string; action: string }[],
  };
  console.log(adapter.format('wf.node.event.list-types', result));
}

async function handleNodeEventSchema(
  _graphSlug: string,
  _nodeId: string,
  eventType: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const { NodeEventRegistry, registerCoreEventTypes } = await import(
    '@chainglass/positional-graph/features/032-node-event-system'
  );
  const registry = new NodeEventRegistry();
  registerCoreEventTypes(registry);

  const registration = registry.get(eventType);
  if (!registration) {
    const available = registry.list().map((t) => t.type);
    const result = {
      errors: [
        {
          code: 'E190',
          message: `Unknown event type '${eventType}'. Available types: ${available.join(', ')}`,
          action: "Run 'cg wf node event list-types' to see available event types.",
        },
      ],
    };
    console.log(adapter.format('wf.node.event.schema', result));
    process.exit(1);
  }

  // Extract schema shape from Zod
  const shape = registration.payloadSchema;
  let fields: Record<string, string> = {};
  if ('shape' in shape && typeof shape.shape === 'object') {
    const zodShape = shape.shape as Record<
      string,
      { _def?: { typeName?: string }; isOptional?: () => boolean }
    >;
    fields = {};
    for (const [key, val] of Object.entries(zodShape)) {
      const typeName = val?._def?.typeName ?? 'unknown';
      const optional = typeof val?.isOptional === 'function' && val.isOptional();
      fields[key] = optional ? `${typeName} (optional)` : typeName;
    }
  }

  const result = {
    type: registration.type,
    displayName: registration.displayName,
    description: registration.description,
    domain: registration.domain,
    stopsExecution: registration.stopsExecution,
    allowedSources: [...registration.allowedSources],
    fields,
    errors: [] as { code: string; message: string; action: string }[],
  };
  console.log(adapter.format('wf.node.event.schema', result));
}

// ============================================
// Unit Subcommand Handlers (Phase 3, Plan 029)
// ============================================

async function handleUnitList(options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath), units: [] };
    console.log(adapter.format('wf.unit.list', result));
    process.exit(1);
  }

  const service = getWorkUnitService();
  const result = await service.list(ctx);
  console.log(adapter.format('wf.unit.list', result));

  if (result.errors.length > 0) process.exit(1);
}

async function handleUnitInfo(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath), unit: undefined };
    console.log(adapter.format('wf.unit.info', result));
    process.exit(1);
  }

  const service = getWorkUnitService();
  const result = await service.load(ctx, slug);

  // Transform unit instance to plain object for output
  if (result.unit) {
    const unit = result.unit;
    const plainUnit: Record<string, unknown> = {
      slug: unit.slug,
      type: unit.type,
      version: unit.version,
      description: unit.description,
      inputs: unit.inputs,
      outputs: unit.outputs,
    };

    // Add type-specific config
    if (unit.type === 'agent') {
      plainUnit.agent = unit.agent;
    } else if (unit.type === 'code') {
      plainUnit.code = unit.code;
    } else if (unit.type === 'user-input') {
      plainUnit.user_input = unit.user_input;
    }

    console.log(adapter.format('wf.unit.info', { unit: plainUnit, errors: [] }));
  } else {
    console.log(adapter.format('wf.unit.info', { unit: undefined, errors: result.errors }));
    process.exit(1);
  }
}

async function handleUnitGetTemplate(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath), content: undefined };
    console.log(adapter.format('wf.unit.get-template', result));
    process.exit(1);
  }

  const service = getWorkUnitService();
  const loadResult = await service.load(ctx, slug);

  if (loadResult.errors.length > 0 || !loadResult.unit) {
    console.log(
      adapter.format('wf.unit.get-template', { content: undefined, errors: loadResult.errors })
    );
    process.exit(1);
  }

  const unit = loadResult.unit;

  // Get template based on unit type
  if (unit.type === 'agent') {
    const content = await unit.getPrompt(ctx);
    console.log(
      adapter.format('wf.unit.get-template', {
        content,
        templateType: 'prompt',
        templatePath: unit.agent.prompt_template,
        errors: [],
      })
    );
  } else if (unit.type === 'code') {
    const content = await unit.getScript(ctx);
    console.log(
      adapter.format('wf.unit.get-template', {
        content,
        templateType: 'script',
        templatePath: unit.code.script,
        errors: [],
      })
    );
  } else {
    // user-input units have no template
    const error = {
      code: 'E183',
      message: `WorkUnit '${slug}' is a user-input type and has no template`,
      action: 'User-input units collect input directly; use agent or code units for templates',
    };
    console.log(adapter.format('wf.unit.get-template', { content: undefined, errors: [error] }));
    process.exit(1);
  }
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

  // ==================== Run Command (Plan 036) ====================

  wf.command('run <slug>')
    .description('Drive a graph to completion (polling loop)')
    .option('--verbose', 'Show detailed iteration info', false)
    .option('--max-iterations <n>', 'Maximum drive iterations', '200')
    .action(
      wrapAction(
        async (
          slug: string,
          options: { verbose: boolean; maxIterations: string },
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const ctx = await resolveOrOverrideContext(parentOpts.workspacePath);
          if (!ctx) {
            const adapter = createOutputAdapter(parentOpts.json ?? false);
            console.log(
              adapter.format('wf.run', { errors: noContextError(parentOpts.workspacePath) })
            );
            process.exit(1);
          }

          const orchestrationService = getOrchestrationService();
          const handle = await orchestrationService.get(ctx, slug);
          const maxIterations = Number.parseInt(options.maxIterations, 10);
          if (Number.isNaN(maxIterations) || maxIterations < 1) {
            console.error(`Invalid --max-iterations value: ${options.maxIterations}`);
            process.exit(1);
          }
          const exitCode = await cliDriveGraph(handle, {
            maxIterations,
            verbose: options.verbose,
          });
          process.exit(exitCode);
        }
      )
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

  // Output Storage Commands (Phase 2, Plan 028)
  node
    .command('save-output-data <graph> <nodeId> <outputName> <valueJson>')
    .description('Save a JSON output value (node must be running). E176 if not running.')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          outputName: string,
          valueJson: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleSaveOutputData(graph, nodeId, outputName, valueJson, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('save-output-file <graph> <nodeId> <outputName> <sourcePath>')
    .description(
      'Copy a file to node storage (node must be running). E176 if not running, E179 if source missing.'
    )
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          outputName: string,
          sourcePath: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleSaveOutputFile(graph, nodeId, outputName, sourcePath, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('get-output-data <graph> <nodeId> <outputName>')
    .description('Retrieve a saved JSON output value. E175 if not yet saved.')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          outputName: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleGetOutputData(graph, nodeId, outputName, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('get-output-file <graph> <nodeId> <outputName>')
    .description('Get absolute path to a saved output file. E175 if not yet saved.')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          outputName: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleGetOutputFile(graph, nodeId, outputName, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  // Node Lifecycle Commands (Phase 3, Plan 028)
  node
    .command('start <graph> <nodeId>')
    .description(
      'Begin node execution (pending → running). Node must pass 4-gate readiness check. E170 if not ready.'
    )
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeStart(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  node
    .command('can-end <graph> <nodeId>')
    .description(
      'Check if all required outputs are saved. Returns canEnd: true/false and missingOutputs list.'
    )
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeCanEnd(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  node
    .command('end <graph> <nodeId>')
    .description(
      'Complete node execution (running → complete). All required outputs must be saved. E172 if wrong state.'
    )
    .option('--message <msg>', 'Completion message (stored as event payload)')
    .action(
      wrapAction(async (graph: string, nodeId: string, localOpts: EndOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleNodeEnd(graph, nodeId, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
          message: localOpts.message,
        });
      })
    );

  // Question/Answer Commands (Phase 4, Plan 028)
  node
    .command('ask <graph> <nodeId>')
    .description(
      'Ask orchestrator a question (running → waiting-question). Returns questionId for answer/get-answer.'
    )
    .requiredOption('--type <type>', 'Question type: text, single, multi, or confirm')
    .requiredOption('--text <text>', 'Question text to display')
    .option('--options <values...>', 'Answer options for single/multi choice questions')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          localOpts: { type: string; text: string; options?: string[] },
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeAsk(graph, nodeId, {
            type: localOpts.type,
            text: localOpts.text,
            options: localOpts.options,
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('answer <graph> <nodeId> <questionId> <answer>')
    .description(
      'Provide answer to waiting node (waiting-question → running). E173 if questionId invalid, E177 if not waiting.'
    )
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          questionId: string,
          answer: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeAnswer(graph, nodeId, questionId, answer, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('get-answer <graph> <nodeId> <questionId>')
    .description(
      'Retrieve answer to a question. Returns answered: true/false with answer value. E173 if questionId invalid.'
    )
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          questionId: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.parent?.opts() ?? {};
          await handleNodeGetAnswer(graph, nodeId, questionId, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  // Input Retrieval Commands (Phase 5, Plan 028)
  node
    .command('get-input-data <graph> <nodeId> <inputName>')
    .description(
      'Get wired input data from upstream node. E178 if source not complete or wiring error.'
    )
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
          await handleNodeGetInputData(graph, nodeId, inputName, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  node
    .command('get-input-file <graph> <nodeId> <inputName>')
    .description(
      'Get wired input file path from upstream node. E178 if source not complete or wiring error.'
    )
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
          await handleNodeGetInputFile(graph, nodeId, inputName, {
            json: parentOpts.json,
            workspacePath: parentOpts.workspacePath,
          });
        }
      )
    );

  // ==================== Node Event System Commands (Phase 6, Plan 032) ====================

  node
    .command('raise-event <graph> <nodeId> <eventType>')
    .description(
      'Raise an event on a node. Validates, records, processes handlers, and persists. Default source: agent.'
    )
    .option('--payload <json>', 'JSON payload for the event')
    .option('--source <source>', 'Event source (agent, executor, orchestrator, human)', 'agent')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          eventType: string,
          localOpts: { payload?: string; source?: string },
          cmd: Command
        ) => {
          const json = getJsonFlag(cmd);
          const workspacePath = getWorkspacePath(cmd);
          await handleNodeRaiseEvent(graph, nodeId, eventType, {
            payload: localOpts.payload,
            source: localOpts.source,
            json,
            workspacePath,
          });
        }
      )
    );

  node
    .command('events <graph> <nodeId>')
    .description(
      'List events for a node. Use --id for single event detail. Filters: --type, --status.'
    )
    .option('--id <eventId>', 'Show single event by ID (with stamps)')
    .option('--type <type...>', 'Filter by event type(s)')
    .option('--status <status>', 'Filter by event status')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          localOpts: { id?: string; type?: string[]; status?: string },
          cmd: Command
        ) => {
          const json = getJsonFlag(cmd);
          const workspacePath = getWorkspacePath(cmd);
          await handleNodeEvents(graph, nodeId, {
            id: localOpts.id,
            type: localOpts.type,
            status: localOpts.status,
            json,
            workspacePath,
          });
        }
      )
    );

  node
    .command('stamp-event <graph> <nodeId> <eventId>')
    .description('Stamp an event as processed by a subscriber. E196 if event not found.')
    .requiredOption('--subscriber <sub>', 'Subscriber name')
    .requiredOption('--action <act>', 'Stamp action (e.g., forwarded, processed)')
    .option('--data <json>', 'Optional JSON data to attach to stamp')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          eventId: string,
          localOpts: { subscriber: string; action: string; data?: string },
          cmd: Command
        ) => {
          const json = getJsonFlag(cmd);
          const workspacePath = getWorkspacePath(cmd);
          await handleNodeStampEvent(graph, nodeId, eventId, {
            subscriber: localOpts.subscriber,
            action: localOpts.action,
            data: localOpts.data,
            json,
            workspacePath,
          });
        }
      )
    );

  node
    .command('accept <graph> <nodeId>')
    .description(
      'Accept a node (shortcut for raise-event node:accepted). Transitions starting → agent-accepted.'
    )
    .action(
      wrapAction(async (graph: string, nodeId: string, _options: BaseOptions, cmd: Command) => {
        const json = getJsonFlag(cmd);
        const workspacePath = getWorkspacePath(cmd);
        await handleNodeAccept(graph, nodeId, { json, workspacePath });
      })
    );

  node
    .command('error <graph> <nodeId>')
    .description(
      'Report an error on a node (shortcut for raise-event node:error). Stops execution.'
    )
    .requiredOption('--code <code>', 'Error code')
    .requiredOption('--message <msg>', 'Error message')
    .option('--details <json>', 'Additional error details as JSON')
    .option('--recoverable', 'Mark error as recoverable', false)
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          localOpts: { code: string; message: string; details?: string; recoverable?: boolean },
          cmd: Command
        ) => {
          const json = getJsonFlag(cmd);
          const workspacePath = getWorkspacePath(cmd);
          await handleNodeError(graph, nodeId, {
            code: localOpts.code,
            message: localOpts.message,
            details: localOpts.details,
            recoverable: localOpts.recoverable,
            json,
            workspacePath,
          });
        }
      )
    );

  // Discovery commands — under 'event' subgroup (cg wf node event list-types / schema)
  const nodeEvent = node.command('event').description('Event system discovery commands');

  nodeEvent
    .command('list-types <graph> <nodeId>')
    .description('List all registered event types, grouped by domain.')
    .option('--domain <domain>', 'Filter by domain (e.g., node, question)')
    .action(
      wrapAction(
        async (graph: string, nodeId: string, localOpts: { domain?: string }, cmd: Command) => {
          const json = getJsonFlag(cmd);
          const workspacePath = getWorkspacePath(cmd);
          await handleNodeEventListTypes(graph, nodeId, {
            domain: localOpts.domain,
            json,
            workspacePath,
          });
        }
      )
    );

  nodeEvent
    .command('schema <graph> <nodeId> <eventType>')
    .description('Show payload schema and metadata for a specific event type. E190 if unknown.')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          eventType: string,
          _options: BaseOptions,
          cmd: Command
        ) => {
          const json = getJsonFlag(cmd);
          const workspacePath = getWorkspacePath(cmd);
          await handleNodeEventSchema(graph, nodeId, eventType, { json, workspacePath });
        }
      )
    );

  // ==================== Unit Commands (Phase 3, Plan 029) ====================

  const unit = wf.command('unit').description('Manage work units (agents, code, user-input)');

  unit
    .command('list')
    .description('List all available work units')
    .action(
      wrapAction(async (_options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleUnitList({
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  unit
    .command('info <slug>')
    .description('Show detailed information about a work unit')
    .action(
      wrapAction(async (slug: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleUnitInfo(slug, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );

  unit
    .command('get-template <slug>')
    .description(
      'Get the template content for an agent (prompt) or code (script) unit. E183 for user-input.'
    )
    .action(
      wrapAction(async (slug: string, _options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.parent?.opts() ?? {};
        await handleUnitGetTemplate(slug, {
          json: parentOpts.json,
          workspacePath: parentOpts.workspacePath,
        });
      })
    );
}
