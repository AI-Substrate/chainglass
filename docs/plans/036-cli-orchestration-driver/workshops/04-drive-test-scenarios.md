# Workshop: drive() Test Scenarios and Graph Configurations

**Type**: Test Design
**Plan**: 036-cli-orchestration-driver
**Spec**: [cli-orchestration-driver-spec.md](../cli-orchestration-driver-spec.md)
**Created**: 2026-02-17
**Status**: Draft

**Related Documents**:
- [01-cli-driver-experience-and-validation.md](./01-cli-driver-experience-and-validation.md) § Part 2 (Two Loops), Part 8 (drive() interface)
- [03-graph-status-visual-gallery.md](./03-graph-status-visual-gallery.md) — visual scenarios (Phase 3)
- [Phase 4 tasks.md](../tasks/phase-4-drive-implementation/tasks.md) — task dossier

---

## Purpose

Define the concrete test scenarios for `drive()` unit tests. Each scenario is a specific `FakeONBAS` action queue + `FakeODS` result queue that simulates a graph configuration progressing through `run()` iterations. This ensures we test every exit path, delay decision, event emission, and edge case.

## Key Questions Addressed

- What action sequences simulate a graph completing normally?
- How do we simulate failure, idle polling, and max iterations?
- How do we verify delay strategy without real timers?
- How do we test session persistence is called at the right times?
- What edge cases could trip up the loop logic?

---

## How drive() Tests Work

drive() doesn't build real graphs. It calls `run()` which delegates to ONBAS/ODS. We control everything by queuing ONBAS responses:

```
FakeONBAS.setActions([          FakeODS.setResults([
  start-node('n1'),    ──→       { ok: true },      ← iteration 1: action
  start-node('n2'),    ──→       { ok: true },      ← iteration 2: action
  no-action('graph-complete')                        ← iteration 3: terminal
])                              ])
```

Each `run()` call goes: settle → reality → ONBAS → (action or exit) → ODS → record. drive() calls `run()` repeatedly and checks the result.

### What run() Returns

```typescript
interface OrchestrationRunResult {
  actions: OrchestrationAction[];  // empty if no-action
  stopReason: 'no-action' | 'graph-complete' | 'graph-failed';
  finalReality: PositionalGraphReality;
  iterations: number;  // internal iterations within run()
  errors: BaseError[];
}
```

### How drive() Interprets Results

| `stopReason` | `actions.length` | drive() Behavior |
|-------------|-------------------|------------------|
| `graph-complete` | 0 | Exit → `exitReason: 'complete'` |
| `graph-failed` | 0 | Exit → `exitReason: 'failed'` |
| `no-action` | 0 | Idle — delay `idleDelayMs`, continue loop |
| `no-action` | > 0 | **Never happens** — if ONBAS returns no-action, run() exits before ODS |
| _(any)_ | > 0 | Action — delay `actionDelayMs`, continue loop |

Key insight: `no-action` with `reason: 'all-waiting'` or `reason: 'transition-blocked'` is **NOT terminal**. drive() keeps polling. Only `graph-complete` and `graph-failed` are terminal.

---

## Scenario Gallery

### Scenario 1: Single-Node Graph Completes

The simplest happy path. One node starts and completes.

```typescript
// ONBAS returns: start n1, then graph-complete
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);
deps.ods.setNextResult({ ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n1' } });

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'complete', iterations: 2, totalActions: 1 }`

**What this tests**: Basic loop → exit → result shape

---

### Scenario 2: Multi-Node Serial Graph

Two nodes in sequence. First completes, second starts, then graph completes.

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n2', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);
deps.ods.setResults([
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n1' } },
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n2' } },
]);

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'complete', iterations: 3, totalActions: 2 }`

**What this tests**: Multiple action iterations, totalActions accumulation

---

### Scenario 3: Graph Fails

A node fails and ONBAS reports graph-failed.

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-failed' },
]);
deps.ods.setNextResult({ ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n1' } });

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'failed', iterations: 2, totalActions: 1 }`

**What this tests**: Terminal failure exit

---

### Scenario 4: Idle Polling Then Completion

