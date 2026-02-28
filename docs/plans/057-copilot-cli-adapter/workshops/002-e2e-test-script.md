# Workshop: E2E Test Script Design

**Type**: CLI Flow
**Plan**: 057-copilot-cli-adapter
**Spec**: [copilot-cli-adapter-spec.md](../copilot-cli-adapter-spec.md)
**Created**: 2026-02-27
**Status**: Draft

**Related Documents**:
- [001-intent-and-design.md](001-intent-and-design.md) — Adapter intent and all design decisions
- `scripts/agent/demo-copilot-adapter-streaming.ts` — Closest exemplar (SdkCopilotAdapter E2E)
- `scripts/test-copilot-serial.ts` — Full orchestration E2E with assertions
- `scratch/session-watcher.ts` — Proven prototype for events.jsonl tailing + tmux input

**Domain Context**:
- **Primary Domain**: Infrastructure adapter testing
- **Related Domains**: None — pure adapter validation

---

## Purpose

Design the E2E test script (`scripts/test-copilot-cli-adapter.ts`) that validates the `CopilotCLIAdapter` against a real running Copilot CLI instance. This is part-human, part-automatic: the user starts the CLI in tmux, provides the session ID and tmux coordinates, and the script exercises the adapter and reports pass/fail.

## Key Questions Addressed

- What's the exact CLI invocation and argument format?
- What does the script test and in what order?
- What assertions prove the adapter is working correctly?
- What output does the user see during the test run?

---

## Command Syntax

```
$ npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> <tmuxSession> <pane>
```

### Arguments

| Arg | Required | Example | Description |
|-----|----------|---------|-------------|
| `sessionId` | Yes | `cee9a7ba-22ce-4cf2-acfd-1f05206c308e` | Copilot session to attach to |
| `tmuxSession` | Yes | `studio` | tmux session name |
| `pane` | Yes | `1.0` | tmux window.pane index |

### Examples

```bash
# Prerequisites: copilot running in studio:1.0 with a session
$ copilot --resume cee9a7ba-22ce-4cf2-acfd-1f05206c308e  # in tmux pane

# Run the test
$ npx tsx scripts/test-copilot-cli-adapter.ts \
    cee9a7ba-22ce-4cf2-acfd-1f05206c308e \
    studio \
    1.0
```

---

## Test Flow

```
$ npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> studio 1.0

═══════════════════════════════════════════════════════
  CopilotCLI Adapter — E2E Test
  Session: cee9a7ba...
  Target:  studio:1.0
═══════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────┐
│ TEST 1: Validate prerequisites                       │
│   • Check events.jsonl exists                        │
│   • Check tmux pane is reachable                     │
│   • Parse existing events to confirm session active  │
└─────────────────────────────┬───────────────────────┘
                              │
                              ▼ PASS / FAIL
┌─────────────────────────────────────────────────────┐
│ TEST 2: run() with simple prompt                     │
│   • Send "Say exactly: ADAPTER_TEST_OK"              │
│   • Collect events via onEvent callback              │
│   • Wait for AgentResult                             │
│   • Assert:                                          │
│     ✓ result.status === 'completed'                  │
│     ✓ result.sessionId === input sessionId           │
│     ✓ result.output contains 'ADAPTER_TEST_OK'      │
│     ✓ events.length > 0                             │
│     ✓ at least one 'text_delta' event received       │
│     ✓ at least one 'message' event received          │
└─────────────────────────────┬───────────────────────┘
                              │
                              ▼ PASS / FAIL
┌─────────────────────────────────────────────────────┐
│ TEST 3: Event type coverage                          │
│   • Send "List the files in the current directory"   │
│   • Assert:                                          │
│     ✓ at least one 'tool_call' event (view tool)     │
│     ✓ at least one 'tool_result' event               │
│     ✓ result.status === 'completed'                  │
│     ✓ result.output is non-empty                     │
└─────────────────────────────┬───────────────────────┘
                              │
                              ▼ PASS / FAIL
┌─────────────────────────────────────────────────────┐
│ TEST 4: compact()                                    │
│   • Call adapter.compact(sessionId)                  │
│   • Assert:                                          │
│     ✓ result.status === 'completed'                  │
│     ✓ No crash or timeout                            │
└─────────────────────────────┬───────────────────────┘
                              │
                              ▼ PASS / FAIL
┌─────────────────────────────────────────────────────┐
│ TEST 5: terminate() (disconnect)                     │
│   • Call adapter.terminate(sessionId)                │
│   • Assert:                                          │
│     ✓ result.status === 'killed'                     │
│     ✓ result.exitCode === 0                          │
│     ✓ File watcher stopped (no more events)          │
│     ✓ CLI process still running in tmux pane         │
└─────────────────────────────┬───────────────────────┘
                              │
                              ▼
═══════════════════════════════════════════════════════
  RESULTS
═══════════════════════════════════════════════════════

  Test 1: Prerequisites ............ ✓ PASS
  Test 2: run() basic .............. ✓ PASS
  Test 3: Tool call events ......... ✓ PASS
  Test 4: compact() ................ ✓ PASS
  Test 5: terminate() .............. ✓ PASS

  5/5 passed — CopilotCLIAdapter is working ✓

═══════════════════════════════════════════════════════
```

