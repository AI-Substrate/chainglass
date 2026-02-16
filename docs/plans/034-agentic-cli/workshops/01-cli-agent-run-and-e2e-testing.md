# Workshop: CLI Agent Run and E2E Testing

**Type**: CLI Flow + Integration Pattern
**Plan**: 034-agentic-cli
**Spec**: [agentic-cli-spec.md](../agentic-cli-spec.md)
**Created**: 2026-02-16
**Status**: Draft

**Related Documents**:
- [Workshop 02: Unified AgentInstance / AgentManagerService Design](../../033-real-agent-pods/workshops/02-unified-agent-design.md)
- [Workshop 03: CLI-First Real Agent Execution](../../033-real-agent-pods/workshops/03-cli-first-real-agents.md) (Phase B scope — this workshop covers Phase A only)
- `apps/cli/src/commands/agent.command.ts` (current CLI implementation)
- `test/integration/real-agent-multi-turn.test.ts` (existing real agent tests at adapter level)
- `test/integration/sdk-copilot-adapter.test.ts` (existing Copilot SDK tests)

---

## Purpose

Define the exact CLI surface for `cg agent run` after the AgentManagerService/AgentInstance redesign, and specify how E2E tests prove session resumption, event handling, parallel execution, and adapter parity — all without any workflow concepts. This is Phase A: the agent system in isolation.

## Key Questions Addressed

- What does `cg agent run` look like after the redesign?
- How does session chaining work across CLI invocations?
- What terminal output modes exist and how do events appear?
- How do we E2E test real agents (both Claude Code and Copilot SDK)?
- What assertions are valid for non-deterministic real agent output?
- How does the same-instance guarantee work in tests vs CLI?

---

## Current State

The existing `cg agent run` (in `apps/cli/src/commands/agent.command.ts`):

```
$ cg agent run -t <type> [-p <text> | -f <path>] [-s <sessionId>] [-c <cwd>] [--stream]
```

- Uses `AgentService` (thin timeout wrapper around `IAgentAdapter`)
- Supports `--session <id>` for resumption
- Supports `--stream` for NDJSON event output
- Outputs `AgentResult` JSON on completion
- Has no concept of `AgentInstance`, metadata, or event handlers
- Always outputs JSON (even in non-stream mode)

---

## Updated Command Surface

Plan 034 changes both `cg agent run` and `cg agent compact` from `AgentService` to `AgentManagerService` / `AgentInstance`. All agent operations go through a cohesive instance — no split paths.

```
cg agent run       - Run a prompt (new or resume session) — UPDATED
cg agent compact   - Reduce session context — UPDATED (now via AgentInstance)
```

No new subcommands (`status`, `kill`) in Plan 034. Those are deferred to Plan 033's Phase B since they're only meaningful in long-lived processes.

### `cg agent run` (Updated)

