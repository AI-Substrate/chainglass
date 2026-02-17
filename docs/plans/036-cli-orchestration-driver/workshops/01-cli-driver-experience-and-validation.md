# Workshop: CLI Driver Experience and Validation

**Type**: CLI Flow + Integration Pattern
**Plan**: 036-cli-orchestration-driver
**Spec**: [cli-orchestration-driver-spec.md](../cli-orchestration-driver-spec.md) (AC-21 through AC-26, AC-41 through AC-43)
**Created**: 2026-02-17
**Status**: Draft

**Related Documents**:
- [Workshop 03: CLI-First Real Agent Execution](../../033-real-agent-pods/workshops/03-cli-first-real-agents.md) — Driver loop pseudo-implementation
- [Workshop 05: PodManager Execution Tracking](../../033-real-agent-pods/workshops/05-podmanager-execution-tracking.md) — Promise tracking API
- [Plan 030 Workshop 12: ODS Design](../../030-positional-orchestrator/workshops/12-ods-design.md) — Fire-and-forget contract
- [Plan 032 Workshop 10: Event Processing in the Orchestration Loop](../../032-node-event-system/workshops/10-event-processing-in-the-orchestration-loop.md) — Settle→Decide→Act
- `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` — Current loop implementation
- `apps/cli/src/commands/positional-graph.command.ts` — CLI command registration

---

## Purpose

Define the exact terminal experience of `cg wf run <slug>`, how the driver loop coordinates with the orchestration engine, and the validation workflow that proves the CLI works without real agents. This workshop addresses the gap between `handle.run()` (which returns immediately when ONBAS says no-action) and a persistent CLI process that waits for agents and re-enters the loop.

## Key Questions Addressed

- Q1: What does the user see in the terminal when running `cg wf run`?
- Q2: How does the driver loop differ from `handle.run()`?
- Q3: How do we surface agent events to the terminal?
- Q4: What does `--verbose` add over default output?
- Q5: How do we validate the entire CLI pipeline with fakes?
- Q6: What is the test graph, and how do we drive it without real agents?
- Q7: How does session sync fit into the driver loop?

---

## Part 1: Concept Boundaries — High Cohesion, Low Coupling

Before anything else: the architectural vibe of this system.

Each component has **one job** and knows **only its own things**. It does not reach into other components. It does not know what's upstream or downstream. The contracts between them are the only interface.

```
┌─────────────────────────────────────────────────────────────────────┐
│                    THE ORCHESTRATION SYSTEM                          │
│                                                                     │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐  │
│  │  ONBAS   │     │   ODS    │     │PodManager│     │  Pods    │  │
│  │          │     │          │     │          │     │          │  │
│  │ Reads a  │────▶│ Takes an │────▶│ Creates  │────▶│ Wraps an │  │
│  │ snapshot,│  OR │ OR and   │     │ and      │     │ instance,│  │
│  │ emits an │     │ launches │     │ tracks   │     │ runs it  │  │
│  │ OR       │     │ pods     │     │ pods     │     │          │  │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘  │
│       ▲                                                     │      │
│       │              EVENTS ON DISK                          │      │
│       │         (the ONLY interface to the                   │      │
│       │          outside world)                              ▼      │
│  ┌──────────┐                                        ┌──────────┐  │
│  │ Reality  │◀───────── settle reads ────────────────│  Agent   │  │
│  │ Builder  │                                        │ (via CLI)│  │
│  └──────────┘                                        └──────────┘  │
│                                                                     │
│  ┌──────────┐                                                      │
│  │ drive()  │  Dumb polling loop. Calls run(). Checks exit.        │
│  │          │  Knows NOTHING about agents, pods, or events.        │
│  └──────────┘                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### What Each Component Knows

| Component | Knows About | Does NOT Know About |
|-----------|------------|---------------------|
| **ONBAS** | Reality snapshot (immutable). Returns an OrchestrationRequest. | Pods, agents, sessions, events, files, CLI, web |
| **ODS** | OrchestrationRequest, PodManager, AgentContextService, GraphService. Dispatches on OR type. | ONBAS, reality building, event processing, terminal output |
| **PodManager** | Pods (create/get/destroy), sessions (load/persist). | ONBAS, ODS, events, graph state, agents beyond what pods expose |
| **AgentPod** | IAgentInstance, prompt loading, result mapping. | Graph state, other pods, ONBAS, ODS, events |
| **Reality Builder** | GraphService status, state, settings. Composes a snapshot. | ONBAS, ODS, pods, agents, CLI |
| **EHS (Settle)** | State, event handlers, subscriber stamps. Processes events into state changes. | ONBAS, ODS, pods, agents, CLI |
| **`drive()`** | `run()` result (actions count, stopReason). Delay strategy. | Agents, pods, events, sessions, ONBAS, ODS, reality |
| **CLI `cg wf run`** | `drive()` result (exitReason). Maps to terminal output + exit code. | Everything internal |

### The Event Boundary

Events on disk are the **only interface** between the orchestration system and the outside world:

- **Agents** communicate by running CLI commands → those raise events → events land on disk
- **Humans** answer questions via CLI → events land on disk
- **Settle** reads events from disk → applies state transitions
- **ONBAS** reads settled state → decides next action

Nothing inside the system talks to agents directly. Nothing inside the system handles questions directly. Events are the boundary. This is why `drive()` doesn't need to know about agents — it just keeps calling `run()`, and the settle phase discovers whatever happened since the last call by reading events from disk.

### Why This Matters for Spec B

Every new piece we add must respect these boundaries:

| New Thing | Boundary Rule |
|-----------|--------------|
| `drive()` on IGraphOrchestration | Knows ONLY about `run()` results. No pods, no agents, no events. |
| `DriveEvent` callback | Consumer-facing output. `drive()` emits generic events; CLI/web interpret them. |
| Prompt templates | AgentPod concern ONLY. ODS doesn't know about prompts. `drive()` doesn't know about prompts. |
| `cg wf run` command | Thin CLI wrapper. Maps `DriveResult` → exit code, `DriveEvent` → terminal lines. |

If any component starts reaching across a boundary, we've broken the vibe.

---

## Part 2: The Two Loops — `run()` and `drive()`

There are **two** loops in the system. Both live on `IGraphOrchestration`.

### Inner Loop: `handle.run()` (Plan 030 — existing)

Already implemented in `graph-orchestration.ts`. Runs the Settle→Decide→Act cycle **synchronously** until ONBAS returns `no-action`. Returns `OrchestrationRunResult`.

```
handle.run()
  ├── Settle: EHS.processGraph(state)
  ├── Build: reality = buildPositionalGraphReality(...)
  ├── Decide: request = onbas.getNextAction(reality)
  ├── Exit? request.type === 'no-action' → return result
  ├── Act: ods.execute(request) → fire-and-forget pod.execute()
  ├── Record action
  └── Loop back to Settle
