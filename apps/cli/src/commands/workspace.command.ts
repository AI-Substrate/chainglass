/**
 * Workspace command group for the CLI.
 *
 * Per Plan 014: Workspaces - Phase 5: CLI Commands
 * Provides cg workspace <subcommand> commands for managing workspaces.
 *
 * Commands:
 * - cg workspace add <name> <path>  - Register a folder as workspace
 * - cg workspace list               - List all registered workspaces
 * - cg workspace info <slug>        - Show workspace details + worktrees
 * - cg workspace remove <slug>      - Unregister workspace (keeps files)
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per DYK-P5-02: No confirmation prompts, --force required for destructive ops.
 */

import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  WORKSPACE_DI_TOKENS,
  type WorkspaceAddCmdResult,
  type WorkspaceInfoCmdResult,
  type WorkspaceListCmdResult,
  type WorkspaceRemoveCmdResult,
} from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// ==================== Option Types ====================

/**
 * Options for workspace add command.
 */
interface AddOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Allow adding a git worktree (normally rejected) */
  allowWorktree?: boolean;
}

/**
 * Options for workspace list command.
 */
interface ListOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for workspace info command.
 */
interface InfoOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for workspace remove command.
 */
interface RemoveOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
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

// ==================== Command Handlers ====================

/**
 * Handle cg workspace add <name> <path> command.
 */
async function handleWorkspaceAdd(name: string, path: string, options: AddOptions): Promise<void> {
  const service = getWorkspaceService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.add(name, path, {
    allowWorktree: options.allowWorktree,
  });

  // Convert service result to output result type
  const outputResult: WorkspaceAddCmdResult = {
    errors: result.errors,
    workspace: result.workspace
      ? {
          slug: result.workspace.slug,
          name: result.workspace.name,
          path: result.workspace.path,
          createdAt: result.workspace.createdAt.toISOString(),
        }
      : undefined,
  };

  const output = adapter.format('workspace.add', outputResult);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg workspace list command.
 */
async function handleWorkspaceList(options: ListOptions): Promise<void> {
  const service = getWorkspaceService();
  const adapter = createOutputAdapter(options.json ?? false);

  const workspaces = await service.list();

  const outputResult: WorkspaceListCmdResult = {
    errors: [],
    workspaces: workspaces.map((ws) => ({
      slug: ws.slug,
      name: ws.name,
      path: ws.path,
      createdAt: ws.createdAt.toISOString(),
    })),
    count: workspaces.length,
  };

  const output = adapter.format('workspace.list', outputResult);
  console.log(output);
}

/**
 * Handle cg workspace info <slug> command.
 */
async function handleWorkspaceInfo(slug: string, options: InfoOptions): Promise<void> {
  const service = getWorkspaceService();
  const adapter = createOutputAdapter(options.json ?? false);

  const info = await service.getInfo(slug);

  if (!info) {
    const outputResult: WorkspaceInfoCmdResult = {
      errors: [
        {
          code: 'E074',
          message: `Workspace '${slug}' not found`,
          action: 'Run: cg workspace list',
        },
      ],
      isGitRepo: false,
    };

    const output = adapter.format('workspace.info', outputResult);
    console.log(output);
    process.exit(1);
  }

  const outputResult: WorkspaceInfoCmdResult = {
    errors: [],
    workspace: {
      slug: info.slug,
      name: info.name,
      path: info.path,
      createdAt: info.createdAt.toISOString(),
    },
    isGitRepo: info.hasGit,
    worktrees: info.worktrees.map((wt) => ({
      // Derive name from path (last directory segment)
      name: wt.path.split('/').pop() || wt.path,
      path: wt.path,
      branch: wt.branch || 'detached',
    })),
    worktreeCount: info.worktrees.length,
  };

  const output = adapter.format('workspace.info', outputResult);
  console.log(output);
}

/**
 * Handle cg workspace remove <slug> command.
 *
 * Per DYK-P5-02: No confirmation prompts. --force is required for this
 * destructive operation since we run in non-TTY environments (web agents, CI).
 */
async function handleWorkspaceRemove(slug: string, options: RemoveOptions): Promise<void> {
  const service = getWorkspaceService();
  const adapter = createOutputAdapter(options.json ?? false);

  // Per DYK-P5-02: Require --force for destructive operations
  if (!options.force) {
    const outputResult: WorkspaceRemoveCmdResult = {
      errors: [
        {
          code: 'E081',
          message: 'The --force flag is required for destructive operations',
          action: `Run: cg workspace remove ${slug} --force`,
        },
      ],
    };

    const output = adapter.format('workspace.remove', outputResult);
    console.log(output);
    process.exit(1);
  }

  const result = await service.remove(slug);

  const outputResult: WorkspaceRemoveCmdResult = {
    errors: result.errors,
    slug: result.removedSlug,
    path: undefined, // Service doesn't return path; could enhance later
    message: result.success ? 'Workspace removed from registry. Folder not modified.' : undefined,
  };

  const output = adapter.format('workspace.remove', outputResult);
  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

// ==================== Command Registration ====================

/**
 * Register the workspace command group with the Commander program.
 *
 * Creates the cg workspace command group with subcommands:
 * - cg workspace add <name> <path>  - Register a folder as workspace
 * - cg workspace list               - List all registered workspaces
 * - cg workspace info <slug>        - Show workspace details + worktrees
 * - cg workspace remove <slug>      - Unregister workspace (keeps files)
 *
 * @param program - Commander.js program instance
 */
export function registerWorkspaceCommands(program: Command): void {
  const workspace = program
    .command('workspace')
    .description('Register, list, and manage workspaces');

  // cg workspace add <name> <path>
  workspace
    .command('add <name> <path>')
    .description('Register a folder as a workspace')
    .option('--json', 'Output as JSON', false)
    .option('--allow-worktree', 'Allow adding a git worktree', false)
    .action(async (name: string, path: string, options: AddOptions) => {
      await handleWorkspaceAdd(name, path, options);
    });

  // cg workspace list
  workspace
    .command('list')
    .description('List all registered workspaces')
    .option('--json', 'Output as JSON', false)
    .action(async (options: ListOptions) => {
      await handleWorkspaceList(options);
    });

  // cg workspace info <slug>
  workspace
    .command('info <slug>')
    .description('Show workspace details and worktrees')
    .option('--json', 'Output as JSON', false)
    .action(async (slug: string, options: InfoOptions) => {
      await handleWorkspaceInfo(slug, options);
    });

  // cg workspace remove <slug>
  workspace
    .command('remove <slug>')
    .description('Unregister a workspace (keeps files)')
    .option('--json', 'Output as JSON', false)
    .option('--force', 'Required for destructive operation', false)
    .action(async (slug: string, options: RemoveOptions) => {
      await handleWorkspaceRemove(slug, options);
    });
}