```
$ cg agent run -t <type> [-p <text> | -f <path>] [-s <sessionId>]
               [-c <cwd>] [--name <name>] [--meta key=value...]
               [--stream | --verbose | --quiet]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | Agent type: `claude-code` or `copilot` | Required |
| `-p, --prompt <text>` | Prompt text | One of -p or -f required |
| `-f, --prompt-file <path>` | Path to file containing prompt | |
| `-s, --session <id>` | Resume existing session | (new session) |
| `-c, --cwd <path>` | Working directory for agent | `process.cwd()` |
| `--name <name>` | Human-readable instance name | `agent-<type>` |
| `--meta <key=value>` | Set metadata (repeatable) | |
| `--stream` | NDJSON event output (machine-readable) | |
| `--verbose` | Show thinking + tool results | |
| `--quiet` | Suppress event output, only show result | |

**New in Plan 034**: `--name`, `--meta`, `--verbose`, `--quiet`, human-readable default output.

**Unchanged**: `-t`, `-p`, `-f`, `-s`, `-c`, `--stream` flags keep the same semantics.

### `cg agent compact` (Updated)

```
$ cg agent compact -t <type> -s <sessionId> [--quiet]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --type <type>` | Agent type: `claude-code` or `copilot` | Required |
| `-s, --session <id>` | Session ID to compact | Required |
| `--quiet` | Suppress output, only show result | |

**What changes**: Compact now goes through `AgentManagerService` / `AgentInstance` instead of `AgentService` directly. This means:
- The instance transitions `stopped -> working -> stopped` during compaction (same as `run()`)
- If the session is already managed by the service (long-lived process), compact operates on the same instance — no parallel path
- Token metrics from the compact result are visible on the instance

---

## All Agent Operations on IAgentInstance

The redesigned `IAgentInstance` exposes three operations that map 1:1 to `IAgentAdapter`:

| Operation | `IAgentAdapter` | `IAgentInstance` | Status Transition | Returns |
|-----------|:-:|:-:|---|---|
| **run** | `adapter.run(options)` | `instance.run(options)` | `stopped -> working -> stopped\|error` | `AgentResult` |
| **compact** | `adapter.compact(sessionId)` | `instance.compact()` | `stopped -> working -> stopped\|error` | `AgentResult` |
| **terminate** | `adapter.terminate(sessionId)` | `instance.terminate()` | `* -> stopped` | `AgentResult` |

All three operations:
- Are guarded against double-invocation while `status === 'working'`
- Pass events through to registered handlers (compact may emit events during compaction)
- Update `updatedAt` timestamp
- Are available on both `AgentInstance` and `FakeAgentInstance`

### compact() on AgentInstance

```typescript
async compact(): Promise<AgentResult> {
  if (this._status === 'working') {
    throw new Error(`Cannot compact agent '${this.name}': already running`);
  }
  if (!this._sessionId) {
    throw new Error(`Cannot compact agent '${this.name}': no session`);
  }

  this._status = 'working';
  this._updatedAt = new Date();

  try {
    const result = await this._adapter.compact(this._sessionId);

    // Update session if adapter returns a new one
    if (result.sessionId) {
      this._sessionId = result.sessionId;
    }

    // Update token metrics if available
    if (result.tokens) {
      this.setMetadata('lastTokens', result.tokens);
    }

    this._status = result.status === 'completed' ? 'stopped' : 'error';
    return result;
  } catch (err) {
    this._status = 'error';
    throw err;
  } finally {
    this._updatedAt = new Date();
  }
}
```

**Key design details**:
- `compact()` requires a sessionId — throws if none exists (can't compact a session that hasn't started)
- Uses the same `stopped -> working -> stopped|error` transition as `run()`
- Same double-invocation guard — can't compact while running or while another compact is in progress
- Events from the adapter during compaction flow through to registered handlers
- Token metrics saved to metadata so consumers can observe the effect

### How Compact Works at the Adapter Level

**Claude Code adapter** (`claude-code.adapter.ts:312-317`):
- Delegates to `run({ prompt: '/compact', sessionId })` — sends `/compact` as a prompt to the CLI
- This triggers Claude Code's built-in context compaction
- Returns an `AgentResult` with potentially reduced token counts

**Copilot SDK adapter** (`sdk-copilot-adapter.ts:355-401`):
- Does NOT call `run()` (would destroy the session in the `finally` block)
- Explicitly resumes the session, sends `/compact` as a message, keeps session alive
- Returns an `AgentResult` with compaction status

Both adapters return `AgentResult` — the `AgentInstance` layer treats them uniformly.

### terminate() on AgentInstance

For completeness, terminate also follows the cohesive pattern:

```typescript
async terminate(): Promise<AgentResult> {
  if (!this._sessionId) {
    // Nothing to terminate — just set status
    this._status = 'stopped';
    return { output: '', sessionId: '', status: 'killed', exitCode: 137, tokens: null };
  }

  try {
    const result = await this._adapter.terminate(this._sessionId);
    this._status = 'stopped';
    return result;
  } catch {
    this._status = 'stopped'; // Terminate always ends in stopped
    throw;
  } finally {
    this._updatedAt = new Date();
  }
}
```

**Key difference from run/compact**: Terminate doesn't transition through `working` — it's an immediate forced stop. Status always ends at `stopped` regardless of whether the adapter call succeeded.

---

## How It Works Internally

### Current Flow (AgentService)

```
CLI options → validateAgentType → AgentService.run(options) → AgentResult JSON
```

### New Flow (AgentManagerService)

```typescript
async function handleAgentRun(options: RunOptions): Promise<void> {
  const agentType = validateAgentType(options.type);
  const prompt = await resolvePrompt(options);

  // 1. Get AgentManagerService from DI container
  const container = createCliProductionContainer();
  const agentManager = container.resolve<IAgentManagerService>(
    CLI_DI_TOKENS.AGENT_MANAGER   // NEW token replacing AGENT_SERVICE
  );

  // 2. Create instance: getNew or getWithSessionId
  const params: CreateAgentParams = {
    name: options.name ?? `agent-${agentType}`,
    type: agentType,
    workspace: options.cwd ?? process.cwd(),
    metadata: parseMetaOptions(options.meta),
  };

  const instance = options.session
    ? agentManager.getWithSessionId(options.session, params)
    : agentManager.getNew(params);

  // 3. Attach event handler based on output mode
  if (options.stream) {
    instance.addEventHandler(ndjsonEventHandler);
  } else if (!options.quiet) {
    instance.addEventHandler(
      createTerminalEventHandler(instance.name, { verbose: options.verbose })
    );
  }

  // 4. Run
  const result = await instance.run({
    prompt,
    cwd: options.cwd ?? process.cwd(),
  });

  // 5. Output result summary
  printSessionInfo(instance, result);
  process.exit(result.status === 'completed' ? 0 : 1);
}
```

**Key changes from current**:
- `AgentService` replaced by `AgentManagerService`
- Instance created via `getNew()` or `getWithSessionId()`
- Event handlers registered on `AgentInstance` (not as callback to `service.run()`)
- Human-readable output as default (not JSON)
- DI token changes from `CLI_DI_TOKENS.AGENT_SERVICE` to `CLI_DI_TOKENS.AGENT_MANAGER`

### New Flow: Compact (AgentManagerService)

```typescript
async function handleAgentCompact(options: CompactOptions): Promise<void> {
  const agentType = validateAgentType(options.type);

  // 1. Get AgentManagerService from DI container
  const container = createCliProductionContainer();
  const agentManager = container.resolve<IAgentManagerService>(
    CLI_DI_TOKENS.AGENT_MANAGER
  );

  // 2. Get instance with the session to compact
  const params: CreateAgentParams = {
    name: `compact-${agentType}`,
    type: agentType,
    workspace: options.cwd ?? process.cwd(),
  };

  const instance = agentManager.getWithSessionId(options.session, params);

  // 3. Compact — transitions stopped -> working -> stopped
  const result = await instance.compact();

  // 4. Output
  printCompactResult(result);
  process.exit(result.status === 'completed' ? 0 : 1);
}
```

**Why this is better than the old path**: In a long-lived process (orchestration, web server), a managed instance already exists for the session. Calling `agentManager.getWithSessionId()` returns the **same instance** (same-instance guarantee), so the compact happens on the actual running agent object — token metrics, status transitions, and event handlers all stay cohesive. No separate `AgentService` creating a throwaway adapter.

---

## Terminal Output Modes

### Default Mode (Human-Readable)

```
$ cg agent run -t claude-code -p "Create a fibonacci function in TypeScript"

[agent-claude-code] I'll create a fibonacci function in TypeScript.
[agent-claude-code] [tool] Write: fibonacci.ts
[agent-claude-code] [tool] Bash: npx tsc --noEmit fibonacci.ts
[agent-claude-code] Created fibonacci.ts with an iterative implementation.

---
Status:    completed
Session:   ses-abc123
Duration:  12.4s
```

The `[name]` prefix uses `instance.name` (defaults to `agent-<type>`, overridable via `--name`).

### Verbose Mode

```
$ cg agent run -t claude-code -p "Create a fibonacci function" --verbose

[agent-claude-code] [thinking] The user wants a fibonacci function. I'll use an iterative
  approach for better performance...
[agent-claude-code] I'll create a fibonacci function in TypeScript.
[agent-claude-code] [tool] Write: fibonacci.ts
  > function fibonacci(n: number): number {
      if (n <= 1) return n;
      let a = 0, b = 1;
      for (let i = 2; i <= n; i++) { [a, b] = [b, a + b]; }
      return b;
    }
[agent-claude-code] [tool] Bash: npx tsc --noEmit fibonacci.ts
  > (no errors)
[agent-claude-code] Created fibonacci.ts with an iterative implementation.

---
Status:    completed
Session:   ses-abc123
Duration:  12.4s
```

Verbose adds: `thinking` events and `tool_result` content.

### Stream Mode (NDJSON)

```
$ cg agent run -t claude-code -p "Create a fibonacci function" --stream

