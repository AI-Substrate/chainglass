/**
 * WorkGraph command group for the CLI.
 *
 * Per Phase 6: CLI Integration - Provides cg wg <subcommand> commands.
 * Manages WorkGraphs in .chainglass/work-graphs/.
 *
 * Commands:
 * - cg wg create <slug>                    - Create new graph with start node
 * - cg wg show <slug>                      - Show graph structure as tree
 * - cg wg status <slug>                    - Show node status table
 * - cg wg node add-after <graph> <after> <unit> - Add node after existing node
 * - cg wg node remove <graph> <node>       - Remove node (--cascade optional)
 * - cg wg node exec <graph> <node>         - Show bootstrap prompt for execution
 * - cg wg node start <graph> <node>        - Transition node to running
 * - cg wg node end <graph> <node>          - Complete node execution
 * - cg wg node can-run <graph> <node>      - Check if node can run
 * - cg wg node can-end <graph> <node>      - Check if node can end
 * - cg wg node list-inputs <graph> <node>  - List node inputs
 * - cg wg node list-outputs <graph> <node> - List node outputs
 * - cg wg node get-input-data <graph> <node> <name>  - Get input data value
 * - cg wg node get-input-file <graph> <node> <name>  - Get input file path
 * - cg wg node save-output-data <graph> <node> <name> <value> - Save output data
 * - cg wg node save-output-file <graph> <node> <name> <path>  - Save output file
 * - cg wg node ask <graph> <node>          - Ask question (handover)
 * - cg wg node answer <graph> <node>       - Answer question (resume)
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per ADR-0008: Workgraph services registered via registerWorkgraphServices().
 * Per DYK#3: Triple-nested command structure (wg → node → cmd).
 * Per DYK#4: exec prints prompt + Copilot CLI example (no actual agent spawning).
 */

import {
  ConsoleOutputAdapter,
  type IFileSystem,
  type IOutputAdapter,
  type IPathResolver,
  JsonOutputAdapter,
  SHARED_DI_TOKENS,
  WORKGRAPH_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import type {
  BootstrapPromptService,
  IWorkGraphService,
  IWorkNodeService,
  IWorkUnitService,
  Question,
} from '@chainglass/workgraph';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// ============================================
// Option Interfaces
// ============================================

interface BaseOptions {
  json?: boolean;
  workspacePath?: string;
}

interface AddAfterOptions extends BaseOptions {
  input?: string[];
  config?: string[];
}

interface RemoveOptions extends BaseOptions {
  cascade?: boolean;
}

interface AskOptions extends BaseOptions {
  type: 'text' | 'single' | 'multi' | 'confirm';
  text: string;
  options?: string[];
  default?: string;
}

// ============================================
// Helpers
// ============================================

/**
 * Create an output adapter based on options.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Wrap async action handlers with try-catch for graceful error handling.
 * Per FIX-003: Prevents unhandled promise rejections from crashing CLI.
 */
function wrapAction<T extends unknown[]>(
  handler: (...args: T) => Promise<void>
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  };
}

/**
 * Get the WorkspaceService from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkspaceService(): IWorkspaceService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
}

/**
 * Resolve workspace context from CWD or explicit path.
 *
 * Per AC-23: --workspace-path flag overrides CWD-based context.
 * Per Plan 021: All service calls require WorkspaceContext.
 *
 * @param overridePath - Explicit path if --workspace-path was provided
 * @returns WorkspaceContext if found, null otherwise
 */
async function resolveOrOverrideContext(overridePath?: string): Promise<WorkspaceContext | null> {
  const workspaceService = getWorkspaceService();
  const path = overridePath ?? process.cwd();
  return workspaceService.resolveContext(path);
}

/**
 * Get the WorkGraphService from DI container.
 */
function getWorkGraphService(): IWorkGraphService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkGraphService>(WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE);
}

/**
 * Get the WorkNodeService from DI container.
 */
function getWorkNodeService(): IWorkNodeService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkNodeService>(WORKGRAPH_DI_TOKENS.WORKNODE_SERVICE);
}

