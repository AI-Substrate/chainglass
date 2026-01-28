/**
 * Sample command group for the CLI.
 *
 * Per Plan 014: Workspaces - Phase 5: CLI Commands
 * Provides cg sample <subcommand> commands for managing samples within workspaces.
 *
 * Commands:
 * - cg sample add <name>      - Create a new sample in current workspace
 * - cg sample list            - List samples in current worktree
 * - cg sample info <slug>     - Show sample details
 * - cg sample delete <slug>   - Delete a sample file
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per DYK-P5-02: No confirmation prompts, --force required for destructive ops.
 * Per AC-23: --workspace-path flag overrides CWD-based context.
 */

import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  type SampleAddCmdResult,
  type SampleDeleteCmdResult,
  type SampleInfoCmdResult,
  type SampleListCmdResult,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { ISampleService, IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// ==================== Option Types ====================

/**
 * Options for sample add command.
 */
interface AddOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Sample content (optional) */
  content?: string;
  /** Override workspace context with explicit path */
  workspacePath?: string;
}

/**
 * Options for sample list command.
 */
interface ListOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Override workspace context with explicit path */
  workspacePath?: string;
}

/**
 * Options for sample info command.
 */
interface InfoOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Override workspace context with explicit path */
  workspacePath?: string;
}

/**
 * Options for sample delete command.
 */
interface DeleteOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Override workspace context with explicit path */
  workspacePath?: string;
  /** Skip confirmation requirement */
  force?: boolean;
}

// ==================== DI Helpers ====================

/**
 * Create an output adapter based on options.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Get the workspace service from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkspaceService(): IWorkspaceService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
}

/**
 * Get the sample service from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getSampleService(): ISampleService {
  const container = createCliProductionContainer();
  return container.resolve<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE);
}

/**
 * Resolve workspace context from CWD or explicit path.
 *
 * Per AC-23: --workspace-path flag overrides CWD-based context.
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
 * Extract worktree name from path for display.
 */
function getWorktreeName(worktreePath: string): string {
  return worktreePath.split('/').pop() || worktreePath;
}

// ==================== Command Handlers ====================

/**
 * Handle cg sample add <name> command.
 */