{"type":"thinking","timestamp":"2026-02-16T10:00:01Z","data":{"content":"The user wants..."}}
{"type":"text_delta","timestamp":"2026-02-16T10:00:02Z","data":{"content":"I'll create"}}
{"type":"tool_call","timestamp":"2026-02-16T10:00:03Z","data":{"toolName":"Write","toolCallId":"tc-1","input":{"path":"fibonacci.ts"}}}
{"type":"tool_result","timestamp":"2026-02-16T10:00:04Z","data":{"toolCallId":"tc-1","output":"File written","isError":false}}
{"type":"message","timestamp":"2026-02-16T10:00:05Z","data":{"content":"Created fibonacci.ts"}}
{"status":"completed","sessionId":"ses-abc123","output":"Created fibonacci.ts..."}
```

Final line is the `AgentResult` object (same as current behavior).

### Quiet Mode

```
$ cg agent run -t claude-code -p "Create a fibonacci function" --quiet

---
Status:    completed
Session:   ses-abc123
Duration:  12.4s
```

Only the result summary. No events.

---

## Event Handler Implementation

```typescript
function createTerminalEventHandler(
  name: string,
  options: { verbose?: boolean } = {},
): AgentEventHandler {
  return (event: AgentEvent) => {
    const prefix = `[${name}]`;

    switch (event.type) {
      case 'text_delta':
        process.stdout.write(`${prefix} ${event.data.content}`);
        break;

      case 'message':
        console.log(`${prefix} ${event.data.content}`);
        break;

      case 'tool_call':
        console.log(
          `${prefix} [tool] ${event.data.toolName}: ${truncate(JSON.stringify(event.data.input), 100)}`
        );
        break;

      case 'tool_result':
        if (event.data.isError) {
          console.error(`${prefix} [tool error] ${truncate(event.data.output, 200)}`);
        } else if (options.verbose) {
          console.log(`${prefix}   > ${truncate(event.data.output, 200)}`);
        }
        break;

      case 'thinking':
        if (options.verbose) {
          console.log(`${prefix} [thinking] ${truncate(event.data.content, 200)}`);
        }
        break;
    }
  };
}

function ndjsonEventHandler(event: AgentEvent): void {
  console.log(JSON.stringify(event));
}
```

---

## Session Chaining via CLI

Each CLI invocation is a separate process. The `--session` flag is the only thread linking them. The sessionId maps to Claude Code's on-disk conversation history or Copilot SDK's session state.

```bash
# Turn 1: New session
$ cg agent run -t claude-code -p "Write a hello world in Python"
...
Session:   ses-abc123

# Turn 2: Resume (agent remembers turn 1)
$ cg agent run -t claude-code -s ses-abc123 -p "Add error handling to that script"
...
Session:   ses-def456

# Turn 3: Continue the chain
$ cg agent run -t claude-code -s ses-def456 -p "Now add unit tests"
...
Session:   ses-ghi789
```

**How it maps to AgentManagerService**:
- Turn 1: `agentManager.getNew(params)` — fresh instance, no session
- Turn 2: `agentManager.getWithSessionId('ses-abc123', params)` — instance with session baked in
- Turn 3: `agentManager.getWithSessionId('ses-def456', params)` — instance with session baked in

**Important nuance**: In CLI mode (ephemeral process), the same-instance guarantee doesn't apply. Each invocation creates a new `AgentManagerService` in-memory. But the `sessionId` ensures adapter-level continuity (Claude Code resumes the conversation from disk). The same-instance guarantee matters for long-lived processes (orchestration, web server) where multiple consumers reference the same running agent.

---

## DI Container Changes

### Current Wiring

```typescript
// apps/cli/src/lib/container.ts
const adapterFactory: AdapterFactory = (agentType: string): IAgentAdapter => {
  if (agentType === 'claude-code') {
    return new ClaudeCodeAdapter(processManager, { logger });
  }
  if (agentType === 'copilot') {
    return new SdkCopilotAdapter(copilotClient, { logger });
  }
  throw new Error(`Unknown agent type: ${agentType}`);
};

const agentService = new AgentService(adapterFactory, configService, logger);
container.registerInstance(CLI_DI_TOKENS.AGENT_SERVICE, agentService);
```

### New Wiring

```typescript
// apps/cli/src/lib/container.ts

// AdapterFactory stays the same — it creates IAgentAdapter instances
const adapterFactory: AdapterFactory = (agentType: string): IAgentAdapter => {
  if (agentType === 'claude-code') {
    return new ClaudeCodeAdapter(processManager, { logger });
  }
  if (agentType === 'copilot') {
    return new SdkCopilotAdapter(copilotClient, { logger });
  }
  throw new Error(`Unknown agent type: ${agentType}`);
};

// NEW: AgentManagerService replaces AgentService for all agent commands
const agentManager = new AgentManagerService(adapterFactory);
container.registerInstance(CLI_DI_TOKENS.AGENT_MANAGER, agentManager);

// AgentService is NO LONGER registered. All commands go through AgentManagerService.
// The timeout enforcement that AgentService provided will move to AgentInstance.run()
// (or the CLI handler can wrap with Promise.race if needed).
```

**Single path**: Both `cg agent run` and `cg agent compact` use `AgentManagerService`. No parallel `AgentService` registration. This gives a cohesive view — every operation goes through the same instance, same event handlers, same session index.

---

## E2E Testing Strategy

### Layer Overview

Plan 034 tests the agent system **in isolation** (no workflows). Three test tiers:

```
Tier 1: UNIT TESTS (fast, no real agents)
  AgentInstance + AgentManagerService with FakeAgentAdapter
  Contract tests: FakeAgentInstance <-> AgentInstance parity
  Runs in CI. < 5 seconds.

Tier 2: REAL AGENT INTEGRATION TESTS (both adapters, skipped by default)
  AgentInstance wrapping real ClaudeCodeAdapter / SdkCopilotAdapter
  New session, session resume, multi-handler events, parallel
  describe.skipIf(!hasClaudeCli()) / describe.skipIf(!hasCopilotSdk())
  30-120 seconds per test. Run manually.

Tier 3: CLI E2E (shell out to cg agent run, skipped by default)
  Spawn actual CLI process, verify stdout/exit codes
  Session chaining across CLI invocations
  describe.skipIf(!existsSync(CLI_PATH) || !hasClaudeCli())
  60-180 seconds. Run manually.
