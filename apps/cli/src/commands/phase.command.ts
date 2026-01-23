/**
 * Phase command group for the CLI.
 *
 * Per Phase 3: Phase Operations - Provides cg phase prepare and cg phase validate commands.
 * Per Phase 4: Phase Lifecycle - Adds cg phase finalize command.
 * Per Phase 3 Subtask 001: Adds cg phase message commands.
 * Per Phase 3 Subtask 002: Adds cg phase accept/preflight/handover commands.
 */

import {
  ConsoleOutputAdapter,
  type IOutputAdapter,
  JsonOutputAdapter,
  NodeFileSystemAdapter,
} from '@chainglass/shared';
import {
  FakeSchemaValidator,
  FakeYamlParser,
  type IPhaseService,
  PhaseService,
  type ValidateCheckMode,
} from '@chainglass/workflow';
import { SchemaValidatorAdapter, YamlParserAdapter } from '@chainglass/workflow';
import type { Command } from 'commander';
import { registerMessageCommands } from './message.command.js';

/**
 * Options for phase prepare command.
 */
interface PrepareOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
}

/**
 * Options for phase validate command.
 */
interface ValidateOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** What to validate: 'inputs' or 'outputs' (required) */
  check: ValidateCheckMode;
}

/**
 * Options for phase finalize command.
 */
interface FinalizeOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
}

/**
 * Options for phase accept command.
 */
interface AcceptOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** Optional comment explaining acceptance */
  comment?: string;
}

/**
 * Options for phase preflight command.
 */
interface PreflightOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** Optional comment for preflight */
  comment?: string;
}

/**
 * Options for phase handover command.
 */
interface HandoverOptions {
  /** Output as JSON (default: false) */
  json?: boolean;
  /** Run directory path (required) */
  runDir: string;
  /** Reason for handover */
  reason?: string;
  /** Whether this handover is due to an error */
  error?: boolean;
}

/**
 * Create a phase service with real implementations.
 *
 * TODO: Replace with DI container resolution.
 */
function createPhaseService(): IPhaseService {
  const fs = new NodeFileSystemAdapter();
  const yamlParser = new YamlParserAdapter();
  const schemaValidator = new SchemaValidatorAdapter();
  return new PhaseService(fs, yamlParser, schemaValidator);
}

/**
 * Create an output adapter based on options.
 *
 * TODO: Replace with DI container resolution.
 */
function createOutputAdapter(json: boolean): IOutputAdapter {
  return json ? new JsonOutputAdapter() : new ConsoleOutputAdapter();
}

/**
 * Handle cg phase prepare <phase> command.
 *
 * @param phase - Phase name to prepare
 * @param options - Command options
 */
