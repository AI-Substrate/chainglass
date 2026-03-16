/**
 * Unit command group for the CLI.
 *
 * Per Phase 6: CLI Integration - Provides cg unit <subcommand> commands.
 * Manages WorkUnit library in `<worktree>/.chainglass/data/units/`.
 *
 * Commands:
 * - cg unit list              - List all units
 * - cg unit info <slug>       - Show unit details
 * - cg unit create <slug>     - Create new unit scaffold
 * - cg unit validate <slug>   - Validate unit definition
 * - cg unit update <slug>     - Update unit definition (Plan 074 Phase 6)
 * - cg unit delete <slug>     - Delete unit (Plan 074 Phase 6)
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per ADR-0008: Workgraph services registered via registerWorkgraphServices().
 * Per Plan 021: Uses --workspace-path flag for workspace context override.
 */

import fs from 'node:fs';
import type { IWorkUnitService, UpdateUnitPatch } from '@chainglass/positional-graph';
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

/**
 * Options for unit update command (Plan 074 Phase 6 T001).
 */
interface UpdateOptions extends BaseUnitOptions {
  description?: string;
  version?: string;
  patch?: string;
  set?: string[];
  addInput?: string[];
  addOutput?: string[];
  inputsJson?: string;
  outputsJson?: string;
}

/**
 * Options for unit delete command (Plan 074 Phase 6 T002).
 */
interface DeleteOptions extends BaseUnitOptions {}

// ============================================
// Helpers
// ============================================

/**
 * Get the WorkUnitService from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkUnitService(): IWorkUnitService {
  const container = createCliProductionContainer();
  return container.resolve<IWorkUnitService>(POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE);
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
  const result = await service.create(ctx, { slug, type: options.type });
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
// Plan 074 Phase 6: Update + Delete Handlers
// ============================================

/**
 * Parse a --patch YAML/JSON file into an UpdateUnitPatch object.
 */
async function loadPatchFile(filePath: string): Promise<UpdateUnitPatch> {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // Try JSON first
  if (filePath.endsWith('.json')) {
    return JSON.parse(raw) as UpdateUnitPatch;
  }

  // YAML — use a simple approach: the service will handle yaml→patch
  // The patch file IS a partial unit.yaml, so parse as JSON-compatible subset
  // For YAML support, we use the same yaml parser the service uses
  const { parse: parseYaml } = await import('yaml');
  return parseYaml(raw) as UpdateUnitPatch;
}

/**
 * Parse --add-input/--add-output spec strings into declaration objects.
 * Format: "name:spec,type:data,data_type:text,required:true"
 */
function parseIOSpec(spec: string): {
  name: string;
  type: 'data' | 'file';
  data_type?: 'text' | 'number' | 'boolean' | 'json';
  required: boolean;
  description?: string;
} {
  const parts = spec.split(',');
  const obj: Record<string, string> = {};
  for (const part of parts) {
    const [key, ...rest] = part.split(':');
    obj[key.trim()] = rest.join(':').trim();
  }
  return {
    name: obj.name ?? '',
    type: (obj.type as 'data' | 'file') ?? 'data',
    data_type: obj.data_type as 'text' | 'number' | 'boolean' | 'json' | undefined,
    required: obj.required === 'true',
    description: obj.description,
  };
}

/**
 * Handle cg unit update <slug> command (Plan 074 Phase 6 T001).
 */
