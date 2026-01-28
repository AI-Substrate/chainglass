/**
 * Unit command group for the CLI.
 *
 * Per Phase 6: CLI Integration - Provides cg unit <subcommand> commands.
 * Manages WorkUnit library in .chainglass/units/.
 *
 * Commands:
 * - cg unit list              - List all units
 * - cg unit info <slug>       - Show unit details
 * - cg unit create <slug>     - Create new unit scaffold
 * - cg unit validate <slug>   - Validate unit definition
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per ADR-0008: Workgraph services registered via registerWorkgraphServices().
 */

import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  WORKGRAPH_DI_TOKENS,
  WORKSPACE_DI_TOKENS,
} from '@chainglass/shared';
import type { IWorkspaceService, WorkspaceContext } from '@chainglass/workflow';
import type { IWorkUnitService } from '@chainglass/workgraph';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// ============================================
// Option Interfaces
// ============================================

/**
 * Base options shared by all unit commands.
 */
interface BaseUnitOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Override workspace context with explicit path */
  workspacePath?: string;
}

/**
 * Options for unit list command.
 */
interface ListOptions extends BaseUnitOptions {}

/**
 * Options for unit info command.
 */
interface InfoOptions extends BaseUnitOptions {}

/**
 * Options for unit create command.
 */
interface CreateOptions extends BaseUnitOptions {
  /** Unit type: agent, code, or user-input */
  type: 'agent' | 'code' | 'user-input';
}

/**
 * Options for unit validate command.
 */
interface ValidateOptions extends BaseUnitOptions {}

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
 * Get the WorkUnitService from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkUnitService(): IWorkUnitService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
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

// ============================================
// Command Handlers
// ============================================

/**
 * Handle cg unit list command.
 */
async function handleUnitList(options: ListOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      units: [],
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
    console.log(adapter.format('unit.list', result));
    process.exit(1);
  }

  const service = getWorkUnitService();
  const result = await service.list(ctx);
  const output = adapter.format('unit.list', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg unit info <slug> command.
 */
async function handleUnitInfo(slug: string, options: InfoOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
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
    console.log(adapter.format('unit.info', result));
    process.exit(1);
  }

  const service = getWorkUnitService();

  const result = await service.load(ctx, slug);
  const output = adapter.format('unit.info', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg unit create <slug> --type <type> command.
 */
async function handleUnitCreate(slug: string, options: CreateOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      slug: '',
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
    console.log(adapter.format('unit.create', result));
    process.exit(1);
  }

  const service = getWorkUnitService();
  const result = await service.create(ctx, slug, options.type);
  const output = adapter.format('unit.create', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg unit validate <slug> command.
 */
async function handleUnitValidate(slug: string, options: ValidateOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  // Resolve workspace context
  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = {
      slug: '',
      valid: false,
      issues: [],
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
    console.log(adapter.format('unit.validate', result));
    process.exit(1);
  }

  const service = getWorkUnitService();
  const result = await service.validate(ctx, slug);
  const output = adapter.format('unit.validate', result);

  console.log(output);

  // Exit with error if validation failed (has error-level issues)
  if (result.errors.length > 0 || !result.valid) {
    process.exit(1);
  }
}

// ============================================
// Command Registration
// ============================================

/**
 * Register the unit command group with the Commander program.
 *
 * Creates the cg unit command group with subcommands:
 * - cg unit list              - List all units
 * - cg unit info <slug>       - Show unit details
 * - cg unit create <slug>     - Create new unit scaffold
 * - cg unit validate <slug>   - Validate unit definition
 *
 * @param program - Commander.js program instance
 */
export function registerUnitCommands(program: Command): void {
  const unit = program.command('unit').description('Manage WorkUnit library');

  // cg unit list
  unit
    .command('list')
    .description('List all available units')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (options: ListOptions) => {
        await handleUnitList(options);
      })
    );

  // cg unit info <slug>
  unit
    .command('info <slug>')
    .description('Show detailed information about a unit')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (slug: string, options: InfoOptions) => {
        await handleUnitInfo(slug, options);
      })
    );

  // cg unit create <slug>
  unit
    .command('create <slug>')
    .description('Create a new unit scaffold')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .requiredOption('-t, --type <type>', 'Unit type: agent, code, or user-input')
    .action(
      wrapAction(async (slug: string, options: CreateOptions) => {
        await handleUnitCreate(slug, options);
      })
    );

  // cg unit validate <slug>
  unit
    .command('validate <slug>')
    .description('Validate a unit definition')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (slug: string, options: ValidateOptions) => {
        await handleUnitValidate(slug, options);
      })
    );
}
