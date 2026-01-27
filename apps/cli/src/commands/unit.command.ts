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
} from '@chainglass/shared';
import type { IWorkUnitService } from '@chainglass/workgraph';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// ============================================
// Option Interfaces
// ============================================

/**
 * Options for unit list command.
 */
interface ListOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for unit info command.
 */
interface InfoOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
}

/**
 * Options for unit create command.
 */
interface CreateOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Unit type: agent, code, or user-input */
  type: 'agent' | 'code' | 'user-input';
}

/**
 * Options for unit validate command.
 */
interface ValidateOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
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
 * Get the WorkUnitService from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkUnitService(): IWorkUnitService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
}

// ============================================
// Command Handlers
// ============================================

/**
 * Handle cg unit list command.
 */
async function handleUnitList(options: ListOptions): Promise<void> {
  const service = getWorkUnitService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.list();
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
  const service = getWorkUnitService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.load(slug);
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
  const service = getWorkUnitService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.create(slug, options.type);
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
  const service = getWorkUnitService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.validate(slug);
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
    .action(async (options: ListOptions) => {
      await handleUnitList(options);
    });

  // cg unit info <slug>
  unit
    .command('info <slug>')
    .description('Show detailed information about a unit')
    .option('--json', 'Output as JSON', false)
    .action(async (slug: string, options: InfoOptions) => {
      await handleUnitInfo(slug, options);
    });

  // cg unit create <slug>
  unit
    .command('create <slug>')
    .description('Create a new unit scaffold')
    .option('--json', 'Output as JSON', false)
    .requiredOption('-t, --type <type>', 'Unit type: agent, code, or user-input')
    .action(async (slug: string, options: CreateOptions) => {
      await handleUnitCreate(slug, options);
    });

  // cg unit validate <slug>
  unit
    .command('validate <slug>')
    .description('Validate a unit definition')
    .option('--json', 'Output as JSON', false)
    .action(async (slug: string, options: ValidateOptions) => {
      await handleUnitValidate(slug, options);
    });
}