---

## Script Structure

```typescript
// scripts/test-copilot-cli-adapter.ts

import { CopilotCLIAdapter } from '../packages/shared/src/adapters/copilot-cli.adapter';
import type { AgentEvent, AgentResult } from '../packages/shared/src/interfaces/agent-types';

// ── Args ───────────────────────────────────────────
const [sessionId, tmuxSession, tmuxPane] = process.argv.slice(2);
// Validate args...

// ── Colors ─────────────────────────────────────────
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ── Test runner ────────────────────────────────────
interface TestResult { name: string; passed: boolean; error?: string; }
const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name} ...`);
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(` ${GREEN}✓ PASS${RESET}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error: msg });
    console.log(` ${RED}✗ FAIL${RESET}: ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ── Create adapter ─────────────────────────────────
const adapter = new CopilotCLIAdapter({
  tmuxSession,
  tmuxPane,
});

// ── Tests ──────────────────────────────────────────

await test('Prerequisites', async () => { ... });
await test('run() basic', async () => { ... });
await test('Tool call events', async () => { ... });
await test('compact()', async () => { ... });
await test('terminate()', async () => { ... });

// ── Summary ────────────────────────────────────────
const passed = results.filter(r => r.passed).length;
console.log(`\n  ${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
```

---

## Event Collection Pattern

During each `run()` test, events are collected for assertion:

```typescript
const events: AgentEvent[] = [];
const result = await adapter.run({
  prompt: 'Say exactly: ADAPTER_TEST_OK',
  sessionId,
  onEvent: (event) => {
    events.push(event);
    // Optional: print events in real-time for visibility
    if (event.type === 'text_delta') {
      process.stdout.write(`${CYAN}${event.data.content}${RESET}`);
    }
  },
});

// Assertions on both result and events
assert(result.status === 'completed', `Expected completed, got ${result.status}`);
assert(events.some(e => e.type === 'text_delta'), 'No text_delta events');
assert(events.some(e => e.type === 'message'), 'No message events');
```

---

## Timeout Handling

Each test has a per-test timeout (default 90s for run(), 60s for compact()):

```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Usage
const result = await withTimeout(
  adapter.run({ prompt: '...', sessionId, onEvent }),
  90_000,
  'run()'
);
```

---

## Verifying CLI Still Running After terminate()

```typescript
await test('terminate()', async () => {
  const result = await adapter.terminate(sessionId);
  assert(result.status === 'killed', `Expected killed, got ${result.status}`);
  assert(result.exitCode === 0, `Expected exitCode 0, got ${result.exitCode}`);

  // Verify CLI is still alive in tmux
  const { execSync } = await import('node:child_process');
  const paneCheck = execSync(
    `tmux list-panes -t ${tmuxSession}:${tmuxPane.split('.')[0]} -F '#{pane_index} #{pane_current_command}'`,
    { encoding: 'utf-8' }
  );
  assert(paneCheck.includes('node'), 'CLI process should still be running in tmux pane');
});
```

---

## Error Output

On failure, the script shows the assertion that failed and any collected context:

```
  Test 2: run() basic ... ✗ FAIL: Expected completed, got failed
    AgentResult: {
      output: "tmux pane unreachable",
      sessionId: "cee9a7ba-...",
      status: "failed",
      exitCode: -1,
      tokens: null
    }
    Events collected: 0
```

---

## Prerequisites Checklist (Test 1)

```typescript
await test('Prerequisites', async () => {
  const { existsSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { homedir } = await import('node:os');
  const { execSync } = await import('node:child_process');

  // 1. events.jsonl exists
  const eventsFile = join(homedir(), '.copilot', 'session-state', sessionId, 'events.jsonl');
  assert(existsSync(eventsFile), `events.jsonl not found at ${eventsFile}`);

  // 2. tmux pane reachable
  try {
    execSync(`tmux has-session -t ${tmuxSession}`, { encoding: 'utf-8' });
  } catch {
    throw new Error(`tmux session '${tmuxSession}' not found`);
  }

  // 3. Pane exists
  const panes = execSync(
    `tmux list-panes -t ${tmuxSession}:${tmuxPane.split('.')[0]} -F '#{pane_index}'`,
    { encoding: 'utf-8' }
  );
  const paneIdx = tmuxPane.includes('.') ? tmuxPane.split('.')[1] : tmuxPane;
  assert(panes.includes(paneIdx), `Pane ${tmuxPane} not found in session ${tmuxSession}`);
});
```

---

## Quick Reference

```bash
# 1. Start copilot in a tmux pane
tmux select-pane -t studio:1.0
copilot --resume <sessionId>

# 2. Run the E2E test
npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> studio 1.0

# 3. Expected: 5/5 tests pass, CLI still running after
```
