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
    .option('-p, --param <key=value>', 'Input parameter (repeatable)', (val: string, acc: string[]) => { acc.push(val); return acc; }, [] as string[])
    .action(async (slug: string, opts: { model?: string; reasoning?: string; timeout?: string; param?: string[] }) => {
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

      // Parse --param key=value pairs into Record
      const params: Record<string, string> = {};
      for (const p of opts.param ?? []) {
        const eq = p.indexOf('=');
        if (eq < 1) {
          exitWithEnvelope(
            formatError('agent run', ErrorCodes.INVALID_ARGS, `Invalid --param format: "${p}". Expected key=value.`),
          );
        }
        params[p.slice(0, eq)] = p.slice(eq + 1);
      }

      // Build run config
      const config: AgentRunConfig = {
        slug,
        model: opts.model,
        reasoningEffort: opts.reasoning as AgentRunConfig['reasoningEffort'],
        timeout: Number.parseInt(opts.timeout ?? '300', 10),
        cwd: path.resolve(resolveHarnessRoot(), '..'), // Repo root
        params: Object.keys(params).length > 0 ? params : undefined,
      };

      // Display header (stderr)
      const isTTY = process.stderr.isTTY;
      if (isTTY) {
        displayHeader(slug, '(starting...)', opts.model);
        displayPreflight('GH_TOKEN', true);
        displayPreflight('Agent definition', true, definition.dir);
        if (config.params) {
          for (const [k, v] of Object.entries(config.params)) {
            displayPreflight(`param:${k}`, true, v);
          }
        }
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
            hasInputSchema: a.inputSchemaPath !== null,
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

      // Persist revalidation results into completed.json so history reflects current state
      const completedPath = path.join(runsDir, latestRun, 'completed.json');
      if (fs.existsSync(completedPath)) {
        const completed = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
        completed.validated = result.valid;
        completed.validationErrors = result.errors;
        if (result.valid && completed.result === 'degraded') {
          completed.result = 'completed';
        }
        fs.writeFileSync(completedPath, JSON.stringify(completed, null, 2));
      }

      exitWithEnvelope(
        formatSuccess('agent validate', {
          runId: latestRun,
          validated: result.valid,
          errors: result.errors,
        }, result.valid ? 'ok' : 'degraded'),
      );
    });

  // --- agent last-run <slug> ---
  agent
    .command('last-run <slug>')
    .description('Print the latest run directory and report path for an agent')
    .action(async (slug: string) => {
      const slugError = validateSlug(slug);
      if (slugError) {
        exitWithEnvelope(formatError('agent last-run', ErrorCodes.INVALID_ARGS, slugError));
      }

      const definition = resolveAgent(slug);
      if (!definition) {
        exitWithEnvelope(formatError('agent last-run', ErrorCodes.AGENT_NOT_FOUND, `Agent "${slug}" not found.`));
      }

      const runsDir = path.join(definition.dir, 'runs');
      if (!fs.existsSync(runsDir)) {
        exitWithEnvelope(formatError('agent last-run', ErrorCodes.AGENT_VALIDATION_FAILED, 'No runs found.'));
      }

      const entries = fs.readdirSync(runsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));

      if (entries.length === 0) {
        exitWithEnvelope(formatError('agent last-run', ErrorCodes.AGENT_VALIDATION_FAILED, 'No runs found.'));
      }

      const latestRun = entries[0].name;
      const runDir = path.join(runsDir, latestRun);
      const reportPath = path.join(runDir, 'output', 'report.json');
      const completedPath = path.join(runDir, 'completed.json');

      let metadata = null;
      if (fs.existsSync(completedPath)) {
        try { metadata = JSON.parse(fs.readFileSync(completedPath, 'utf-8')); } catch { /* ignore */ }
      }

      exitWithEnvelope(formatSuccess('agent last-run', {
        runId: latestRun,
        runDir,
        reportPath: fs.existsSync(reportPath) ? reportPath : null,
        result: metadata?.result ?? 'unknown',
        verdict: null, // filled below if report exists
        ...(fs.existsSync(reportPath) ? (() => {
          try {
            const report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
            return { verdict: report.verdict ?? null, summary: report.summary ?? null };
          } catch { return {}; }
        })() : {}),
      }));
    });

  // --- agent tail <slug> ---
  agent
    .command('tail <slug>')
    .description('Follow a running agent\'s event stream in real-time')
    .option('--run <runId>', 'Specific run ID (default: latest)')
    .action(async (slug: string, opts: { run?: string }) => {
      const slugError = validateSlug(slug);
      if (slugError) {
        process.stderr.write(`Error: ${slugError}\n`);
        process.exit(1);
      }

      const definition = resolveAgent(slug);
      if (!definition) {
        process.stderr.write(`Agent "${slug}" not found.\n`);
        process.exit(1);
      }

      const runsDir = path.join(definition.dir, 'runs');
      if (!fs.existsSync(runsDir)) {
        process.stderr.write(`No runs found for "${slug}".\n`);
        process.exit(1);
      }

      // Find the target run
      let runId: string;
      if (opts.run) {
        runId = opts.run;
      } else {
        const entries = fs.readdirSync(runsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .sort((a, b) => b.name.localeCompare(a.name));
        if (entries.length === 0) {
          process.stderr.write(`No runs found for "${slug}".\n`);
          process.exit(1);
        }
        runId = entries[0].name;
      }

      const eventsPath = path.join(runsDir, runId, 'events.ndjson');
      const completedPath = path.join(runsDir, runId, 'completed.json');

      process.stderr.write(`\n  Tailing: ${slug} / ${runId}\n`);
      process.stderr.write(`  Events:  ${eventsPath}\n`);
      process.stderr.write(`  Press Ctrl+C to stop\n\n`);

      // Read existing events first
      let bytesRead = 0;
      if (fs.existsSync(eventsPath)) {
        const existing = fs.readFileSync(eventsPath, 'utf-8');
        bytesRead = Buffer.byteLength(existing, 'utf-8');
        const lines = existing.split('\n').filter(Boolean);
        // Show last 20 existing events for context
        const recent = lines.slice(-20);
        if (lines.length > 20) {
          process.stderr.write(`  ... (${lines.length - 20} earlier events)\n\n`);
        }
        for (const line of recent) {
          try {
            const event = JSON.parse(line);
            displayEvent(event);
          } catch { /* skip malformed */ }
        }
      }

      // Poll for new events (tail -f style)
      const poll = setInterval(() => {
        if (!fs.existsSync(eventsPath)) return;
        const stat = fs.statSync(eventsPath);
        if (stat.size <= bytesRead) return;

        const fd = fs.openSync(eventsPath, 'r');
        const buf = Buffer.alloc(stat.size - bytesRead);
        fs.readSync(fd, buf, 0, buf.length, bytesRead);
        fs.closeSync(fd);
        bytesRead = stat.size;

        const chunk = buf.toString('utf-8');
        const lines = chunk.split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const event = JSON.parse(line);
            displayEvent(event);
          } catch { /* skip malformed */ }
        }
      }, 200);

      // Watch for completion
      const completionPoll = setInterval(() => {
        if (fs.existsSync(completedPath)) {
          clearInterval(poll);
          clearInterval(completionPoll);
          try {
            const completed = JSON.parse(fs.readFileSync(completedPath, 'utf-8'));
            const statusColor = completed.result === 'completed' ? '\x1b[32m'
              : completed.result === 'degraded' ? '\x1b[33m' : '\x1b[31m';
            process.stderr.write(`\n\x1b[1m─── Run Complete ───\x1b[0m\n`);
            process.stderr.write(`  Result:     ${statusColor}${completed.result}\x1b[0m\n`);
            process.stderr.write(`  Duration:   ${(completed.durationMs / 1000).toFixed(1)}s\n`);
            process.stderr.write(`  Events:     ${completed.eventCount} (${completed.toolCallCount} tool calls)\n`);
            process.stderr.write(`  Validated:  ${completed.validated === true ? '\x1b[32m✓' : completed.validated === false ? '\x1b[31m✗' : '—'}\x1b[0m\n`);
          } catch { /* ignore parse errors */ }
          process.exit(0);
        }
      }, 500);

      // Handle Ctrl+C gracefully
      process.on('SIGINT', () => {
        clearInterval(poll);
        clearInterval(completionPoll);
        process.stderr.write('\n  Stopped tailing.\n');
        process.exit(0);
      });
    });

  program.addCommand(agent);
}
