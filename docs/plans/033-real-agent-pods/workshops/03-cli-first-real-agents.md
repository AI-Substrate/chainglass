# Workshop: CLI-First Real Agent Execution

**Type**: CLI Flow + Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: (pending)
**Created**: 2026-02-16
**Status**: Draft

**Related Documents**:
- `docs/plans/033-real-agent-pods/workshops/02-unified-agent-design.md` (AgentInstance/AgentManagerService redesign)
- `docs/plans/030-positional-orchestrator/workshops/13-phase-8-e2e-design.md` (Plan 030 E2E design)
- `docs/plans/030-positional-orchestrator/workshops/03-agent-context-service.md` (session inheritance rules)
- `test/e2e/positional-graph-orchestration-e2e.ts` (Plan 030 E2E script — to be upgraded)
- `packages/positional-graph/src/features/030-orchestration/` (orchestration system)

---

## Purpose

Define the CLI-first approach to running real agents in the orchestration system. This plan delivers a working CLI that drives orchestration end-to-end with real Claude Code agents, events streaming to terminal. No web UI, no TUI, no interactivity beyond output. The CLI and E2E testing together prove the agentic vision works before a future plan adds the web layer.

## Key Questions Addressed

- Q0: How do we run agents from the CLI without any workflow concepts?
- Q1: What does `cg wf run` look like and how does it drive the loop?
- Q2: How does the orchestration loop wait for real agents that run asynchronously?
- Q3: What does terminal output look like?
- Q4: What do agents see when they start (node-starter-prompt)?
- Q5: What do agents see when they resume after a pause?
- Q6: How do we upgrade the Plan 030 E2E to use real agents?
- Q7: What testing strategy handles non-deterministic real agents?

---

## Scope: What This Plan Delivers

| Delivered | Not Delivered |
|-----------|---------------|
| Updated `cg agent` commands (AgentManagerService) | Web UI reconnection |
| `cg wf run <slug>` CLI command | TUI / interactive terminal |
| Events to terminal (stdout) | Copilot agent pods (future) |
| Real agent pods (Claude Code) | Agent metadata CLI commands |
| Enhanced node-starter-prompt | Automatic question detection in loop |
| Resume prompt | Production daemon / watchdog |
| E2E tests with real agents | Cross-process event broadcasting |
| Session inheritance with real sessions | |

---

## Build Order: Agent System First, Then Workflow

The agent system (`AgentManagerService` / `AgentInstance`) is independently usable. It has no knowledge of workflows, graphs, or orchestration. We build and test it in isolation via `cg agent` commands **before** integrating into the WF system.

```
Phase A: Agent System (no WF dependency)
  ├── Redesign AgentInstance (Workshop 02)
  ├── Redesign AgentManagerService (Workshop 02)
  ├── Update cg agent commands to use new system
  ├── Test with real agents via CLI
  └── Verify: event streaming, sessions, same-instance guarantee

Phase B: WF Integration (depends on Phase A)
  ├── Update ODS to use AgentManagerService
  ├── Update AgentPod to wrap AgentInstance
  ├── Add cg wf run command
  ├── Upgrade Plan 030 E2E
  └── Real agent E2E tests
```

---

## Agent Commands Without Workflow (Phase A)

### Current State

The existing `cg agent run` (in `apps/cli/src/commands/agent.command.ts`):
- Uses `AgentService` (thin timeout wrapper around `IAgentAdapter`)
- Supports `--session <id>` for resumption
- Supports `--stream` for NDJSON event output
- Outputs `AgentResult` JSON on completion
- Has no concept of `AgentInstance`, metadata, or event handlers

### What Changes

`cg agent run` switches from `AgentService` to `AgentManagerService` / `AgentInstance`. The external interface stays compatible but gains new capabilities.

### Updated Command Surface

```
cg agent run       - Run a prompt (new or resume session) — UPDATED
cg agent compact   - Reduce session context — UNCHANGED (stays on AgentService)
cg agent status    - Show running agent status — NEW
cg agent kill      - Terminate a running agent — NEW
```

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
| `-f, --prompt-file <path>` | Path to prompt file | |
| `-s, --session <id>` | Resume existing session | (new session) |
| `-c, --cwd <path>` | Working directory for agent | `process.cwd()` |
| `--name <name>` | Human-readable instance name | `agent-<type>` |
| `--meta <key=value>` | Set metadata (repeatable) | |
| `--stream` | NDJSON event output (machine-readable) | |
| `--verbose` | Show thinking + tool results | |
| `--quiet` | Suppress event output, only show result | |

### How It Works Internally

```typescript
async function handleAgentRun(options: RunOptions): Promise<void> {
  const agentType = validateAgentType(options.type);
  const prompt = await resolvePrompt(options);

  // 1. Get AgentManagerService from DI container
  const container = createCliProductionContainer();
  const agentManager = container.resolve<IAgentManagerService>(
    ORCHESTRATION_DI_TOKENS.AGENT_MANAGER
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
    instance.addEventHandler(createTerminalEventHandler(instance.name));
  }

  // 4. Run
  const result = await instance.run({
    prompt,
    cwd: options.cwd ?? process.cwd(),
  });

  // 5. Output result
  printSessionInfo(instance, result);
  process.exit(result.status === 'completed' ? 0 : 1);
}
```

### Terminal Output: Human-Readable Mode (Default)

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

### Terminal Output: Verbose Mode

```
$ cg agent run -t claude-code -p "Create a fibonacci function" --verbose

[agent-claude-code] [thinking] The user wants a fibonacci function. I'll use an iterative
  approach for better performance...
[agent-claude-code] I'll create a fibonacci function in TypeScript.
[agent-claude-code] [tool] Write: fibonacci.ts
  → function fibonacci(n: number): number {
      if (n <= 1) return n;
      let a = 0, b = 1;
      for (let i = 2; i <= n; i++) { [a, b] = [b, a + b]; }
      return b;
    }
[agent-claude-code] [tool] Bash: npx tsc --noEmit fibonacci.ts
  → (no errors)
[agent-claude-code] Created fibonacci.ts with an iterative implementation.

---
Status:    completed
Session:   ses-abc123
Duration:  12.4s
```

### Terminal Output: Stream Mode (NDJSON)

