/**
 * test-data command group for the harness CLI.
 *
 * Plan 074 Phase 6 T011.
 *
 * Subcommands:
 * - harness test-data create [units|template|workflow|env]
 * - harness test-data clean
 * - harness test-data status
 * - harness test-data run
 * - harness test-data stop
 */

import type { Command } from 'commander';
import type { CgExecOptions } from '../../test-data/cg-runner.js';
import { computePorts } from '../../ports/allocator.js';
import {
  cleanTestData,
  createEnv,
  createTemplate,
  createUnits,
  createWorkflow,
  runTestWorkflow,
  statusTestData,
  stopTestWorkflow,
} from '../../test-data/environment.js';
import { exitWithEnvelope, formatError, formatSuccess, ErrorCodes } from '../output.js';

function resolveOptions(opts: { target?: string; workspacePath?: string }): CgExecOptions {
  const target = (opts.target as 'local' | 'container') ?? 'local';
  const ports = target === 'container' ? computePorts() : null;
  return {
    target,
    workspacePath: opts.workspacePath ?? process.cwd(),
    containerName: ports ? `chainglass-${ports.worktree}` : undefined,
  };
}

export function registerTestDataCommand(program: Command): void {
  const td = program
    .command('test-data')
    .description('Manage deterministic test workflow environment (Plan 074)')
    .option('--target <target>', 'Execution target: local or container', 'local')
    .option('--workspace-path <path>', 'Workspace path', process.cwd());

  // create subcommand group
  const create = td.command('create').description('Create test data components');

  create
    .command('units')
    .description('Create 3 test work units (idempotent)')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const result = await createUnits(options);
      if (result.ok) {
        exitWithEnvelope(formatSuccess('test-data.create.units', { created: true }));
      } else {
        exitWithEnvelope(formatError('test-data.create.units', ErrorCodes.UNKNOWN, 'Failed to create units'));
      }
    });

  create
    .command('template')
    .description('Create workflow template from test units (idempotent)')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const result = await createTemplate(options);
      if (result.ok) {
        exitWithEnvelope(formatSuccess('test-data.create.template', { created: true }));
      } else {
        exitWithEnvelope(formatError('test-data.create.template', ErrorCodes.UNKNOWN, 'Failed to create template'));
      }
    });

  create
    .command('workflow')
    .description('Instantiate workflow from template (idempotent)')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const result = await createWorkflow(options);
      if (result.ok) {
        exitWithEnvelope(formatSuccess('test-data.create.workflow', { created: true }));
      } else {
        exitWithEnvelope(
          formatError('test-data.create.workflow', ErrorCodes.UNKNOWN, 'Failed to create workflow')
        );
      }
    });

  create
    .command('env')
    .description('Create complete test environment (units + template + workflow)')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const result = await createEnv(options);
      if (result.ok) {
        exitWithEnvelope(formatSuccess('test-data.create.env', { steps: result.steps }));
      } else {
        exitWithEnvelope(
          formatError('test-data.create.env', ErrorCodes.UNKNOWN, 'Some steps failed', {
            steps: result.steps,
          })
        );
      }
    });

  // clean
  td.command('clean')
    .description('Delete all test data (units, template, workflow)')
    .action(async () => {
      const options = resolveOptions(td.opts());
      await cleanTestData(options);
      exitWithEnvelope(formatSuccess('test-data.clean', { cleaned: true }));
    });

  // status
  td.command('status')
    .description('Show what test data exists')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const status = await statusTestData(options);
      exitWithEnvelope(formatSuccess('test-data.status', status));
    });

  // run
  td.command('run')
    .description('Execute the test workflow')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const result = await runTestWorkflow(options);
      if (result.exitCode === 0) {
        exitWithEnvelope(formatSuccess('test-data.run', { output: result.stdout }));
      } else {
        exitWithEnvelope(
          formatError('test-data.run', ErrorCodes.UNKNOWN, 'Workflow execution failed', {
            stderr: result.stderr,
          })
        );
      }
    });

  // stop
  td.command('stop')
    .description('Stop the running test workflow')
    .action(async () => {
      const options = resolveOptions(td.opts());
      const result = await stopTestWorkflow(options);
      if (result.exitCode === 0) {
        exitWithEnvelope(formatSuccess('test-data.stop', { output: result.stdout }));
      } else {
        exitWithEnvelope(
          formatError('test-data.stop', ErrorCodes.UNKNOWN, 'Failed to stop workflow', {
            stderr: result.stderr,
          })
        );
      }
    });
}