```

**Key property**: `handle.run()` returns as soon as there's nothing to do. With real agents, this means it fires pods and returns immediately (because the agents haven't finished yet — they're async).

### Outer Loop: `handle.drive()` (Spec B — NEW)

`drive()` is the **persistent execution loop** that wraps `run()` and runs to graph completion. Both the CLI and the web server use it. It has **no knowledge of agents, pods, or execution tracking** — it only knows about `run()` results.

```
handle.drive(options)
  ├── Load pod sessions
  ├── DRIVE LOOP:
  │   ├── result = this.run()                ← inner loop
  │   ├── Emit status via callback
  │   ├── Check: graph-complete → return { exitReason: 'complete' }
  │   ├── Check: graph-failed → return { exitReason: 'failed' }
  │   ├── Delay:
  │   │   ├── result had actions? → short delay (100ms), re-enter immediately
  │   │   └── no-action?          → long delay (10s), then re-enter
  │   └── Loop back
  └── Max iterations → return { exitReason: 'max-iterations' }
```

### The Drive Loop is Agent-Agnostic

`drive()` has **zero knowledge** of agents, pods, execution tracking, or sessions. It is a dumb polling loop around `run()`:

1. Call `run()`
2. Did the graph finish? → exit
3. Did `run()` do anything? → short delay, re-enter
4. Did `run()` return no-action? → long delay, re-enter

That's it. The intelligence lives in the inner loop: settle processes events the agents raised via CLI, ONBAS detects newly completed nodes, ODS starts the next ones. `drive()` just keeps re-entering until the graph reaches a terminal state.

**Why no agent awareness?** Agents communicate through events on disk. The settle phase discovers those events. There's no need for `drive()` to track Promises or wait for specific agents — it just needs to re-enter `run()` often enough for settle to pick up new events. The short delay after actions gives agents time to start accepting. The long delay after no-action avoids busy-looping when the graph is idle (waiting for human input, slow agents, etc.).

**Why 10 seconds for no-action?** Real agents take minutes to hours. Polling every 10s means worst-case ~10s latency between an agent completing and the loop discovering it. That's acceptable. The alternative (execution tracking, `waitForAnyCompletion`) adds complexity for marginal gain — the settle phase already handles the state discovery.

The handle already:
- Carries identity (`graphSlug`) and workspace context
- Holds the PodManager (sessions loaded once, reused)
- Owns ONBAS, ODS, EHS — the full orchestration stack
- Is the "unit of work" per Workshop 07

Adding `drive()` keeps the developer UX simple:

```typescript
// CLI
const handle = await orchestrationService.get(ctx, slug);
const result = await handle.drive({ maxIterations: 200, onEvent: printToTerminal });
process.exit(result.exitReason === 'complete' ? 0 : 1);

// Web server
const handle = await orchestrationService.get(ctx, slug);
const result = await handle.drive({ maxIterations: 200, onEvent: pushToSSE });

