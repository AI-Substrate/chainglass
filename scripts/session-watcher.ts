#!/usr/bin/env npx tsx
/**
 * Session Watcher — Tails events.jsonl and sends prompts via tmux.
 *
 * Usage:
 *   npx tsx scratch/session-watcher.ts <sessionId> [tmuxTarget]
 *
 * Example:
 *   npx tsx scratch/session-watcher.ts cee9a7ba-... studio:1.0
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const BLUE = '\x1b[34m';

const sessionId = process.argv[2];
const tmuxSession = process.argv[3]; // e.g. "studio"
const tmuxPane = process.argv[4] ?? '0'; // e.g. "1.0" (window.pane)
const tmuxTarget = tmuxSession ? `${tmuxSession}:${tmuxPane}` : undefined;

if (!sessionId) {
  console.error(
    'Usage: npx tsx scratch/session-watcher.ts <sessionId> <tmuxSession> [windowIndex.paneIndex]'
  );
  console.error('  Example: npx tsx scratch/session-watcher.ts cee9a7ba-... studio 1.0');
  process.exit(1);
}

const sessionDir = join(homedir(), '.copilot', 'session-state', sessionId);
const eventsFile = join(sessionDir, 'events.jsonl');

if (!existsSync(eventsFile)) {
  console.error(`Session not found: ${eventsFile}`);
  process.exit(1);
}

interface EventLine {
  type: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

function formatEvent(event: EventLine): string | null {
  const type = event.type;
  const data = event.data;
  const ts = event.timestamp?.slice(11, 19) ?? '';

  switch (type) {
    case 'user.message':
      return `${GREEN}${BOLD}[${ts}] USER:${RESET} ${(data?.content as string) ?? ''}`;

    case 'assistant.message': {
      const content = (data?.content as string) ?? '';
      return `${CYAN}${BOLD}[${ts}] ASSISTANT:${RESET} ${content.slice(0, 500)}`;
    }

    case 'assistant.message_delta': {
      const delta = (data?.deltaContent as string) ?? '';
      if (delta) {
        process.stdout.write(`${CYAN}${delta}${RESET}`);
      }
      return null; // don't add newline
    }

    case 'assistant.reasoning':
      return `\n${MAGENTA}[${ts}] THINKING:${RESET}${DIM} ${(data?.content as string)?.slice(0, 300) ?? ''}${RESET}`;

    case 'assistant.reasoning_delta': {
      const delta = (data?.deltaContent as string) ?? '';
      if (delta) process.stdout.write(`${DIM}${MAGENTA}${delta}${RESET}`);
      return null;
    }

    case 'tool.execution_start':
      return `\n${YELLOW}[${ts}] TOOL:${RESET} ${data?.toolName ?? 'unknown'}`;

    case 'tool.execution_complete': {
      const result = (data?.result as string) ?? '';
      return `${YELLOW}[${ts}] TOOL DONE:${RESET} ${result.slice(0, 200)}`;
    }

    case 'tool.execution_partial_result': {
      const partial = (data?.partialOutput as string) ?? '';
      if (partial) process.stdout.write(`${DIM}${partial}${RESET}`);
      return null;
    }

    case 'assistant.turn_start':
      return `\n${DIM}[${ts}] --- turn start ---${RESET}`;

    case 'assistant.turn_end':
      return `${DIM}[${ts}] --- turn end ---${RESET}\n`;

    case 'session.idle':
      return `${DIM}[${ts}] --- idle ---${RESET}\n`;

    case 'session.start':
      return `${BLUE}[${ts}] SESSION START${RESET} model=${data?.selectedModel ?? '?'}`;

    case 'assistant.usage': {
      const d = data as Record<string, unknown>;
      return `${DIM}[${ts}] TOKENS: in=${d?.inputTokens} out=${d?.outputTokens} cost=${d?.cost}${RESET}`;
    }

    case 'session.usage_info':
      return null; // noisy

    case 'pending_messages.modified':
      return null; // noisy

    default:
      return `${DIM}[${ts}] ${type}${RESET}`;
  }
}

// ── Read existing events ──────────────────────────────────────────
const content = readFileSync(eventsFile, 'utf-8');
const lines = content.split('\n').filter(Boolean);
let lineCount = lines.length;

console.log('═══════════════════════════════════════════════════════');
console.log(`  Session Watcher — ${sessionId.slice(0, 8)}...`);
console.log(`  File: ${eventsFile}`);
console.log(`  Existing events: ${lineCount}`);
console.log('═══════════════════════════════════════════════════════\n');

// Show last few events as context
const showLast = Math.min(lineCount, 5);
if (showLast > 0) {
  console.log(`${DIM}  (last ${showLast} events)${RESET}`);
  for (const line of lines.slice(-showLast)) {
    try {
      const event = JSON.parse(line) as EventLine;
      const formatted = formatEvent(event);
      if (formatted) console.log(`  ${DIM}${formatted}${RESET}`);
    } catch {
      /* skip bad lines */
    }
  }
  console.log('');
}

console.log(`${BOLD}  Watching for new events...${RESET}\n`);

// ── Tail the file ─────────────────────────────────────────────────
function checkForNew() {
  try {
    const freshContent = readFileSync(eventsFile, 'utf-8');
    const freshLines = freshContent.split('\n').filter(Boolean);

    if (freshLines.length <= lineCount) return;

    const newLines = freshLines.slice(lineCount);
    for (const line of newLines) {
      try {
        const event = JSON.parse(line) as EventLine;
        const formatted = formatEvent(event);
        if (formatted) console.log(formatted);
      } catch {
        /* skip */
      }
    }

    lineCount = freshLines.length;
  } catch {
    /* file may be mid-write */
  }
}

// fs.watch fires on changes; also poll as fallback
watch(eventsFile, () => checkForNew());
setInterval(checkForNew, 500);

// ── Interactive input via tmux ────────────────────────────────────
if (tmuxTarget) {
  console.log(`${GREEN}  Input enabled → tmux ${tmuxTarget}${RESET}`);
  console.log(`${DIM}  Type a prompt and hit Enter to send it to the CLI${RESET}\n`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: `${GREEN}❯ ${RESET}`,
  });

  rl.prompt();

  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) {
      rl.prompt();
      return;
    }

    try {
      // Send text then Enter as separate calls (required for Copilot TUI)
      execSync(`tmux send-keys -t ${tmuxTarget} ${JSON.stringify(text)}`);
      execSync(`sleep 0.1 && tmux send-keys -t ${tmuxTarget} Enter`);
      console.log(`${DIM}  → sent to ${tmuxTarget}${RESET}\n`);
    } catch (err) {
      console.error(`${RED}  Failed to send: ${err}${RESET}`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(`\n${DIM}Stopped.${RESET}`);
    process.exit(0);
  });
} else {
  console.log(
    `${DIM}  Read-only mode (no tmux target). Add tmux session + pane to enable input.${RESET}\n`
  );
}

process.on('SIGINT', () => {
  console.log(`\n${DIM}Stopped watching.${RESET}`);
  process.exit(0);
});