/**
 * Get the BootstrapPromptService from DI container.
 * Per ADR-0004 and Plan 021 T005a: Services resolved from containers, not instantiated directly.
 */
function getBootstrapPromptService(): BootstrapPromptService {
  const container = createCliProductionContainer();
  return container.resolve<BootstrapPromptService>(WORKGRAPH_DI_TOKENS.BOOTSTRAP_PROMPT_SERVICE);
}

/**
 * Parse key:value input mappings.
 */
function parseInputMappings(
  inputs: string[] | undefined
): Record<string, { from: string; output: string }> {
  const result: Record<string, { from: string; output: string }> = {};
  if (!inputs) return result;

  for (const input of inputs) {
    // Format: inputName:sourceNode.outputName
    const [name, source] = input.split(':');
    if (name && source) {
      const [from, output] = source.split('.');
      if (from && output) {
        result[name] = { from, output };
      }
    }
  }
  return result;
}

/**
 * Parse config values.
 */
function parseConfig(configs: string[] | undefined): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (!configs) return result;

  for (const config of configs) {
    const [key, ...valueParts] = config.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=');
      // Try to parse as JSON, fallback to string
      try {
        result[key] = JSON.parse(value);
      } catch {
        result[key] = value;
      }
    }
  }
  return result;
}

// ============================================
// Graph Command Handlers
// ============================================

