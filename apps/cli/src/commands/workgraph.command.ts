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
} from '@chainglass/shared';
import type { IWorkGraphService, IWorkNodeService, Question } from '@chainglass/workgraph';
import { BootstrapPromptService } from '@chainglass/workgraph';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// ============================================
// Option Interfaces
// ============================================

interface BaseOptions {
  json?: boolean;
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
  const service = getWorkGraphService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.create(slug);
  const output = adapter.format('wg.create', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleWgShow(slug: string, options: BaseOptions): Promise<void> {
  const service = getWorkGraphService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.show(slug);
  const output = adapter.format('wg.show', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

async function handleWgStatus(slug: string, options: BaseOptions): Promise<void> {
  const service = getWorkGraphService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.status(slug);
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
  const service = getWorkGraphService();
  const adapter = createOutputAdapter(options.json ?? false);

  const config = parseConfig(options.config);
  const result = await service.addNodeAfter(graphSlug, afterNode, unitSlug, { config });
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
  const service = getWorkGraphService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.removeNode(graphSlug, nodeId, { cascade: options.cascade });
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
  const container = createCliProductionContainer();

  // Get services needed for bootstrap prompt
  const fs = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);
  const workGraphService = container.resolve<IWorkGraphService>(
    WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
  );

  const bootstrapService = new BootstrapPromptService(fs, pathResolver, workGraphService);
  const promptResult = await bootstrapService.generate({
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.start(graphSlug, nodeId);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.end(graphSlug, nodeId);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.canRun(graphSlug, nodeId);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  // Use canEnd() which is a query (no state mutation)
  const result = await service.canEnd(graphSlug, nodeId);
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
  const nodeService = getWorkNodeService();

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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.getInputData(graphSlug, nodeId, inputName);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.getInputFile(graphSlug, nodeId, inputName);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.getOutputData(graphSlug, nodeId, outputName);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  // Try to parse value as JSON
  let parsedValue: unknown = value;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    // Keep as string
  }

  const result = await service.saveOutputData(graphSlug, nodeId, outputName, parsedValue);
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

  const service = getWorkNodeService();
  const result = await service.saveOutputFile(graphSlug, nodeId, outputName, sourcePath);
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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  const question: Question = {
    type: options.type,
    text: options.text,
    options: options.options,
    default: options.default,
  };

  const result = await service.ask(graphSlug, nodeId, question);
  const output = adapter.format('wg.node.ask', result);

  console.log(output);

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
  const service = getWorkNodeService();
  const adapter = createOutputAdapter(options.json ?? false);

  // Try to parse answer as JSON
  let parsedAnswer: unknown = answer;
  try {
    parsedAnswer = JSON.parse(answer);
  } catch {
    // Keep as string
  }

  const result = await service.answer(graphSlug, nodeId, questionId, parsedAnswer);
  const output = adapter.format('wg.node.answer', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
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
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleWgCreate(slug, options);
      })
    );

  // cg wg show <slug>
  wg.command('show <slug>')
    .description('Show graph structure as tree')
    .option('--json', 'Output as JSON', false)
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleWgShow(slug, options);
      })
    );

  // cg wg status <slug>
  wg.command('status <slug>')
    .description('Show node status table')
    .option('--json', 'Output as JSON', false)
    .action(
      wrapAction(async (slug: string, options: BaseOptions) => {
        await handleWgStatus(slug, options);
      })
    );

  // ==================== Node Commands (triple-nested) ====================

  const node = wg
    .command('node')
    .description('Node operations')
    .option('--json', 'Output as JSON', false);

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
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeAddAfter(graph, after, unit, { ...options, json });
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
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeRemove(graph, nodeId, { ...options, json });
      })
    );

  // cg wg node exec <graph> <node>
  node
    .command('exec <graph> <node>')
    .description('Show bootstrap prompt for node execution')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeExec(graph, nodeId, { json });
      })
    );

  // cg wg node start <graph> <node>
  node
    .command('start <graph> <node>')
    .description('Start node execution (transition to running)')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeStart(graph, nodeId, { json });
      })
    );

  // cg wg node end <graph> <node>
  node
    .command('end <graph> <node>')
    .description('End node execution (transition to complete)')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeEnd(graph, nodeId, { json });
      })
    );

  // cg wg node can-run <graph> <node>
  node
    .command('can-run <graph> <node>')
    .description('Check if a node can run')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeCanRun(graph, nodeId, { json });
      })
    );

  // cg wg node can-end <graph> <node>
  node
    .command('can-end <graph> <node>')
    .description('Check if a node can end (all required outputs present)')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeCanEnd(graph, nodeId, { json });
      })
    );

  // cg wg node list-inputs <graph> <node>
  node
    .command('list-inputs <graph> <node>')
    .description('List node inputs and their resolution status')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeListInputs(graph, nodeId, { json });
      })
    );

  // cg wg node list-outputs <graph> <node>
  node
    .command('list-outputs <graph> <node>')
    .description('List node outputs and their save status')
    .action(
      wrapAction(async (graph: string, nodeId: string, options: BaseOptions, cmd: Command) => {
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeListOutputs(graph, nodeId, { json });
      })
    );

  // cg wg node get-input-data <graph> <node> <name>
  node
    .command('get-input-data <graph> <node> <name>')
    .description('Get input data value from upstream node')
    .action(
      wrapAction(
        async (graph: string, nodeId: string, name: string, options: BaseOptions, cmd: Command) => {
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeGetInputData(graph, nodeId, name, { json });
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
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeGetInputFile(graph, nodeId, name, { json });
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
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeGetOutputData(graph, nodeId, name, { json });
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
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeSaveOutputData(graph, nodeId, name, value, { json });
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
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeSaveOutputFile(graph, nodeId, name, path, { json });
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
        const json = cmd.parent?.opts()?.json ?? false;
        await handleNodeAsk(graph, nodeId, { ...options, json });
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
          const json = cmd.parent?.opts()?.json ?? false;
          await handleNodeAnswer(graph, nodeId, questionId, answer, { json });
        }
      )
    );
}