// Test
const handle = await orchestrationService.get(ctx, slug);
const result = await handle.drive({ maxIterations: 50 });
expect(result.exitReason).toBe('complete');
```

**`run()` vs `drive()`**: `run()` is a single pass (fire pods, return). `drive()` is the full lifecycle (fire pods, wait, re-enter, repeat until done). `run()` is the building block; `drive()` is what consumers actually call. Both are useful — `run()` for tests that want fine-grained control, `drive()` for "just make it go."

---

## Part 2: Terminal Output — Default Mode

### Command Synopsis

```
$ cg wf run <slug> [--verbose] [--max-iterations <n>]
```

### Default Output

Default mode shows **orchestration status** (what the system is doing) plus **agent text** (what agents are saying). No thinking, no tool details.

```
$ cg wf run my-pipeline

Graph: my-pipeline (pending)
─────────────────────────────
  Line 0: ⬜ get-spec
  Line 1: ⚪ spec-builder → ⚪ spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 0/8 complete

[orchestrator] Iteration 1: 1 action (started get-spec)
[orchestrator] get-spec is user-input — waiting for external completion
[orchestrator] Idle — no action, waiting 10s

  (user completes get-spec from another terminal)

Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: 🔶 spec-builder → ⚪ spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 1/8 complete

[orchestrator] Iteration 2: 1 action (started spec-builder)
[spec-builder] I'll read the inputs and build a detailed specification.
[spec-builder] Created specification with 5 sections covering all requirements.

Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → 🔶 spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 2/8 complete

[orchestrator] Iteration 3: 1 action (started spec-reviewer)
[spec-reviewer] Reviewing the specification... Approved.

Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: 🔶 coder │ 🔶 tester │ 🔶 alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 3/8 complete

[orchestrator] Iteration 4: 3 actions (started coder, tester, alignment-tester)
[coder] I'll implement the solution based on the spec.
[tester] I'll write tests for the implementation.
[alignment-tester] Checking alignment with requirements...
[coder] Implementation complete.
[tester] 15 tests written, all passing.
[alignment-tester] Requirements fully covered.

Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ✅ coder │ ✅ tester │ ✅ alignment-tester
  Line 3: 🔶 pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 6/8 complete

[orchestrator] Iteration 5: 1 action (started pr-preparer — code unit)

Graph: my-pipeline (complete)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ✅ coder │ ✅ tester │ ✅ alignment-tester
  Line 3: ✅ pr-preparer → ✅ pr-creator
─────────────────────────────
  Progress: 8/8 complete

[orchestrator] Graph complete (7 iterations)
```

### Output Rules

| Source | Prefix | When Shown | Content |
|--------|--------|------------|---------|
| Driver loop | `[orchestrator]` | Always | Iterations, actions taken, idle state, completion |
| Agent text | `[nodeId]` | Always | `text_delta` and `message` events from agent |
| Agent tools | — | Never (default) | Tool calls, tool results, thinking |
| Errors | `[orchestrator] ERROR:` | Always | ODS failures, max iterations, agent crashes |

### Orchestrator Messages

| Event | Format |
|-------|--------|
| Start | `[orchestrator] Running graph: {slug}` |
| Iteration summary | `[orchestrator] Iteration {n}: {count} action(s) ({summary})` |
| User-input skip | `[orchestrator] {nodeId} is user-input — waiting for external completion` |
| Idle | `[orchestrator] Idle — waiting for external input ({interval})` |
| Node complete | `[orchestrator] Node complete: {nodeId}` |
| Agent waiting | `[orchestrator] Node waiting: {nodeId} (question pending)` |
| Graph complete | `[orchestrator] Graph complete ({n} iterations)` |
| Graph failed | `[orchestrator] ERROR: Graph failed ({n} iterations)` |
| Max iterations | `[orchestrator] ERROR: Max iterations reached ({n})` |

---

## Part 3: Graph Status View — Visual State Dump

A utility that renders the graph as a compact, readable status view. Called after each `run()` iteration so the user (or log file) can see progress at a glance.

### Design

The view renders from a `PositionalGraphReality` snapshot. It lives in `packages/positional-graph/` (not CLI) because the web will use it too (e.g. server-side rendering of graph state into text).

```typescript
// packages/positional-graph/src/features/030-orchestration/reality.format.ts

