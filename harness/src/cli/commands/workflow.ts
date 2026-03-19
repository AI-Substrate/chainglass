/**
 * Workflow CLI commands — harness workflow run/status/logs/reset.
 *
 * Plan 076 Phase 3: Harness Workflow Commands.
 *
 * The experience layer: composes CG CLI telemetry (--detailed, --json-events)
 * and test-data primitives (cleanTestData, createEnv) into agent-friendly
 * commands returning structured HarnessEnvelope JSON.
 *
 * ADR-0014 override: imports @chainglass/positional-graph directly for
 * auto-completion of user-input nodes and Q&A answering during workflow runs.
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ErrorCodes,
  exitWithEnvelope,
  formatError,
  formatSuccess,
} from '../output.js';
import {
  runCg,
  resolveProjectRoot,
  type CgExecOptions,
} from '../../test-data/cg-runner.js';
import {
  cleanTestData,
  createEnv,
  statusTestData,
} from '../../test-data/environment.js';
import { TEST_DATA } from '../../test-data/constants.js';
import { spawnCg } from '../../test-data/cg-spawner.js';

/**
 * Lazy import for AutoCompletionRunner to avoid loading @chainglass/positional-graph
 * for commands that don't need it (reset, status, logs).
 */
async function createAutoCompletionRunner(
  workspacePath: string,
  graphSlug: string,
  verbose: boolean,
) {
  const { AutoCompletionRunner } = await import('../../test-data/auto-completion.js');
  return new AutoCompletionRunner({ workspacePath, graphSlug, verbose });
}

/** Resolve harness root directory */
function resolveHarnessRoot(): string {
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(thisDir, '..', '..', '..');
}

/** Cache directory for workflow run data */
function getCacheDir(): string {
  return path.join(resolveHarnessRoot(), '.cache');
}

/** Build CgExecOptions from command options */
function buildExecOptions(opts: { target?: string }): CgExecOptions {
  return {
    target: (opts.target as 'local' | 'container') ?? 'local',
  };
}

// ── Workflow Error Codes ─────────────────────────────────────────────

const WorkflowErrorCodes = {
  ...ErrorCodes,
  WORKFLOW_NOT_FOUND: 'E131',
  NO_CACHED_RUN: 'E132',
  WORKFLOW_RUN_FAILED: 'E133',
  SETUP_FAILED: 'E134',
} as const;

/**
 * Register the `workflow` command group on the CLI program.
 * Following agent.ts pattern: export register function, use program.addCommand().
 */
