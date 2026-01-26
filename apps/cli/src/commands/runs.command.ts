/**
 * Runs command group for the CLI.
 *
 * Per Phase 4: CLI cg runs Commands - Provides cg runs <subcommand> commands.
 *
 * Commands:
 * - cg runs list              - List all workflow runs
 * - cg runs get --workflow <slug> <run-id> - Show run details
 *
 * Per ADR-0004: Uses DI container, not direct instantiation.
 * Per DYK-01: `cg runs get` requires --workflow flag
 * Per DYK-02: `cg runs list` enumerates workflows then aggregates
 * Per DYK-04: `cg runs get` calls both WorkflowAdapter and PhaseAdapter
 */

import { type IFileSystem, SHARED_DI_TOKENS, WORKFLOW_DI_TOKENS } from '@chainglass/shared';
import type {
  IPhaseAdapter,
  IWorkflowAdapter,
  Phase,
  RunStatus,
  Workflow,
} from '@chainglass/workflow';
import type { Command } from 'commander';
import { createCliProductionContainer } from '../lib/container.js';

// Default runs directory
const DEFAULT_RUNS_DIR = '.chainglass/runs';

/**
 * Valid run statuses for --status option.
 */
const VALID_RUN_STATUSES = ['pending', 'active', 'complete', 'failed'] as const;

/**
 * Options for runs list command.
 */
interface ListOptions {
  /** Filter by workflow slug */
  workflow?: string;
  /** Filter by status (pending, active, complete, failed) */
  status?: string;
  /** Output format: table (default), json */
  output?: 'table' | 'json';
}

/**
 * Validate and convert status string to RunStatus.
 */
function validateStatus(status: string | undefined): RunStatus | undefined {
  if (!status) return undefined;
  if (VALID_RUN_STATUSES.includes(status as RunStatus)) {
    return status as RunStatus;
  }
  throw new Error(`Invalid status '${status}'. Valid values: ${VALID_RUN_STATUSES.join(', ')}`);
}

/**
 * Options for runs get command.
 */
interface GetOptions {
  /** Workflow slug (required per DYK-01) */
  workflow: string;
  /** Output format: table (default), json */
  output?: 'table' | 'json';
}

/**
 * Get the workflow adapter from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getWorkflowAdapter(): IWorkflowAdapter {
  const container = createCliProductionContainer();
  return container.resolve<IWorkflowAdapter>(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER);
}

/**
 * Get the filesystem adapter from DI container.
 */
function getFileSystem(): IFileSystem {
  const container = createCliProductionContainer();
  return container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
}

/**
 * Get the phase adapter from DI container.
 * Per ADR-0004: Services resolved from containers, not instantiated directly.
 */
function getPhaseAdapter(): IPhaseAdapter {
  const container = createCliProductionContainer();
  return container.resolve<IPhaseAdapter>(WORKFLOW_DI_TOKENS.PHASE_ADAPTER);
}

/**
 * Format relative time (age) from a date.
 */
function formatAge(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return '<1m';
  if (diffMinutes < 60) return `${diffMinutes}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

/**
 * Format runs as a table for console output.
 */
function formatRunsTable(runs: Workflow[]): string {
  if (runs.length === 0) {
    return 'No runs found.\n\nCreate a run with: cg workflow compose <workflow-slug>';
  }

  // Table headers
  const headers = ['NAME', 'WORKFLOW', 'VERSION', 'STATUS', 'AGE'];
  const rows: string[][] = runs.map((run) => [
    run.run?.runId ?? 'unknown',
    run.slug,
    run.checkpoint?.hash
      ? `v${String(run.checkpoint.ordinal).padStart(3, '0')}-${run.checkpoint.hash.slice(0, 8)}`
      : 'unknown',
    run.run?.status ?? 'unknown',
    run.run?.createdAt ? formatAge(run.run.createdAt) : 'unknown',
  ]);

  // Calculate column widths
  const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

  // Format header row
  const headerRow = headers.map((h, i) => h.padEnd(colWidths[i])).join('  ');

  // Format data rows
  const dataRows = rows.map((row) => row.map((cell, i) => cell.padEnd(colWidths[i])).join('  '));

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Format runs as JSON for automation.
 */
function formatRunsJson(runs: Workflow[]): string {
  return JSON.stringify(
    runs.map((r) => r.toJSON()),
    null,
    2
  );
}

/**
 * Handle cg runs list command.
 *
 * Per DYK-02: When --workflow is not specified, enumerates all workflows
 * in .chainglass/runs/ and aggregates results from listRuns() per slug.
 */
async function handleRunsList(options: ListOptions): Promise<void> {
  const adapter = getWorkflowAdapter();
  const fs = getFileSystem();

  let allRuns: Workflow[] = [];

  try {
    // Validate status option
    const statusFilter = validateStatus(options.status);

    if (options.workflow) {
      // Single workflow specified - call listRuns directly
      allRuns = await adapter.listRuns(options.workflow, {
        status: statusFilter,
      });
    } else {
      // Per DYK-02: Enumerate workflows in .chainglass/runs/
      const runsExists = await fs.exists(DEFAULT_RUNS_DIR);
      if (runsExists) {
        const workflowSlugs = await fs.readDir(DEFAULT_RUNS_DIR);

        // Aggregate runs from all workflows
        for (const slug of workflowSlugs) {
          try {
            const runs = await adapter.listRuns(slug, {
              status: statusFilter,
            });
            allRuns.push(...runs);
          } catch {
            // Skip workflows that fail to list (e.g., invalid directory structure)
          }
        }
      }
    }

    // Sort by creation date descending (newest first)
    allRuns.sort((a, b) => {
      const dateA = a.run?.createdAt?.getTime() ?? 0;
      const dateB = b.run?.createdAt?.getTime() ?? 0;
      return dateB - dateA;
    });

    // Output in requested format
    if (options.output === 'json') {
      console.log(formatRunsJson(allRuns));
    } else {
      console.log(formatRunsTable(allRuns));
    }
  } catch (error) {
    console.error(`Error listing runs: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Format duration in human-readable form.
 */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '-';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format run details as a detailed table for console output.
 * Per DYK-04: Takes workflow and phases as separate arguments.
 */
function formatRunDetails(run: Workflow, phases: Phase[]): string {
  const lines: string[] = [];

  // Run header
  lines.push(`Run: ${run.run?.runId ?? 'unknown'}`);
  lines.push(`Workflow: ${run.slug}`);
  lines.push(
    `Version: ${run.checkpoint?.hash ? `v${String(run.checkpoint.ordinal).padStart(3, '0')}-${run.checkpoint.hash}` : 'unknown'}`
  );
  lines.push(`Status: ${run.run?.status ?? 'unknown'}`);
  lines.push(`Created: ${run.run?.createdAt?.toISOString() ?? 'unknown'}`);
  lines.push('');

  // Phases section
  if (phases.length > 0) {
    lines.push('Phases:');

    // Table headers
    const headers = ['NAME', 'STATUS', 'STARTED', 'DURATION'];
    const rows: string[][] = phases.map((phase) => [
      phase.name,
      phase.status,
      phase.startedAt?.toISOString().slice(11, 19) ?? '-',
      formatDuration(phase.duration),
    ]);

    // Calculate column widths
    const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));

    // Format header row
    const headerRow = `  ${headers.map((h, i) => h.padEnd(colWidths[i])).join('  ')}`;
    lines.push(headerRow);

    // Format data rows
    for (const row of rows) {
      lines.push(`  ${row.map((cell, i) => cell.padEnd(colWidths[i])).join('  ')}`);
    }
  } else {
    lines.push('Phases: (none)');
  }

  return lines.join('\n');
}