export function formatGraphStatus(reality: PositionalGraphReality): string
```

Pure function. Takes a snapshot, returns a string. No side effects, no I/O.

### Status Glyphs

The view only shows **graph-domain execution state**. It does not interpret why a node is paused (questions are an event-domain concept).

| Glyph | Statuses | Meaning |
|-------|----------|---------|
| `✅` | `complete` | Finished successfully |
| `❌` | `blocked-error` | Failed |
| `🔶` | `starting`, `agent-accepted` | Actively running |
| `⏸️` | `waiting-question`, `restart-pending` | Paused (needs external action) |
| `⬜` | `pending` + `node.ready === true` | Ready to start |
| `⚪` | `pending` + `node.ready === false` | Not yet eligible |

No question marks, no "waiting for answer" text. If a node is paused, it's paused. The event system (a higher-order concept) knows why. The graph view doesn't need to.

### Output Format

Compact, one line per graph line. Nodes shown left-to-right in position order. Log-friendly (no ANSI colors — glyphs carry the meaning).

```
Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: 🔶 coder │ 🔶 tester │ 🔶 alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 3/8 complete
```

### Separator Between Nodes

- Serial nodes (within a line): `→` (left-to-right dependency)
- Parallel nodes (within a line): `│` (independent)

The separator is determined by the **right node's** execution mode:
- If `nodes[i+1].execution === 'serial'` → use `→`
- If `nodes[i+1].execution === 'parallel'` → use `│`

### Progression Examples

**Start of execution** (user-input not yet complete):
```
Graph: my-pipeline (pending)
─────────────────────────────
  Line 0: ⬜ get-spec
  Line 1: ⚪ spec-builder → ⚪ spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 0/8 complete
```

**User-input done, first agent running**:
```
Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: 🔶 spec-builder → ⚪ spec-reviewer
  Line 2: ⚪ coder │ ⚪ tester │ ⚪ alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 1/8 complete
```

**Node paused (e.g. agent asked a question — but the view doesn't know that)**:
```
Graph: my-pipeline (in_progress)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ⏸️ coder │ 🔶 tester │ 🔶 alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 3/8 complete
```

**Agent failed**:
```
Graph: my-pipeline (failed)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ❌ coder │ ✅ tester │ ✅ alignment-tester
  Line 3: ⚪ pr-preparer → ⚪ pr-creator
─────────────────────────────
  Progress: 5/8 complete (1 failed)
```

**Graph complete**:
```
Graph: my-pipeline (complete)
─────────────────────────────
  Line 0: ✅ get-spec
  Line 1: ✅ spec-builder → ✅ spec-reviewer
  Line 2: ✅ coder │ ✅ tester │ ✅ alignment-tester
  Line 3: ✅ pr-preparer → ✅ pr-creator
─────────────────────────────
  Progress: 8/8 complete
```

### Integration with `drive()` and Consumers

`drive()` emits the formatted view as a `DriveEvent` after each iteration. It does **not** call `console.log` or `ILogger` — it has no output dependency.

```typescript
// Inside drive():
const result = await this.run();
const statusView = formatGraphStatus(result.finalReality);
emit({ type: 'status', message: statusView });
```

**Consumers decide where output goes**:

```typescript
// CLI: print to terminal
onEvent: (event) => {
  if (event.type === 'status') console.log(event.message);
}

// Web: route to logger (structured, timestamped)
onEvent: (event) => {
  if (event.type === 'status') logger.info(event.message);
}

// Test: capture for assertions
const events: DriveEvent[] = [];
onEvent: (event) => events.push(event);
```

This follows the existing codebase pattern: `packages/positional-graph/` is pure logic with no output dependencies. CLI uses `console.log` via output adapters. `ILogger` (Pino) exists for infrastructure diagnostics but is not used for user-facing output. The `onEvent` callback bridges the gap — `drive()` produces the data, the consumer routes it.

### Implementation Notes

- `formatGraphStatus` iterates `reality.lines` in index order
- For each line, iterates nodes by `positionInLine`
- Glyph selection is a pure switch on `node.status` + `node.ready`
- The `ready` flag distinguishes `⬜` (ready to run) from `⚪` (not yet eligible)
- Progress line counts `completedNodeIds.length` / `totalNodes` and notes failures if any `blockedNodeIds`

---

## Part 4: Terminal Output — Verbose Mode

With `--verbose`, the user sees **everything**: thinking, tool calls, tool results, plus orchestration diagnostics.

```
$ cg wf run my-pipeline --verbose

[orchestrator] Running graph: my-pipeline
[orchestrator] Loading pod sessions... (0 existing)
[orchestrator] Iteration 1:
  settle: 0 events processed
  decide: start-node → get-spec
  act: user-input — no-op
[orchestrator] Iteration 1: 1 action (started get-spec)
[orchestrator] Idle — no running executions, sleeping 2s

  (user completes get-spec)

[orchestrator] Iteration 2:
  settle: 2 events processed (node:completed on get-spec)
  decide: start-node → spec-builder
  act: reserved spec-builder → starting, launched AgentPod
[orchestrator] Iteration 2: 1 action (started spec-builder)
[spec-builder] [thinking] The user wants a specification based on...
[spec-builder] I'll read the inputs and build a detailed specification.
[spec-builder] [tool] Bash: cg wf node accept my-pipeline spec-builder
[spec-builder] [tool] Bash: cg wf node collate my-pipeline spec-builder
  > {"main-prompt": {"source": "unit:generate-spec"}, "requirements": {"source": "node:get-spec"}}