```

### Tier 1: Unit Tests (Fast, No Real Agents)

These run with `FakeAgentAdapter` and prove the redesigned interfaces work correctly.

#### AgentInstance Unit Tests

```typescript
describe('AgentInstance', () => {
  let adapter: FakeAgentAdapter;
  let instance: AgentInstance;

  beforeEach(() => {
    adapter = new FakeAgentAdapter();
    instance = new AgentInstance({
      id: 'test-1',
      name: 'test-agent',
      type: 'claude-code',
      workspace: '/tmp/test',
      adapter,
    });
  });

  // --- Status Transitions ---

  it('starts with status stopped', () => {
    expect(instance.status).toBe('stopped');
    expect(instance.isRunning).toBe(false);
  });

  it('transitions stopped -> working -> stopped on successful run', async () => {
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });

    const statusLog: string[] = [];
    // Could observe via event or polling — implementation detail

    await instance.run({ prompt: 'test' });

    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBe('ses-1');
  });

  it('transitions to error on failed run', async () => {
    adapter.setNextResult({ status: 'failed', output: '', sessionId: null });

    await instance.run({ prompt: 'test' });

    expect(instance.status).toBe('error');
  });

  it('throws on double-run (concurrent guard)', async () => {
    adapter.setRunDelay(100);
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });

    const firstRun = instance.run({ prompt: 'test' });

    await expect(instance.run({ prompt: 'test2' })).rejects.toThrow(/already running/i);

    await firstRun;
  });

  // --- Event Pass-Through ---

  it('passes adapter events to registered handlers', async () => {
    const events: AgentEvent[] = [];
    instance.addEventHandler((e) => events.push(e));

    adapter.setNextResult({ status: 'completed', output: 'hi', sessionId: 'ses-1' });
    // FakeAgentAdapter emits events during run

    await instance.run({ prompt: 'test' });

    expect(events.length).toBeGreaterThan(0);
  });

  it('multiple handlers receive same events', async () => {
    const handler1Events: AgentEvent[] = [];
    const handler2Events: AgentEvent[] = [];
    instance.addEventHandler((e) => handler1Events.push(e));
    instance.addEventHandler((e) => handler2Events.push(e));

    adapter.setNextResult({ status: 'completed', output: 'hi', sessionId: 'ses-1' });
    await instance.run({ prompt: 'test' });

    expect(handler1Events.length).toBe(handler2Events.length);
    for (let i = 0; i < handler1Events.length; i++) {
      expect(handler1Events[i]).toBe(handler2Events[i]); // Same object reference
    }
  });

  it('removeEventHandler stops delivery', async () => {
    const events: AgentEvent[] = [];
    const handler = (e: AgentEvent) => events.push(e);
    instance.addEventHandler(handler);
    instance.removeEventHandler(handler);

    adapter.setNextResult({ status: 'completed', output: 'hi', sessionId: 'ses-1' });
    await instance.run({ prompt: 'test' });

    expect(events.length).toBe(0);
  });

  it('per-run onEvent receives events alongside handlers', async () => {
    const handlerEvents: AgentEvent[] = [];
    const runEvents: AgentEvent[] = [];

    instance.addEventHandler((e) => handlerEvents.push(e));
    adapter.setNextResult({ status: 'completed', output: 'hi', sessionId: 'ses-1' });

    await instance.run({ prompt: 'test', onEvent: (e) => runEvents.push(e) });

    expect(handlerEvents.length).toBe(runEvents.length);
  });

  // --- Session Tracking ---

  it('sessionId is null before first run', () => {
    expect(instance.sessionId).toBeNull();
  });

  it('sessionId updates from adapter result', async () => {
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-new' });
    await instance.run({ prompt: 'test' });
    expect(instance.sessionId).toBe('ses-new');
  });

  it('sessionId can be set at creation', () => {
    const inst = new AgentInstance({
      id: 'test-2',
      name: 'resumed',
      type: 'claude-code',
      workspace: '/tmp/test',
      adapter,
      sessionId: 'ses-existing',
    });
    expect(inst.sessionId).toBe('ses-existing');
  });

  // --- Metadata ---

  it('metadata is set at creation and updatable', () => {
    const inst = new AgentInstance({
      id: 'test-3',
      name: 'meta-test',
      type: 'claude-code',
      workspace: '/tmp/test',
      adapter,
      metadata: { project: 'demo' },
    });

    expect(inst.metadata.project).toBe('demo');

    inst.setMetadata('version', '2.0');
    expect(inst.metadata.version).toBe('2.0');
    expect(inst.metadata.project).toBe('demo'); // Preserved
  });

  // --- Compact ---

  it('compact transitions stopped -> working -> stopped', async () => {
    // First run to get a sessionId
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });
    await instance.run({ prompt: 'setup' });

    // Now compact
    adapter.setNextCompactResult({ status: 'completed', output: 'compacted', sessionId: 'ses-1', tokens: { used: 500, total: 8000, limit: 200000 } });
    await instance.compact();

    expect(instance.status).toBe('stopped');
    expect(instance.metadata.lastTokens).toEqual({ used: 500, total: 8000, limit: 200000 });
  });

  it('compact throws if no session', async () => {
    // No run yet — no session
    await expect(instance.compact()).rejects.toThrow(/no session/i);
  });

  it('compact throws if already running', async () => {
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });
    await instance.run({ prompt: 'setup' });

    adapter.setRunDelay(100);
    adapter.setNextCompactResult({ status: 'completed', output: 'ok', sessionId: 'ses-1' });
    const compacting = instance.compact();

    await expect(instance.compact()).rejects.toThrow(/already running/i);
    await compacting;
  });

  it('compact transitions to error on failure', async () => {
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });
    await instance.run({ prompt: 'setup' });

    adapter.setNextCompactResult({ status: 'failed', output: '', sessionId: 'ses-1' });
    await instance.compact();

    expect(instance.status).toBe('error');
  });

  // --- Terminate ---

  it('terminate delegates to adapter and sets status', async () => {
    await instance.terminate();
    expect(instance.status).toBe('stopped');
  });
});
```

#### AgentManagerService Unit Tests

```typescript
describe('AgentManagerService', () => {
  let adapter: FakeAgentAdapter;
  let adapterFactory: AdapterFactory;
  let manager: AgentManagerService;

  beforeEach(() => {
    adapter = new FakeAgentAdapter();
    adapterFactory = () => adapter;
    manager = new AgentManagerService(adapterFactory);
  });

  const baseParams = {
    name: 'test-agent',
    type: 'claude-code' as const,
    workspace: '/tmp/test',
  };

  // --- getNew ---

  it('getNew creates instance with no session', () => {
    const instance = manager.getNew(baseParams);
    expect(instance.sessionId).toBeNull();
    expect(instance.name).toBe('test-agent');
    expect(instance.type).toBe('claude-code');
  });

  it('getNew creates distinct instances each call', () => {
    const a = manager.getNew(baseParams);
    const b = manager.getNew(baseParams);
    expect(a).not.toBe(b);
    expect(a.id).not.toBe(b.id);
  });

  // --- getWithSessionId ---

  it('getWithSessionId creates instance with session', () => {
    const instance = manager.getWithSessionId('ses-123', baseParams);
    expect(instance.sessionId).toBe('ses-123');
  });

  it('getWithSessionId same sessionId returns same instance (===)', () => {
    const a = manager.getWithSessionId('ses-123', baseParams);
    const b = manager.getWithSessionId('ses-123', baseParams);
    expect(a).toBe(b); // Same object reference
  });

  it('getWithSessionId different sessionId returns different instance', () => {
    const a = manager.getWithSessionId('ses-123', baseParams);
    const b = manager.getWithSessionId('ses-456', baseParams);
    expect(a).not.toBe(b);
  });

  // --- getAgent / getAgents ---

  it('getAgent returns instance by ID', () => {
    const instance = manager.getNew(baseParams);
    expect(manager.getAgent(instance.id)).toBe(instance);
  });

  it('getAgent returns null for unknown ID', () => {
    expect(manager.getAgent('nonexistent')).toBeNull();
  });

  it('getAgents returns all instances', () => {
    manager.getNew(baseParams);
    manager.getNew(baseParams);
    expect(manager.getAgents()).toHaveLength(2);
  });

  it('getAgents with filter', () => {
    manager.getNew({ ...baseParams, type: 'claude-code' });
    manager.getNew({ ...baseParams, type: 'copilot' });
    const claudeOnly = manager.getAgents({ type: 'claude-code' });
    expect(claudeOnly).toHaveLength(1);
  });

  // --- terminateAgent ---

  it('terminateAgent removes from both maps', async () => {
    const instance = manager.getWithSessionId('ses-123', baseParams);
    await manager.terminateAgent(instance.id);

    expect(manager.getAgent(instance.id)).toBeNull();
    // Same sessionId no longer returns old instance
    const fresh = manager.getWithSessionId('ses-123', baseParams);
    expect(fresh).not.toBe(instance);
  });

  // --- Session Index Update ---

  it('session index updates after run gives new sessionId', async () => {
    const instance = manager.getNew(baseParams);
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-new' });

    await instance.run({ prompt: 'test' });

    // Now getWithSessionId('ses-new') should return the same instance
    const retrieved = manager.getWithSessionId('ses-new', baseParams);
    expect(retrieved).toBe(instance);
  });
});
```

#### Contract Tests (Shared Suite)

```typescript
function agentInstanceContractTests(
  name: string,
  factory: () => { instance: IAgentInstance; adapter: FakeAgentAdapter },
) {
  describe(`IAgentInstance contract: ${name}`, () => {
    let instance: IAgentInstance;
    let adapter: FakeAgentAdapter;

    beforeEach(() => {
      ({ instance, adapter } = factory());
    });

    it('starts with status stopped', () => {
      expect(instance.status).toBe('stopped');
    });

    it('run transitions to stopped on success', async () => {
      adapter.setNextResult({ status: 'completed', output: 'ok', sessionId: 'ses-1' });
      await instance.run({ prompt: 'test' });
      expect(instance.status).toBe('stopped');
    });

    it('run transitions to error on failure', async () => {
      adapter.setNextResult({ status: 'failed', output: '', sessionId: null });
      await instance.run({ prompt: 'test' });
      expect(instance.status).toBe('error');
    });

    it('double-run guard', async () => {
      adapter.setRunDelay(50);
      adapter.setNextResult({ status: 'completed', output: 'ok', sessionId: 'ses-1' });
      const first = instance.run({ prompt: 'test' });
      await expect(instance.run({ prompt: 'test2' })).rejects.toThrow();
      await first;
    });

    it('event pass-through', async () => {
      const events: AgentEvent[] = [];
      instance.addEventHandler((e) => events.push(e));
      adapter.setNextResult({ status: 'completed', output: 'ok', sessionId: 'ses-1' });
      await instance.run({ prompt: 'test' });
      expect(events.length).toBeGreaterThan(0);
    });

    it('sessionId updates from result', async () => {
      adapter.setNextResult({ status: 'completed', output: 'ok', sessionId: 'ses-updated' });
      await instance.run({ prompt: 'test' });
      expect(instance.sessionId).toBe('ses-updated');
    });

    it('compact transitions stopped -> working -> stopped', async () => {
      adapter.setNextResult({ status: 'completed', output: 'ok', sessionId: 'ses-1' });
      await instance.run({ prompt: 'setup' });
      adapter.setNextCompactResult({ status: 'completed', output: 'ok', sessionId: 'ses-1' });
      await instance.compact();
      expect(instance.status).toBe('stopped');
    });

    it('compact throws without session', async () => {
      await expect(instance.compact()).rejects.toThrow();
    });

    it('metadata set and get', () => {
      instance.setMetadata('key', 'value');
      expect(instance.metadata.key).toBe('value');
    });

    it('isRunning is false when stopped', () => {
      expect(instance.isRunning).toBe(false);
    });
  });
}

