/**
 * Workflow command group for the CLI.
 *
 * Per Phase 5: CLI Commands - Provides cg workflow <subcommand> commands.
 * Consolidates all workflow management commands under single command group.
 *
 * Commands:
 * - cg workflow list              - List all workflow templates
 * - cg workflow info <slug>       - Show workflow details
 * - cg workflow checkpoint <slug> - Create checkpoint from current/
 * - cg workflow restore <slug> <version> - Restore checkpoint to current/
 * - cg workflow versions <slug>   - List checkpoint versions
 * - cg workflow compose <slug>    - Create a run from checkpoint
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 */

import { createInterface } from 'node:readline';
import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  SHARED_DI_TOKENS,
  WORKFLOW_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkflowRegistry, IWorkflowService } from '@chainglass/workflow';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// Default workflows directory
const DEFAULT_WORKFLOWS_DIR = '.chainglass/workflows';
const DEFAULT_RUNS_DIR = '.chainglass/runs';

/**
 * Options for workflow list command.
 */
interface ListOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for workflow info command.
 */
interface InfoOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for workflow checkpoint command.
 */
interface CheckpointOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Comment describing this checkpoint */
  comment?: string;
  /** Force creation even if content unchanged */
  force?: boolean;
}

/**
 * Options for workflow restore command.
 */
interface RestoreOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Skip confirmation prompt */
  force?: boolean;
}

/**
 * Options for workflow versions command.
 */
interface VersionsOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for workflow compose command.
 */
interface ComposeOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Directory for run folders */
  runsDir?: string;
  /** Checkpoint version to use (default: latest) */
  checkpoint?: string;
}

/**
 * Create an output adapter based on options.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Get the workflow registry from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkflowRegistry(): IWorkflowRegistry {
  const container = createCliProductionContainer();
  return container.resolve<IWorkflowRegistry>(WORKFLOW_DI_TOKENS.WORKFLOW_REGISTRY);
}

/**
 * Get the workflow service from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkflowService(): IWorkflowService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkflowService>(WORKFLOW_DI_TOKENS.WORKFLOW_SERVICE);
}

/**
 * Handle cg workflow list command.
 */
async function handleWorkflowList(options: ListOptions): Promise<void> {
  const registry = getWorkflowRegistry();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await registry.list(DEFAULT_WORKFLOWS_DIR);
  const output = adapter.format('workflow.list', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg workflow info <slug> command.
 */
async function handleWorkflowInfo(slug: string, options: InfoOptions): Promise<void> {
  const registry = getWorkflowRegistry();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await registry.info(DEFAULT_WORKFLOWS_DIR, slug);
  const output = adapter.format('workflow.info', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg workflow checkpoint <slug> command.
 */
async function handleWorkflowCheckpoint(slug: string, options: CheckpointOptions): Promise<void> {
  const registry = getWorkflowRegistry();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await registry.checkpoint(DEFAULT_WORKFLOWS_DIR, slug, {
    comment: options.comment,
    force: options.force,
  });
  const output = adapter.format('workflow.checkpoint', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Prompt user for confirmation.
 * Returns true if user confirms (y/Y), false otherwise.
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

/**
 * Handle cg workflow restore <slug> <version> command.
 */
async function handleWorkflowRestore(
  slug: string,
  version: string,
  options: RestoreOptions
): Promise<void> {
  const registry = getWorkflowRegistry();
  const adapter = createOutputAdapter(options.json ?? false);

  // Prompt for confirmation unless --force is set
  if (!options.force) {
    const confirmed = await promptConfirmation(
      `Restore will overwrite current/ for '${slug}'. Continue?`
    );
    if (!confirmed) {
      console.log('Restore cancelled.');
      return;
    }
  }

  const result = await registry.restore(DEFAULT_WORKFLOWS_DIR, slug, version);
  const output = adapter.format('workflow.restore', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg workflow versions <slug> command.
 */
async function handleWorkflowVersions(slug: string, options: VersionsOptions): Promise<void> {
  const registry = getWorkflowRegistry();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await registry.versions(DEFAULT_WORKFLOWS_DIR, slug);
  const output = adapter.format('workflow.versions', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg workflow compose <slug> command.
 * Per Phase 3: Uses --checkpoint flag to specify version (default: latest).
 */
async function handleWorkflowCompose(slug: string, options: ComposeOptions): Promise<void> {
  const service = getWorkflowService();
  const adapter = createOutputAdapter(options.json ?? false);
  const runsDir = options.runsDir ?? DEFAULT_RUNS_DIR;

  const result = await service.compose(slug, runsDir, {
    checkpoint: options.checkpoint,
  });
  const output = adapter.format('workflow.compose', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Register the workflow command group with the Commander program.
 *
 * Creates the cg workflow command group with subcommands:
 * - cg workflow list              - List all workflow templates
 * - cg workflow info <slug>       - Show workflow details
 * - cg workflow checkpoint <slug> - Create checkpoint from current/
 * - cg workflow restore <slug> <version> - Restore checkpoint to current/
 * - cg workflow versions <slug>   - List checkpoint versions
 * - cg workflow compose <slug>    - Create a run from checkpoint
 *
 * @param program - Commander.js program instance
 */
export function registerWorkflowCommands(program: Command): void {
  const workflow = program
    .command('workflow')
    .description('Manage workflow templates and checkpoints');

  // cg workflow list
  workflow
    .command('list')
    .description('List all workflow templates')
    .option('--json', 'Output as JSON', false)
    .action(async (options: ListOptions) => {
      await handleWorkflowList(options);
    });

  // cg workflow info <slug>
  workflow
    .command('info <slug>')
    .description('Show detailed information about a workflow')
    .option('--json', 'Output as JSON', false)
    .action(async (slug: string, options: InfoOptions) => {
      await handleWorkflowInfo(slug, options);
    });

  // cg workflow checkpoint <slug>
  workflow
    .command('checkpoint <slug>')
    .description('Create a checkpoint from current/')
    .option('--json', 'Output as JSON', false)
    .option('-c, --comment <text>', 'Comment describing this checkpoint')
    .option('-f, --force', 'Force creation even if content unchanged', false)
    .action(async (slug: string, options: CheckpointOptions) => {
      await handleWorkflowCheckpoint(slug, options);
    });

  // cg workflow restore <slug> <version>
  workflow
    .command('restore <slug> <version>')
    .description('Restore a checkpoint to current/')
    .option('--json', 'Output as JSON', false)
    .option('-f, --force', 'Skip confirmation prompt', false)
    .action(async (slug: string, version: string, options: RestoreOptions) => {
      await handleWorkflowRestore(slug, version, options);
    });

  // cg workflow versions <slug>
  workflow
    .command('versions <slug>')
    .description('List all checkpoint versions for a workflow')
    .option('--json', 'Output as JSON', false)
    .action(async (slug: string, options: VersionsOptions) => {
      await handleWorkflowVersions(slug, options);
    });

  // cg workflow compose <slug>
  workflow
    .command('compose <slug>')
    .description('Create a new workflow run from a checkpoint')
    .option('--json', 'Output as JSON', false)
    .option('--runs-dir <path>', 'Directory for run folders', DEFAULT_RUNS_DIR)
    .option('--checkpoint <version>', 'Checkpoint version to use (default: latest)')
    .action(async (slug: string, options: ComposeOptions) => {
      await handleWorkflowCompose(slug, options);
    });
}