async function handleUnitUpdate(slug: string, options: UpdateOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('unit.update', { slug, errors: [noContextError(options.workspacePath)] })
    );
    process.exit(1);
  }

  const service = getWorkUnitService();

  // Build the patch from options
  const patch: UpdateUnitPatch = {};

  // --patch file (highest precedence — provides full patch)
  if (options.patch) {
    const filePatch = await loadPatchFile(options.patch);
    Object.assign(patch, filePatch);
  }

  // Scalar overrides
  if (options.description !== undefined) patch.description = options.description;
  if (options.version !== undefined) patch.version = options.version;

  // --set key=value (type-config shallow merge)
  if (options.set?.length) {
    const setMap: Record<string, string> = {};
    for (const s of options.set) {
      const [key, ...rest] = s.split('=');
      setMap[key.trim()] = rest.join('=').trim();
    }
    // Load current unit to determine type
    const loaded = await service.load(ctx, slug);
    if (loaded.errors.length > 0) {
      console.log(adapter.format('unit.update', { slug, errors: loaded.errors }));
      process.exit(1);
    }
    const unit = loaded.unit;
    if (unit?.type === 'agent')
      patch.agent = { ...patch.agent, ...setMap } as UpdateUnitPatch['agent'];
    else if (unit?.type === 'code')
      patch.code = { ...patch.code, ...setMap } as UpdateUnitPatch['code'];
    else if (unit?.type === 'user-input')
      patch.user_input = { ...patch.user_input, ...setMap } as UpdateUnitPatch['user_input'];
  }

  // --add-input (append to existing inputs)
  if (options.addInput?.length) {
    // Load current unit to get existing inputs
    const loaded = await service.load(ctx, slug);
    if (loaded.errors.length === 0 && loaded.unit) {
      const existing = loaded.unit.inputs ?? [];
      const added = options.addInput.map(parseIOSpec);
      patch.inputs = [...existing, ...added];
    }
  }

  // --add-output (append to existing outputs)
  if (options.addOutput?.length) {
    const loaded = await service.load(ctx, slug);
    if (loaded.errors.length === 0 && loaded.unit) {
      const existing = loaded.unit.outputs ?? [];
      const added = options.addOutput.map(parseIOSpec);
      patch.outputs = [...existing, ...added];
    }
  }

  // --inputs-json (wholesale replacement)
  if (options.inputsJson) {
    patch.inputs = JSON.parse(options.inputsJson);
  }

  // --outputs-json (wholesale replacement)
  if (options.outputsJson) {
    patch.outputs = JSON.parse(options.outputsJson);
  }

  const result = await service.update(ctx, slug, patch);
  console.log(adapter.format('unit.update', result));

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg unit delete <slug> command (Plan 074 Phase 6 T002).
 */
async function handleUnitDelete(slug: string, options: DeleteOptions): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    console.log(
      adapter.format('unit.delete', {
        deleted: false,
        errors: [noContextError(options.workspacePath)],
      })
    );
    process.exit(1);
  }

  const service = getWorkUnitService();
  const result = await service.delete(ctx, slug);
  console.log(adapter.format('unit.delete', result));

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Register the unit command group with the Commander program.
 *
 * Creates the cg unit command group with subcommands:
 * - cg unit list              - List all units
 * - cg unit info <slug>       - Show unit details
 * - cg unit create <slug>     - Create new unit scaffold
 * - cg unit validate <slug>   - Validate unit definition
 * - cg unit update <slug>     - Update unit definition (Plan 074)
 * - cg unit delete <slug>     - Delete unit (Plan 074)
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

  // cg unit update <slug> (Plan 074 Phase 6 T001)
  unit
    .command('update <slug>')
    .description('Update a unit definition')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .option('--description <text>', 'Set description')
    .option('--version <semver>', 'Set version')
    .option('--patch <file>', 'Apply YAML/JSON patch file')
    .option(
      '--set <key=value>',
      'Set type-config property (repeatable)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option(
      '--add-input <spec>',
      'Add input (repeatable, format: name:x,type:data,data_type:text,required:true)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option(
      '--add-output <spec>',
      'Add output (repeatable, same format as --add-input)',
      (v: string, a: string[]) => [...a, v],
      [] as string[]
    )
    .option('--inputs-json <json>', 'Replace all inputs (JSON array)')
    .option('--outputs-json <json>', 'Replace all outputs (JSON array)')
    .action(
      wrapAction(async (slug: string, options: UpdateOptions) => {
        await handleUnitUpdate(slug, options);
      })
    );

  // cg unit delete <slug> (Plan 074 Phase 6 T002)
  unit
    .command('delete <slug>')
    .description('Delete a unit (idempotent)')
    .option('--json', 'Output as JSON', false)
    .option('--workspace-path <path>', 'Override workspace context')
    .action(
      wrapAction(async (slug: string, options: DeleteOptions) => {
        await handleUnitDelete(slug, options);
      })
    );
}