// Run against both implementations
agentInstanceContractTests('AgentInstance (real)', () => {
  const adapter = new FakeAgentAdapter();
  return {
    instance: new AgentInstance({
      id: 'real-1', name: 'test', type: 'claude-code',
      workspace: '/tmp', adapter,
    }),
    adapter,
  };
});

agentInstanceContractTests('FakeAgentInstance', () => {
  const adapter = new FakeAgentAdapter();
  return {
    instance: new FakeAgentInstance({
      id: 'fake-1', name: 'test', type: 'claude-code',
      workspace: '/tmp', adapter,
    }),
    adapter,
  };
});
```

---

### Tier 2: Real Agent Integration Tests

These run against real Claude Code CLI and Copilot SDK. Skipped by default. Prove the redesigned AgentInstance works with real adapters.

#### File Location

```
test/integration/agent-instance-real.test.ts
```

#### Skip Logic

```typescript
import { execSync } from 'node:child_process';

function hasClaudeCli(): boolean {
  try {
    execSync('claude --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function hasCopilotSdk(): boolean {
  try {
    execSync('npx -y @github/copilot --version', { stdio: 'ignore', timeout: 30000 });
    return true;
  } catch {
    return false;
  }
}
```

**Design decision**: Use `describe.skipIf(!hasClaudeCli())` not `describe.skip`. This way the tests auto-run when the CLI is available (dev machine) and auto-skip when it isn't (CI). Same pattern as the existing `test/integration/real-agent-multi-turn.test.ts`.

#### Test: New Session (Claude Code)

```typescript
describe.skipIf(!hasClaudeCli())(
  'AgentInstance with ClaudeCodeAdapter',
  { timeout: 120_000 },
  () => {
    let manager: AgentManagerService;

    beforeAll(() => {
      const processManager = new UnixProcessManager(new FakeLogger());
      const adapterFactory: AdapterFactory = () =>
        new ClaudeCodeAdapter(processManager, { logger: new FakeLogger() });
      manager = new AgentManagerService(adapterFactory);
    });

    it('creates new session and gets completed status', async () => {
      const instance = manager.getNew({
        name: 'test-new-session',
        type: 'claude-code',
        workspace: process.cwd(),
      });

      expect(instance.status).toBe('stopped');
      expect(instance.sessionId).toBeNull();

      const events: AgentEvent[] = [];
      instance.addEventHandler((e) => events.push(e));

      await instance.run({ prompt: 'What is 2+2? Reply with just the number.' });

      // Structural assertions (not content assertions)
      expect(instance.status).toBe('stopped');
      expect(instance.sessionId).toBeTruthy();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.type === 'text_delta' || e.type === 'message')).toBe(true);
    });
  }
);
```

#### Test: Session Resume (Claude Code)

```typescript
it('resumes session and agent retains context', async () => {
  // Turn 1: Establish context
  const instance1 = manager.getNew({
    name: 'resume-test',
    type: 'claude-code',
    workspace: process.cwd(),
  });

  await instance1.run({ prompt: 'Remember the word "pineapple". Just confirm you will remember it.' });

  const sessionId = instance1.sessionId;
  expect(sessionId).toBeTruthy();

  // Turn 2: Resume and verify context
  const instance2 = manager.getWithSessionId(sessionId!, {
    name: 'resume-test-t2',
    type: 'claude-code',
    workspace: process.cwd(),
  });

  // In CLI mode (ephemeral), same-instance guarantee doesn't apply
  // but the sessionId ensures adapter-level continuity

  await instance2.run({ prompt: 'What word did I ask you to remember? Say just the word.' });

  expect(instance2.status).toBe('stopped');
  expect(instance2.sessionId).toBeTruthy();

  // Cannot assert exact content ("pineapple") — LLM output is non-deterministic
  // But the test proves: (1) session resume didn't error, (2) agent completed
});
```

**Why not assert "pineapple"?** Real agents are non-deterministic. They might say "pineapple", "Pineapple", "The word was pineapple", or even get it wrong occasionally. Structural assertions (status, sessionId, events) are reliable. Content assertions are fragile. The existing `real-agent-multi-turn.test.ts` does check content loosely (`subjectWords.some(word => outputLower.includes(word))`) — we can do the same where useful, but the primary goal is proving the AgentInstance lifecycle works.

#### Test: Multiple Event Handlers (Claude Code)

```typescript
it('multiple handlers receive identical events', async () => {
  const instance = manager.getNew({
    name: 'multi-handler-test',
    type: 'claude-code',
    workspace: process.cwd(),
  });

  const handler1Events: AgentEvent[] = [];
  const handler2Events: AgentEvent[] = [];

  instance.addEventHandler((e) => handler1Events.push(e));
  instance.addEventHandler((e) => handler2Events.push(e));

  await instance.run({ prompt: 'Say hello in one word.' });

  expect(handler1Events.length).toBeGreaterThan(0);
  expect(handler1Events.length).toBe(handler2Events.length);

  // Same object references (not copies)
  for (let i = 0; i < handler1Events.length; i++) {
    expect(handler1Events[i]).toBe(handler2Events[i]);
  }
});
```

#### Test: Parallel Agents (Claude Code)

```typescript
it('two agents run concurrently with independent sessions', async () => {
  const instanceA = manager.getNew({
    name: 'parallel-a',
    type: 'claude-code',
    workspace: process.cwd(),
  });
  const instanceB = manager.getNew({
    name: 'parallel-b',
    type: 'claude-code',
    workspace: process.cwd(),
  });

  const start = Date.now();

  // Run both in parallel
  const [resultA, resultB] = await Promise.all([
    instanceA.run({ prompt: 'What is 1+1? Reply with just the number.' }),
    instanceB.run({ prompt: 'What is 3+3? Reply with just the number.' }),
  ]);

  const elapsed = Date.now() - start;

  expect(instanceA.status).toBe('stopped');
  expect(instanceB.status).toBe('stopped');
  expect(instanceA.sessionId).toBeTruthy();
  expect(instanceB.sessionId).toBeTruthy();
  expect(instanceA.sessionId).not.toBe(instanceB.sessionId);

  // If truly parallel, total time should be less than 2x a single run
  // (Can't assert precisely — just log for visibility)
  console.log(`Parallel execution took ${elapsed}ms`);
});
```

#### Test: Compact Session (Claude Code)

```typescript
it('compact reduces session context without losing continuity', async () => {
  // Turn 1: Establish context with enough content to be compactable
  const instance = manager.getNew({
    name: 'compact-test',
    type: 'claude-code',
    workspace: process.cwd(),
  });

  await instance.run({
    prompt: 'Write a detailed explanation of the Fibonacci sequence, including history, formula, and code examples in 3 languages.',
  });

  const sessionId = instance.sessionId;
  expect(sessionId).toBeTruthy();

  // Compact the session
  const compactResult = await instance.compact();
  expect(compactResult.status).toBe('completed');
  expect(instance.status).toBe('stopped');
  // Session should still be valid (same or updated)
  expect(instance.sessionId).toBeTruthy();

  // Turn 2: Resume after compact — session still works
  await instance.run({
    prompt: 'What topic were we discussing? Reply briefly.',
  });

  expect(instance.status).toBe('stopped');
  // Agent completed — session continuity survived compaction
});
```

#### Copilot SDK Tests (Same Pattern)

Same five tests repeated with `SdkCopilotAdapter`:

```typescript
describe.skipIf(!hasCopilotSdk())(
  'AgentInstance with SdkCopilotAdapter',
  { timeout: 120_000 },
  () => {
    let manager: AgentManagerService;
    let copilotClient: CopilotClient;

    beforeAll(async () => {
      const { CopilotClient: CC } = await import('@github/copilot-sdk');
      copilotClient = new CC();

      const adapterFactory: AdapterFactory = () =>
        new SdkCopilotAdapter(copilotClient, { logger: new FakeLogger() });
      manager = new AgentManagerService(adapterFactory);
    });

    afterAll(async () => {
      await copilotClient.stop();
    });

    // Same 5 tests as Claude Code:
    // - New session
    // - Session resume
    // - Multiple event handlers
    // - Parallel agents
    // - Compact session
  }
);
```

#### Cross-Adapter Parity Test

```typescript
describe.skipIf(!hasClaudeCli() || !hasCopilotSdk())(
  'Cross-Adapter Parity',
  { timeout: 120_000 },
  () => {
    it('both adapters produce text events for simple prompt', async () => {
      // Run same prompt through both adapters
      // Assert both produce at least text_delta or message events
      // Assert both return completed status and non-null sessionId
    });

    it('both adapters support session resume', async () => {
      // Run turn 1, then turn 2 with sessionId for both
      // Assert both complete without error on resume
    });

    it('both adapters support compact', async () => {
      // Run a prompt, then compact, then resume for both
      // Assert compact completes and session remains usable
    });
  }
);
```

---

### Tier 3: CLI E2E Tests

These spawn actual `cg agent run` CLI processes and verify stdout, exit codes, and session chaining.

#### File Location

```
test/e2e/agent-cli-e2e.test.ts
```

#### Pattern: Shell Out to CLI

Follows the established E2E pattern from Plan 030:

```typescript
import { execSync, type ExecSyncOptions } from 'node:child_process';
import { resolve } from 'node:path';