async function handlePrepare(phase: string, options: PrepareOptions): Promise<void> {
  const service = createPhaseService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.prepare(phase, options.runDir);
  const output = adapter.format('phase.prepare', result);

  console.log(output);

  // Exit with error code if prepare failed
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase validate <phase> command.
 *
 * @param phase - Phase name to validate
 * @param options - Command options
 */
async function handleValidate(phase: string, options: ValidateOptions): Promise<void> {
  const service = createPhaseService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.validate(phase, options.runDir, options.check);
  const output = adapter.format('phase.validate', result);

  console.log(output);

  // Exit with error code if validation failed
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase finalize <phase> command.
 *
 * @param phase - Phase name to finalize
 * @param options - Command options
 */
async function handleFinalize(phase: string, options: FinalizeOptions): Promise<void> {
  const service = createPhaseService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.finalize(phase, options.runDir);
  const output = adapter.format('phase.finalize', result);

  console.log(output);

  // Exit with error code if finalize failed
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

// ==================== Handover Commands (Phase 3 Subtask 002) ====================

/**
 * Handle cg phase accept <phase> command.
 *
 * @param phase - Phase name to accept
 * @param options - Command options
 */
async function handleAccept(phase: string, options: AcceptOptions): Promise<void> {
  const service = createPhaseService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.accept(phase, options.runDir, {
    comment: options.comment,
  });
  const output = adapter.format('phase.accept', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase preflight <phase> command.
 *
 * @param phase - Phase name to preflight
 * @param options - Command options
 */
async function handlePreflight(phase: string, options: PreflightOptions): Promise<void> {
  const service = createPhaseService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.preflight(phase, options.runDir, {
    comment: options.comment,
  });
  const output = adapter.format('phase.preflight', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Handle cg phase handover <phase> command.
 *
 * @param phase - Phase name to handover
 * @param options - Command options
 */
async function handleHandover(phase: string, options: HandoverOptions): Promise<void> {
  const service = createPhaseService();
  const adapter = createOutputAdapter(options.json ?? false);

  const result = await service.handover(phase, options.runDir, {
    reason: options.reason,
    dueToError: options.error,
  });
  const output = adapter.format('phase.handover', result);

  console.log(output);

  if (result.errors.length > 0) {
    process.exit(1);
  }
}

/**
 * Register the phase command group with the Commander program.
 *
 * Creates the cg phase command group with subcommands:
 * - cg phase prepare <phase> - Prepare a phase for execution
 * - cg phase validate <phase> - Validate phase inputs or outputs
 * - cg phase finalize <phase> - Finalize a phase and extract output parameters
 * - cg phase message <subcommand> - Agent-orchestrator messaging commands
 *
 * @param program - Commander.js program instance
 */
export function registerPhaseCommands(program: Command): void {
  const phase = program.command('phase').description('Phase lifecycle commands');

  // cg phase prepare <phase>
  phase
    .command('prepare <phase>')
    .description('Prepare a phase for execution')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .option('--json', 'Output as JSON', false)
    .action(async (phaseName: string, options: PrepareOptions) => {
      await handlePrepare(phaseName, options);
    });

  // cg phase validate <phase>
  phase
    .command('validate <phase>')
    .description('Validate phase inputs or outputs')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .requiredOption('--check <mode>', 'What to validate: inputs or outputs')
    .option('--json', 'Output as JSON', false)
    .action(async (phaseName: string, options: ValidateOptions) => {
      // Validate --check value
      if (options.check !== 'inputs' && options.check !== 'outputs') {
        console.error(`Error: --check must be 'inputs' or 'outputs', got '${options.check}'`);
        process.exit(1);
      }
      await handleValidate(phaseName, options);
    });

  // cg phase finalize <phase>
  phase
    .command('finalize <phase>')
    .description('Finalize a phase and extract output parameters')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .option('--json', 'Output as JSON', false)
    .action(async (phaseName: string, options: FinalizeOptions) => {
      await handleFinalize(phaseName, options);
    });

  // cg phase accept <phase> - Agent accepts control of a phase
  phase
    .command('accept <phase>')
    .description('Accept control of a phase (agent takes over from orchestrator)')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .option('--comment <text>', 'Comment explaining the acceptance')
    .option('--json', 'Output as JSON', false)
    .action(async (phaseName: string, options: AcceptOptions) => {
      await handleAccept(phaseName, options);
    });

  // cg phase preflight <phase> - Agent validates readiness
  phase
    .command('preflight <phase>')
    .description('Run preflight checks before starting phase work')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .option('--comment <text>', 'Comment for the preflight check')
    .option('--json', 'Output as JSON', false)
    .action(async (phaseName: string, options: PreflightOptions) => {
      await handlePreflight(phaseName, options);
    });

  // cg phase handover <phase> - Transfer control
  phase
    .command('handover <phase>')
    .description('Hand over control of a phase to the other party')
    .requiredOption('--run-dir <path>', 'Run directory path')
    .option('--reason <text>', 'Reason for the handover')
    .option('--error', 'Indicate handover is due to an error (sets state to blocked)', false)
    .option('--json', 'Output as JSON', false)
    .action(async (phaseName: string, options: HandoverOptions) => {
      await handleHandover(phaseName, options);
    });

  // Register message subcommands under phase
  registerMessageCommands(phase);
}
