#!/usr/bin/env npx tsx
/**
 * Demo: SdkCopilotAdapter Streaming Events
 *
 * Shows real-time event emission during ACTUAL Copilot execution using
 * the SdkCopilotAdapter with REAL CopilotClient.
 *
 * This validates the full adapter streaming path:
 * - Real CopilotClient (from @github/copilot-sdk)
 * - SdkCopilotAdapter._translateToAgentEvent()
 * - onEvent callback in AgentRunOptions
 *
 * Usage:
 *   npx tsx scripts/agent/demo-copilot-adapter-streaming.ts [options] [prompt]
 *
 * Options:
 *   --session-id <id>   Resume an existing session
 *   --help              Show this help
 *
 * Examples:
 *   npx tsx scripts/agent/demo-copilot-adapter-streaming.ts
 *   npx tsx scripts/agent/demo-copilot-adapter-streaming.ts "What is 2+2?"
 *   npx tsx scripts/agent/demo-copilot-adapter-streaming.ts --session-id abc123 "Continue from where we left off"
 *
 * Requirement: GitHub Copilot CLI must be installed and authenticated.
 *   npm install -g @github/copilot
 *   gh auth login
 */

import { CopilotClient } from '@github/copilot-sdk';
import type { AgentEvent } from '@chainglass/shared';
import { SdkCopilotAdapter } from '@chainglass/shared';

function parseArgs(): { prompt: string; sessionId?: string } {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx scripts/agent/demo-copilot-adapter-streaming.ts [options] [prompt]

Options:
  --session-id <id>   Resume an existing session
  --help              Show this help

Examples:
  npx tsx scripts/agent/demo-copilot-adapter-streaming.ts
  npx tsx scripts/agent/demo-copilot-adapter-streaming.ts "What is 2+2?"
  npx tsx scripts/agent/demo-copilot-adapter-streaming.ts --session-id abc123 "Continue"
`);
    process.exit(0);
  }

  let sessionId: string | undefined;
  const positionalArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--session-id' || args[i] === '-s') {
      sessionId = args[++i];
    } else if (!args[i].startsWith('-')) {
      positionalArgs.push(args[i]);
    }
  }

  const prompt =
    positionalArgs.join(' ') ||
    'Say "Hello from SdkCopilotAdapter!" in exactly those words and nothing else.';

  return { prompt, sessionId };
}

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Simple console logger
const logger = {
  trace: (msg: string, data?: Record<string, unknown>) =>
    console.log(`[TRACE] ${msg}`, data ?? ''),
  debug: (msg: string, data?: Record<string, unknown>) =>
    console.log(`[DEBUG] ${msg}`, data ?? ''),
  info: (msg: string, data?: Record<string, unknown>) =>
    console.log(`[INFO] ${msg}`, data ?? ''),
  warn: (msg: string, data?: Record<string, unknown>) =>
    console.warn(`[WARN] ${msg}`, data ?? ''),
  error: (msg: string, err?: Error, data?: Record<string, unknown>) =>
    console.error(`[ERROR] ${msg}`, err?.message ?? '', data ?? ''),
  fatal: (msg: string, err?: Error, data?: Record<string, unknown>) =>
    console.error(`[FATAL] ${msg}`, err?.message ?? '', data ?? ''),
  child: () => logger,
};

function formatEvent(event: AgentEvent): string {
  const timestamp = event.timestamp.split('T')[1]?.slice(0, 12) ?? 'N/A';

  switch (event.type) {
    case 'text_delta':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.green}text_delta${colors.reset}: "${event.data.content}"`;
    case 'message':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.blue}message${colors.reset}: "${event.data.content.slice(0, 80)}${event.data.content.length > 80 ? '...' : ''}"`;
    case 'usage':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.yellow}usage${colors.reset}: in=${event.data.inputTokens}, out=${event.data.outputTokens}`;
    case 'session_start':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.blue}session_start${colors.reset}: ${event.data.sessionId}`;
    case 'session_idle':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.dim}session_idle${colors.reset}`;
    case 'session_error':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.red}session_error${colors.reset}: ${event.data.errorType} - ${event.data.message}`;
    case 'raw':
      return `${colors.cyan}[${timestamp}]${colors.reset} ${colors.magenta}raw${colors.reset}: ${event.data.originalType}`;
    default:
      return `${colors.cyan}[${timestamp}]${colors.reset} unknown: ${JSON.stringify(event)}`;
  }
}

async function main() {
  const { prompt, sessionId } = parseArgs();

  console.log(`${colors.bright}🤖 SdkCopilotAdapter Streaming Events Demo${colors.reset}\n`);
  console.log(`${colors.dim}Using SdkCopilotAdapter with REAL CopilotClient from @github/copilot-sdk${colors.reset}\n`);

  // Create REAL CopilotClient
  let client: CopilotClient;
  try {
    client = new CopilotClient();
    console.log(`${colors.green}✓ CopilotClient created${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}✗ Failed to create CopilotClient:${colors.reset}`, error);
    console.log(`\n${colors.yellow}Make sure you have Copilot CLI installed and authenticated:${colors.reset}`);
    console.log(`  npm install -g @github/copilot`);
    console.log(`  gh auth login`);
    process.exit(1);
  }

  // Create adapter with REAL client (cast to ICopilotClient interface)
  const adapter = new SdkCopilotAdapter(client as any, { logger });

  console.log(`${colors.dim}Prompt: "${prompt}"${colors.reset}`);
  if (sessionId) {
    console.log(`${colors.dim}Session ID: ${sessionId}${colors.reset}`);
  }
  console.log();
  console.log(`${colors.bright}Events:${colors.reset}`);

  // Collect events
  const events: AgentEvent[] = [];
  let streamedContent = '';

  try {
    const result = await adapter.run({
      prompt,
      sessionId,
      onEvent: (event) => {
        events.push(event);
        console.log(formatEvent(event));

        if (event.type === 'text_delta') {
          streamedContent += event.data.content;
          process.stdout.write(
            `${colors.dim}  → Accumulated: "${streamedContent}"${colors.reset}\n`
          );
        }
      },
    });

    console.log(`\n${colors.bright}Response:${colors.reset}`);
    console.log(`${colors.magenta}${result.output}${colors.reset}`);

    console.log(`\n${colors.dim}Session: ${result.sessionId} | Status: ${result.status} | Events: ${events.length}${colors.reset}`);

    console.log(`\n${colors.green}✓ Demo complete!${colors.reset}`);
    process.exit(0);
  } catch (error: unknown) {
    console.error(
      `\n${colors.red}Error:${colors.reset}`,
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