const CLI_PATH = resolve(__dirname, '../../apps/cli/dist/bin/cg.js');

function runAgentCli(args: string[], options: ExecSyncOptions = {}): string {
  const cmd = `node ${CLI_PATH} agent ${args.join(' ')}`;
  return execSync(cmd, {
    encoding: 'utf-8',
    timeout: 120_000,
    ...options,
  });
}
```

#### Test: New Session via CLI

```typescript
describe.skipIf(!existsSync(CLI_PATH) || !hasClaudeCli())(
  'cg agent run CLI E2E',
  { timeout: 180_000 },
  () => {
    it('new session returns session ID and exits 0', () => {
      const output = runAgentCli([
        'run', '-t', 'claude-code',
        '-p', '"What is 2+2? Reply with just the number."',
        '--quiet',
      ]);

      // Quiet mode: only result summary
      expect(output).toContain('Status:');
      expect(output).toContain('Session:');
      expect(output).toMatch(/Session:\s+\S+/); // Non-empty session ID
    });
  }
);
```

#### Test: Session Chaining via CLI

```typescript
it('session chaining across CLI invocations', () => {
  // Turn 1
  const output1 = runAgentCli([
    'run', '-t', 'claude-code',
    '-p', '"Remember the number 42. Confirm."',
    '--quiet',
  ]);

  const sessionMatch = output1.match(/Session:\s+(\S+)/);
  expect(sessionMatch).toBeTruthy();
  const sessionId = sessionMatch![1];

  // Turn 2: Resume
  const output2 = runAgentCli([
    'run', '-t', 'claude-code',
    '-s', sessionId,
    '-p', '"What number did I ask you to remember?"',
    '--quiet',
  ]);

  expect(output2).toContain('Status:');
  expect(output2).toMatch(/completed/i);
  // Session continues (new or same sessionId returned)
  expect(output2).toMatch(/Session:\s+\S+/);
});
```

#### Test: Compact via CLI

```typescript
it('compact session and continue', () => {
  // Turn 1: Create session with some content
  const output1 = runAgentCli([
    'run', '-t', 'claude-code',
    '-p', '"Explain the Fibonacci sequence in detail."',
    '--quiet',
  ]);

  const sessionMatch = output1.match(/Session:\s+(\S+)/);
  expect(sessionMatch).toBeTruthy();
  const sessionId = sessionMatch![1];

  // Compact
  const compactOutput = runAgentCli([
    'compact', '-t', 'claude-code',
    '-s', sessionId,
  ]);

  expect(compactOutput).toMatch(/completed/i);

  // Turn 2: Resume after compact — session still works
  const output2 = runAgentCli([
    'run', '-t', 'claude-code',
    '-s', sessionId,
    '-p', '"What were we discussing?"',
    '--quiet',
  ]);

  expect(output2).toMatch(/completed/i);
  expect(output2).toMatch(/Session:\s+\S+/);
});
```

#### Test: Stream Mode NDJSON

```typescript
it('--stream outputs NDJSON events', () => {
  const output = runAgentCli([
    'run', '-t', 'claude-code',
    '-p', '"Say hello."',
    '--stream',
  ]);

  const lines = output.trim().split('\n');
  expect(lines.length).toBeGreaterThan(1);

  // Each line should be valid JSON
  for (const line of lines) {
    expect(() => JSON.parse(line)).not.toThrow();
  }

  // Should contain at least one text event and final result
  const events = lines.map((l) => JSON.parse(l));
  const hasTextEvent = events.some(
    (e) => e.type === 'text_delta' || e.type === 'message'
  );
  expect(hasTextEvent).toBe(true);

  // Last line should be the result with status
  const last = events[events.length - 1];
  expect(last.status).toBe('completed');
  expect(last.sessionId).toBeTruthy();
});
```

---

## Non-Determinism Handling

### What We CAN Assert

| Property | Assertion | Why Reliable |
|----------|-----------|--------------|
| Status | `expect(status).toBe('stopped')` | Adapter always reports completion status |
| SessionId | `expect(sessionId).toBeTruthy()` | Claude Code always returns session IDs |
| Event count | `expect(events.length).toBeGreaterThan(0)` | Any prompt produces events |
| Event types | `expect(events.some(e => e.type === 'text_delta'))` | Text output always happens |
| Exit code | `expect(exitCode).toBe(0)` | Successful run always exits 0 |
| Handler parity | `handler1.length === handler2.length` | Same events dispatched to all handlers |

### What We CANNOT Assert

| Property | Why Unreliable |
|----------|----------------|
| Exact output text | LLM output varies between runs |
| Specific event count | Depends on model's internal processing |
| Event ordering details | Some events may batch differently |
| Timing | Network latency, model load time vary |
| Content of context retention | Agent may not repeat exact words |

### Soft Content Assertions (Where Useful)

Following the pattern from `real-agent-multi-turn.test.ts`:

```typescript
// Loose content check — useful but not critical
const outputLower = result.output.toLowerCase();
const hasContext = ['pineapple'].some((word) => outputLower.includes(word));
if (!hasContext) {
  console.warn('Agent may not have retained context — output:', result.output);
}
// Don't fail the test on content — log for visibility
```

---

## Relationship to Existing Real Agent Tests

### What Exists (Keep As-Is)

| File | Level | What It Tests |
|------|-------|---------------|
| `test/integration/real-agent-multi-turn.test.ts` | `IAgentAdapter` | Raw adapter 3-turn session: poem, tool use, context |
| `test/integration/sdk-copilot-adapter.test.ts` | `IAgentAdapter` | Copilot SDK: events, session, compact, terminate |
| `test/integration/claude-code-adapter.test.ts` | `IAgentAdapter` | Claude CLI: placeholder stubs only |

### What Plan 034 Adds

| File | Level | What It Tests |
|------|-------|---------------|
| `test/unit/agent-instance.test.ts` | `AgentInstance` | Unit tests with FakeAgentAdapter |
| `test/unit/agent-manager-service.test.ts` | `AgentManagerService` | Unit tests with FakeAgentAdapter |
| `test/unit/agent-instance-contract.test.ts` | Contract | Parity: Real vs Fake |
| `test/integration/agent-instance-real.test.ts` | `AgentInstance` + real adapter | New session, resume, handlers, parallel |
| `test/e2e/agent-cli-e2e.test.ts` | CLI process | Shell-out tests with session chaining |

**Two validation layers**: Old tests prove adapters work. New tests prove the AgentInstance wrapper around those adapters works. No duplication — different abstraction levels.

---

## File Placement (PlanPak)

Per the spec's PlanPak file management:

```
packages/shared/src/features/034-agentic-cli/
  agent-instance.ts              # AgentInstance implementation
  agent-instance.interface.ts    # IAgentInstance (redesigned)
  agent-manager-service.ts       # AgentManagerService implementation
  agent-manager-service.interface.ts  # IAgentManagerService
  types.ts                       # CreateAgentParams, AgentInstanceConfig, etc.
  fakes/
    fake-agent-instance.ts       # FakeAgentInstance
    fake-agent-manager-service.ts # FakeAgentManagerService