[spec-builder] [tool] Bash: cg wf node get-input-data my-pipeline spec-builder main-prompt
  > "Write a detailed specification based on the requirements..."
[spec-builder] [tool] Write: docs/spec.md
  > # Todo App Specification...
[spec-builder] [tool] Bash: cg wf node save-output-data my-pipeline spec-builder detailed_spec '{"title":"Todo App"}'
[spec-builder] [tool] Bash: cg wf node end my-pipeline spec-builder --message "Spec written"
[orchestrator] Node complete: spec-builder (session: ses-abc123, synced)
...
```

### Verbose Additions

| Content | Default | Verbose |
|---------|---------|---------|
| Orchestrator status | ✅ | ✅ |
| Agent text (message/text_delta) | ✅ | ✅ |
| Settle/decide/act diagnostics | ❌ | ✅ |
| Agent thinking | ❌ | ✅ (dimmed) |
| Tool calls | ❌ | ✅ |
| Tool results | ❌ | ✅ (indented) |
| Session sync | ❌ | ✅ |

---

## Part 5: Two Separate Event Domains

### The Two Event Systems

There are **two completely separate event systems**. They must not be conflated.

| System | Domain | Producer | Consumer | Transport |
|--------|--------|----------|----------|-----------|
| **DriveEvent** | Orchestration | `drive()` | CLI terminal, web SSE, tests | `onEvent` callback on `DriveOptions` |
| **AgentEvent** | Agent instance | `IAgentInstance` | Terminal handler, web stream | `instance.addEventHandler()` |

`drive()` emits `DriveEvent` (iteration status, graph view, idle, errors). It knows nothing about `AgentEvent`. Agent event wiring is a **separate consumer concern** — the CLI wires it, the web wires it, `drive()` doesn't touch it.

### DriveEvent — What `drive()` Emits

```typescript
type DriveEvent =
  | { type: 'iteration'; message: string; data?: OrchestrationRunResult }
  | { type: 'idle'; message: string }
  | { type: 'status'; message: string }   // includes graph status view
  | { type: 'error'; message: string };
```

That's it. No agent events, no node IDs, no session IDs. Pure orchestration status.

### AgentEvent — Wired Separately by the Consumer

The CLI (or web) attaches agent event handlers **independently** from `drive()`. This is an open question (OQ-01) about the best attachment mechanism, but the key principle is: `drive()` doesn't do it.

```typescript
// CLI wires two independent concerns:

// 1. Orchestration status — via drive()
const result = await handle.drive({
  onEvent: (event) => console.log(event.message),
});