/**
 * Format run details as JSON for automation.
 * Per DYK-04: Takes workflow and phases as separate arguments.
 */
function formatRunDetailsJson(run: Workflow, phases: Phase[]): string {
  return JSON.stringify(
    {
      ...run.toJSON(),
      phases: phases.map((p) => p.toJSON()),
    },
    null,
    2
  );
}

/**
 * Handle cg runs get --workflow <slug> <run-id> command.
 *
 * Per DYK-01: --workflow is required to identify the run.
 * Per DYK-04: Calls both WorkflowAdapter.loadRun() and PhaseAdapter.listForWorkflow().
 */
async function handleRunsGet(runId: string, options: GetOptions): Promise<void> {
  const workflowAdapter = getWorkflowAdapter();
  const phaseAdapter = getPhaseAdapter();

  try {
    // Step 1: Find the run by listing runs for the workflow and matching runId
    const runs = await workflowAdapter.listRuns(options.workflow);
    const matchingRun = runs.find((r) => r.run?.runId === runId);

    if (!matchingRun) {
      console.error(`Run not found: ${runId}`);
      console.error(`\nWorkflow '${options.workflow}' has ${runs.length} run(s).`);
      if (runs.length > 0) {
        console.error('Available runs:');
        for (const r of runs.slice(0, 5)) {
          console.error(`  - ${r.run?.runId}`);
        }
        if (runs.length > 5) {
          console.error(`  ... and ${runs.length - 5} more`);
        }
      }
      process.exit(1);
    }

    // Step 2: Load full run details
    const run = await workflowAdapter.loadRun(matchingRun.workflowDir);

    // Step 3: Per DYK-04, load phases separately
    const phases = await phaseAdapter.listForWorkflow(run);

    // Output in requested format
    if (options.output === 'json') {
      console.log(formatRunDetailsJson(run, phases));
    } else {
      console.log(formatRunDetails(run, phases));
    }
  } catch (error) {
    console.error(`Error getting run: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Register the runs command group with the Commander program.
 *
 * Creates the cg runs command group with subcommands:
 * - cg runs list              - List all workflow runs
 * - cg runs get --workflow <slug> <run-id> - Show run details
 *
 * @param program - Commander.js program instance
 */
export function registerRunsCommands(program: Command): void {
  const runs = program.command('runs').description('Manage workflow runs');

  // cg runs list
  runs
    .command('list')
    .description('List all workflow runs')
    .option('-w, --workflow <slug>', 'Filter by workflow slug')
    .option('-s, --status <status>', 'Filter by status (pending, running, completed, failed)')
    .option('-o, --output <format>', 'Output format: table (default), json', 'table')
    .action(async (options: ListOptions) => {
      await handleRunsList(options);
    });

  // cg runs get --workflow <slug> <run-id>
  runs
    .command('get <run-id>')
    .description('Show detailed information about a run')
    .requiredOption('-w, --workflow <slug>', 'Workflow slug (required)')
    .option('-o, --output <format>', 'Output format: table (default), json', 'table')
    .action(async (runId: string, options: GetOptions) => {
      await handleRunsGet(runId, options);
    });
}