async function handleSampleAdd(name: string, options: AddOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve context first
  const ctx = await resolveOrOverrideContext(options.workspacePath);

  if (!ctx) {
    const outputResult: SampleAddCmdResult = {
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

    const output = adapter.format('sample.add', outputResult);
    console.log(output);
    process.exit(1);
  }

  const sampleService = getSampleService();
  const result = await sampleService.add(ctx, name, options.content ?? '');

  const outputResult: SampleAddCmdResult = {
    errors: result.errors,
    sample: result.sample
      ? {
          slug: result.sample.slug,
          name: result.sample.name,
          content: result.sample.description,
          createdAt: result.sample.createdAt.toISOString(),
          updatedAt: result.sample.updatedAt.toISOString(),
        }
      : undefined,
    path: result.sample
      ? `${ctx.worktreePath}/.chainglass/data/samples/${result.sample.slug}.json`
      : undefined,
    workspace: {
      slug: ctx.workspaceSlug,
      worktree: getWorktreeName(ctx.worktreePath),
    },
  };

  const output = adapter.format('sample.add', outputResult);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg sample list command.
 */
async function handleSampleList(options: ListOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve context first
  const ctx = await resolveOrOverrideContext(options.workspacePath);

  if (!ctx) {
    const outputResult: SampleListCmdResult = {
      errors: [
        {
          code: 'E074',
          message: 'No workspace context found',
          action: options.workspacePath
            ? `Path '${options.workspacePath}' is not inside a registered workspace`
            : 'Current directory is not inside a registered workspace. Run: cg workspace list',
        },
      ],
      samples: [],
      count: 0,
    };

    const output = adapter.format('sample.list', outputResult);
    console.log(output);
    process.exit(1);
  }

  const sampleService = getSampleService();
  const samples = await sampleService.list(ctx);

  const outputResult: SampleListCmdResult = {
    errors: [],
    samples: samples.map((s) => ({
      slug: s.slug,
      name: s.name,
      content: s.description,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    count: samples.length,
    workspace: {
      slug: ctx.workspaceSlug,
      worktree: getWorktreeName(ctx.worktreePath),
      dataRoot: `${ctx.worktreePath}/.chainglass/data`,
    },
  };

  const output = adapter.format('sample.list', outputResult);
  console.log(output);
}

/**
 * Handle cg sample info <slug> command.
 */
async function handleSampleInfo(slug: string, options: InfoOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve context first
  const ctx = await resolveOrOverrideContext(options.workspacePath);

  if (!ctx) {
    const outputResult: SampleInfoCmdResult = {
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

    const output = adapter.format('sample.info', outputResult);
    console.log(output);
    process.exit(1);
  }

  const sampleService = getSampleService();
  const sample = await sampleService.get(ctx, slug);

  if (!sample) {
    const outputResult: SampleInfoCmdResult = {
      errors: [
        {
          code: 'E082',
          message: `Sample '${slug}' not found`,
          action: 'Run: cg sample list',
        },
      ],
    };

    const output = adapter.format('sample.info', outputResult);
    console.log(output);
    process.exit(1);
  }

  const outputResult: SampleInfoCmdResult = {
    errors: [],
    sample: {
      slug: sample.slug,
      name: sample.name,
      content: sample.description,
      createdAt: sample.createdAt.toISOString(),
      updatedAt: sample.updatedAt.toISOString(),
    },
    path: `${ctx.worktreePath}/.chainglass/data/samples/${sample.slug}.json`,
    workspace: {
      slug: ctx.workspaceSlug,
      worktree: getWorktreeName(ctx.worktreePath),
    },
  };

  const output = adapter.format('sample.info', outputResult);
  console.log(output);
}

/**
 * Handle cg sample delete <slug> command.
 *
 * Per DYK-P5-02: No confirmation prompts. --force is required for this
 * destructive operation since we run in non-TTY environments (web agents, CI).
 */
async function handleSampleDelete(slug: string, options: DeleteOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Per DYK-P5-02: Require --force for destructive operations
  if (!options.force) {
    const outputResult: SampleDeleteCmdResult = {
      errors: [
        {
          code: 'E089',
          message: 'The --force flag is required for destructive operations',
          action: `Run: cg sample delete ${slug} --force`,
        },
      ],
    };

    const output = adapter.format('sample.delete', outputResult);
    console.log(output);
    process.exit(1);
  }

  // Resolve context first
  const ctx = await resolveOrOverrideContext(options.workspacePath);

  if (!ctx) {
    const outputResult: SampleDeleteCmdResult = {
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

    const output = adapter.format('sample.delete', outputResult);
    console.log(output);
    process.exit(1);
  }

  const sampleService = getSampleService();
  const result = await sampleService.delete(ctx, slug);

  const outputResult: SampleDeleteCmdResult = {
    errors: result.errors,
    slug: result.deletedSlug,
    path: result.deletedSlug
      ? `${ctx.worktreePath}/.chainglass/data/samples/${result.deletedSlug}.json`
      : undefined,
    message: result.success ? 'Sample deleted' : undefined,
  };

  const output = adapter.format('sample.delete', outputResult);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

// ==================== Command Registration ====================

/**
 * Register the sample command group with the Commander program.
 *
 * Creates the cg sample command group with subcommands:
 * - cg sample add <name>      - Create a new sample in current workspace
 * - cg sample list            - List samples in current worktree
 * - cg sample info <slug>     - Show sample details
 * - cg sample delete <slug>   - Delete a sample file
 *
 * @param program - Commander.js program instance
 */
export function registerSampleCommands(program: Command): void {
  const sample = program
    .command('sample')
    .description('Create, list, and manage samples within workspaces');

  // cg sample add <name>
  sample
    .command('add <name>')
    .description('Create a new sample in the current workspace')
    .option('--json', 'Output as JSON', false)
    .option('--content <text>', 'Sample content')
    .option('--workspace-path <path>', 'Override workspace context')
    .action(async (name: string, options: AddOptions) => {
      await handleSampleAdd(name, options);
    });

  // cg sample list
  sample
    .command('list')
    .description('List samples in the current worktree')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(async (options: ListOptions) => {
      await handleSampleList(options);
    });

  // cg sample info <slug>
  sample
    .command('info <slug>')
    .description('Show sample details')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(async (slug: string, options: InfoOptions) => {
      await handleSampleInfo(slug, options);
    });

  // cg sample delete <slug>
  sample
    .command('delete <slug>')
    .description('Delete a sample file')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .option('--force', 'Required for destructive operation', false)
    .action(async (slug: string, options: DeleteOptions) => {
      await handleSampleDelete(slug, options);
    });
}
