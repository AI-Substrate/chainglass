# Workshop: Workflow System Domain Boundaries

**Type**: Integration Pattern / Architecture Rules
**Scope**: All plans touching the workflow / orchestration system
**Created**: 2026-02-17
**Status**: Draft

**Related Documents**:
- [Clean Architecture Rules](../../rules/architecture.md)
- [Plan 030: Positional Orchestrator](../../plans/030-positional-orchestrator/positional-orchestrator-plan.md)
- [Plan 032: Node Event System](../../plans/032-node-event-system/node-event-system-plan.md)
- [Plan 034: Agentic CLI](../../plans/034-agentic-cli/agentic-cli-plan.md)
- [Plan 035: Agent Orchestration Wiring](../../plans/035-agent-orchestration-wiring/agent-orchestration-wiring-plan.md)
- [Workshop 12: ODS Design](../../plans/030-positional-orchestrator/workshops/12-ods-design.md) — Fire-and-forget, ODS as launcher
- [Workshop 10: Event Processing in Orchestration Loop](../../plans/032-node-event-system/workshops/10-event-processing-in-the-orchestration-loop.md) — Settle→Decide→Act

---

## Purpose

Define the **domain boundaries** within the workflow/orchestration system so that future plans do not accidentally introduce cross-domain coupling. This document exists because we've already caught near-misses: `drive()` almost forwarded agent events, the graph status view almost exposed question lifecycle, and execution tracking almost gave the outer loop knowledge of pods.

Each domain has one job. It knows only its own things. The contracts between domains are the only interfaces. **High cohesion within, low coupling between.**

This workshop produces:
1. A domain map (this document)
2. Rules for what each domain may and may not know
3. Boundary violation examples (things we caught, things to watch for)
4. A rules document in `docs/rules/` for ongoing reference
5. An ADR recording this as an architectural decision

---

## The Six Domains

The workflow system has six domains. Each is independent. They communicate through well-defined contracts — never by reaching into each other's internals.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WORKFLOW / ORCHESTRATION SYSTEM                       │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   GRAPH     │  │   EVENT     │  │ ORCHESTR.   │  │   AGENT     │  │
│  │   DOMAIN    │  │   DOMAIN    │  │   DOMAIN    │  │   DOMAIN    │  │
│  │             │  │             │  │             │  │             │  │
│  │ Structure,  │  │ Events on   │  │ Settle →    │  │ Instances,  │  │
│  │ state,      │  │ disk, raise │  │ Decide →    │  │ sessions,   │  │
│  │ readiness   │  │ & handle,   │  │ Act loop,   │  │ adapters,   │  │
│  │ gates,      │  │ subscriber  │  │ drive loop  │  │ run/compact │  │
│  │ status      │  │ stamps      │  │             │  │             │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
│         │                │                │                │          │
│  ┌──────┴──────┐  ┌──────┴──────┐                                    │
│  │   POD       │  │  CONSUMER   │                                    │
│  │   DOMAIN    │  │  DOMAIN     │                                    │
│  │             │  │             │                                    │
│  │ AgentPod,   │  │ CLI cmds,   │                                    │
│  │ CodePod,    │  │ web server, │                                    │
│  │ PodManager, │  │ terminal    │                                    │
│  │ sessions    │  │ output, SSE │                                    │
│  └─────────────┘  └─────────────┘                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Domain Definitions

### 1. Graph Domain

> *I am the ledger. I record the shape of work and the facts of what happened. I do not act.*

**Owner**: `packages/positional-graph/src/schemas/`, `services/positional-graph.service.ts`
**Plans**: 026 (model), 028 (questions schema)

**Owns**:
- Graph structure: lines, nodes, positions, execution modes (serial/parallel)
- Node state: `NodeExecutionStatus` enum (starting, agent-accepted, waiting-question, blocked-error, restart-pending, complete)
- Readiness gates: 4-gate algorithm (precedingLinesComplete, transitionOpen, serialNeighborComplete, inputsAvailable)
- Input wiring and resolution
- State persistence (state.json, atomic writes)
- Question schema (storage shape only — not question lifecycle logic)

