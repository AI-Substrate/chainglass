#!/usr/bin/env npx tsx
/**
 * E2E Test Script for CopilotCLIAdapter
 *
 * Validates the adapter against a real running Copilot CLI instance.
 * Part-human, part-automatic: user starts the CLI in tmux first.
 *
 * Usage:
 *   npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> <tmuxSession> <pane>
 *
 * Example:
 *   npx tsx scripts/test-copilot-cli-adapter.ts cee9a7ba-... studio 1.0
 *
 * Prerequisites:
 *   1. Start tmux: tmux new-session -s studio
 *   2. In that pane, run: copilot
 *   3. Note the session ID from ~/.copilot/session-state/
 *   4. Run this script with those coordinates
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CopilotCLIAdapter } from '@chainglass/shared';
import type { AgentEvent } from '@chainglass/shared';

// ── CLI Arguments ──────────────────────────────────────────────────────

const [sessionId, tmuxSession, pane] = process.argv.slice(2);

if (!sessionId || !tmuxSession || !pane) {
  console.error('Usage: npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> <tmuxSession> <pane>');
  console.error('Example: npx tsx scripts/test-copilot-cli-adapter.ts cee9a7ba-... studio 1.0');
  process.exit(1);
}

const tmuxTarget = `${tmuxSession}:${pane}`;
const sessionStateDir = path.join(process.env.HOME ?? '~', '.copilot', 'session-state');
const eventsPath = path.join(sessionStateDir, sessionId, 'events.jsonl');

// ── Validate Prerequisites ─────────────────────────────────────────────

console.log('\n━━━ CopilotCLI Adapter E2E Test ━━━\n');

function check(label: string, ok: boolean, detail?: string): void {
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exit(1);
}

// Check tmux session exists
try {
  execSync(`tmux has-session -t ${tmuxSession}`, { stdio: 'ignore' });
  check('tmux session exists', true, tmuxSession);
} catch {
  check('tmux session exists', false, `tmux session "${tmuxSession}" not found`);
}

// Check events.jsonl exists
check('events.jsonl exists', fs.existsSync(eventsPath), eventsPath);

// ── Create Adapter ─────────────────────────────────────────────────────

const sendKeys = (target: string, text: string): void => {
  execSync(`tmux send-keys -t ${target} ${JSON.stringify(text)}`, { stdio: 'ignore' });
};

const sendEnter = (target: string): void => {
  execSync(`tmux send-keys -t ${target} Enter`, { stdio: 'ignore' });
};

const adapter = new CopilotCLIAdapter({
  sendKeys,
  sendEnter,
  sessionStateDir,
  tmuxTarget,
  pollIntervalMs: 200,
  timeoutMs: 60_000,
});

// ── Test Helpers ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`\n🧪 ${name}...`);
  try {
    await fn();
    passed++;
    console.log(' ✅ PASS');
  } catch (err) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(` ❌ FAIL: ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ── Tests ──────────────────────────────────────────────────────────────

await test('T1: run() sends prompt and returns completed result', async () => {
  const events: AgentEvent[] = [];
  const result = await adapter.run({
    prompt: 'echo "copilot-cli-adapter-e2e-test-ok"',
    sessionId,
    onEvent: (e) => events.push(e),
  });

  assert(result.status === 'completed', `Expected completed, got ${result.status}`);
  assert(result.sessionId === sessionId, `SessionId mismatch: ${result.sessionId}`);
  assert(events.length > 0, 'No events received');

  const types = new Set(events.map((e) => e.type));
  console.log(` (${events.length} events, types: ${[...types].join(', ')})`);
});

await test('T2: run() emits tool_call and tool_result events', async () => {
  const events: AgentEvent[] = [];
  await adapter.run({
    prompt: 'List the files in the current directory using the Bash tool. Just run ls.',
    sessionId,
    onEvent: (e) => events.push(e),
  });

  const toolCalls = events.filter((e) => e.type === 'tool_call');
  const toolResults = events.filter((e) => e.type === 'tool_result');
  assert(toolCalls.length > 0, 'No tool_call events received');
  assert(toolResults.length > 0, 'No tool_result events received');
  console.log(` (${toolCalls.length} tool calls, ${toolResults.length} tool results)`);
});

await test('T3: compact() sends /compact command', async () => {
  const result = await adapter.compact(sessionId);
  assert(result.status === 'completed', `Expected completed, got ${result.status}`);
  assert(result.sessionId === sessionId, `SessionId mismatch: ${result.sessionId}`);
});

await test('T4: terminate() returns killed without stopping CLI', async () => {
  const result = await adapter.terminate(sessionId);
  assert(result.status === 'killed', `Expected killed, got ${result.status}`);
  assert(result.exitCode === 0, `Expected exitCode 0, got ${result.exitCode}`);

  // Verify CLI is still running by checking the tmux pane
  try {
    execSync(`tmux has-session -t ${tmuxSession}`, { stdio: 'ignore' });
    console.log(' (tmux session still alive)');
  } catch {
    throw new Error('tmux session was killed — terminate() should not kill the CLI');
  }
});

await test('T5: run() works after terminate() (adapter reconnects)', async () => {
  const events: AgentEvent[] = [];
  const result = await adapter.run({
    prompt: 'Say "reconnect-test-ok" and nothing else.',
    sessionId,
    onEvent: (e) => events.push(e),
  });

  assert(result.status === 'completed', `Expected completed, got ${result.status}`);
  assert(events.length > 0, 'No events after reconnect');
  console.log(` (${events.length} events after reconnect)`);
});

// ── Summary ────────────────────────────────────────────────────────────

console.log('\n━━━ Results ━━━');
console.log(`Passed: ${passed}/${passed + failed}`);
console.log(`Failed: ${failed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
