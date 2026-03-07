/**
 * Plan 067: Question Popper — CLI Alert Commands
 *
 * `cg alert send` — fire-and-forget notifications through the Chainglass web UI.
 *
 * AC-11: Send alert, return immediately with alertId
 * AC-13/14: Tmux context auto-detected
 * AC-35: Self-documenting --help for agents
 * DYK-03: Source defaults to cg-alert:${USER}
 */

import { getTmuxMeta } from '@chainglass/shared/event-popper';
import type { Command } from 'commander';
import { wrapAction } from './command-helpers.js';
import {
  type IEventPopperClient,
  createEventPopperClient,
  discoverServerUrl,
} from './event-popper-client.js';
import { type CliIO, defaultCliIO } from './question.command.js';

// ── Exported Handler (testable with FakeEventPopperClient) ──

export async function handleAlertSend(
  client: IEventPopperClient,
  options: {
    text: string;
    description?: string;
    source: string;
  },
  io: CliIO = defaultCliIO
): Promise<void> {
  const body = {
    source: options.source,
    text: options.text,
    description: options.description ?? null,
    meta: { ...getTmuxMeta() },
  };

  const result = await client.sendAlert(body);
  io.log(JSON.stringify(result));
}

// ── Command Registration (AC-35: agent-oriented help) ──

const ALERT_HELP = `
Send fire-and-forget notifications to the Chainglass web UI.

Alerts are one-way notifications — the sender does not wait for a response.
Use alerts to inform the user about completed tasks, status changes, or
events that don't require an answer.

WHEN TO USE 'cg alert send' vs 'cg question ask':
  Use 'alert' when you just want to notify (fire-and-forget, one-way).
  Use 'question' when you need an answer back (blocking, two-way).

  Alert: "Build completed successfully" — user sees it, no response needed.
  Question: "Deploy to production?" — user must answer before agent continues.

BEHAVIOR:
  The alert appears in the Chainglass web UI as a notification badge.
  The CLI returns immediately with the alert ID. No blocking, no polling.
  The user can acknowledge (mark as read) the alert in the UI.

KEY FLAGS:
  send --text <message>           Alert text (required)
  send --description <markdown>   Detailed context shown in UI
  send --source <name>            Source identifier (default: cg-alert:$USER)

EXAMPLES:
  cg alert send --text "Build completed"
  cg alert send --text "Deployment failed" --description "Error: timeout on health check"
  cg alert send --text "Tests passed" --source "ci-pipeline:build-42"
`;

function defaultSource(prefix: string): string {
  return `${prefix}:${process.env.USER || 'unknown'}`;
}

export function registerAlertCommands(program: Command): void {
  const alert = program
    .command('alert')
    .description('Send fire-and-forget notifications to the Chainglass web UI')
    .addHelpText('after', ALERT_HELP);

  alert
    .command('send')
    .description('Send an alert notification')
    .requiredOption('--text <message>', 'Alert message text')
    .option('--description <markdown>', 'Detailed context (markdown)')
    .option('--source <name>', 'Source identifier', defaultSource('cg-alert'))
    .action(
      wrapAction(async (options) => {
        const url = discoverServerUrl();
        const client = createEventPopperClient(url);
        await handleAlertSend(client, options);
      })
    );
}