apps/cli/src/features/034-agentic-cli/
  agent-run-handler.ts           # Updated handleAgentRun (extracted from command)
  terminal-event-handler.ts      # createTerminalEventHandler, ndjsonEventHandler
  parse-meta-options.ts          # --meta key=value parser

test/unit/features/034-agentic-cli/
  agent-instance.test.ts
  agent-manager-service.test.ts
  agent-instance-contract.test.ts
  terminal-event-handler.test.ts

test/integration/
  agent-instance-real.test.ts    # Real agent integration (both adapters)

test/e2e/
  agent-cli-e2e.test.ts          # CLI shell-out E2E
```

Old exports from `packages/shared/src/features/019-agent-manager-refactor/` redirect to new 034 location.

---

## Open Questions

### Q1: Should `--quiet` mode output JSON or human-readable?

**OPEN**: Currently the CLI always outputs JSON (even without `--stream`). The redesign adds human-readable default. Should `--quiet` output:
- Option A: Human-readable summary (Status/Session/Duration) — consistent with default mode
- Option B: JSON result (like current behavior) — useful for scripting

Leaning toward **Option A** for consistency, with `--stream` being the machine-readable option.

### Q2: How does AgentInstance update the session index on AgentManagerService?

**OPEN** (from spec OQ-01): When `AgentInstance.run()` or `AgentInstance.compact()` completes and gets a sessionId from the adapter, how does the manager's session index learn about it?

Options:
- **Option A**: Instance holds reference to manager, calls `manager._updateSessionIndex()` — tight coupling
- **Option B**: Manager registers an internal event handler on each instance that watches for session changes — event-driven
- **Option C**: Manager wraps `instance.run()` / `instance.compact()` to capture the result and update the index — proxy pattern

Leaning toward **Option B** — the manager attaches an internal handler at creation time. This works uniformly for both `run()` and `compact()` — any operation that produces a sessionId triggers the index update.

### Q3: Should the CLI create a new container per invocation?

**RESOLVED**: Yes. Each CLI invocation creates a fresh container via `createCliProductionContainer()`. This is the existing pattern and correct for ephemeral CLI processes. The container (and AgentManagerService) lives only for the duration of one command.

### Q4: What happens to AgentService timeout enforcement?

**OPEN**: The current `AgentService.run()` enforces a configurable timeout (default 10 minutes) via `Promise.race()`. With `AgentService` removed:
- Option A: Move timeout enforcement into `AgentInstance.run()` — instance accepts optional timeout in config
- Option B: CLI handler wraps `instance.run()` / `instance.compact()` with its own `Promise.race()` — consumer's responsibility
- Option C: `AgentManagerService` provides timeout configuration that instances inherit

Leaning toward **Option A** — the instance itself should enforce timeouts, since it's the universal entry point for all consumers (CLI, orchestration, web).

---

## Quick Reference

```bash
# New session
cg agent run -t claude-code -p "Your prompt here"