async function handleWgCreate(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      graphSlug: '',
      path: '',
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.create', result));
    process.exit(1);
  }

  const service = getWorkGraphService();
  const result = await service.create(ctx, slug);
  const output = adapter.format('wg.create', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleWgShow(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      graphSlug: '',
      tree: { id: '', children: [] },
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.show', result));
    process.exit(1);
  }

  const service = getWorkGraphService();
  const result = await service.show(ctx, slug);
  const output = adapter.format('wg.show', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleWgStatus(slug: string, options: BaseOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      graphSlug: '',
      graphStatus: 'pending' as const,
      nodes: [],
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.status', result));
    process.exit(1);
  }

  const service = getWorkGraphService();
  const result = await service.status(ctx, slug);
  const output = adapter.format('wg.status', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

// ============================================
// Node Command Handlers
// ============================================

async function handleNodeAddAfter(
  graphSlug: string,
  afterNode: string,
  unitSlug: string,
  options: AddAfterOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId: '',
      inputs: {},
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.add-after', result));
    process.exit(1);
  }

  const service = getWorkGraphService();
  const config = parseConfig(options.config);
  const result = await service.addNodeAfter(ctx, graphSlug, afterNode, unitSlug, { config });
  const output = adapter.format('wg.node.add-after', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeRemove(
  graphSlug: string,
  nodeId: string,
  options: RemoveOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      removedNodes: [],
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.remove', result));
    process.exit(1);
  }

  const service = getWorkGraphService();
  const result = await service.removeNode(ctx, graphSlug, nodeId, { cascade: options.cascade });
  const output = adapter.format('wg.node.remove', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeExec(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      graphSlug,
      unitSlug: '',
      prompt: '',
      commandsPath: '',
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.exec', result));
    process.exit(1);
  }

  // Get BootstrapPromptService from DI (per ADR-0004 and T005a)
  const bootstrapService = getBootstrapPromptService();
  const promptResult = await bootstrapService.generate(ctx, {
    graphSlug,
    nodeId,
    resume: false,
  });

  // Create a result object for formatting
  const result = {
    nodeId,
    graphSlug,
    unitSlug: promptResult.unitSlug,
    prompt: promptResult.prompt,
    commandsPath: promptResult.commandsPath,
    errors: promptResult.errors,
  };

  const output = adapter.format('wg.node.exec', result);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeStart(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      status: '',
      startedAt: '',
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.start', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.start(ctx, graphSlug, nodeId);
  const output = adapter.format('wg.node.start', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeEnd(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      status: '',
      completedAt: '',
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.end', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.end(ctx, graphSlug, nodeId);
  const output = adapter.format('wg.node.end', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeCanRun(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      canRun: false,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.can-run', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.canRun(ctx, graphSlug, nodeId);
  const output = adapter.format('wg.node.can-run', result);

  console.log(output);

  // canRun returns canRun: false without errors, so only exit 1 on actual errors
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeCanEnd(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      canEnd: false,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.can-end', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  // Use canEnd() which is a query (no state mutation)
  const result = await service.canEnd(ctx, graphSlug, nodeId);
  const output = adapter.format('wg.node.can-end', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeListInputs(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context (even for placeholder, maintain consistency)
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      inputs: [],
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.list-inputs', result));
    process.exit(1);
  }

  // Get all available inputs by trying to resolve each one
  // This is a placeholder - actual implementation would need a listInputs method
  const result = {
    nodeId,
    inputs: [] as Array<{
      name: string;
      type: string;
      dataType?: string;
      required: boolean;
      from?: string;
      output?: string;
      resolved: boolean;
    }>,
    errors: [] as Array<{ code: string; message: string }>,
  };

  const output = adapter.format('wg.node.list-inputs', result);
  console.log(output);
}

async function handleNodeListOutputs(
  graphSlug: string,
  nodeId: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context (even for placeholder, maintain consistency)
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      outputs: [],
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.list-outputs', result));
    process.exit(1);
  }

  // Placeholder - actual implementation would need a listOutputs method
  const result = {
    nodeId,
    outputs: [] as Array<{
      name: string;
      type: string;
      dataType?: string;
      required: boolean;
      saved: boolean;
    }>,
    errors: [] as Array<{ code: string; message: string }>,
  };

  const output = adapter.format('wg.node.list-outputs', result);
  console.log(output);
}

async function handleNodeGetInputData(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      inputName,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.get-input-data', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.getInputData(ctx, graphSlug, nodeId, inputName);
  const output = adapter.format('wg.node.get-input-data', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeGetInputFile(
  graphSlug: string,
  nodeId: string,
  inputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      inputName,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.get-input-file', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.getInputFile(ctx, graphSlug, nodeId, inputName);
  const output = adapter.format('wg.node.get-input-file', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeGetOutputData(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      outputName,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.get-output-data', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.getOutputData(ctx, graphSlug, nodeId, outputName);
  const output = adapter.format('wg.node.get-output-data', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeSaveOutputData(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  value: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      outputName,
      saved: false,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.save-output-data', result));
    process.exit(1);
  }

  const service = getWorkNodeService();

  // Try to parse value as JSON
  let parsedValue: unknown = value;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    // Keep as string
  }

  const result = await service.saveOutputData(ctx, graphSlug, nodeId, outputName, parsedValue);
  const output = adapter.format('wg.node.save-output-data', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeSaveOutputFile(
  graphSlug: string,
  nodeId: string,
  outputName: string,
  sourcePath: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // FIX-004: Path traversal validation
  // Reject absolute paths and paths with traversal sequences
  if (sourcePath.startsWith('/') || sourcePath.includes('..')) {
    const result = {
      nodeId,
      outputName,
      saved: false,
      errors: [
        { code: 'PATH_TRAVERSAL', message: 'Path must be relative and cannot contain ".."' },
      ],
    };
    const output = adapter.format('wg.node.save-output-file', result);
    console.log(output);
    process.exit(1);
    return;
  }

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      outputName,
      saved: false,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.save-output-file', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.saveOutputFile(ctx, graphSlug, nodeId, outputName, sourcePath);
  const output = adapter.format('wg.node.save-output-file', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeAsk(
  graphSlug: string,
  nodeId: string,
  options: AskOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      status: '',
      questionId: '',
      question: { type: options.type, text: options.text },
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.ask', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const question: Question = {
    type: options.type,
    text: options.text,
    options: options.options,
    default: options.default,
  };

  const result = await service.ask(ctx, graphSlug, nodeId, question);
  const output = adapter.format('wg.node.ask', result);

  console.log(output);

  // Add agent instruction for non-JSON output
  if (!options.json && result.errors.length === 0) {
    console.log('\n[AGENT INSTRUCTION] STOP HERE. Exit now and wait for orchestrator to answer.');
    console.log(
      'The orchestrator will re-invoke you with a continuation prompt containing the answer.'
    );
  }

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeAnswer(
  graphSlug: string,
  nodeId: string,
  questionId: string,
  answer: string,
  options: BaseOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      nodeId,
      status: '',
      questionId,
      answer: null,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.answer', result));
    process.exit(1);
  }

  const service = getWorkNodeService();

  // Try to parse answer as JSON
  let parsedAnswer: unknown = answer;
  try {
    parsedAnswer = JSON.parse(answer);
  } catch {
    // Keep as string
  }

  const result = await service.answer(ctx, graphSlug, nodeId, questionId, parsedAnswer);
  const output = adapter.format('wg.node.answer', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleNodeGetAnswer(
  graphSlug: string,
  nodeId: string,
  questionId: string,
  options: BaseOptions
): Promise<void> {
  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const adapter = createOutputAdapter(options.json ?? false);
    const result = {
      nodeId,
      questionId,
      answered: false,
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
    };
    console.log(adapter.format('wg.node.get-answer', result));
    process.exit(1);
  }

  const service = getWorkNodeService();
  const result = await service.getAnswer(ctx, graphSlug, nodeId, questionId);

  if (result.errors.length > 0) {
    const adapter = createOutputAdapter(options.json ?? false);
    console.log(adapter.format('wg.node.get-answer', result));
    process.exit(1);
  }

  // Output the answer value directly for agent consumption
  // JSON mode: full result object, otherwise just the raw value
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.answered) {
    console.log('NOT_ANSWERED');
  } else {
    // Output raw value - agents can parse this directly
    const value = result.answer;
    console.log(typeof value === 'string' ? value : JSON.stringify(value));
  }
}

// ============================================
// Command Registration
// ============================================

/**
 * Register the workgraph command group with the Commander program.
 *
 * Creates the cg wg command group with subcommands for graph and node operations.
 * Per DYK#3: Uses triple-nested structure (wg → node → cmd).
 *
 * @param program - Commander.js program instance
 */
export function registerWorkGraphCommands(program: Command): void {
  const wg = program.command('wg').description('Manage WorkGraphs and nodes');

  // ==================== Graph Commands ====================

  // cg wg create <slug>
  wg.command('create <slug>')
    .description('Create a new graph with start node')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleWgCreate(slug, options);
      })
    );

  // cg wg show <slug>
  wg.command('show <slug>')
    .description('Show graph structure as tree')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleWgShow(slug, options);
      })
    );

  // cg wg status <slug>
  wg.command('status <slug>')
    .description('Show node status table')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleWgStatus(slug, options);
      })
    );

  // ==================== Node Commands (triple-nested) ====================

  // Per Critical Insight #4: Add --workspace-path to node parent for inheritance.
  // FALLBACK: If Commander.js doesn't propagate, add to each subcommand explicitly.
  const node = wg
    .command('node')
    .description('Node operations')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context');

  // cg wg node add-after <graph> <after> <unit>
  node
    .command('add-after <graph> <after> <unit>')
    .description('Add a node after an existing node')
    .option('-i, --input <mapping...>', 'Input mappings (name:source.output)')
    .option('-c, --config <value...>', 'Config values (key=value)')
    .action(
      wrapAction(
        async (
          graph: string,
          after: string,
          unit: string,
          options: AddAfterOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeAddAfter(graph, after, unit, { ...options, json, workspacePath });
        }
      )
    );

  // cg wg node remove <graph> <node>
  node
    .command('remove <graph> <node>')
    .description('Remove a node from the graph')
    .option('--cascade', 'Remove dependent nodes as well', false)
    .action(
      wrapAction(async (graph: string, nodeId: string, options: RemoveOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeRemove(graph, nodeId, { ...options, json, workspacePath });
      })
    );

  // cg wg node exec <graph> <node>
  node
    .command('exec <graph> <node>')
    .description('Show bootstrap prompt for node execution')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeExec(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node start <graph> <node>
  node
    .command('start <graph> <node>')
    .description('Start node execution (transition to running)')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeStart(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node end <graph> <node>
  node
    .command('end <graph> <node>')
    .description('End node execution (transition to complete)')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeEnd(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node can-run <graph> <node>
  node
    .command('can-run <graph> <node>')
    .description('Check if a node can run')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeCanRun(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node can-end <graph> <node>
  node
    .command('can-end <graph> <node>')
    .description('Check if a node can end (all required outputs present)')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeCanEnd(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node list-inputs <graph> <node>
  node
    .command('list-inputs <graph> <node>')
    .description('List node inputs and their resolution status')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeListInputs(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node list-outputs <graph> <node>
  node
    .command('list-outputs <graph> <node>')
    .description('List node outputs and their save status')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeListOutputs(graph, nodeId, { json, workspacePath });
      })
    );

  // cg wg node get-input-data <graph> <node> <name>
  node
    .command('get-input-data <graph> <node> <name>')
    .description('Get input data value from upstream node')
    .action(
      wrapAction(
        async (graph: string, nodeId: string, name: string, options: BaseOptions, cmd: Command) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeGetInputData(graph, nodeId, name, { json, workspacePath });
        }
      )
    );

  // cg wg node get-input-file <graph> <node> <name>
  node
    .command('get-input-file <graph> <node> <name>')
    .description('Get input file path from upstream node')
    .action(
      wrapAction(
        async (graph: string, nodeId: string, name: string, options: BaseOptions, cmd: Command) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeGetInputFile(graph, nodeId, name, { json, workspacePath });
        }
      )
    );

  // cg wg node get-output-data <graph> <node> <name>
  // Note: Reads this node's own saved outputs (vs get-input-data which reads from upstream nodes)
  node
    .command('get-output-data <graph> <node> <name>')
    .description("Get output data value from this node's own saved outputs")
    .action(
      wrapAction(
        async (graph: string, nodeId: string, name: string, options: BaseOptions, cmd: Command) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeGetOutputData(graph, nodeId, name, { json, workspacePath });
        }
      )
    );

  // cg wg node save-output-data <graph> <node> <name> <value>
  node
    .command('save-output-data <graph> <node> <name> <value>')
    .description('Save output data value')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          name: string,
          value: string,
          options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeSaveOutputData(graph, nodeId, name, value, { json, workspacePath });
        }
      )
    );

  // cg wg node save-output-file <graph> <node> <name> <path>
  node
    .command('save-output-file <graph> <node> <name> <path>')
    .description('Save output file (copy source file to node storage)')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          name: string,
          path: string,
          options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeSaveOutputFile(graph, nodeId, name, path, { json, workspacePath });
        }
      )
    );

  // cg wg node ask <graph> <node>
  node
    .command('ask <graph> <node>')
    .description('Ask a question (handover to orchestrator)')
    .requiredOption('-t, --type <type>', 'Question type: text, single, multi, confirm')
    .requiredOption('--text <text>', 'Question text')
    .option('-o, --options <options...>', 'Options for single/multi choice')
    .option('-d, --default <default>', 'Default value')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: AskOptions, cmd: Command) => {
        const parentOpts = cmd.parent?.opts() ?? {};
        const json = parentOpts.json ?? false;
        const workspacePath = parentOpts.workspacePath;
        await handleNodeAsk(graph, nodeId, { ...options, json, workspacePath });
      })
    );

  // cg wg node answer <graph> <node> <questionId> <answer>
  node
    .command('answer <graph> <node> <questionId> <answer>')
    .description('Answer a question (resume node execution)')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          questionId: string,
          answer: string,
          options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeAnswer(graph, nodeId, questionId, answer, { json, workspacePath });
        }
      )
    );

  // cg wg node get-answer <graph> <node> <questionId>
  node
    .command('get-answer <graph> <node> <questionId>')
    .description('Get answer to a question (for agent resume)')
    .action(
      wrapAction(
        async (
          graph: string,
          nodeId: string,
          questionId: string,
          options: BaseOptions,
          cmd: Command
        ) => {
          const parentOpts = cmd.parent?.opts() ?? {};
          const json = parentOpts.json ?? false;
          const workspacePath = parentOpts.workspacePath;
          await handleNodeGetAnswer(graph, nodeId, questionId, { json, workspacePath });
        }
      )
    );
}