// 2. Agent terminal output — wired separately, NOT via drive()
// (mechanism TBD — see OQ-01: could be onInstanceCreated hook,
//  exposed agentInstance getter, or manager-level factory)
```

### Why This Separation Matters

If `drive()` forwarded agent events:
- It would need to know about pods, instances, and agent event types — **boundary violation**
- It would need to attach handlers after each `run()` — **it would know about ODS internals**
- Two consumers wanting different agent output formatting would fight over the same callback
- The web server might want agent events on a different channel than orchestration status

By keeping them separate, each system owns its own domain. `drive()` stays agent-agnostic. Agent event wiring stays consumer-specific.

---

## Part 6: Session Sync — Handled by the Inner Loop

Session sync does **not** happen in `drive()`. It happens inside `run()` as part of the existing orchestration flow:

1. ODS fires `pod.execute()` (fire-and-forget)
2. Agent runs, calls `cg wf node end` → raises `node:completed` event on disk
3. Next `run()` → settle phase processes the event → node transitions to `complete`
4. Agent's `pod.execute()` Promise resolves → `AgentInstance.sessionId` is updated
5. The pod's `sessionId` getter reflects the new value
6. ODS on the next start-node reads `podManager.getSessionId()` for context inheritance

**The key insight**: session sync is implicit. When ODS calls `podManager.getSessionId(fromNodeId)` for inheritance, the pod's session was already set when `agentInstance.run()` resolved. There's no explicit sync step needed in the outer loop because:

- The pod holds the instance → instance holds the sessionId → pod.sessionId delegates to it
- PodManager's `setSessionId()` is called by the settle phase or at pod creation time
- `persistSessions()` should be called periodically to survive crashes

`drive()` calls `podManager.persistSessions()` after each `run()` that took actions, to ensure sessions survive a crash. That's the only session-related thing it does.

---

## Part 6: Exit Codes and Termination

| Condition | Exit Code | Message |
|-----------|-----------|---------|
| Graph completes normally | 0 | `Graph complete ({n} iterations)` |
| Graph fails (node error) | 1 | `ERROR: Graph failed ({n} iterations)` |
| Max iterations reached | 1 | `ERROR: Max iterations reached ({n})` |
| Ctrl+C (SIGINT) | 130 | `Interrupted — {n} agents still running` |

### Graceful Shutdown on SIGINT

```typescript
process.on('SIGINT', async () => {
  console.log('\n[orchestrator] Interrupted — waiting for running agents...');
  await podManager.waitForAllCompletions();
  await podManager.persistSessions(ctx, slug);
  console.log('[orchestrator] Sessions persisted. Exiting.');
  process.exit(130);
});
```

**Why wait?** Agents that are mid-execution have work in progress. Waiting for them to finish (or a short timeout) ensures sessions are captured. A second SIGINT force-exits.

---

## Part 7: Validation Workflow — How We Prove the CLI Works

### The Challenge

Real agents take minutes to hours and require API keys. We need to validate the **entire pipeline** — DI container → orchestration service → handle → inner loop → ODS → pods → driver loop → terminal output — without real agents.

### The Test Graph

A minimal 2-line, 3-node graph that exercises the key patterns:

```
Line 0: [setup] (user-input)
Line 1: [worker-a] (agent, serial) → [worker-b] (agent, serial, inherits session)
```

This covers:
- User-input node (external completion)
- Agent node (pod creation, execution, events)
- Serial execution (worker-b starts after worker-a completes)
- Session inheritance (worker-b gets worker-a's session)
- Graph completion (all 3 nodes complete → exit 0)

### Test Strategy: In-Process Integration Test

**NOT a CLI E2E test** (no `child_process.exec`). The test calls the driver loop function directly with a production-like DI container that substitutes `FakeAgentInstance` for real agents.

```typescript
describe('cg wf run driver loop', () => {
  it('drives graph from start to completion with fake agents', async () => {
    // 1. Create graph via service (real graph service, real state)
    const graphService = container.resolve(IPositionalGraphService);
    await createTestGraph(graphService, ctx, 'test-pipeline');
    
    // 2. Complete the user-input node (simulate human)
    await graphService.saveOutputData(ctx, 'test-pipeline', 'setup', 'requirements', '"Build a todo app"');
    await graphService.endNode(ctx, 'test-pipeline', 'setup', { message: 'Setup complete' });
    
    // 3. Create orchestration stack with fake agent manager
    const fakeManager = new FakeAgentManagerService();
    fakeManager.configureFakeResponse({
      status: 'completed',
      output: 'Work done.',
      sessionId: 'ses-001',
    });
    
    const handle = await orchestrationService.get(ctx, 'test-pipeline');
    
    // 4. Run drive() (the method under test)
    const events: DriveEvent[] = [];
    const result = await handle.drive({
      maxIterations: 50,
      onEvent: (e) => events.push(e),
    });
    
    // 5. Assert outcomes
    expect(result.exitReason).toBe('complete');
    expect(events.some(e => e.type === 'status' && e.message?.includes('Graph complete'))).toBe(true);
    expect(events.some(e => e.nodeId === 'worker-a')).toBe(true);
    expect(events.some(e => e.nodeId === 'worker-b')).toBe(true);
    
    // 6. Assert session inheritance
    // worker-b was created with worker-a's session via ODS context resolution
    const workerBPod = podManager.getPod('worker-b');
    expect(workerBPod?.sessionId).toBeDefined();
  });

  it('returns failed when graph fails', async () => {
    fakeManager.configureFakeResponse({
      status: 'failed',
      exitCode: 1,
      stderr: 'Agent crashed',
    });
    
    const result = await handle.drive();
    expect(result.exitReason).toBe('failed');
  });

  it('returns max-iterations when loop exhausted', async () => {
    // Agent never raises node:completed → loop never progresses
    const result = await handle.drive({ maxIterations: 5, idleSleepMs: 10 });
    expect(result.exitReason).toBe('max-iterations');
  });
});
```

### The Fake Agent Behavior Problem

There's a subtlety: `FakeAgentInstance.run()` resolves immediately, but the agent is supposed to raise events via CLI commands (`cg wf node accept`, `cg wf node end`). With fakes, those CLI commands don't happen — so the settle phase never sees the events, the node never transitions, and the loop never progresses.

**Solution: FakeAgentInstance with side effects**

The fake agent simulates what a real agent would do — raise events directly on the graph state:

```typescript
class OrchestrationFakeAgentInstance extends FakeAgentInstance {
  constructor(
    private readonly graphService: IPositionalGraphService,
    private readonly ctx: WorkspaceContext,
    private readonly graphSlug: string,
    private readonly nodeId: string,
  ) { super(); }
  