```
$ cg agent run -t claude-code -p "Create a fibonacci function" --stream

{"type":"thinking","timestamp":"2026-02-16T10:00:01Z","data":{"content":"The user wants..."}}
{"type":"text_delta","timestamp":"2026-02-16T10:00:02Z","data":{"content":"I'll create"}}
{"type":"tool_call","timestamp":"2026-02-16T10:00:03Z","data":{"toolName":"Write","toolCallId":"tc-1","input":{"path":"fibonacci.ts"}}}
{"type":"tool_result","timestamp":"2026-02-16T10:00:04Z","data":{"toolCallId":"tc-1","output":"File written","isError":false}}
{"type":"message","timestamp":"2026-02-16T10:00:05Z","data":{"content":"Created fibonacci.ts"}}
{"status":"completed","sessionId":"ses-abc123","output":"Created fibonacci.ts..."}
```

### Session Chaining

Sessions persist on the Claude Code filesystem. The CLI passes sessionId to the adapter which uses `--resume` / `--fork-session` flags.

```bash
# Turn 1: New session
$ cg agent run -t claude-code -p "Write a hello world in Python"
...
Session:   ses-abc123

# Turn 2: Continue the same session (agent remembers turn 1)
$ cg agent run -t claude-code -s ses-abc123 -p "Add error handling to that script"
...
Session:   ses-def456

# Turn 3: Continue the chain
$ cg agent run -t claude-code -s ses-def456 -p "Now add unit tests"
...
Session:   ses-ghi789
```

Each run is a separate CLI process. The sessionId is the only thread linking them. The adapter passes it to Claude Code which has the full conversation history on disk.

**How it maps to AgentManagerService**:
- Turn 1: `agentManager.getNew(params)` → fresh instance, no session
- Turn 2: `agentManager.getWithSessionId('ses-abc123', params)` → instance with session baked in
- Turn 3: `agentManager.getWithSessionId('ses-def456', params)` → instance with session baked in

In the CLI, each invocation is a new process so the same-instance guarantee doesn't apply (the manager's in-memory Map is empty each time). But the sessionId ensures continuity. The same-instance guarantee matters for long-lived processes (web server, orchestration daemon).

### Metadata

```bash
$ cg agent run -t claude-code -p "Review this PR" \
    --meta project=my-app \
    --meta pr=42 \
    --name "pr-reviewer"
```

Metadata is set on the `AgentInstance` at creation. It's available via `instance.metadata` for any event handler or consumer. In CLI mode, metadata is informational — useful for structured logging or when piping to external tools.

### `cg agent status` (New)

Shows the status of a running agent. Only meaningful in long-lived processes (web server), but included for completeness and testing.

```
$ cg agent status <agentId>

Agent:     pr-reviewer (agent-42)
Type:      claude-code
Status:    working
Session:   ses-abc123
Workspace: /home/user/my-app
Metadata:  { project: "my-app", pr: 42 }
Created:   2026-02-16T10:00:00Z
Updated:   2026-02-16T10:05:23Z
```

In the CLI context (ephemeral process), this would query a running web server's API. Out of scope for Plan 033 (no web), but the command skeleton exists for future use.

### `cg agent kill` (New)

Terminates a running agent.

```
$ cg agent kill <agentId>

Terminated: agent-42 (pr-reviewer)
Session:    ses-abc123
```

Same caveat as `status` — meaningful in long-lived processes. In CLI, the agent terminates when the process exits.

### What About `AgentService`?

`AgentService` (the thin timeout wrapper from Plan 019) **stays as-is**. It's still used by:
- `cg agent compact` (calls `adapter.compact()` with timeout)
- Any code that needs a simple one-shot agent call with timeout enforcement

The updated `cg agent run` uses `AgentManagerService` instead of `AgentService`, but `AgentService` is not removed. It's a different abstraction level:

| | AgentService | AgentManagerService |
|-|-------------|---------------------|
| Purpose | One-shot agent calls with timeout | Agent lifecycle management |
| State | Stateless | In-memory registry with session index |
| Events | Passthrough (onEvent callback) | addEventHandler (multiple consumers) |
| Sessions | Caller manages | Service manages (same-instance guarantee) |
| Use case | CLI one-shot, timeout-sensitive | Orchestration, web UI, multi-consumer |

### Testing the Agent System in Isolation (Phase A Tests)

Before touching any WF code, we validate the new agent system works:

#### Test A1: AgentManagerService Unit Tests (fast, no real agents)

```
- getNew() creates instance with no session
- getWithSessionId() creates instance with session
- getWithSessionId() same session → same instance (same-instance guarantee)
- getWithSessionId() different session → different instances
- getAgent() by ID
- getAgents() with filter
- terminateAgent() cleans up both maps
- Session index updated after run() gives new sessionId
```

#### Test A2: AgentInstance Unit Tests (fast, FakeAgentAdapter)

```
- run() delegates to adapter
- run() updates sessionId from result
- Status transitions: stopped → working → stopped|error
- Double-run guard (concurrent run rejection)
- Event pass-through (addEventHandler receives adapter events)
- Multiple handlers receive same events
- removeEventHandler stops delivery
- Metadata: set at creation, update via setMetadata
- isRunning convenience getter
- terminate() delegates to adapter
```

#### Test A3: Contract Tests (FakeAgentInstance ↔ AgentInstance parity)

```
- Both implement IAgentInstance identically
- Status transitions match
- Event handler behavior matches
- Session tracking matches
```

#### Test A4: CLI Integration Test (real agent, manual/skipped)

```bash
# Automated test script (test/e2e/agent-system-e2e.ts):
#
# 1. Run: cg agent run -t claude-code -p "What is 2+2? Reply with just the number."
#    Assert: exit 0, output contains "4", sessionId returned
#
# 2. Run: cg agent run -t claude-code -s <sessionId> -p "What did I ask you?"
#    Assert: exit 0, output references "2+2" or "four", sessionId returned
#
# 3. Run: cg agent run -t claude-code -p "List files in current dir" --stream
#    Assert: exit 0, NDJSON contains tool_call event for Bash/ls
#
# This proves: getNew, getWithSessionId, event streaming, session continuity
```

#### Test A5: Event Handler Integration Test (real agent, manual/skipped)

