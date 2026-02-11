# Workshop: Orchestration Entry Point & Developer UX

**Type**: Integration Pattern
**Plan**: 030-positional-orchestrator
**Spec**: [positional-orchestrator-spec.md](../positional-orchestrator-spec.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [Workshop #1: PositionalGraphReality](01-positional-graph-reality.md)
- [Workshop #2: OrchestrationRequest](02-orchestration-request.md)
- [Workshop #5: ONBAS](05-onbas.md)
- [Workshop #4: WorkUnitPods](04-work-unit-pods.md)

---

## Purpose

Define the top-level entry point for orchestration — the object a developer creates when they want to orchestrate a specific graph. This workshop addresses the gap between "I have five internal services" (ONBAS, ODS, PodManager, AgentContextService, Reality builder) and "I'm on a graph page and need to do something." Good developer UX means: resolve one service, get one object, call one method.

## Key Questions Addressed

- What is the first object a developer creates to orchestrate a graph?
- How does the two-level pattern (singleton service → per-graph handle) work?
- What does `IGraphOrchestration` expose to callers?
- What does the `run()` result look like?
- How do web pages, CLI commands, and tests each consume this?
- How is this registered in DI and faked for testing?

---

## The Problem

Workshops #1–#5 define five internal collaborators:

| Service | Role |
|---------|------|
| `buildPositionalGraphReality()` | Snapshot builder |
| ONBAS (`walkForNextAction`) | Decision engine |
| ODS | Executor |
| AgentContextService | Context rules |
| PodManager | Pod lifecycle |

A developer on a graph page should never interact with any of these directly. They need a single entry point that composes them all for a specific graph.

Two objects are needed:

1. **`IOrchestrationService`** — DI-registered singleton. The factory. Resolves from the container.
2. **`IGraphOrchestration`** — Per-graph handle with identity. The thing you work with.

```
Container ──resolve──> IOrchestrationService (singleton)
                              │
                              │  .get(ctx, graphSlug)
                              ▼
                       IGraphOrchestration (per-graph, has identity)
                              │
                              ├── .run()          → OrchestrationRunResult
                              ├── .getReality()   → PositionalGraphReality
                              └── .graphSlug      → string
```

---

## Design Decision: Two-Level Pattern

### Why Not Just a Service with `run(ctx, graphSlug)`?

A flat `orchestrationService.run(ctx, graphSlug)` works for a single CLI invocation. But consider the web page:

```typescript
// Page needs to show state AND run orchestration AND show results
// All for the same graph. With a flat service you repeat the slug everywhere:
const reality = await service.getReality(ctx, 'my-graph');
const result = await service.run(ctx, 'my-graph');
const newReality = await service.getReality(ctx, 'my-graph');
```

With a per-graph handle:

```typescript
const graph = await service.get(ctx, 'my-graph');
const reality = await graph.getReality();
const result = await graph.run();
const newReality = await graph.getReality();
```

The handle:
- Carries identity (`graphSlug`) — no repeated parameter
- Holds the PodManager instance — sessions loaded once, reused across calls
- Is the "unit of work" — everything about orchestrating this graph lives here
- Mirrors how the codebase already thinks about graphs as entities

### Why Not Create `IGraphOrchestration` Directly?

The PodManager needs to load persisted sessions from disk. The handle needs ONBAS, ODS, and AgentContextService wired in. That's DI work — the service does it.

---

## Interfaces

### IOrchestrationService (Singleton)

```typescript
/**
 * Entry point for graph orchestration. Registered in DI container.
 * Resolves per-graph orchestration handles.
 */
export interface IOrchestrationService {
  /**
   * Get or create an orchestration handle for a graph.
   *
   * On first call for a graphSlug:
   *   - Creates PodManager for the graph
   *   - Loads persisted sessions from pod-sessions.json
   *   - Wires internal collaborators (ONBAS, ODS, AgentContextService)
   *
   * On subsequent calls for the same graphSlug (same process):
   *   - Returns existing handle (PodManager stays in memory)
   */
  get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration>;
}
```

### IGraphOrchestration (Per-Graph Handle)

```typescript
/**
 * Per-graph orchestration handle. Carries graph identity and owns
 * the orchestration loop for a specific graph.
 *
 * Get one from IOrchestrationService.get(ctx, graphSlug).
 * Never construct directly.
 */
export interface IGraphOrchestration {
  /** Graph this handle is bound to */
  readonly graphSlug: string;

  /**
   * Run the orchestration loop.
   *
   * Builds a fresh reality snapshot, passes it to ONBAS, executes the
   * resulting OR via ODS, and repeats until ONBAS returns no-action
   * or question-pending.
   *
   * Non-blocking: starts nodes but does not wait for agent completion.
   * Call run() again after agents finish to advance further.
   */
  run(): Promise<OrchestrationRunResult>;

  /**
   * Get current graph state without running orchestration.
   *
   * Useful for:
   *   - Rendering graph state on a page
   *   - Checking status between run() calls
   *   - Inspecting state in tests
   */
  getReality(): Promise<PositionalGraphReality>;
}
```

### OrchestrationRunResult

```typescript
/**
 * What happened during one run() invocation.
 */
export interface OrchestrationRunResult extends BaseResult {
  /** Graph this result is for */
  graphSlug: string;

  /** Actions taken in this pass (may be 0 or many) */
  actions: OrchestrationAction[];

  /** Why the loop stopped */
  stopReason: OrchestrationStopReason;

  /** Graph state after all actions completed */
  finalReality: PositionalGraphReality;
}

export type OrchestrationStopReason =
  | 'no-action'           // Nothing actionable (could be waiting on agents, transitions, etc.)
  | 'question-pending'    // Question needs surfacing to user
  | 'graph-complete'      // All nodes complete
  | 'graph-failed';       // Graph in failed state

/**
 * A single action taken during a run() pass.
 */
export interface OrchestrationAction {
  /** The OR that ONBAS produced */
  request: OrchestrationRequest;

  /** The result of ODS executing that request */
  result: OrchestrationExecuteResult;

  /** When this action was executed */
  timestamp: string; // ISO 8601
}
```

---

## Usage Patterns

### Pattern 1: In-Process Test (Primary for This Plan)

This plan tests orchestration by calling `.run()` directly. No web server or CLI orchestration wiring needed.

### Pattern 2: Integration Test

```typescript
describe('orchestration loop', () => {
  let service: IOrchestrationService;
  let fakePodManager: FakePodManager;

  beforeEach(() => {
    fakePodManager = new FakePodManager();
    // Configure deterministic pod behaviors
    fakePodManager.configurePod('spec-builder', {
      executeResult: { outcome: 'completed', sessionId: 'sess-001', outputs: { spec: 'built' } },
    });
    fakePodManager.configurePod('spec-reviewer', {
      executeResult: { outcome: 'completed', sessionId: 'sess-002', outputs: { review: 'pass' } },
    });

    service = createTestOrchestrationService({ podManager: fakePodManager });
  });

  it('advances through serial nodes on a line', async () => {
    const graph = await service.get(ctx, 'test-graph');
    const result = await graph.run();

    expect(result.actions).toHaveLength(1); // Only spec-builder starts (reviewer waits)
    expect(result.actions[0].request.type).toBe('start-node');
    expect(result.stopReason).toBe('no-action');
  });
});
```

### Pattern 3: E2E Test (Human-as-Agent)

```typescript
it('full pipeline with human-as-agent', async () => {
  // Setup graph via CLI...

  // Get orchestration handle
  const service = getOrchestrationService();
  const graph = await service.get(ctx, 'e2e-pipeline');

  // Run — starts first ready node
  const r1 = await graph.run();
  expect(r1.actions[0].request).toMatchObject({ type: 'start-node', nodeId: 'node-spec-builder' });

  // Act as spec-builder agent
  await cli('cg wf save-output-data e2e-pipeline node-spec-builder spec "the spec"');
  await cli('cg wf end e2e-pipeline node-spec-builder');

  // Run again — spec-builder complete, spec-reviewer starts
  const r2 = await graph.run();
  expect(r2.actions[0].request).toMatchObject({ type: 'start-node', nodeId: 'node-spec-reviewer' });

  // Check state without running
  const reality = await graph.getReality();
  expect(reality.completedCount).toBe(2); // get-spec + spec-builder
});
```

### Future Patterns (Out of Scope, Designed For)

The interfaces are designed so a future long-lived web process can host orchestration without modification:

```typescript
// Future: server action calls .run() — same interface, no changes needed
const graph = await service.get(ctx, graphSlug);
const result = await graph.run();

// Future: read state for rendering — same interface
const reality = await graph.getReality();
```

Production wiring (server actions, agent-completion triggers, SSE notifications) is a follow-on concern. The CLI's role in production is as the agent's interface (`save-output-data`, `ask`, `answer`, `end`), not as an orchestration trigger.

---

## Internal Composition

What `IGraphOrchestration.run()` does internally:

```
┌──────────────────────────────────────────────────────────┐
│  graph.run()                                             │
│                                                          │
│  loop:                                                   │
│    ┌─────────────────────────────────┐                   │
│    │ 1. Build fresh reality snapshot │                   │
│    │    (PositionalGraphService +    │                   │
│    │     PodManager sessions)        │                   │
│    └──────────────┬──────────────────┘                   │
│                   │                                      │
│                   ▼                                      │
│    ┌─────────────────────────────────┐                   │
│    │ 2. ONBAS: walkForNextAction()   │                   │
│    │    → OrchestrationRequest       │                   │
│    └──────────────┬──────────────────┘                   │
│                   │                                      │
│           ┌───────┴───────┐                              │
│           │               │                              │
│      no-action /     start-node /                        │
│      question-       resume-node                         │
│      pending                                             │
│           │               │                              │
│           ▼               ▼                              │
│        STOP        ┌─────────────────────────────┐       │
│        (return     │ 3. ODS: execute(request)    │       │
│         result)    │    - Create/get pod          │       │
│                    │    - Resolve context          │       │
│                    │    - Run pod                  │       │
│                    │    - Update state             │       │
│                    └──────────────┬───────────────┘       │
│                                  │                        │
│                           record action                   │
│                                  │                        │
│                           go to loop                      │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

Key internal points:
- Reality is rebuilt **every iteration** (fresh snapshot, no stale data)
- ONBAS is called with the fresh reality (pure function, no memory)
- ODS mutates state (calls `startNode()`, surfaces questions, etc.)
- The action is recorded in the result's `actions` array
- Loop continues until ONBAS says stop

---

## DI Registration

### Tokens

```typescript
// In packages/shared/src/di-tokens.ts
export const ORCHESTRATION_DI_TOKENS = {
  /** IOrchestrationService — top-level orchestration entry point */
  ORCHESTRATION_SERVICE: 'IOrchestrationService',
} as const;
```

Only one public token. ONBAS, ODS, PodManager, AgentContextService are internal — no tokens for consumers.

### Module Registration

```typescript
// In packages/positional-graph/src/container.ts (or new orchestration container)
export function registerOrchestrationServices(container: DependencyContainer): void {
  container.register(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE, {
    useFactory: (c: DependencyContainer) => {
      const graphService = c.resolve<IPositionalGraphService>(
        POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE
      );
      const workUnitService = c.resolve<IWorkUnitService>(
        POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE
      );
      const eventNotifier = c.resolve<ICentralEventNotifier>(
        SHARED_DI_TOKENS.EVENT_NOTIFIER
      );
      // ONBAS, ODS, AgentContextService, PodManager are created internally
      // by OrchestrationService — not resolved from container
      return new OrchestrationService(graphService, workUnitService, eventNotifier);
    },
  });
}
```

### Why Internal Collaborators Stay Private

ONBAS, ODS, PodManager, and AgentContextService are **not** registered in the DI container:

| Service | Why Private |
|---------|-------------|
| ONBAS | Pure function. No dependencies. Called by the loop, never standalone. |
| ODS | Needs PodManager instance (per-graph). Created per-graph by the handle. |
| AgentContextService | Pure function on reality. No dependencies. Called by ODS. |
| PodManager | Per-graph instance. Created per-graph by the handle. |

If a consumer needs these, they're going through the wrong door. The only public surface is `IOrchestrationService` → `IGraphOrchestration`.

---

## FakeOrchestrationService

For tests that don't need real orchestration logic (e.g., testing a web page or CLI command):

```typescript
export class FakeOrchestrationService implements IOrchestrationService {
  private graphs = new Map<string, FakeGraphConfig>();
  private getHistory: Array<{ graphSlug: string }> = [];

  /** Pre-configure a graph's behavior */
  configureGraph(graphSlug: string, config: FakeGraphConfig): void {
    this.graphs.set(graphSlug, config);
  }

  async get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration> {
    this.getHistory.push({ graphSlug });
    const config = this.graphs.get(graphSlug);
    if (!config) {
      throw new Error(`FakeOrchestrationService: no config for '${graphSlug}'`);
    }
    return new FakeGraphOrchestration(graphSlug, config);
  }

  /** Assert which graphs were requested */
  getGetHistory(): ReadonlyArray<{ graphSlug: string }> {
    return this.getHistory;
  }

  reset(): void {
    this.graphs.clear();
    this.getHistory = [];
  }
}

export interface FakeGraphConfig {
  runResults: OrchestrationRunResult[];  // Queue of results for successive run() calls
  reality: PositionalGraphReality;       // State returned by getReality()
}

export class FakeGraphOrchestration implements IGraphOrchestration {
  readonly graphSlug: string;
  private runCallIndex = 0;
  private config: FakeGraphConfig;

  constructor(graphSlug: string, config: FakeGraphConfig) {
    this.graphSlug = graphSlug;
    this.config = config;
  }

  async run(): Promise<OrchestrationRunResult> {
    const result = this.config.runResults[this.runCallIndex];
    if (!result) {
      throw new Error(`FakeGraphOrchestration: no run result at index ${this.runCallIndex}`);
    }
    this.runCallIndex++;
    return result;
  }

  async getReality(): Promise<PositionalGraphReality> {
    return this.config.reality;
  }
}
```

### Test Registration

```typescript
// In test setup
const fakeService = new FakeOrchestrationService();
fakeService.configureGraph('test-graph', {
  runResults: [
    { graphSlug: 'test-graph', actions: [...], stopReason: 'no-action', finalReality: ..., errors: [] },
  ],
  reality: buildFakeReality({ graphSlug: 'test-graph', ... }),
});

container.register<IOrchestrationService>(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE, {
  useValue: fakeService,
});
```

---

## Handle Lifecycle

### When Is `IGraphOrchestration` Created?

```
Service.get(ctx, 'graph-A')  →  creates handle + PodManager, loads sessions
Service.get(ctx, 'graph-A')  →  returns SAME handle (cached by slug)
Service.get(ctx, 'graph-B')  →  creates NEW handle for graph-B
```

The service maintains a registry keyed by `graphSlug`. Within a process lifetime, the same handle is reused. This means:
- **Web app** (long-lived process): PodManager stays in memory across requests. Sessions loaded once. Pods stay alive. This is the primary consumer.
- **Tests**: Fresh service per test (no leakage).

Note: The CLI does not resolve `IOrchestrationService`. The CLI is the agent's interface (`save-output-data`, `ask`, `answer`, `end`), not the orchestrator's trigger.

### When Is It Disposed?

Handles are not explicitly disposed. They live as long as the service lives (which lives as long as the process). PodManager persists sessions to disk on every state change, so no explicit "save" is needed at disposal time.

---

## Design Questions Resolved

### Q1: Is `IGraphOrchestration` stateful?

**RESOLVED**: Yes. It holds a PodManager instance with loaded sessions. Multiple `run()` calls reuse the same PodManager. This avoids reloading sessions from disk on every call.

### Q2: Does `.get()` cache handles?

**RESOLVED**: Yes. Same `graphSlug` returns the same handle within a process lifetime. This follows the "entity with identity" pattern — there's one orchestration per graph.

### Q3: Can `getReality()` be called independently of `run()`?

**RESOLVED**: Yes. `getReality()` builds and returns a fresh snapshot without executing any actions. Useful for rendering graph state on a page without advancing orchestration.

### Q4: What does `run()` return when there's nothing to do?

**RESOLVED**: `OrchestrationRunResult` with empty `actions` array and `stopReason: 'no-action'` (or more specific: `'graph-complete'`, `'graph-failed'`). The result always includes `finalReality` so the caller can inspect current state regardless.

### Q5: Does `run()` stop on `question-pending`?

**RESOLVED**: Yes. When ONBAS returns `question-pending`, ODS surfaces the question (sets `surfaced_at`), and the loop stops. The caller inspects the result to see which question was surfaced. The user answers via a separate path (CLI `cg wf answer` or web action), then calls `run()` again.

### Q6: Does the CLI run orchestration?

**RESOLVED**: No. The CLI is the agent's interface to the graph — `save-output-data`, `ask`, `answer`, `end`. Orchestration runs in the long-lived web server process. The CLI updates state; the web process reacts.

### Q7: How does the web process know when to run the next cycle?

**DEFERRED**: Out of scope for this plan. The interfaces support it — a future web process calls `graph.run()` whenever it detects state changes (agent completion, user answers). The trigger mechanism (API endpoint, domain event, polling) is a production-wiring concern for a follow-on plan.

---

## Quick Reference

```typescript
// === Get orchestration for a graph ===
const service = container.resolve<IOrchestrationService>(
  ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE
);
const graph = await service.get(ctx, 'my-graph');

// === Run orchestration (advances the graph) ===
const result = await graph.run();
// result.actions       — what happened
// result.stopReason    — why we stopped
// result.finalReality  — state after actions
// result.errors        — if something went wrong

// === Check state (read-only) ===
const reality = await graph.getReality();
// reality.currentLineIndex    — which line is active
// reality.readyNodeIds        — nodes that can start
// reality.runningNodeIds      — nodes in progress
// reality.pendingQuestions    — questions awaiting answers
// reality.isComplete          — graph finished?

// === DI Token ===
ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE  // 'IOrchestrationService'
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **IOrchestrationService** | DI-registered singleton. Factory for per-graph orchestration handles. The only public entry point. |
| **IGraphOrchestration** | Per-graph handle with identity. Owns the orchestration loop for one graph. Retrieved via `service.get(ctx, graphSlug)`. |
| **OrchestrationRunResult** | Return value of `run()`. Contains actions taken, stop reason, and final reality snapshot. |
| **OrchestrationStopReason** | Why `run()` stopped: `no-action`, `question-pending`, `graph-complete`, `graph-failed`. |
| **OrchestrationAction** | One iteration's request (from ONBAS) and result (from ODS), with timestamp. |
| **Handle caching** | `service.get()` returns the same handle for the same `graphSlug` within a process lifetime. |

| Term | Definition (from other workshops) |
|------|-----------|
| **OR** | OrchestrationRequest — 4-variant discriminated union (Workshop #2) |
| **ONBAS** | OrchestrationNextBestActionService — pure-function walk engine (Workshop #5) |
| **ODS** | OrchestrationDoerService — executor of ORs (Workshop #8) |
| **Reality** | PositionalGraphReality — read-only snapshot of entire graph state (Workshop #1) |
| **Pod** | IWorkUnitPod — ephemeral execution container (Workshop #4) |
| **PodManager** | IPodManager — per-graph registry of pods and persisted session IDs (Workshop #4) |