export function registerWorkflowCommand(program: Command): void {
  const workflow = new Command('workflow').description(
    'Run, observe, and debug workflow pipelines with structured telemetry',
  );

  // --- workflow reset ---
  workflow
    .command('reset')
    .description('Clean all workflow state and recreate fresh test data')
    .option('--target <target>', 'Execution target: local or container', 'local')
    .action(async (opts: { target?: string }) => {
      const execOptions = buildExecOptions(opts);

      try {
        await cleanTestData(execOptions);
        const createResult = await createEnv(execOptions);

        if (!createResult.ok) {
          exitWithEnvelope(
            formatError('workflow.reset', WorkflowErrorCodes.SETUP_FAILED, 'Failed to create test environment', {
              steps: createResult.steps,
            }),
          );
        }

        exitWithEnvelope(
          formatSuccess('workflow.reset', {
            cleaned: true,
            created: createResult.steps,
          }),
        );
      } catch (err) {
        exitWithEnvelope(
          formatError(
            'workflow.reset',
            WorkflowErrorCodes.UNKNOWN,
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    });

  // --- workflow run ---
  workflow
    .command('run')
    .description('Execute workflow, capture telemetry, report pass/fail')
    .option('--target <target>', 'Execution target: local or container', 'local')
    .option('--timeout <seconds>', 'Timeout in seconds', '120')
    .option('--verbose', 'Stream events to stderr in real time')
    .option('--no-auto-complete', 'Disable auto-completion of user-input and Q&A nodes')
    .action(async (opts: { target?: string; timeout?: string; verbose?: boolean; autoComplete?: boolean }) => {
      const execOptions = buildExecOptions(opts);
      const timeoutSeconds = parseInt(opts.timeout ?? '120', 10);
      const verbose = opts.verbose ?? false;
      const autoComplete = opts.autoComplete !== false;

      try {
        // Step 1: Auto-reset if test data missing (Workshop 001 D2)
        const status = await statusTestData(execOptions);
        const missing = Object.entries(status).filter(([, v]) => v === 'missing');
        if (missing.length > 0) {
          if (verbose) {
            console.error('[workflow run] Test data missing, auto-resetting...');
          }
          await cleanTestData(execOptions);
          const createResult = await createEnv(execOptions);
          if (!createResult.ok) {
            exitWithEnvelope(
              formatError('workflow.run', WorkflowErrorCodes.SETUP_FAILED, 'Auto-reset failed', {
                steps: createResult.steps,
              }),
            );
          }
          if (verbose) {
            console.error('[workflow run] ✓ Test data created');
          }
        }

        // Step 2: Spawn cg wf run --json-events (P3-DYK #2: streaming via spawn)
        // P3-DYK #1: CLI --timeout is seconds, subprocess kill timeout is ms + buffer
        const subprocessTimeoutMs = (timeoutSeconds + 10) * 1000;
        const handle = spawnCg(
          ['wf', 'run', TEST_DATA.workflowId, '--json-events', '--timeout', String(timeoutSeconds)],
          execOptions,
          subprocessTimeoutMs,
        );

        // Step 3: Process NDJSON lines via event listeners (not for-await, to keep event loop alive)
        const events: Array<Record<string, unknown>> = [];
        const stderrLines: string[] = [];
        let iterations = 0;

        // Set up auto-completion (P3-DYK #3: cross-repo import enabled)
        let autoCompletionRunner: Awaited<ReturnType<typeof createAutoCompletionRunner>> | null = null;
        if (autoComplete) {
          try {
            autoCompletionRunner = await createAutoCompletionRunner(
              resolveProjectRoot(),
              TEST_DATA.workflowId,
              verbose,
            );
          } catch (err) {
            if (verbose) {
              console.error(`[workflow run] Auto-completion init failed: ${err instanceof Error ? err.message : String(err)}`);
            }
          }
        }

        // Collect stdout NDJSON lines via event listener
        handle.stdoutLines.on('line', (line: string) => {
          if (!line.trim()) return;
          try {
            const event = JSON.parse(line) as Record<string, unknown>;
            events.push(event);

            if (event.type === 'iteration') iterations++;

            if (verbose) {
              const ts = new Date().toISOString().slice(11, 19);
              const emoji = event.type === 'error' ? '❌' : event.type === 'iteration' ? '▶' : event.type === 'idle' ? '⏸' : '📊';
              console.error(`[${ts}] ${emoji} ${event.type}: ${event.message ?? ''}`);
            }

            // Auto-complete on idle events
            if (event.type === 'idle' && autoCompletionRunner) {
              autoCompletionRunner.onIdle().catch((err: unknown) => {
                if (verbose) {
                  console.error(`[auto-complete] Error: ${err instanceof Error ? err.message : String(err)}`);
                }
              });
            }
          } catch {
            if (verbose) console.error(`[raw] ${line}`);
          }
        });

        // Collect stderr lines
        handle.stderrLines.on('line', (line: string) => {
          stderrLines.push(line);
        });

        // Wait for process exit
        const result = await handle.result;

        // Step 4: Get final status snapshot
        let nodeStatus: unknown = null;
        try {
          const statusResult = await runCg(
            ['wf', 'show', TEST_DATA.workflowId, '--detailed'],
            execOptions,
          );
          if (statusResult.exitCode === 0) {
            const parsed = JSON.parse(statusResult.stdout);
            nodeStatus = parsed.data ?? parsed;
          }
        } catch {
          // Status fetch failed — continue without it
        }

        // Step 5: Run structural assertions
        const assertions: Array<{ name: string; passed: boolean; detail?: string }> = [];

        assertions.push({
          name: 'workflow-started',
          passed: events.length > 0,
          detail: `${events.length} events emitted`,
        });

        assertions.push({
          name: 'drive-iterated',
          passed: iterations > 0,
          detail: `${iterations} drive iterations`,
        });

        const errorEvents = events.filter((e) => e.type === 'error');
        assertions.push({
          name: 'no-crash-errors',
          passed: errorEvents.length === 0,
          detail: errorEvents.length > 0
            ? `${errorEvents.length} errors: ${errorEvents.map((e) => e.message ?? e.error).join(', ')}`
            : 'clean execution',
        });

        assertions.push({
          name: 'clean-exit',
          passed: result.exitCode === 0,
          detail: `exit code ${result.exitCode}`,
        });

        const allPassed = assertions.every((a) => a.passed);

        // Step 6: Cache events (P3-DYK #4: mkdir first)
        const cacheDir = getCacheDir();
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(
          path.join(cacheDir, 'last-workflow-run.json'),
          JSON.stringify({
            timestamp: new Date().toISOString(),
            events,
            stderrLines,
            iterations,
            exitCode: result.exitCode,
            nodeStatus,
            assertions,
          }, null, 2),
        );

        // Step 7: Return HarnessEnvelope
        exitWithEnvelope(
          formatSuccess('workflow.run', {
            exitCode: result.exitCode,
            exitReason: result.exitCode === 0 ? 'complete' : 'timeout',
            iterations,
            totalEvents: events.length,
            errorCount: errorEvents.length,
            assertions,
            allPassed,
            nodeStatus,
            stderrLines: stderrLines.slice(-20),
          }, allPassed ? 'ok' : 'degraded'),
        );
      } catch (err) {
        exitWithEnvelope(
          formatError(
            'workflow.run',
            WorkflowErrorCodes.WORKFLOW_RUN_FAILED,
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    });

  // --- workflow status ---
  workflow
    .command('status')
    .description('Show current node-level workflow status')
    .option('--target <target>', 'Execution target: local or container', 'local')
    .action(async (opts: { target?: string }) => {
      const execOptions = buildExecOptions(opts);

      try {
        const result = await runCg(
          ['wf', 'show', TEST_DATA.workflowId, '--detailed'],
          execOptions,
        );

        if (result.exitCode !== 0) {
          exitWithEnvelope(
            formatError('workflow.status', WorkflowErrorCodes.WORKFLOW_NOT_FOUND, `Workflow '${TEST_DATA.workflowId}' not found or error`, {
              stderr: result.stderr,
              exitCode: result.exitCode,
            }),
          );
        }

        const parsed = JSON.parse(result.stdout);
        exitWithEnvelope(formatSuccess('workflow.status', parsed.data ?? parsed));
      } catch (err) {
        exitWithEnvelope(
          formatError(
            'workflow.status',
            WorkflowErrorCodes.UNKNOWN,
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    });

  // --- workflow logs ---
  workflow
    .command('logs')
    .description('Show event timeline from last workflow run')
    .option('--node <nodeId>', 'Filter to specific node')
    .option('--errors', 'Show only error events')
    .action(async (opts: { node?: string; errors?: boolean }) => {
      const cacheFile = path.join(getCacheDir(), 'last-workflow-run.json');

      if (!fs.existsSync(cacheFile)) {
        exitWithEnvelope(
          formatError(
            'workflow.logs',
            WorkflowErrorCodes.NO_CACHED_RUN,
            'No workflow run data — run `harness workflow run` first',
          ),
        );
      }

      try {
        const raw = fs.readFileSync(cacheFile, 'utf-8');
        const cached = JSON.parse(raw);
        let events: Array<Record<string, unknown>> = cached.events ?? [];

        const filters: string[] = [];

        if (opts.errors) {
          events = events.filter((e) => e.type === 'error');
          filters.push('errors-only');
        }

        if (opts.node) {
          events = events.filter((e) => {
            const str = JSON.stringify(e);
            return str.includes(opts.node!);
          });
          filters.push(`node:${opts.node}`);
        }

        exitWithEnvelope(
          formatSuccess('workflow.logs', {
            totalEvents: cached.events?.length ?? 0,
            filteredEvents: events.length,
            filters,
            events,
          }),
        );
      } catch (err) {
        exitWithEnvelope(
          formatError(
            'workflow.logs',
            WorkflowErrorCodes.UNKNOWN,
            err instanceof Error ? err.message : String(err),
          ),
        );
      }
    });

  program.addCommand(workflow);
}