```typescript
describe.skip('AgentInstance Event Handlers (Real Agent)', { timeout: 60_000 }, () => {
  it('multiple handlers receive same events', async () => {
    const manager = new AgentManagerService(realAdapterFactory);
    const instance = manager.getNew({
      name: 'event-test',
      type: 'claude-code',
      workspace: process.cwd(),
    });

    const handler1Events: AgentEvent[] = [];
    const handler2Events: AgentEvent[] = [];

    instance.addEventHandler((e) => handler1Events.push(e));
    instance.addEventHandler((e) => handler2Events.push(e));

    await instance.run({ prompt: 'Say hello in one word.' });

    // Both handlers got the same events
    expect(handler1Events.length).toBeGreaterThan(0);
    expect(handler1Events.length).toBe(handler2Events.length);

    // Events are the same objects
    for (let i = 0; i < handler1Events.length; i++) {
      expect(handler1Events[i]).toBe(handler2Events[i]);
    }
  });
});
```

These tests prove the agent system works **before any WF code is touched**. Once passing, we move to Phase B.

---

## The `cg wf run` Command

### Synopsis

```
$ cg wf run <slug> [--verbose] [--max-iterations <n>] [--json]
```

This is the first user-facing command that drives the orchestration loop. It creates the orchestration stack, runs the settle-decide-act loop, waits for agents between iterations, and exits when the graph completes, fails, or idles.

### What It Does

```
┌──────────────────────────────────────────────────────────────┐
│                       cg wf run <slug>                        │
│                                                               │
│  1. Resolve workspace context                                 │
│  2. Create orchestration stack from DI container              │
│  3. Enter the DRIVER LOOP:                                    │
│     a. handle.run()                                           │
│        ├── Settle: processGraph (events → state changes)      │
│        ├── Build reality                                      │
│        ├── Decide: ONBAS.getNextAction()                      │
│        └── Act: ODS.execute() → fires agent pods              │
│     b. Print actions taken                                    │
│     c. Check stopReason:                                      │
│        ├── graph-complete → exit 0                            │
│        ├── graph-failed  → exit 1                             │
│        └── no-action     → step (d)                           │
│     d. Wait for running agents to complete                    │
│        (or timeout for idle graphs)                           │
│     e. Go to (a)                                              │
│                                                               │
│  4. Print summary and exit                                    │
└──────────────────────────────────────────────────────────────┘
```

### Pseudo-Implementation

```typescript
// apps/cli/src/commands/positional-graph.command.ts

async function runGraph(slug: string, options: RunOptions): Promise<void> {
  const ctx = await resolveContext();
  const container = createCliProductionContainer(ctx);
  const orchestrationService = container.resolve(OrchestrationService);
  const podManager = container.resolve(PodManager);

  const handle = await orchestrationService.get(ctx, slug);
  console.log(`[orchestrator] Running graph: ${slug}`);

  let iteration = 0;
  const maxIterations = options.maxIterations ?? 200;

  while (iteration < maxIterations) {
    iteration++;

    // a. Run one settle-decide-act pass
    const result = await handle.run();

    // b. Print what happened
    for (const action of result.actions) {
      if (action.request.type === 'start-node') {
        const nodeId = action.request.nodeId;
        console.log(`[orchestrator] Started node: ${nodeId}`);
      }
    }

    // c. Check stop reason
    if (result.stopReason === 'graph-complete') {
      console.log(`[orchestrator] Graph complete (${iteration} iterations)`);
      return;
    }
    if (result.stopReason === 'graph-failed') {
      console.error(`[orchestrator] Graph failed (${iteration} iterations)`);
      process.exit(1);
    }

    // d. Wait for running agents or idle timeout
    if (podManager.hasRunningExecutions()) {
      await podManager.waitForAnyCompletion();
    } else {
      // Nothing running — graph is idle (waiting for external input)
      console.log('[orchestrator] Idle — waiting for external input');
      await sleep(2000);
    }
  }

  console.error(`[orchestrator] Max iterations reached (${maxIterations})`);
  process.exit(1);
}
```

### Terminal Output Example

```
$ cg wf run my-pipeline

[orchestrator] Running graph: my-pipeline
[orchestrator] Started node: get-spec (user-input) — skipped (UI concern)
[orchestrator] Idle — waiting for external input

  (user completes get-spec via another terminal: cg wf node end ...)

[orchestrator] Started node: spec-builder (claude-code)
[spec-builder] I'll read the inputs and build a detailed specification.
[spec-builder] [tool] Bash: cg wf node accept my-pipeline spec-builder
[spec-builder] [tool] Bash: cg wf node collate my-pipeline spec-builder
[spec-builder] Based on the input spec, I'll create a detailed specification...
[spec-builder] [tool] Bash: cg wf node save-output-data my-pipeline spec-builder detailed_spec '{"title":"..."}'
[spec-builder] [tool] Bash: cg wf node end my-pipeline spec-builder --message "Spec built"
[orchestrator] Node complete: spec-builder
[orchestrator] Started node: spec-reviewer (claude-code, session: ses-002)
[spec-reviewer] I'll review the specification...
...
[orchestrator] Started node: coder (claude-code)
[coder] [tool] Bash: cg wf node ask my-pipeline coder --type text --text "Which language?"
[orchestrator] Node waiting: coder (question pending)
[orchestrator] Idle — waiting for external input

  (human answers via another terminal: cg wf node answer ... && cg wf node raise-event ... node:restart)

[orchestrator] Node restarted: coder
[coder] The answer is TypeScript. Continuing implementation...
...
[orchestrator] Graph complete (12 iterations)
```

### Key Design Decisions

**D1: The CLI drives a DRIVER LOOP around `handle.run()`**

`handle.run()` executes one settle-decide-act pass and returns. The CLI driver loop calls it repeatedly, waiting for agents between calls. This keeps the orchestration loop clean (no waiting logic) and puts the CLI in control of when to re-enter.

**D2: Event output is agent event pass-through, not structured orchestration logs**

When the user sees `[spec-builder] I'll read the inputs...`, that's a `text_delta` event from the Claude Code adapter flowing through AgentInstance's event handler to a terminal printer. The `[orchestrator]` lines are CLI-level status messages, not events.

**D3: User-input nodes require external completion**

