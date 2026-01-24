#!/usr/bin/env npx tsx
/**
 * Demo: Multi-Turn Conversation with Compact
 * 
 * Demonstrates Turn 1 → Compact → Turn 2 flow with REAL ClaudeCodeAdapter.
 * Per DYK-05: Uses context-dependent prompts to prove context survived compact.
 *
 * Flow:
 * 1. Turn 1: Tell agent a "secret password" (e.g., "blueberry")
 * 2. Compact: Send /compact to reduce context
 * 3. Turn 2: Ask agent to recall the password
 * 4. Verify: If agent says "blueberry", context survived ✅
 *
 * Usage:
 *   npx tsx scripts/agent/demo-claude-multi-turn.ts
 *   npx tsx scripts/agent/demo-claude-multi-turn.ts --password "myword"
 *
 * Requirement: Claude CLI must be installed and authenticated.
 */

import type { AgentEvent } from '@chainglass/shared';
import { ClaudeCodeAdapter, UnixProcessManager } from '@chainglass/shared';

function parseArgs(): { password: string } {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: npx tsx scripts/agent/demo-claude-multi-turn.ts [options]

Options:
  --password <word>   Secret password to test context retention (default: "blueberry")
  --help              Show this help

This demo proves context survives the /compact command by:
1. Telling the agent a "secret password"
2. Running /compact
3. Asking the agent to recall the password
`);
    process.exit(0);
  }

  let password = 'blueberry';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--password' || args[i] === '-p') {
      password = args[++i];
    }
  }

  return { password };
}

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

// Color helpers
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

function formatEvent(event: AgentEvent): string {
  const timestamp = event.timestamp.split('T')[1]?.slice(0, 12) ?? 'N/A';
  const prefix = `${colors.cyan}[${timestamp}]${colors.reset}`;

  switch (event.type) {
    case 'text_delta':
      return `${prefix} ${colors.green}δ${colors.reset}`;
    case 'message':
      return `${prefix} ${colors.blue}message${colors.reset}`;
    case 'session_start':
      return `${prefix} ${colors.blue}session_start${colors.reset}: ${event.data.sessionId}`;
    case 'session_idle':
      return `${prefix} ${colors.dim}session_idle${colors.reset}`;
    default:
      return `${prefix} ${event.type}`;
  }
}

function printSection(title: string, emoji: string) {
  console.log();
  console.log(`${colors.bright}═════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${emoji} ${title}${colors.reset}`);
  console.log(`${colors.bright}═════════════════════════════════════════${colors.reset}`);
}

async function main() {
  const { password } = parseArgs();

  console.log(`${colors.bright}🤖 Multi-Turn Conversation Demo (Claude)${colors.reset}`);
  console.log(`${colors.dim}Tests context retention after /compact${colors.reset}`);
  console.log();
  console.log(`${colors.yellow}Secret password: "${password}"${colors.reset}`);

  const processManager = new UnixProcessManager(logger);
  const adapter = new ClaudeCodeAdapter(processManager, { logger });

  try {
    // ═══════════════════════════════════════════
    // TURN 1: Tell the secret
    // ═══════════════════════════════════════════
    printSection('Turn 1: Establishing context', '📝');

    const turn1Prompt = `I'm going to tell you a secret password. Please remember it: "${password}". Just say "Got it, I've memorized the password." Nothing else.`;
    console.log(`${colors.dim}Prompt: ${turn1Prompt}${colors.reset}`);
    console.log();
    console.log(`${colors.dim}Events:${colors.reset}`);

    const turn1Result = await adapter.run({
      prompt: turn1Prompt,
      onEvent: (event) => {
        process.stdout.write(formatEvent(event) + ' ');
      },
    });

    console.log();
    console.log(`${colors.bright}Response:${colors.reset}`);
    console.log(`${colors.magenta}${turn1Result.output}${colors.reset}`);
    console.log(`${colors.dim}Session: ${turn1Result.sessionId} | Status: ${turn1Result.status}${colors.reset}`);

    const sessionId = turn1Result.sessionId;

    // ═══════════════════════════════════════════
    // COMPACT: Reduce context
    // ═══════════════════════════════════════════
    printSection('Compact: Reducing context', '🗜️');

    console.log(`${colors.dim}Sending /compact to session ${sessionId}...${colors.reset}`);

    const compactResult = await adapter.compact(sessionId);

    console.log(`${colors.bright}Compact Result:${colors.reset}`);
    console.log(`  Status: ${compactResult.status}`);
    console.log(`  Session: ${compactResult.sessionId} ${compactResult.sessionId === sessionId ? '(preserved ✓)' : '(changed!)'}`);

    // ═══════════════════════════════════════════
    // TURN 2: Recall the secret (PROVES CONTEXT)
    // ═══════════════════════════════════════════
    printSection('Turn 2: Testing context retention', '📝');

    const turn2Prompt = 'What is the secret password I told you earlier? Just say the password word itself, nothing else.';
    console.log(`${colors.dim}Prompt: ${turn2Prompt}${colors.reset}`);
    console.log();
    console.log(`${colors.dim}Events:${colors.reset}`);

    const turn2Result = await adapter.run({
      prompt: turn2Prompt,
      sessionId,
      onEvent: (event) => {
        process.stdout.write(formatEvent(event) + ' ');
      },
    });

    console.log();
    console.log(`${colors.bright}Response:${colors.reset}`);
    console.log(`${colors.magenta}${turn2Result.output}${colors.reset}`);
    console.log(`${colors.dim}Session: ${turn2Result.sessionId} | Status: ${turn2Result.status}${colors.reset}`);

    // ═══════════════════════════════════════════
    // VERDICT
    // ═══════════════════════════════════════════
    printSection('Verdict', '🎯');

    const outputLower = turn2Result.output.toLowerCase();
    const passwordLower = password.toLowerCase();
    const contextSurvived = outputLower.includes(passwordLower);

    if (contextSurvived) {
      console.log(`${colors.green}${colors.bright}✓ PASS: Context survived compact!${colors.reset}`);
      console.log(`${colors.green}  Agent correctly recalled: "${password}"${colors.reset}`);
    } else {
      console.log(`${colors.red}${colors.bright}✗ FAIL: Context may have been lost${colors.reset}`);
      console.log(`${colors.red}  Expected password "${password}" in response${colors.reset}`);
      console.log(`${colors.red}  Got: "${turn2Result.output}"${colors.reset}`);
    }

    console.log(`\n${colors.green}✓ Demo complete!${colors.reset}`);
    process.exit(contextSurvived ? 0 : 1);
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error(`\n${colors.red}✗ Claude CLI not found${colors.reset}`);
      console.log(`\n${colors.yellow}Install Claude CLI:${colors.reset}`);
      console.log(`  npm install -g @anthropic-ai/claude-code`);
    } else {
      console.error(
        `\n${colors.red}Error:${colors.reset}`,
        error instanceof Error ? error.message : String(error)
      );
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