Graph has nodes running but nothing to do. ONBAS returns `all-waiting` (idle) twice, then graph completes. Simulates agents working in the background.

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' },  // idle
  { type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' },  // idle
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },  // done
]);
deps.ods.setNextResult({ ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n1' } });

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'complete', iterations: 4, totalActions: 1 }`

**What this tests**: Idle iterations don't exit, only terminal reasons exit. `totalActions` stays at 1 despite 4 iterations.

---

### Scenario 5: Max Iterations Guard

Graph never completes. ONBAS always returns `all-waiting`.

```typescript
deps.onbas.setNextAction({ type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' });

const result = await handle.drive({ maxIterations: 5, actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'max-iterations', iterations: 5, totalActions: 0 }`

**What this tests**: Safety guard prevents infinite loop. Low maxIterations for fast test.

---

### Scenario 6: Transition-Blocked Then Proceeds

Manual transition hasn't been triggered yet. ONBAS returns `transition-blocked`, then eventually something changes and graph completes.

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'transition-blocked' },  // waiting for manual transition
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n2', inputs: emptyInputPack },  // transition opened
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);
deps.ods.setResults([
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n1' } },
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'n2' } },
]);

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'complete', iterations: 4, totalActions: 2 }`

**What this tests**: `transition-blocked` is NOT terminal — drive() keeps polling.

---

### Scenario 7: run() Throws Error

Unexpected error inside run() (e.g., graphService unavailable).

```typescript
// Override graphService to throw
const throwingService = {
  ...deps.graphService,
  loadGraphState: async () => { throw new Error('disk failure'); },
};
const handle = makeHandle({ ...deps, graphService: throwingService });

const events: DriveEvent[] = [];
const result = await handle.drive({
  actionDelayMs: 0,
  idleDelayMs: 0,
  onEvent: async (e) => events.push(e),
});
```

**Expected**: `{ exitReason: 'failed', iterations: 0, totalActions: 0 }`
Plus: `events` contains `{ type: 'error', message: 'disk failure', error: ... }`

**What this tests**: Error handling — drive() doesn't crash, emits error event, returns failed.

---

### Scenario 8: Immediate Completion (Graph Already Done)

Graph is already complete when drive() starts. First `run()` returns `graph-complete`.

```typescript
deps.onbas.setNextAction({ type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' });

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'complete', iterations: 1, totalActions: 0 }`

**What this tests**: Edge case — drive() exits immediately, no wasted iterations.

---

### Scenario 9: Immediate Failure (Graph Already Failed)

Graph is already in a failed state.

```typescript
deps.onbas.setNextAction({ type: 'no-action', graphSlug: 'g1', reason: 'graph-failed' });

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'failed', iterations: 1, totalActions: 0 }`

**What this tests**: Symmetric to Scenario 8 for failures.

---

## Event Emission Scenarios

### Scenario E1: Status Event After Each Iteration

Every `run()` call should produce a `status` event with the graph view.

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);

const events: DriveEvent[] = [];
await handle.drive({
  actionDelayMs: 0, idleDelayMs: 0,
  onEvent: async (e) => events.push(e),
});

const statusEvents = events.filter(e => e.type === 'status');
expect(statusEvents.length).toBeGreaterThanOrEqual(1);
expect(statusEvents[0].message).toContain('Graph:');  // formatGraphStatus output
```

**What this tests**: formatGraphStatus() is called and emitted as a status event.

---

### Scenario E2: Iteration vs Idle Events

Action-producing iterations emit `iteration`; no-action iterations emit `idle`.

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);

const events: DriveEvent[] = [];
await handle.drive({
  actionDelayMs: 0, idleDelayMs: 0,
  onEvent: async (e) => events.push(e),
});

const iterationEvents = events.filter(e => e.type === 'iteration');
const idleEvents = events.filter(e => e.type === 'idle');
expect(iterationEvents).toHaveLength(1);  // one action iteration
expect(idleEvents).toHaveLength(1);  // one idle iteration (all-waiting)
// graph-complete exits without emitting idle
```

**What this tests**: Correct event type discrimination based on run() result.

---

### Scenario E3: Async onEvent Is Awaited

Verify drive() awaits the onEvent callback.

```typescript
const order: string[] = [];
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);

await handle.drive({
  actionDelayMs: 0, idleDelayMs: 0,
  onEvent: async (e) => {
    await new Promise(r => setTimeout(r, 10));
    order.push(e.type);
  },
});

// If drive() didn't await, events would be missing
expect(order.length).toBeGreaterThan(0);
```

**What this tests**: DYK Phase 2 #3 — onEvent is `void | Promise<void>`, drive() awaits it.

---

## Session Persistence Scenarios

### Scenario S1: persistSessions Called After Actions

```typescript
const fakePodManager = new FakePodManager();
const handle = makeHandle(deps, { podManager: fakePodManager });

deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);

await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });

expect(fakePodManager.persistSessionsCalls).toBe(1);  // called after the action iteration
```

---

### Scenario S2: persistSessions NOT Called After Idle

```typescript
deps.onbas.setActions([
  { type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' },
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);

await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });

expect(fakePodManager.persistSessionsCalls).toBe(0);  // no actions = no persistence
```

---

### Scenario S3: loadSessions Called Once At Start

```typescript
await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });

expect(fakePodManager.loadSessionsCalls).toBe(1);  // exactly once, at the start
```

---

## Delay Strategy Scenarios

### Scenario D1: Action Path vs Idle Path

We can't easily test actual delay durations in unit tests. Instead, we verify the **event types** tell us which path was taken — `iteration` means action path (short delay), `idle` means idle path (long delay).

```typescript
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'n1', inputs: emptyInputPack },  // → iteration event
  { type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' },                   // → idle event
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);

const events: DriveEvent[] = [];
await handle.drive({
  actionDelayMs: 0, idleDelayMs: 0,
  onEvent: async (e) => events.push(e),
});

// Event order verifies which code path was taken
const types = events.map(e => e.type);
expect(types).toContain('iteration');  // action path
expect(types).toContain('idle');       // idle path
```

**What this tests**: The delay code path is selected correctly based on action presence. Actual delay values are implementation details — we trust setTimeout works.

---

## Summary Table

| # | Scenario | Exit Reason | Iterations | Actions | Key Test |
|---|----------|------------|------------|---------|----------|
| 1 | Single node completes | complete | 2 | 1 | Basic loop → exit |
| 2 | Multi-node serial | complete | 3 | 2 | totalActions accumulation |
| 3 | Graph fails | failed | 2 | 1 | Terminal failure |
| 4 | Idle polling then done | complete | 4 | 1 | Idle isn't terminal |
| 5 | Max iterations | max-iterations | 5 | 0 | Safety guard |
| 6 | Transition-blocked | complete | 4 | 2 | Non-terminal no-action |
| 7 | run() throws | failed | 0 | 0 | Error handling |
| 8 | Already complete | complete | 1 | 0 | Immediate exit |
| 9 | Already failed | failed | 1 | 0 | Immediate failure |
| E1 | Status events | — | — | — | formatGraphStatus emitted |
| E2 | Iteration vs idle | — | — | — | Event type discrimination |
| E3 | Async onEvent | — | — | — | Callback awaited |
| S1 | Persist after actions | — | — | — | persistSessions called |
| S2 | No persist after idle | — | — | — | Not called on idle |
| S3 | Load at start | — | — | — | loadSessions once |
| D1 | Action vs idle path | — | — | — | Correct delay selection |

## Open Questions

### Q1: Should drive() emit a final status event before returning?

**RESOLVED**: Yes — always emit status after every run() including the terminal iteration. The consumer gets the final graph view ("8/8 complete") before drive() returns. This status will be rich and used for real-world validation in future plans. (Option A selected.)

### Q2: Should the error scenario (S7) try one more iteration or exit immediately?

**RESOLVED**: Exit immediately with `failed`. Don't retry — fail fast. The error event carries the details for the consumer.

---

### Scenario 10: Parallel Nodes — Multiple Actions Per run()

A single `run()` call can fire multiple parallel nodes. `totalActions` counts real actions, not iterations.

```typescript
// ONBAS returns 3 start-nodes in first run() (parallel), then graph-complete
deps.onbas.setActions([
  { type: 'start-node', graphSlug: 'g1', nodeId: 'coder', inputs: emptyInputPack },
  { type: 'start-node', graphSlug: 'g1', nodeId: 'tester', inputs: emptyInputPack },
  { type: 'start-node', graphSlug: 'g1', nodeId: 'alignment', inputs: emptyInputPack },
  // run()'s internal loop starts all 3 before ONBAS returns no-action
  { type: 'no-action', graphSlug: 'g1', reason: 'all-waiting' },
  // drive() calls run() again, agents still working
  { type: 'no-action', graphSlug: 'g1', reason: 'graph-complete' },
]);
deps.ods.setResults([
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'coder' } },
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'tester' } },
  { ok: true, request: { type: 'start-node', graphSlug: 'g1', nodeId: 'alignment' } },
]);

const result = await handle.drive({ actionDelayMs: 0, idleDelayMs: 0 });
```

**Expected**: `{ exitReason: 'complete', iterations: 2, totalActions: 3 }`
(First run() fires all 3 parallel nodes = 3 actions in 1 iteration. Second run() sees graph-complete.)

**What this tests**: `totalActions` counts real actions across ALL internal run() iterations, not just drive() loop iterations. A single drive iteration can produce many actions.
