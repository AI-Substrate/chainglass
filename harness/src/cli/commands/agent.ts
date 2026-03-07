/**
 * Agent CLI commands — Commander.js subcommands for the agent runner.
 *
 * This is the composition root: it creates CopilotClient → SdkCopilotAdapter
 * and passes the adapter to the runner. Only file that imports @github/copilot-sdk.
 *
 * Commands: agent run <slug>, agent list, agent history <slug>, agent validate <slug>
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ErrorCodes,
  exitWithEnvelope,
  formatError,
  formatSuccess,
} from '../output.js';
import {
  listAgents,
  resolveAgent,
  resolveHarnessRoot,
  validateSlug,
} from '../../agent/folder.js';
import { runAgent } from '../../agent/runner.js';
import {
  displayEvent,
  displayHeader,
  displayPreflight,
  displaySummary,
} from '../../agent/display.js';
import { validateOutput } from '../../agent/validator.js';
import type { AgentRunConfig } from '../../agent/types.js';

/**
 * Register the `agent` command group on the CLI program.
 * Uses .addCommand() for nested subcommands (per Finding 06).
 */
export function registerAgentCommand(program: Command): void {
  const agent = new Command('agent').description('Run and manage declarative agent definitions');

  // --- agent run <slug> ---
  agent
    .command('run <slug>')
    .description('Execute an agent from harness/agents/<slug>/')
    .option('-m, --model <model>', 'Model to use (e.g., gpt-5.4, claude-sonnet-4)')
    .option('-r, --reasoning <effort>', 'Reasoning effort (low, medium, high, xhigh)')
    .option('-t, --timeout <seconds>', 'Timeout in seconds', '300')
    .action(async (slug: string, opts: { model?: string; reasoning?: string; timeout?: string }) => {
      // Pre-flight: validate slug
      const slugError = validateSlug(slug);
      if (slugError) {
        exitWithEnvelope(formatError('agent run', ErrorCodes.INVALID_ARGS, slugError));
      }

      // Pre-flight: check GH_TOKEN
      if (!process.env.GH_TOKEN) {
        exitWithEnvelope(
          formatError(
            'agent run',
            ErrorCodes.AGENT_AUTH_MISSING,
            'GH_TOKEN environment variable is not set. Required for Copilot SDK.',
            { fix: 'export GH_TOKEN=$(gh auth token)' },
          ),
        );
      }

      // Resolve agent definition
      const definition = resolveAgent(slug);
      if (!definition) {
        const available = listAgents().map((a) => a.slug);
        exitWithEnvelope(
          formatError(
            'agent run',
            ErrorCodes.AGENT_NOT_FOUND,
            `Agent "${slug}" not found.${available.length ? ` Available: ${available.join(', ')}` : ' No agents defined yet.'}`,
          ),
        );
      }

      // Build run config
      const config: AgentRunConfig = {
        slug,
        model: opts.model,
        reasoningEffort: opts.reasoning as AgentRunConfig['reasoningEffort'],
        timeout: Number.parseInt(opts.timeout ?? '300', 10),
        cwd: path.resolve(resolveHarnessRoot(), '..'), // Repo root
      };

      // Display header (stderr)
      const isTTY = process.stderr.isTTY;
      if (isTTY) {
        displayHeader(slug, '(starting...)', opts.model);
        displayPreflight('GH_TOKEN', true);
        displayPreflight('Agent definition', true, definition.dir);
        process.stderr.write('\n');
      }

      // Create adapter — composition root
      // Dynamic import to avoid loading SDK when not needed (list, history, validate)
      const { CopilotClient } = await import('@github/copilot-sdk');
      const { SdkCopilotAdapter } = await import('@chainglass/shared');
      const client = new CopilotClient();
      // biome-ignore lint/suspicious/noExplicitAny: CopilotClient doesn't implement our ICopilotClient exactly
      const adapter = new SdkCopilotAdapter(client as any);

      // Run agent
      const result = await runAgent(
        adapter,
        definition,
        config,
        isTTY ? displayEvent : undefined,
      );

      // Display summary (stderr)
      if (isTTY) {
        displaySummary(result);
      }

      // Stop SDK client
      await client.stop();

      // Output envelope (stdout)
      const status = result.metadata.result === 'completed' ? 'ok'
        : result.metadata.result === 'degraded' ? 'degraded'
        : 'error';

      if (status === 'error') {
        const errorCode = result.metadata.result === 'timeout'
          ? ErrorCodes.AGENT_TIMEOUT
          : ErrorCodes.AGENT_EXECUTION_FAILED;
        exitWithEnvelope(
          formatError('agent run', errorCode, result.agentResult.output, {
            runDir: result.runDir,
            metadata: result.metadata,
          }),
        );
      } else {
        exitWithEnvelope(
          formatSuccess('agent run', {
            slug,
            runId: result.metadata.runId,
            runDir: result.runDir,
            sessionId: result.metadata.sessionId,
            result: result.metadata.result,
            durationMs: result.metadata.durationMs,
            validated: result.metadata.validated,
            validationErrors: result.metadata.validationErrors,
            eventCount: result.metadata.eventCount,
            toolCallCount: result.metadata.toolCallCount,
          }, status as 'ok' | 'degraded'),
        );
      }
    });

  // --- agent list ---
  agent
    .command('list')
    .description('List available agent definitions')
    .action(async () => {
      const agents = listAgents();
      exitWithEnvelope(
        formatSuccess('agent list', {
          agents: agents.map((a) => ({
            slug: a.slug,
            hasSchema: a.schemaPath !== null,
            hasInstructions: a.instructionsPath !== null,
          })),
          count: agents.length,
        }),
      );
    });

  // --- agent history <slug> ---
  agent
    .command('history <slug>')
    .description('List past runs for an agent')
    .action(async (slug: string) => {
      const slugError = validateSlug(slug);
      if (slugError) {
        exitWithEnvelope(formatError('agent history', ErrorCodes.INVALID_ARGS, slugError));
      }

      const definition = resolveAgent(slug);
      if (!definition) {
        exitWithEnvelope(formatError('agent history', ErrorCodes.AGENT_NOT_FOUND, `Agent "${slug}" not found.`));
      }

      const runsDir = path.join(definition.dir, 'runs');
      if (!fs.existsSync(runsDir)) {
        exitWithEnvelope(formatSuccess('agent history', { runs: [], count: 0 }));
      }

      const entries = fs.readdirSync(runsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name)); // Most recent first

      const runs = entries.map((e) => {
        const completedPath = path.join(runsDir, e.name, 'completed.json');
        if (fs.existsSync(completedPath)) {
          try {
            return JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
          } catch {
            return { runId: e.name, result: 'unknown' };
          }
        }
        return { runId: e.name, result: 'incomplete' };
      });

      exitWithEnvelope(formatSuccess('agent history', { runs, count: runs.length }));
    });

  // --- agent validate <slug> ---
  agent
    .command('validate <slug>')
    .description('Re-validate the most recent run output against current schema')
    .action(async (slug: string) => {
      const slugError = validateSlug(slug);
      if (slugError) {
        exitWithEnvelope(formatError('agent validate', ErrorCodes.INVALID_ARGS, slugError));
      }

      const definition = resolveAgent(slug);
      if (!definition) {
        exitWithEnvelope(formatError('agent validate', ErrorCodes.AGENT_NOT_FOUND, `Agent "${slug}" not found.`));
      }

      if (!definition.schemaPath) {
        exitWithEnvelope(formatSuccess('agent validate', { validated: null, message: 'No output-schema.json defined.' }));
      }

      // Find most recent run
      const runsDir = path.join(definition.dir, 'runs');
      if (!fs.existsSync(runsDir)) {
        exitWithEnvelope(formatError('agent validate', ErrorCodes.AGENT_VALIDATION_FAILED, 'No runs found.'));
      }

      const entries = fs.readdirSync(runsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));

      if (entries.length === 0) {
        exitWithEnvelope(formatError('agent validate', ErrorCodes.AGENT_VALIDATION_FAILED, 'No runs found.'));
      }

      const latestRun = entries[0].name;
      const outputPath = path.join(runsDir, latestRun, 'output', 'report.json');
      const result = validateOutput(definition.schemaPath, outputPath);

      exitWithEnvelope(
        formatSuccess('agent validate', {
          runId: latestRun,
          validated: result.valid,
          errors: result.errors,
        }, result.valid ? 'ok' : 'degraded'),
      );
    });

  program.addCommand(agent);
}