# Resume session
cg agent run -t claude-code -s ses-abc123 -p "Follow-up prompt"

# Compact a session (reduce context)
cg agent compact -t claude-code -s ses-abc123

# With metadata
cg agent run -t claude-code -p "Review PR" --name pr-reviewer --meta pr=42

# Verbose output (see thinking + tool results)
cg agent run -t claude-code -p "Build something" --verbose

# Machine-readable NDJSON
cg agent run -t claude-code -p "Do something" --stream

# Copilot instead of Claude
cg agent run -t copilot -p "Your prompt here"

# Prompt from file
cg agent run -t claude-code -f ./prompts/task.md

# Full lifecycle: run → compact → resume
cg agent run -t claude-code -p "Write a long analysis"   # → Session: ses-001
cg agent compact -t claude-code -s ses-001                # → Compacted
cg agent run -t claude-code -s ses-001 -p "Summarize"     # → Resumed
```

---

## Summary

This workshop covers the Phase A (agent system in isolation) CLI design:

1. **All agent commands go through AgentManagerService / AgentInstance** — no split paths. `run`, `compact`, and `terminate` are all on the instance with uniform status transitions and event pass-through
2. **`compact()` added to IAgentInstance** — transitions `stopped -> working -> stopped|error`, requires a sessionId, uses same double-invocation guard as `run()`
3. **AgentService removed from CLI wiring** — single cohesive path through AgentManagerService. Same-instance guarantee means compact operates on the actual managed instance
4. **Session chaining works via `--session` flag** — each invocation is a new process, sessionId provides adapter-level continuity
5. **Three output modes**: human-readable (default), verbose, NDJSON stream
6. **Three test tiers**: unit (fast, fakes), real integration (both adapters, skipped), CLI E2E (shell-out, skipped)
7. **Compact tested at all three tiers** — unit tests for status transitions/guards, real agent tests for session continuity after compact, CLI E2E for the full lifecycle (run -> compact -> resume)
8. **Non-deterministic real agent tests use structural assertions** — status, sessionId, event counts, not content
9. **Both Claude Code and Copilot SDK tested identically** — same test patterns, skip logic per adapter
10. **Existing adapter-level tests kept** — two validation layers (adapter + instance)