The CLI run command does not handle user-input nodes interactively. The user completes them from another terminal (or they're pre-completed before running). The loop idles until the events appear.

---

## Tracking Running Agents: Pod Execution Promises

### The Problem

Currently, ODS fires `pod.execute()` without awaiting (line 122 of `ods.ts`). The Promise is discarded. When agents are real, the CLI needs to know when they finish so it can re-enter the loop.

### The Solution: PodManager Tracks Execute Promises

```typescript
export class PodManager implements IPodManager {
  private readonly pods = new Map<string, IWorkUnitPod>();
  private readonly sessions = new Map<string, string>();
  private readonly _runningExecutions = new Map<string, Promise<PodExecuteResult>>();

  // ── NEW: Execution tracking ────────────────────────────

  trackExecution(nodeId: string, promise: Promise<PodExecuteResult>): void {
    this._runningExecutions.set(
      nodeId,
      promise.finally(() => {
        this._runningExecutions.delete(nodeId);
      })
    );
  }

  hasRunningExecutions(): boolean {
    return this._runningExecutions.size > 0;
  }

  /**
   * Resolves when ANY running execution completes (or immediately if none running).
   * Returns the nodeId that completed so the caller can sync its session.
   */
  async waitForAnyCompletion(): Promise<string | undefined> {
    if (this._runningExecutions.size === 0) return undefined;

    const entries = [...this._runningExecutions.entries()];
    const result = await Promise.race(
      entries.map(async ([nodeId, promise]) => {
        await promise;
        return nodeId;
      })
    );
    return result;
  }

  /**
   * Resolves when ALL running executions complete.
   */
  async waitForAllCompletions(): Promise<void> {
    if (this._runningExecutions.size === 0) return;
    await Promise.allSettled([...this._runningExecutions.values()]);
  }

  // ── existing methods unchanged ─────────────────────────
}
```

### ODS Change: Capture the Promise

```typescript
// In ODS.handleAgentOrCode:

// 3. Create pod
const pod = this.deps.podManager.createPod(nodeId, this.buildPodParams(node));

// 4. Fire and forget — DO NOT await, but TRACK the promise
const executePromise = pod.execute({
  inputs: request.inputs,
  contextSessionId,
  ctx: { worktreePath: ctx.worktreePath },
  graphSlug: request.graphSlug,
});

this.deps.podManager.trackExecution(nodeId, executePromise);

return { ok: true, request, newStatus: 'starting', sessionId: pod.sessionId };
```

### Why `waitForAnyCompletion` Not `waitForAll`

`waitForAnyCompletion` is used in the driver loop because:
- Completing one agent might unblock serial successors
- We want the loop to process completions incrementally
- Parallel agents complete at different times — process each as it finishes

`waitForAllCompletions` is available for shutdown/cleanup.

### Session Sync After Completion

After an agent completes, its pod's sessionId is updated (by `AgentInstance.run()` updating the sessionId). The settle step in the next `handle.run()` processes events the agent raised via CLI. The driver loop syncs sessions:

```typescript
// After waitForAnyCompletion in the driver loop:
const completedNodeId = await podManager.waitForAnyCompletion();
if (completedNodeId) {
  const pod = podManager.getPod(completedNodeId);
  if (pod?.sessionId) {
    podManager.setSessionId(completedNodeId, pod.sessionId);
  }
  await podManager.persistSessions(ctx, slug);
}
```

---

## Terminal Event Output

### Event Flow Path

```
Claude Code subprocess
  → IAgentAdapter.run(onEvent callback)
    → AgentInstance.run() passes to registered handlers
      → CLI event handler prints to terminal
```

### CLI Event Handler

The `cg wf run` command attaches an event handler to each AgentInstance before execution:

```typescript
function createTerminalEventHandler(nodeId: string): AgentEventHandler {
  return (event: AgentEvent) => {
    const prefix = `[${nodeId}]`;

    switch (event.type) {
      case 'text_delta':
        // Stream text as it arrives (no newline — concatenated)
        process.stdout.write(`${prefix} ${event.data.content}`);
        break;

      case 'message':
        console.log(`${prefix} ${event.data.content}`);
        break;

      case 'tool_call':
        console.log(`${prefix} [tool] ${event.data.toolName}: ${truncate(event.data.input, 100)}`);
        break;

      case 'tool_result':
        if (event.data.isError) {
          console.error(`${prefix} [tool error] ${truncate(event.data.output, 200)}`);
        }
        // Non-error tool results: silent in normal mode, shown in --verbose
        break;

      case 'thinking':
        // Silent by default. Show with --verbose.
        break;
    }
  };
}
```

### How It Gets Wired

In the **new AgentPod** (from Workshop 02), the pod wraps `IAgentInstance`. The CLI run command creates the instance via AgentManagerService and attaches the handler BEFORE the pod executes:

```typescript
// In ODS (after Workshop 02 changes):
const instance = agentManager.getNew(baseParams);  // or getWithSessionId

// The CLI driver attaches event handlers before the loop starts.
// But ODS fires pod.execute() inside handle.run()...
// So: attach handler at instance creation time (in the AgentManagerService wrapper),
// OR have PodManager expose a hook for new pods.

// Simplest: AgentManagerService accepts a default event handler at construction.
// The CLI sets this when creating the container.
```

**Resolution**: The CLI container registers an `AgentManagerService` with a `defaultEventHandler` option. Every instance created by the service gets this handler pre-attached. This keeps the orchestration code clean — it doesn't know about terminal output.

```typescript
// CLI container setup:
container.register(ORCHESTRATION_DI_TOKENS.AGENT_MANAGER, {
  useFactory: () => {
    const adapterFactory = buildAdapterFactory();
    const manager = new AgentManagerService(adapterFactory);

    // Pre-register a factory that attaches terminal handlers
    manager.onInstanceCreated = (instance) => {
      const nodeId = (instance.metadata.nodeId as string) ?? instance.id;
      instance.addEventHandler(createTerminalEventHandler(nodeId));
    };

    return manager;
  },
});
```

### Verbose Mode

With `--verbose`:
- `thinking` events are shown (dimmed)
- `tool_result` content is shown
- Orchestration loop diagnostics: iteration count, settle event counts, ONBAS decisions

---

## Node Starter Prompt

### Current State

The existing `node-starter-prompt.md` (24 lines) is too generic. It tells the agent to "use CLI commands" but doesn't say which ones or how.

### Enhanced Starter Prompt

The prompt is a **template** that AgentPod populates with node-specific values before passing to the adapter.

```markdown
# Workflow Agent Instructions

You are an agent operating within a structured workflow system.

## Your Assignment

- **Graph**: {{graphSlug}}
- **Node**: {{nodeId}}
- **Work Unit**: {{unitSlug}}
- **Workspace**: {{worktreePath}}

## Step 1: Accept Your Assignment

```
cg wf node accept {{graphSlug}} {{nodeId}}
```

## Step 2: Read Your Task

Get your task instructions (the work unit's prompt template):
```
cg wf node get-input-data {{graphSlug}} {{nodeId}} main-prompt
```

Get all your available inputs (data from upstream nodes):
```
cg wf node collate {{graphSlug}} {{nodeId}}
```

Read specific inputs:
```
cg wf node get-input-data {{graphSlug}} {{nodeId}} <inputName>
```

## Step 3: Do Your Work

Use your regular tools (file editing, code writing, terminal commands, etc.) for the actual task.
Only use the `cg wf` commands for workflow-specific operations.

## Step 4: Save Your Results

For each output your work unit defines, save the result:
```
cg wf node save-output-data {{graphSlug}} {{nodeId}} <outputName> '<jsonValue>'
```

## Step 5: Complete

When all outputs are saved:
```
cg wf node end {{graphSlug}} {{nodeId}} --message "Brief summary of what you did"
```

## Asking Questions

If you need clarification from a human before continuing:
```
cg wf node ask {{graphSlug}} {{nodeId}} --type text --text "Your question here"
```

After asking a question, **STOP immediately**. Do not continue working.
You will be resumed later with the answer available.

## Error Handling

If you hit an unrecoverable error related to the workflow:
```
cg wf node error {{graphSlug}} {{nodeId}} --code ERROR_CODE --message "What went wrong"
```

Do NOT try to work around workflow errors. Report and stop.
If the error is in your regular work (not workflow-related), handle it normally.

## Key Rules

1. **Accept first** before doing any work
2. **Read your inputs** to understand the task
3. **Save outputs** before ending
4. **Fail fast** on workflow errors — do not retry or guess
5. **Stop after asking** — do not continue past a question
```

### Template Resolution

AgentPod resolves placeholders before passing to the adapter:

```typescript
export class AgentPod implements IWorkUnitPod {
  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const template = loadStarterPrompt();
    const prompt = template
      .replaceAll('{{graphSlug}}', options.graphSlug)
      .replaceAll('{{nodeId}}', this.nodeId)
      .replaceAll('{{unitSlug}}', this._unitSlug)
      .replaceAll('{{worktreePath}}', options.ctx.worktreePath);

    const result = await this._agentInstance.run({ prompt, cwd: options.ctx.worktreePath });
    return this.mapAgentResult(result);
  }
}
```

### Why `cg` Not `ppm`

The CLI binary is `cg` (and `chainglass`). If the deployment uses a different alias, the starter prompt template can be configured via graph orchestrator settings:

```typescript
GraphOrchestratorSettingsSchema = z.object({
  agentType: z.enum(['claude-code', 'copilot']).optional(),
  cliCommand: z.string().optional(),  // default: 'cg'
});
```

---

## Resume Prompt

When an agent is resumed after a pause (question answered, error cleared, manual restart), it gets a generic resume prompt instead of the starter prompt.

### The Resume Prompt Template

```markdown
# Resume Instructions

You were previously working on node **{{nodeId}}** in graph **{{graphSlug}}**.

Your previous conversation history contains your prior work. Continue from where you left off.

## What to Do

1. Check if there are answers to questions you asked:
   ```
   cg wf node get-answer {{graphSlug}} {{nodeId}} <questionId>
   ```

2. Continue your work based on any new information.

3. Save any remaining outputs:
   ```
   cg wf node save-output-data {{graphSlug}} {{nodeId}} <outputName> '<jsonValue>'
   ```

4. Complete when done:
   ```
   cg wf node end {{graphSlug}} {{nodeId}} --message "Summary"
   ```

## Key Rules

- Do NOT repeat work you already completed
- Check your conversation history for context
- If you asked a question, the answer should now be available
- Complete as normal when your work is done
```

### When It's Used

AgentPod uses the resume prompt when the node is being restarted (status was `restart-pending`):

```typescript
export class AgentPod implements IWorkUnitPod {
  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    // Determine which prompt to use based on whether this is first run or resume
    const isResume = this._agentInstance.sessionId !== null;

    const template = isResume ? loadResumePrompt() : loadStarterPrompt();
    const prompt = this.resolveTemplate(template, options);

    const result = await this._agentInstance.run({ prompt, cwd: options.ctx.worktreePath });
    return this.mapAgentResult(result);
  }
}
```

The check is simple: if the AgentInstance already has a sessionId (set at creation via `getWithSessionId`, or from a prior run), this is a resume. Otherwise it's a fresh start.

---

## AgentPod Redesign (Workshop 02 Integration)

### Current AgentPod → New AgentPod

Per Workshop 02, AgentPod wraps `IAgentInstance` instead of `IAgentAdapter`:

```typescript
export class AgentPod implements IWorkUnitPod {
  readonly unitType = 'agent' as const;
  private readonly _unitSlug: string;

  constructor(
    readonly nodeId: string,
    private readonly _agentInstance: IAgentInstance,
    unitSlug: string,
  ) {
    this._unitSlug = unitSlug;
  }

  get sessionId(): string | undefined {
    return this._agentInstance.sessionId ?? undefined;
  }

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const isResume = this._agentInstance.sessionId !== null;
    const template = isResume ? loadResumePrompt() : loadStarterPrompt();
    const prompt = this.resolveTemplate(template, options);

    try {
      const result = await this._agentInstance.run({
        prompt,
        cwd: options.ctx.worktreePath,
      });
      return this.mapAgentResult(result);
    } catch (err) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_AGENT_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async terminate(): Promise<void> {
    await this._agentInstance.terminate();
  }

  private resolveTemplate(template: string, options: PodExecuteOptions): string {
    return template
      .replaceAll('{{graphSlug}}', options.graphSlug)
      .replaceAll('{{nodeId}}', this.nodeId)
      .replaceAll('{{unitSlug}}', this._unitSlug)
      .replaceAll('{{worktreePath}}', options.ctx.worktreePath);
  }

  private mapAgentResult(result: AgentResult): PodExecuteResult {
    switch (result.status) {
      case 'completed':
        return { outcome: 'completed', sessionId: result.sessionId };
      case 'failed':
        return {
          outcome: 'error',
          sessionId: result.sessionId,
          error: {
            code: 'AGENT_FAILED',
            message: result.stderr ?? `Agent failed with exit code ${result.exitCode}`,
          },
        };
      case 'killed':
        return { outcome: 'terminated', sessionId: result.sessionId };
    }
  }
}
```

### Key Differences from Current AgentPod

| Aspect | Current | New |
|--------|---------|-----|
| Wraps | `IAgentAdapter` | `IAgentInstance` |
| Session tracking | Internal `_sessionId` | Reads from `agentInstance.sessionId` |
| Context session | `contextSessionId` param | Baked into instance at creation |
| Prompt | Static `node-starter-prompt.md` | Template with placeholders, starter vs resume |
| Events | None | Flow through AgentInstance handlers |
| Constructor | `(nodeId, adapter)` | `(nodeId, agentInstance, unitSlug)` |

---

## ODS Changes for Real Agents

### Creating AgentInstance via AgentManagerService

```typescript
private async handleAgentOrCode(
  request: StartNodeRequest,
  ctx: WorkspaceContext,
  reality: PositionalGraphReality,
  node: NodeReality,
): Promise<OrchestrationExecuteResult> {
  const { nodeId } = request;

  // 1. Reserve the node
  const startResult = await this.deps.graphService.startNode(ctx, request.graphSlug, nodeId);
  if (startResult.errors.length > 0) {
    return {
      ok: false,
      error: { code: 'START_NODE_FAILED', message: startResult.errors[0].message, nodeId },
      request,
    };
  }

  // 2. Resolve agent type and session context
  const agentType = reality.settings?.agentType ?? 'claude-code';
  const baseParams: CreateAgentParams = {
    name: `${request.graphSlug}/${nodeId}`,
    type: agentType,
    workspace: ctx.worktreePath,
    metadata: {
      graphSlug: request.graphSlug,
      nodeId,
      unitSlug: node.unitSlug,
    },
  };

  let instance: IAgentInstance;
  const contextResult = this.deps.contextService.getContextSource(reality, nodeId);

  if (contextResult.source === 'inherit') {
    const sessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);
    if (sessionId) {
      instance = this.deps.agentManager.getWithSessionId(sessionId, baseParams);
    } else {
      instance = this.deps.agentManager.getNew(baseParams);
    }
  } else {
    instance = this.deps.agentManager.getNew(baseParams);
  }

  // 3. Create pod with the agent instance
  const pod = this.deps.podManager.createPod(nodeId, {
    unitType: 'agent',
    unitSlug: node.unitSlug,
    agentInstance: instance,
  });

  // 4. Fire and forget — track the promise
  const executePromise = pod.execute({
    inputs: request.inputs,
    ctx: { worktreePath: ctx.worktreePath },
    graphSlug: request.graphSlug,
  });
  this.deps.podManager.trackExecution(nodeId, executePromise);

  return { ok: true, request, newStatus: 'starting', sessionId: instance.sessionId };
}
```

---

## E2E Test Strategy

### The Three Testing Layers

```
Layer 1: FAKE AGENT E2E (keep existing, fast CI)
  Plan 030's E2E with FakeAgentAdapter + CLI-as-agent.
  Upgraded to use AgentManagerService/AgentInstance fakes.
  Runs in CI. < 30 seconds. Deterministic.

Layer 2: REAL AGENT E2E (new, manual)
  Real Claude Code agents running real tasks.
  Skipped by default (requires auth, costs money, slow).
  Run manually: remove .skip or use flag.
  60-300 seconds per scenario.

Layer 3: REAL AGENT INTEGRATION (new, focused)
  Single-node tests proving specific behaviors:
  - Agent reads inputs via CLI
  - Agent saves outputs via CLI
  - Agent asks questions
  - Agent resumes after question
  - Agent reports errors
  Skipped by default. 30-120 seconds each.
```

### Layer 1: Upgraded Fake E2E

The existing Plan 030 E2E (`test/e2e/positional-graph-orchestration-e2e.ts`) gets updated for the Workshop 02 redesign:

**Changes**:
- `FakeAgentAdapter` → `FakeAgentManagerService` (used by ODS)
- ODS dependency: `agentAdapter` → `agentManager`
- PodCreateParams: `adapter` → `agentInstance`
- The test still acts as the agent via CLI commands
- Same 8-node, 4-line pipeline
- Same deterministic behavior

**Why keep it**: Fast regression catching. Runs in CI on every commit. Proves the orchestration machinery works without needing real agents.

### Layer 2: Real Agent E2E

A new E2E script that runs the full orchestration with real Claude Code agents on a simplified pipeline.

#### Test Graph: 3 Nodes, 2 Lines

```
Line 0: get-spec (user-input, pre-completed)
Line 1: spec-writer (agent, serial) → reviewer (agent, serial)
```

Why simpler than Plan 030's 8-node graph:
- Real agents are slow (30-120s per turn)
- Each node is a full Claude Code session
- 3 nodes keeps total time under 5 minutes
- Still exercises: serial chain, session inheritance, input wiring

#### The Test Flow

```
ACT 0: Setup
  1. Create temp workspace
  2. Write work unit files (spec-writer has a simple prompt template)
  3. Create graph, add lines, add nodes, wire inputs
  4. Pre-complete get-spec (save output via CLI)
  5. Build orchestration stack with REAL adapter factory

ACT 1: Orchestrate with Real Agents
  6. handle = orchestrationService.get(ctx, slug)
  7. DRIVER LOOP:
     a. result = handle.run()
     b. If agents started, wait for completion (podManager.waitForAnyCompletion)
     c. Sync sessions
     d. If graph-complete → break
     e. If max iterations → fail

ACT 2: Verify Outcomes
  8. All nodes have status 'complete'
  9. spec-writer produced output (some non-empty string)
  10. reviewer produced output
  11. Session inheritance worked (reviewer inherited from spec-writer)

ACT 3: Cleanup
```

#### What Makes This Test Different

| Aspect | Fake E2E (Layer 1) | Real E2E (Layer 2) |
|--------|--------------------|--------------------|
| Agent adapter | FakeAgentAdapter | ClaudeCodeAdapter |
| Agent behavior | Test acts as agent via CLI | Real Claude Code reads prompt, uses CLI |
| Determinism | Fully deterministic | Non-deterministic (LLM output varies) |
| Speed | < 30s | 2-5 minutes |
| Auth required | No | Yes (Claude CLI key) |
| Assertions | Exact status checks | Status checks + "output is non-empty" |
| Skip condition | `skipIf(!existsSync(CLI_PATH))` | `skipIf(!hasClaudeCli())` |

#### Non-Determinism Handling

Real agent tests cannot assert on specific output values. Instead:

```typescript
// BAD: Asserting specific content
expect(output).toBe('The specification includes...');

// GOOD: Asserting structural properties
expect(output).toBeTruthy();                        // Output exists
expect(typeof output).toBe('string');               // Correct type
expect(output.length).toBeGreaterThan(10);          // Non-trivial
expect(nodeStatus).toBe('complete');                 // Lifecycle correct
expect(sessionId).toBeTruthy();                     // Session was created
expect(node2SessionId).not.toBe(node1SessionId);    // Fork happened
```

### Layer 3: Real Agent Integration Tests

Focused tests for specific agent-workflow behaviors. Each test creates a minimal 1-node graph and verifies one thing.

#### Test: Agent Reads Inputs and Produces Output

```typescript
describe.skip('Real Agent: Input → Output', { timeout: 120_000 }, () => {
  it('agent reads input via CLI and saves output', async () => {
    // Setup: 1-node graph, pre-wired input with known data
    // Agent prompt: "Read your input 'spec' and save a summary as output 'summary'"
    // Run: handle.run() + wait for completion
    // Assert: node status = complete, output 'summary' exists and is non-empty
  });
});
```

#### Test: Agent Asks Question and Stops

```typescript
describe.skip('Real Agent: Question Lifecycle', { timeout: 120_000 }, () => {
  it('agent asks question and stops, resumes after answer', async () => {
    // Setup: 1-node graph with prompt that instructs agent to ask a question
    // Run: handle.run() + wait for completion
    // Assert: node status = waiting-question, question event exists
    // Answer: cg wf node answer + cg wf node raise-event node:restart
    // Run again: handle.run() + wait
    // Assert: node status = complete
  });
});
```

#### Test: Agent Reports Error

```typescript
describe.skip('Real Agent: Error Handling', { timeout: 120_000 }, () => {
  it('agent reports error via CLI and stops', async () => {
    // Setup: 1-node graph with prompt that triggers an intentional error
    // Run: handle.run() + wait for completion
    // Assert: node status = blocked-error, error event exists
  });
});
```

#### Test: Session Inheritance

```typescript
describe.skip('Real Agent: Session Inheritance', { timeout: 180_000 }, () => {
  it('second agent inherits first agent session', async () => {
    // Setup: 2-node serial graph
    // Run first: handle.run() → first agent completes
    // Run second: handle.run() → second agent starts with inherited session
    // Assert: second agent's sessionId differs from first (fork)
    // Assert: second agent can reference first agent's work
  });
});
```

#### Test: Parallel Agents

```typescript
describe.skip('Real Agent: Parallel Execution', { timeout: 180_000 }, () => {
  it('two agents run concurrently with independent sessions', async () => {
    // Setup: 2-node parallel graph
    // Run: handle.run() → both agents started
    // Wait: podManager.waitForAllCompletions()
    // Assert: both nodes complete
    // Assert: different session IDs (independent)
    // Assert: total time < 2x single agent time (prove parallelism)
  });
});
```

---

## File Structure

```
test/
├── e2e/
│   ├── positional-graph-orchestration-e2e.ts       # Layer 1: Fake E2E (updated)
│   └── real-agent-orchestration-e2e.ts             # Layer 2: Real Agent E2E (NEW)
├── integration/
│   ├── positional-graph/
│   │   └── orchestration-e2e.test.ts               # Vitest wrapper for Layer 1
│   └── real-agent-orchestration.test.ts            # Layer 3: Real Agent Integration (NEW)
├── helpers/
│   └── positional-graph-e2e-helpers.ts             # Shared helpers (existing)
└── fixtures/
    └── orchestration-e2e/
        └── units/                                   # Work unit YAML files
            └── ...                                  # (extended with prompt templates)
```

### New Files

| File | Purpose |
|------|---------|
| `test/e2e/real-agent-orchestration-e2e.ts` | Standalone real agent E2E script |
| `test/integration/real-agent-orchestration.test.ts` | Vitest wrapper + focused integration tests |
| `packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md` | Enhanced starter prompt (replaces current) |
| `packages/positional-graph/src/features/030-orchestration/node-resume-prompt.md` | New resume prompt |

---

## How Real Agents See the System

### Agent Lifecycle (What Claude Code Experiences)

```
1. Claude Code is spawned by ClaudeCodeAdapter.run()
   - CWD: workspace root (worktree path)
   - Prompt: node-starter-prompt.md (resolved with graph/node IDs)
   - Session: new session (or --resume for inherited session)

2. Agent reads the prompt, understands it's in a workflow:
   "I'm node 'spec-writer' in graph 'my-pipeline'. I need to accept, read inputs, do work, save outputs, end."

3. Agent calls: cg wf node accept my-pipeline spec-writer
   → Event raised: node:accept
   → Status: starting → agent-accepted

4. Agent calls: cg wf node collate my-pipeline spec-writer
   → Gets JSON of all resolved inputs
   → Agent now knows what data it has to work with

5. Agent calls: cg wf node get-input-data my-pipeline spec-writer main-prompt
   → Gets the work unit's prompt template (its actual task instructions)
   → E.g., "Write a detailed specification based on the user's requirements"

6. Agent does the actual work (writes files, runs commands, etc.)
   → This is regular Claude Code behavior, not workflow-specific

7. Agent calls: cg wf node save-output-data my-pipeline spec-writer detailed_spec '{"title":"..."}'
   → Output persisted to the workflow state

8. Agent calls: cg wf node end my-pipeline spec-writer --message "Detailed spec written"
   → Events raised: node:outputs-saved, node:complete
   → Status: agent-accepted → complete

9. Claude Code subprocess exits (adapter.run() Promise resolves)
   → AgentInstance status: working → stopped
   → PodManager: execution Promise resolves
   → Driver loop: wakes up, re-enters handle.run()
   → Settle: picks up completion events → node marked complete in reality
   → Decide: ONBAS finds next ready node → start-node(spec-reviewer)
```

### What the Agent Sees on Resume

```
1. Claude Code is spawned with --resume <sessionId>
   - Same CWD, same workspace
   - Prompt: node-resume-prompt.md (resolved)
   - Session: inherited or continued

2. Agent reads conversation history (from prior session)
   → Knows it asked a question earlier
   → Knows what work it already did

3. Agent reads resume prompt:
   "You were previously working on 'coder' in 'my-pipeline'. Check for answers."

4. Agent calls: cg wf node get-answer my-pipeline coder q-001
   → Gets the human's answer: "Use TypeScript"

5. Agent continues work with the answer incorporated

6. Agent saves outputs and ends (same as steps 7-8 above)
```

---

## Work Unit Prompt Templates

Each work unit can have a `prompts/main.md` file that contains its specific task instructions. The agent reads this via `cg wf node get-input-data <graph> <node> main-prompt`.

### Example: spec-writer/prompts/main.md

```markdown
# Task: Write Detailed Specification

You are the spec-writer. Your job is to take the user's requirements and produce a detailed specification.

## Input

Read your input `spec` — this contains the user's raw requirements.

## Expected Output

Produce a `detailed_spec` output that includes:
1. A summary of what needs to be built
2. Acceptance criteria
3. Technical considerations

Save your output as: detailed_spec
```

This separation (starter prompt is generic, task prompt is per-work-unit) keeps the orchestration system clean while allowing per-node customization.

---

## Changes to Plan 030 E2E (Layer 1 Upgrade)

### What Changes

The `createOrchestrationStack` function in `test/e2e/positional-graph-orchestration-e2e.ts`:

```typescript
// BEFORE (Plan 030)
const agentAdapter = new FakeAgentAdapter();
const scriptRunner = new FakeScriptRunner();
const ods = new ODS({
  graphService: service,
  podManager,
  contextService,
  agentAdapter,        // ← bare adapter
  scriptRunner,
});

// AFTER (Plan 033)
const agentManager = new FakeAgentManagerService();
const scriptRunner = new FakeScriptRunner();
const ods = new ODS({
  graphService: service,
  podManager,
  contextService,
  agentManager,        // ← manager service
  scriptRunner,
});
```

### What Stays the Same

Everything else. The test still acts as the agent via CLI commands. The orchestration loop is unchanged. The assertions are unchanged. Only the wiring changes because ODS now depends on `IAgentManagerService` instead of `IAgentAdapter`.

---

## DI Container Wiring

### CLI Container (Production)

```typescript
// apps/cli/src/lib/container.ts

function registerOrchestrationServices(container: Container): void {
  // Agent adapter factory (creates real ClaudeCodeAdapter instances)
  const adapterFactory: AdapterFactory = () => {
    const processManager = container.resolve(UnixProcessManager);
    return new ClaudeCodeAdapter(processManager, { logger });
  };

  // Agent manager (creates AgentInstances wrapping real adapters)
  const agentManager = new AgentManagerService(adapterFactory);
  container.registerInstance(ORCHESTRATION_DI_TOKENS.AGENT_MANAGER, agentManager);

  // Other orchestration services unchanged
  container.registerInstance(ORCHESTRATION_DI_TOKENS.SCRIPT_RUNNER, new NodeScriptRunner());
  // ... ONBAS, ODS, etc.
}
```

### Test Container (Fakes)

```typescript
// test/e2e/positional-graph-orchestration-e2e.ts

function createOrchestrationStack(service, ctx) {
  // Fake agent manager (no real agents)
  const agentManager = new FakeAgentManagerService();
  const scriptRunner = new FakeScriptRunner();

  const ods = new ODS({
    graphService: service,
    podManager,
    contextService,
    agentManager,
    scriptRunner,
  });

  // ... rest unchanged
}
```

---

## Open Questions

### Q1: How does the CLI handle user-input nodes?

**OPEN**: The `cg wf run` command encounters user-input nodes that need external completion. Options:
- **Option A**: Skip them silently, idle until completed externally (current behavior)
- **Option B**: Print a message: "Waiting for node 'get-spec' (user-input). Complete via: cg wf node end ..."
- **Option C**: Prompt on stdin (violates "no interactivity" constraint)

Leaning toward **Option B** — print the needed command so the user knows what to do.

### Q2: Should the driver loop have a configurable idle timeout?

**OPEN**: When the graph is waiting for external input (questions, manual transitions, user-input nodes), the loop polls. Should it give up after N minutes?
- Default: no timeout (run until graph-complete or Ctrl+C)
- Optional: `--timeout 300` for CI/automation

### Q3: How do parallel agents share terminal output?

**OPEN**: When two agents run simultaneously, their events interleave on stdout. Options:
- **Option A**: Interleave with prefixes (`[agent-A] ...`, `[agent-B] ...`) — simple, can be noisy
- **Option B**: Buffer each agent's output and print in blocks — cleaner but delays output
- **Option C**: Only show agent names, not their event content (summarize)

Leaning toward **Option A** — interleaved with prefixes. It's honest and matches how parallel processes work.

### Q4: What work unit prompt templates do we need for the real agent E2E?

**OPEN**: The E2E test graph needs simple but realistic prompts. Candidates:
- `spec-writer`: "Summarize the following requirements in 2-3 sentences" (fast, deterministic enough)
- `reviewer`: "Review this spec and output 'approved' or 'needs-changes'" (fast, binary outcome)

These need to be simple enough that real agents complete quickly but realistic enough to prove the system works.

### Q5: Should the E2E test verify session inheritance via agent output?

**OPEN**: For the session inheritance test, should we verify the second agent can "see" the first agent's work by checking its output references the first agent's content? This is non-deterministic but would strongly prove inheritance works. Alternative: just verify different sessionIds.

### Q6: `cg wf node accept` — does the agent always call this, or does ODS do it?

**RESOLVED**: The AGENT calls `accept`. ODS sets status to `starting`. The agent acknowledges by calling `accept` → status becomes `agent-accepted`. This proves the agent is alive and has read the prompt. If the agent never calls accept, the node stays in `starting` and the orchestrator can detect zombies.

---

## Summary

This workshop defines the CLI-first approach for Plan 033:

1. **`cg wf run <slug>`** drives a loop around `handle.run()`, waiting for real agents between iterations
2. **Terminal events** flow through AgentInstance handlers to stdout, prefixed by node ID
3. **Node starter prompt** is a template with graph/node IDs and concrete CLI commands
4. **Resume prompt** is generic, tells agent to check for answers and continue
5. **PodManager tracks execution Promises** so the driver loop knows when to re-enter
6. **Three test layers**: fake E2E (CI), real agent E2E (manual), focused integration (manual)
7. **Plan 030 E2E gets minimal changes** — only the adapter → manager wiring
8. **No web UI, no TUI, no interactivity** — pure output to terminal