  async run(options: AgentRunOptions): Promise<AgentResult> {
    // Simulate: agent accepts the node
    await this.graphService.raiseEvent(
      this.ctx, this.graphSlug, this.nodeId,
      'node:accepted', {}, 'agent'
    );
    
    // Simulate: agent completes the node
    await this.graphService.raiseEvent(
      this.ctx, this.graphSlug, this.nodeId,
      'node:completed', { message: 'Fake agent done' }, 'agent'
    );
    
    return {
      status: 'completed',
      output: 'Fake work done.',
      sessionId: this._sessionId ?? `ses-fake-${this.nodeId}`,
      exitCode: 0,
      stderr: null,
      tokens: null,
    };
  }
}
```

This fake agent:
1. Raises `node:accepted` → settle phase transitions to `agent-accepted`
2. Raises `node:completed` → settle phase transitions to `complete`
3. Returns a result → `pod.execute()` resolves → `waitForAnyCompletion()` resolves

The next `handle.run()` settles these events and ONBAS sees the node as complete, proceeds to the next.

### What This Validates

| Concern | How It's Validated |
|---------|-------------------|
| DI wiring | Real container resolves orchestration service |
| Inner loop (Settle→Decide→Act) | `handle.run()` executes correctly |
| Outer loop (driver) | `runDriverLoop()` waits for agents, re-enters |
| Fire-and-forget + polling | `run()` returns, `drive()` re-enters after delay, settle discovers events |
| Session sync | Pod holds instance → instance holds sessionId → ODS reads it for inheritance |
| Session inheritance | Second agent created with first agent's session |
| Terminal output | Captured `write` function asserts [orchestrator] and [nodeId] lines |
| Exit codes | exit 0 on complete, exit 1 on failure/max-iterations |
| Event flow | Fake agent raises events → settle processes → ONBAS decides → ODS acts |

### What This Does NOT Validate (Spec C)

- Real agent follows the prompt
- Real agent calls CLI commands correctly
- Agent actually reads inputs via `cg wf node get-input-data`
- Non-deterministic agent behavior
- Network/timeout failures

---

## Part 8: The `IGraphOrchestration.drive()` Interface Extension

`drive()` is added to the existing `IGraphOrchestration` interface:

```typescript
// Added to orchestration-service.types.ts

export interface DriveOptions {
  readonly maxIterations?: number;     // default: 200
  readonly actionDelayMs?: number;     // default: 100 (short delay after actions)
  readonly idleDelayMs?: number;       // default: 10_000 (long delay after no-action)
  readonly onEvent?: (event: DriveEvent) => void;
}

export type DriveEventType =
  | 'iteration' | 'idle'
  | 'status' | 'error';

export interface DriveEvent {
  readonly type: DriveEventType;
  readonly message?: string;
  readonly data?: unknown;
}

export type DriveExitReason = 'complete' | 'failed' | 'max-iterations';

export interface DriveResult {
  readonly exitReason: DriveExitReason;
  readonly iterations: number;
  readonly totalActions: number;
}

export interface IGraphOrchestration {
  readonly graphSlug: string;

  /** Single Settle→Decide→Act pass. Returns when ONBAS says no-action. */
  run(): Promise<OrchestrationRunResult>;

  /**
   * Persistent execution loop. Calls run() repeatedly, runs to completion.
   * Agent-agnostic: re-enters after a short delay if actions were taken,
   * or after a long delay if no-action (idle polling).
   */
  drive(options?: DriveOptions): Promise<DriveResult>;

  /** Read-only reality snapshot. */
  getReality(): Promise<PositionalGraphReality>;
}
```

### Pseudocode for `drive()`

```typescript
async drive(options?: DriveOptions): Promise<DriveResult> {
  const maxIterations = options?.maxIterations ?? 200;
  const actionDelay = options?.actionDelayMs ?? 100;
  const idleDelay = options?.idleDelayMs ?? 10_000;
  const emit = options?.onEvent ?? (() => {});
  
  let totalActions = 0;
  
  await this.podManager.loadSessions(this.ctx, this.graphSlug);
  emit({ type: 'status', message: `Running graph: ${this.graphSlug}` });
  
  for (let i = 0; i < maxIterations; i++) {
    const result = await this.run();
    totalActions += result.actions.length;
    
    emit({ type: 'iteration', message: `Iteration ${i + 1}: ${result.actions.length} action(s)`, data: result });
    
    // Persist sessions after actions (crash recovery)
    if (result.actions.length > 0) {
      await this.podManager.persistSessions(this.ctx, this.graphSlug);
    }
    
    // Terminal conditions
    if (result.stopReason === 'graph-complete') {
      emit({ type: 'status', message: `Graph complete (${i + 1} iterations)` });
      return { exitReason: 'complete', iterations: i + 1, totalActions };
    }
    if (result.stopReason === 'graph-failed') {
      emit({ type: 'error', message: `Graph failed (${i + 1} iterations)` });
      return { exitReason: 'failed', iterations: i + 1, totalActions };
    }
    
    // Delay before re-entering
    if (result.actions.length > 0) {
      await sleep(actionDelay);    // actions taken → re-enter quickly
    } else {
      emit({ type: 'idle', message: `No action — waiting ${idleDelay / 1000}s` });
      await sleep(idleDelay);      // nothing to do → poll slowly
    }
  }
  
  emit({ type: 'error', message: `Max iterations reached (${maxIterations})` });
  return { exitReason: 'max-iterations', iterations: maxIterations, totalActions };
}
```

### Consumer Examples

```typescript
// CLI — maps DriveEvent to terminal output
const result = await handle.drive({
  maxIterations: 200,
  onEvent: (event) => {
    // All DriveEvents have .message — just print it
    console.log(`[orchestrator] ${event.message}`);
  },
});
process.exit(result.exitReason === 'complete' ? 0 : 1);

