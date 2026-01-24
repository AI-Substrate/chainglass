/**
 * Workflow (wf) command group for the CLI.
 *
 * Per Phase 2: Compose Command - Provides cg wf compose <slug> command.
 * Per DYK-05: ConsoleOutputAdapter already has wf.compose case from Phase 1a.
 */

import {
  ConsoleOutputAdapter,
  FakeFileSystem,
  FakePathResolver,
  type IOutputAdapter,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
  PathResolverAdapter,
} from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeYamlParser,
  type IWorkflowService,
  WorkflowService,
} from '@chainglass/workflow';
import { SchemaValidatorAdapter, YamlParserAdapter } from '@chainglass/workflow';
import type { Command } from 'commander';

/**
 * Options for wf compose command.
 */
interface ComposeOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Directory for run folders (default: .chainglass/runs) */
  runsDir?: string;
}

/**
 * Create a workflow service with real implementations.
 *
 * TODO (T010): Replace with DI container resolution.
 */
function createWorkflowService(): IWorkflowService {
  const fs = new NodeFileSystemAdapter();
  const yamlParser = new YamlParserAdapter();
  const schemaValidator = new SchemaValidatorAdapter();
  const pathResolver = new PathResolverAdapter();
  return new WorkflowService(fs, yamlParser, schemaValidator, pathResolver);
}

/**
 * Create an output adapter based on options.
 *
 * TODO (T010): Replace with DI container resolution.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Handle cg wf compose <slug> command.
 *
 * @param slug - Template name or path
 * @param options - Command options
 */
async function handleCompose(slug: string, options: ComposeOptions): Promise<void> {
  const service = createWorkflowService();
  const adapter = createOutputAdapter(options.json ?? false);
  const runsDir = options.runsDir ?? '.chainglass/runs';

  const result = await service.compose(slug, runsDir);
  const output = adapter.format('wf.compose', result);

  console.log(output);

  // Exit with error code if compose failed
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Register the wf command group with the Commander program.
 *
 * Creates the cg wf command group with subcommands:
 * - cg wf compose <slug> - Create a new workflow run from a template
 *
 * @param program - Commander.js program instance
 */
export function registerWfCommands(program: Command): void {
  const wf = program.command('wf').description('Workflow management commands');

  // cg wf compose <slug>
  wf.command('compose <slug>')
    .description('Create a new workflow run from a template')
    .option('--json', 'Output as JSON', false)
    .option('--runs-dir <path>', 'Directory for run folders', '.chainglass/runs')
    .action(async (slug: string, options: ComposeOptions) => {
      await handleCompose(slug, options);
    });
}