**Does NOT own**:
- Why a node is in a given status (that's event domain)
- What to do about a status (that's orchestration domain)
- How agents work (that's agent domain)
- How pods execute (that's pod domain)

**Key rule**: The graph domain is a **data store**. It records facts. It does not make decisions or drive behaviour. `startNode()` transitions a status — it doesn't know or care whether an agent or a test harness triggered it.

---

### 2. Event Domain

> *I am the nervous system. I carry signals between the workflow and the outside world. Higher-order features — questions, answers, restarts — are expressed through me without the workflow engine knowing they exist.*

**Owner**: `packages/positional-graph/src/features/032-node-event-system/`
**Plans**: 032

**Owns**:
- Event types: `node:accepted`, `node:completed`, `node:error`, `question:ask`, `question:answer`, `node:restart`, `progress:update`
- Event lifecycle: new → acknowledged → handled
- `raiseEvent()` — the single write path (validate, record, persist)
- Event handlers — state transition functions invoked by `handleEvents()`
- `INodeEventService` — single-node event operations
- `IEventHandlerService` — graph-wide event processing (the Settle phase)
- Subscriber stamps — tracking which subscriber has processed which event
- Question lifecycle: ask → answer → restart (all expressed as events)

**Does NOT own**:
- Graph structure or readiness gates (that's graph domain)
- What happens after events are settled (that's orchestration domain — ONBAS reads settled state)
- Agent execution or sessions (that's agent/pod domain)
- Terminal output or user interaction (that's consumer domain)

**Key rule**: The event domain **records facts and applies consequences**. An agent raises `node:completed` → the handler sets `status = 'complete'`. That's it. The event domain doesn't decide what node to start next. It doesn't surface questions to users. It doesn't notify anyone. It just records and transitions.

**The extension point**: Events are how the workflow system communicates with everything outside itself — without coupling to it. Q&A is the prime example: an agent raises a `question:ask` event. The workflow doesn't handle the question — something external does (a human via CLI, a web UI, another system). When the answer arrives, it comes back as a `question:answer` event. The settle phase applies the state change, ONBAS sees the node is ready, and the loop continues. The workflow engine never knew what the question was, who answered it, or how. It just saw events.

This means we can express arbitrarily complex cross-system features later (approvals, escalations, external integrations) by adding new event types — without modifying ONBAS, ODS, `drive()`, or any orchestration code. The workflow engine processes events generically. The semantics live in the event type definitions and their handlers.

**Critical boundary**: Question/answer is an **event-domain concept**. The graph domain stores `pending_question_id` and `waiting-question` status as state fields, but the *lifecycle* (ask → surface → answer → restart) is entirely expressed through events. Other domains should not reference questions directly — they see `waiting-question` status (graph domain fact) or `⏸️ paused` (a status glyph), never "waiting for answer to question Q-123."

---

### 3. Orchestration Domain

> *I am the conductor. I read the score, choose the next note, and cue the player — then I step back and wait.*

**Owner**: `packages/positional-graph/src/features/030-orchestration/`
**Plans**: 030, 035, 036

The orchestration domain has five subdomains, each with its own job and vibe:

#### 3a. Reality (the snapshot)

> *I am the photograph. I freeze the entire graph at one instant so that decisions can be made on stable ground.*

- `buildPositionalGraphReality()` composes data from `graphService.getStatus()` + state + settings
- Produces `PositionalGraphReality` — an immutable snapshot with lines, nodes, readiness, questions, sessions
- `PositionalGraphRealityView` adds navigation helpers (getNode, getLeftNeighbor, etc.)
- Built once per loop iteration. Nobody writes to it. ONBAS reads it, ODS reads it, then it's discarded.
- **Never re-implements gate logic** — trusts `getStatus()` from the graph domain.

#### 3b. OrchestrationRequest (the decision envelope)

> *I am the message. I carry everything needed to act — no follow-up questions required.*

- 4-variant discriminated union: `start-node`, `resume-node`, `question-pending`, `no-action`
- Each variant is **self-contained** — it carries all the data ODS needs (nodeId, graphSlug, inputs, reason)
- Produced by ONBAS, consumed by ODS. The loop doesn't inspect it — just passes it through.
- TypeScript `never` in the default case ensures exhaustive handling.
- Today only `start-node` and `no-action` are live. `resume-node` and `question-pending` are **dead code** — they were designed before the event system existed. Q&A and resumption are now expressed entirely through events (Plan 032), not through orchestration requests. These variants remain in the union only for exhaustive type checking; ODS returns a defensive error if they ever appear.
- **This is a lesson in domain boundaries**: `question-pending` was originally an orchestration concept ("ONBAS detects a question, tells ODS to surface it"). Moving it to the event domain was the right call — questions are signals between agents and the outside world, not orchestration decisions. The dead variants are a scar from before the boundary was clean.

#### 3c. ONBAS (the decision engine)

> *I am the judge. Show me the state of the world and I'll tell you the one best thing to do next. I will never act on it myself.*

- `walkForNextAction(reality): OrchestrationRequest` — pure, synchronous, stateless
- Walks lines 0→N, nodes by position, first actionable node wins
- Same input → same output. Always. No side effects, no I/O, no memory between calls.
- Returns `no-action` with a diagnostic `reason` when nothing is actionable (graph-complete, graph-failed, all-running, all-waiting, empty-graph)
- **Does not know**: pods, agents, events, files, CLI, web. Only sees the reality snapshot.

#### 3d. ODS (the launcher)

> *I am the ignition key. I turn the engine on. I don't drive the car, and I don't check the mirrors.*

- `execute(request, ctx, reality): OrchestrationExecuteResult` — dispatches on `request.type`
- For `start-node`: reserves node (`startNode()` → starting), creates pod via PodManager, fires `pod.execute()` **without await**, returns immediately
- For `no-action`: no-op, returns `{ ok: true }`
- For `resume-node` / `question-pending`: defensive error (dead code — events handle these)
- **Fire-and-forget**: ODS does not wait for the pod, does not read the result, does not process events. The agent communicates through events on disk. The settle phase discovers what happened.
- **Does not know**: ONBAS, event processing, terminal output, the drive loop.

#### 3e. `drive()` (the persistence loop)

> *I am the heartbeat. I keep the loop alive, but I have no idea what's happening inside it.*

- `handle.drive(options): DriveResult` — calls `run()` repeatedly until the graph reaches a terminal state
- Agent-agnostic: no knowledge of pods, instances, sessions, events, or agent types
- Delay strategy: short delay (100ms) after actions, long delay (10s) after no-action
- Emits `DriveEvent` (orchestration status only — never agent events)
- Used by CLI, web, tests — all call the same method with different `onEvent` callbacks
- **Does not know**: what agents are, what pods are, what events are, what sessions are. Only sees `run()` results: action count and stop reason.

#### 3f. `IOrchestrationService` / `IGraphOrchestration` (the entry point)

> *I am the front door. Resolve me from DI, give me a graph slug, and I'll hand you a handle that does everything.*

- Two-level pattern: `IOrchestrationService` (singleton, DI-registered) → `IGraphOrchestration` (per-graph handle)
- Handle carries identity (`graphSlug`), holds PodManager, ONBAS, ODS, EHS
- Handle caching: same slug → same handle within process lifetime
- Exposes `run()` (single pass), `drive()` (persistent loop), `getReality()` (read-only snapshot)
- **The only public surface** of the orchestration domain. Internal collaborators (ONBAS, ODS, PodManager, AgentContextService) are never exposed.

---

**Owns** (collectively):
- `PositionalGraphReality` — immutable snapshot
- `OrchestrationRequest` — 4-variant decision envelope
- `ONBAS` — pure decision engine
- `ODS` — fire-and-forget launcher
- `run()` — single Settle→Decide→Act pass
- `drive()` — persistent polling loop
- `IOrchestrationService` / `IGraphOrchestration` — entry point
- `AgentContextService` — positional session inheritance rules

**Does NOT own**:
- Graph state or readiness computation (reads it via reality builder, doesn't compute it)
- Event processing (delegates to `IEventHandlerService` during settle)
- Agent lifecycle (ODS asks PodManager to create pods; doesn't manage agents directly)
- Terminal output, exit codes, or user-facing formatting (that's consumer domain)

---

### 4. Agent Domain

> *I am the worker. Give me a prompt and a workspace and I'll do the job. I don't know what a graph is.*

**Owner**: `packages/shared/src/features/034-agentic-cli/`
**Plans**: 034

**Owns**:
- `IAgentInstance` — 3-state lifecycle (stopped/working/error), run/compact/terminate
- `IAgentManagerService` — creates instances, session index, same-instance guarantee
- `AgentEvent` — agent-level events (text_delta, tool_call, thinking, message, tool_result)
- Agent adapters — `IAgentAdapter` (Claude Code, Copilot SDK)
- Agent event handlers — `addEventHandler()`, multiple consumers, fire-and-forget delivery

**Does NOT own**:
- Graph state (doesn't know graphs exist)
- Node events (doesn't know about `node:accepted`, `question:ask`, etc.)
- Orchestration decisions (doesn't know about ONBAS or ODS)
- Pods (agents don't know they're wrapped in pods)
- Prompts (agent receives a string — doesn't know it came from a template)

**Key rule**: The agent domain is **completely independent** of the workflow system. `IAgentInstance` and `IAgentManagerService` are usable without any graph, orchestration, or event code. The `cg agent run` command proves this — it runs agents with zero workflow dependency.

**Important**: Agents are just one type of worker. The workflow system runs **work units**, not agents. There are three work unit types today — with more to come:

| Work Unit Type | What It Is | Pod Type | Runner |
|---------------|-----------|----------|--------|
| `agent` | An LLM agent (Claude Code, Copilot) that receives a prompt and works autonomously | `AgentPod` | `IAgentInstance` |
| `code` | Imperative code (bash/python script) that runs deterministically | `CodePod` | `IScriptRunner` |
| `user-input` | A human providing data (text, choices) | No pod — ODS skips, handled externally | N/A |

The work unit type system (`packages/positional-graph/src/features/029-agentic-work-units/`) is a discriminated union — `WorkUnit = AgenticWorkUnit | CodeUnit | UserInputUnit`. Each type has its own schema, config, and rich domain object. The orchestration domain sees `unitType` on the node and routes to the appropriate pod. ODS doesn't care what's inside the pod — it just calls `pod.execute()`.

Future work unit types (approval gates, external API calls, composite units) will plug in by adding a new variant to the union, a new pod type, and a new case in `PodManager.createPod()`. Nothing else changes — ONBAS, `drive()`, the event system, and the CLI are all unaware.

**Critical boundary**: Agent events (`text_delta`, `tool_call`) and node events (`node:accepted`, `node:completed`) are **two entirely separate event systems**. Agent events are in-memory callbacks on `IAgentInstance`. Node events are persisted to disk via `raiseEvent()`. They must never be conflated, forwarded through the same callback, or mixed in the same type union.

---

### 5. Pod Domain

> *I am the container. I wrap a worker, hand it instructions, and report back what happened. I don't choose who works or when.*

**Owner**: `packages/positional-graph/src/features/030-orchestration/pod.*.ts`, `pod-manager.ts`
**Plans**: 030 (Phase 4), 035 (rewiring)

**Owns**:
- `IWorkUnitPod` — execution container interface (`execute()`, `terminate()`, `sessionId`)
- `AgentPod` — wraps `IAgentInstance`, loads prompts, maps results
- `CodePod` — wraps `IScriptRunner`, runs scripts
- `PodManager` — creates/tracks pods, session persistence to `pod-sessions.json`

**Does NOT own**:
- Agent lifecycle (delegates to `IAgentInstance.run()`)
- Orchestration decisions (doesn't know about ONBAS)
- Event processing (agents raise events via CLI commands, not through pods)
- Graph state (pods don't read or write graph state)

**Key rule**: Pods are **execution containers**. They wrap an agent or script, provide a uniform `execute()` interface, and track session IDs. They don't make decisions. They don't process events. They don't know the graph topology.

**Critical boundary**: Prompt loading is a pod-domain concern. `AgentPod` loads `node-starter-prompt.md`, resolves `{{placeholders}}`, and passes the result to `agentInstance.run({prompt})`. ODS doesn't know about prompts. `drive()` doesn't know about prompts. The orchestration domain asks the pod to execute — the pod decides how.

---

### 6. Consumer Domain

> *I am the interface. I translate system events into things humans and scripts can see, and route their actions back in.*

**Owner**: `apps/cli/src/commands/`, `apps/web/` (future)
**Plans**: Various

**Owns**:
- CLI commands (`cg wf run`, `cg wf node accept`, etc.)
- Terminal output formatting (`[orchestrator]`, `[nodeId]` prefixed lines)
- Output adapters (JSON vs human-readable)
- Exit codes
- Agent event handler wiring (attaching terminal printers to agent instances)
- Web SSE, server actions (future)

**Does NOT own**:
- Orchestration logic (calls `handle.drive()`, doesn't implement the loop)
- Event processing (CLI commands call service methods that raise events internally)
- Agent lifecycle (resolves `IAgentManagerService` from DI, doesn't manage agents)
- Graph state (reads via service, doesn't modify directly)

**Key rule**: Consumers are **thin wrappers**. They resolve services from DI, call methods, and format output. A CLI command should be 10-30 lines of glue code. If a command contains business logic, that logic belongs in a service.

---

## Domain Dependency Rules

### Allowed Dependencies

```
Consumer → Orchestration → Event → Graph
Consumer → Agent (for event handler wiring)
Orchestration → Pod → Agent
Orchestration → Graph (via reality builder)
Event → Graph (handlers write to state)
```

### Forbidden Dependencies

| From | To | Why |
|------|----|-----|
| Graph | Event | Graph is pure data store. Events are a higher-order concept. |
| Graph | Orchestration | Graph doesn't know it's being orchestrated. |
| Agent | Graph | Agents are workflow-independent. |
| Agent | Event | Agent events ≠ node events. Separate systems. |
| Agent | Orchestration | Agents don't know they're in a loop. |
| Pod | Orchestration | Pods execute. They don't decide. |
| ONBAS | ODS | ONBAS produces requests. ODS consumes them. No back-channel. |
| ODS | ONBAS | ODS doesn't ask "what should I do?" — it's told. |
| `drive()` | Pod/Agent | `drive()` is a dumb polling loop. Agent-agnostic. |
| Event | Agent | Node events don't know about agent instances. |

### The Import Rule

In the codebase, these rules manifest as **import direction**:

```
030-orchestration/ imports from 032-node-event-system/  ✅ (IEventHandlerService for settle)
032-node-event-system/ does NOT import from 030-orchestration/  ✅ (correct)
030-orchestration/ imports IAgentInstance from @chainglass/shared  ✅ (via pod domain)
032-node-event-system/ does NOT import IAgentInstance  ✅ (correct)
```

If you find yourself writing an import that goes against the dependency direction, **stop**. The design is wrong, not the import rule.

---

## Boundary Violation Examples

### ❌ VIOLATION: `drive()` forwarding agent events

```typescript
// WRONG — drive() knows about agent events
type DriveEvent =
  | { type: 'status'; message: string }
  | { type: 'agent-event'; nodeId: string; event: AgentEvent }; // ← VIOLATION

// drive() attaches handlers to agent instances
pod.agentInstance.addEventHandler((e) => emit({ type: 'agent-event', ... })); // ← VIOLATION
```

**Why it's wrong**: `drive()` is orchestration domain. `AgentEvent` is agent domain. `drive()` would need to know about pods, instances, and agent event types — three boundary crossings.

**Correct approach**: Consumer wires agent events independently. `drive()` emits only `DriveEvent` (orchestration status).

---

### ❌ VIOLATION: Graph status view showing question details

```typescript
// WRONG — graph status view exposes event-domain concepts
function formatGraphStatus(reality: PositionalGraphReality): string {
  if (node.status === 'waiting-question') {
    return `❓ ${node.nodeId} (waiting for answer to ${node.pendingQuestionId})`; // ← VIOLATION
  }
}
```

**Why it's wrong**: Questions are an event-domain lifecycle concept. The graph status view is graph-domain. Showing `pendingQuestionId` or "waiting for answer" leaks event concepts into graph presentation.

**Correct approach**: Show `⏸️ paused`. The graph domain knows the node is paused (that's a status). It doesn't know or care *why*.

---

### ❌ VIOLATION: ODS processing events after agent completion

```typescript
// WRONG — ODS monitors agent results
const result = await pod.execute(options);  // ← blocks, ODS waits for agent
if (result.outcome === 'question') {
  await this.deps.eventService.raise('question:ask', ...);  // ← VIOLATION
}
```

**Why it's wrong**: ODS is fire-and-forget. Event processing belongs to the settle phase. Agents communicate through CLI commands that raise events on disk. ODS doesn't wait, doesn't read results, doesn't process events.

**Correct approach**: ODS fires `pod.execute()` without await. Agent raises events via CLI. Next `run()` iteration settles them.

---

### ❌ VIOLATION: ONBAS with side effects

```typescript
// WRONG — ONBAS writes to state
function walkForNextAction(reality: PositionalGraphReality): OrchestrationRequest {
  if (node.status === 'waiting-question') {
    graphService.surfaceQuestion(node.pendingQuestionId); // ← VIOLATION: side effect
  }
}
```

**Why it's wrong**: ONBAS is a pure function. Snapshot in, request out. Zero side effects. Zero I/O. Zero memory between calls.

**Correct approach**: ONBAS returns `question-pending` request. The consumer (or a future handler) surfaces the question.

---

### ❌ VIOLATION: Pod raising node events directly

```typescript
// WRONG — pod crosses into event domain
class AgentPod implements IWorkUnitPod {
  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    await this.eventService.raise('node:accepted', ...); // ← VIOLATION
    const result = await this.agentInstance.run({...});
    await this.eventService.raise('node:completed', ...); // ← VIOLATION
  }
}
```

**Why it's wrong**: Pods execute agents/scripts. They don't raise events. The *agent* raises events by calling CLI commands (`cg wf node accept`, `cg wf node end`). Those CLI commands call the event service. The pod is just a container.

**Correct approach**: Pod calls `agentInstance.run({prompt})`. The prompt instructs the agent to call CLI commands. Events flow through the CLI → event service → disk.

---

### ✅ CORRECT: Each component stays in its lane

```
Agent (in pod) → runs CLI command → cg wf node accept
  CLI command → calls graphService.raiseEvent('node:accepted', ...)
    Event service → validates, records event, handler sets agent-accepted
      (event on disk)

Next run() iteration:
  Settle → EHS.processGraph() finds event, applies state transition
  Reality → builds snapshot with node now in agent-accepted
  ONBAS → walks snapshot, skips agent-accepted (running), finds next
  ODS → starts next node if any
```

Every component does its one thing. No reaching across boundaries.

---

## The Litmus Test

When adding new functionality, ask these questions:

1. **Does this component need to know about a concept from another domain?**
   → If yes, you're probably crossing a boundary. Redesign.

2. **Would this still work if I replaced the other domain with a fake?**
   → If no, you have a hidden coupling. The contract isn't clean enough.

3. **Can I explain what this component does without mentioning another domain?**
   → "ONBAS reads a snapshot and returns a request." ✅ No mention of agents, events, CLI.
   → "`drive()` calls `run()` and checks the result." ✅ No mention of pods, sessions, events.
   → "ODS takes a request and launches pods." ✅ No mention of ONBAS, events, settle.

4. **If I added a new feature to domain X, would domain Y need to change?**
   → If yes, the boundary is leaky. Example: adding a new event type should not require changes to ONBAS, ODS, or `drive()`.

5. **Are there two different "event" concepts being mixed?**
   → Agent events (in-memory, instance-level) ≠ node events (on-disk, graph-level) ≠ drive events (orchestration status) ≠ domain events (SSE notifications). Four separate systems. Never conflate.

---

## Open Questions

### OQ-01: Should question surfacing be event-domain or consumer-domain?

**RESOLVED**: Surfacing is **consumer-domain** — which is effectively outside the workflow system. The event domain records the fact (`question:ask` event, `waiting-question` status). Consumers decide what to do with it: a web handler shows a dialog, the CLI prints a message, a bot forwards it to Slack. The workflow system doesn't know or care how questions reach humans — it just sees the answer come back as an event.

### OQ-02: Where does `formatGraphStatus()` live?

**RESOLVED**: In `packages/positional-graph/` (graph domain). It reads `PositionalGraphReality` (a graph snapshot) and produces a string. Pure function, no consumer dependency. Consumers call it and route the output wherever they want.

---

## Quick Reference

```
DOMAIN BOUNDARIES:
  Graph    → structure, state, readiness gates, persistence
  Event    → raise, handle, stamp, question lifecycle
  Orchestr → reality, ONBAS, ODS, run(), drive()
  Agent    → instances, manager, adapters, agent events
  Pod      → AgentPod, CodePod, PodManager, prompts, sessions
  Consumer → CLI, web, terminal output, exit codes

KEY RULES:
  ONBAS    → pure function, no side effects
  ODS      → fire-and-forget launcher, no event processing
  drive()  → dumb polling loop, agent-agnostic
  Events   → only interface to the outside world (agents, humans)
  AgentEvent ≠ NodeEvent ≠ DriveEvent ≠ DomainEvent

LITMUS TEST:
  "Can I explain this component without mentioning another domain?"
  "Would this still work with fakes for every dependency?"
```