// Agent output is wired SEPARATELY (not via drive):
// agentManager.onInstanceCreated(...) or similar — see OQ-01

// Web — maps DriveEvent to SSE
const result = await handle.drive({
  onEvent: (event) => centralEventNotifier.emit('orchestration', event),
});

// Test — no callback, just check result
const result = await handle.drive({ maxIterations: 50, idleDelayMs: 10 });
expect(result.exitReason).toBe('complete');
```

---

## Part 9: Command Registration

The command registers on the existing `wf` subcommand group:

```typescript
// In positional-graph.command.ts, after existing wf subcommands:

wf
  .command('run <slug>')
  .description('Run the orchestration loop for a graph')
  .option('--verbose', 'Show agent thinking, tools, and orchestration diagnostics')
  .option('--max-iterations <n>', 'Maximum drive loop iterations', '200')
  .action(wrapAction(async (slug: string, opts: any, cmd: any) => {
    const ctx = await resolveContext(cmd);
    const container = createCliProductionContainer(ctx);
    
    const orchestrationService = container.resolve(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE);
    const handle = await orchestrationService.get(ctx, slug);
    
    const exitCode = await cliDriveGraph(handle, {
      maxIterations: parseInt(opts.maxIterations),
      verbose: opts.verbose,
    });
    
    process.exit(exitCode);
  }));
```

The thin `cliDriveGraph` wrapper maps `DriveEvent` → terminal output and `DriveResult` → exit code. It's the only CLI-specific code:

```typescript
async function cliDriveGraph(
  handle: IGraphOrchestration,
  options: { maxIterations?: number; verbose?: boolean },
): Promise<number> {
  const result = await handle.drive({
    maxIterations: options.maxIterations,
    onEvent: createCliEventHandler(options.verbose),
  });
  return result.exitReason === 'complete' ? 0 : 1;
}
```
```

---

## Open Questions

### OQ-01: How should agent event handlers be attached for terminal/web output?

**OPEN**: Agent events (`text_delta`, `tool_call`, etc.) need to reach the CLI terminal or web UI. But `drive()` doesn't do this — it's a separate concern. Options:
- A: Expose `agentInstance` getter on AgentPod — consumer reads pods after `drive()` starts, attaches handlers
- B: `onInstanceCreated` hook on AgentManagerService — consumer registers a factory before `drive()`
- C: Manager-level `setDefaultEventHandler()` — all new instances get it automatically

**Recommendation**: Option B — cleanest separation. Consumer registers the hook before calling `drive()`, every new instance gets the handler. `drive()` never touches it.

### OQ-02: Should `drive()` call `persistSessions()` after every iteration or only after actions?

**OPEN**: Persisting after every iteration is safe but wasteful. After actions only means crash between no-action iterations could lose a session.

**Recommendation**: After actions only. If `run()` returned no-action, nothing changed. Sessions only update when agents complete, which means actions were taken on a prior iteration and already persisted.

### OQ-03: Should the fake agent raise events via service methods or event service?

**OPEN**: The fake needs to simulate what a real agent does (raise events on disk).

**Recommendation**: Use `graphService.endNode()` etc. — same code paths the CLI commands use internally. Fast, deterministic.

---

## Quick Reference

```
DRIVE LOOP LIFECYCLE:
  load sessions → LOOP { run() → check exit → delay → repeat } → return result

DELAY STRATEGY:
  actions taken → 100ms (re-enter quickly, more work likely pending)
  no-action     → 10s   (idle poll, agents still running or waiting for human)

TERMINAL OUTPUT (CLI layer, not drive()):
  [orchestrator] System status (always)
  [nodeId]       Agent text (always)
  [thinking]     Agent reasoning (--verbose only)
  [tool]         Tool calls/results (--verbose only)

EXIT CODES (CLI maps from DriveResult):
  0 = exitReason: 'complete'
  1 = exitReason: 'failed' | 'max-iterations'
  130 = SIGINT

VALIDATION GRAPH:
  Line 0: [setup] (user-input)
  Line 1: [worker-a] → [worker-b] (serial agents, session inheritance)

KEY INTERFACE:
  handle.run()              → OrchestrationRunResult  (single pass, existing)
  handle.drive(options?)    → DriveResult              (persistent loop, NEW)
  DriveOptions.onEvent      → callback for status/events (consumer-specific)
```
