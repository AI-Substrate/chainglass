# Workshop: Fire-and-Forget Pod Synchronization for Integration Tests

**Type**: Integration Pattern
**Plan**: 037-codepod-and-goat-integration
**Spec**: [codepod-and-goat-integration-spec.md](../codepod-and-goat-integration-spec.md)
**Created**: 2026-02-20
**Status**: Draft

**Related Documents**:
- [05-real-integration-testing.md](./05-real-integration-testing.md) — onRun callback, agent simulation
- [06-finishing-codepod.md](./06-finishing-codepod.md) — CodePod execution model
- Phase 3 tasks: [tasks.md](../tasks/phase-3-simple-test-graphs/tasks.md)

---

## Purpose

ODS intentionally fire-and-forgets `pod.execute()`. This is correct for production — the drive loop polls for state changes. But integration tests need to know when scripts have actually finished so they can assert on results. This workshop designs a synchronization mechanism that doesn't corrupt the production architecture.

## Key Questions Addressed

- How do we detect script completion in integration tests without changing ODS's fire-and-forget?
- Does drive() naturally handle this, or do we need additional synchronization?
- What's the simplest mechanism that works reliably (not timing hacks)?

---

## The Problem

### Production Flow (Correct)

```
drive() iteration 1:
  settle → reality → ONBAS says "start worker-1"
  → ODS fires pod.execute() (NOT awaited) → returns immediately
  → run() returns with 1 action
  → sleep(actionDelayMs=100ms)

drive() iteration 2:                        ← SCRIPT STILL RUNNING
  settle → processGraph() → no new events yet (script hasn't written them)
  → reality unchanged → ONBAS says "no action" (worker-1 already starting)
  → run() returns with 0 actions
  → sleep(idleDelayMs=10000ms)              ← 10 SECOND WAIT

                                             ← SCRIPT FINISHES, WRITES EVENTS TO DISK

drive() iteration 3:
  settle → processGraph() → picks up node:accepted + node:completed events
  → reality updated: worker-1 is complete
  → ONBAS says "no action" (graph complete)
  → run() returns with stopReason: 'graph-complete'
  → drive() returns { exitReason: 'complete' }
```

### Why This Actually Works

The key insight: **drive() already handles this via polling**. The idle delay gives scripts time to finish. The next settle phase picks up whatever events the script wrote to disk.

The problem is NOT that it doesn't work — it's that:
1. **Default `idleDelayMs: 10000`** makes tests slow (10 seconds waiting per idle poll)
2. **Timing-dependent** — if a script takes longer than one idle cycle, it works; if it takes longer than `maxIterations × idleDelayMs`, it times out

### What We Actually Need

For integration tests:
- **Short delays** so tests run fast (`actionDelayMs: 50`, `idleDelayMs: 200-500`)
- **Enough iterations** so the script completes before maxIterations
- **Confidence** that scripts finish within the idle window

---

## Analysis: How Long Do Simulation Scripts Take?

A typical `simulate.sh` does:

```bash
#!/bin/bash
cg wf node accept "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
cg wf node save-output-data "$CG_GRAPH_SLUG" "$CG_NODE_ID" result '{"done":true}' --workspace-path "$CG_WORKSPACE_PATH"
cg wf node end "$CG_GRAPH_SLUG" "$CG_NODE_ID" --workspace-path "$CG_WORKSPACE_PATH"
```

Each `cg` call:
1. Spawns Node.js process (~50-100ms startup)
2. Parses CLI args (~5ms)
3. Resolves workspace context (~10ms)
4. Reads graph from disk (~5ms)
5. Writes events/data to disk (~5ms)
6. Exits

**Estimated per-command time**: 100-200ms
**Three commands**: 300-600ms total
**With safety margin**: ~1 second

So `idleDelayMs: 1000` (1 second) should be sufficient for simple scripts.

---

## Solution: Drive() Already Works — Just Tune Parameters

### Option A: Tune drive() parameters (RECOMMENDED)

**No new code needed.** drive() already polls. Set test-appropriate parameters:

```typescript
const result = await handle.drive({
  maxIterations: 100,      // Plenty of room
  actionDelayMs: 50,       // Fast between action iterations
  idleDelayMs: 1000,       // 1 second — enough for script to finish
  onEvent: (event) => {
    // Verbose logging for debugging (DYK#5)
    if (event.type === 'iteration') {
      console.log(`  [drive] iteration: ${event.message}`);
    } else if (event.type === 'idle') {
      console.log(`  [drive] idle — waiting for scripts...`);
    }
  },
});
```

**Why this works**:
- Iteration 1: ODS starts the script (action → 50ms delay)
- Iteration 2: Script still running, no new actions (idle → 1000ms delay)
- Iteration 3: Script finished, settle picks up events, graph progresses
- Repeat until complete

**Worst case**: 3 iterations per node × (50ms + 1000ms) ≈ 3 seconds per node. For simple-serial (2 nodes, 1 code): ~3 seconds. For parallel-fan-out (5 nodes, 4 code): ~6 seconds. Acceptable for integration tests.

### Option B: Add a pod completion tracking mechanism

```typescript
// In PodManager, track active executions
class PodManager {
  private _activeExecutions = new Set<Promise<void>>();

  trackExecution(promise: Promise<void>): void {
    this._activeExecutions.add(promise);
    promise.finally(() => this._activeExecutions.delete(promise));
  }

  async waitForAll(): Promise<void> {
    await Promise.all([...this._activeExecutions]);
  }
}

// In ODS, track the fire-and-forget
const execPromise = pod.execute({ ... });
this.deps.podManager.trackExecution(execPromise);

// In tests, after drive()
await podManager.waitForAll();  // Ensure all scripts finished
```

**Rejected because**:
- Changes production code (IPodManager interface, ODS dispatch)
- Adds complexity that's only useful for tests
- drive() already handles the polling — don't fight the architecture

### Option C: Event-based completion signal

```typescript
// Scripts write a marker file when done
echo "DONE" > "$CG_WORKSPACE_PATH/.chainglass/markers/$CG_NODE_ID.done"

// Test watches for marker files
async function waitForMarker(path: string, nodeId: string, timeout = 5000) { ... }
```

**Rejected because**:
- Adds a parallel signaling mechanism alongside the event system
- Scripts become test-aware (they shouldn't know they're being tested)
- Fragile (marker file vs event system — which is source of truth?)

---

## Recommended Approach

### For Integration Tests: Tune drive() Parameters

```typescript
// Test constants
const TEST_DRIVE_OPTIONS = {
  maxIterations: 100,
  actionDelayMs: 50,
  idleDelayMs: 1000,
  onEvent: (event: DriveEvent) => {
    // Log for debugging — DYK#5
    if (event.type !== 'status') {
      console.log(`  [drive] ${event.type}: ${event.message}`);
    }
  },
} satisfies DriveOptions;
```

Use this in all Phase 3/4 integration tests. Shared constant so parameters are tuned once.

### Timeout Budget

| Graph | Code Nodes | Est. Time | maxIterations × idleDelayMs |
|-------|-----------|-----------|----------------------------|
| simple-serial | 1 | ~3s | 100 × 1s = 100s budget |
| parallel-fan-out | 4 | ~6s | 100 × 1s = 100s budget |
| error-recovery | 1 | ~2s | 100 × 1s = 100s budget |
| GOAT (Phase 4) | ~6 | ~12s | 100 × 1s = 100s budget |

All well within Vitest default timeout (30s per test). Set explicit `timeout: 60_000` on test for safety.

### If Scripts Are Slow

If we discover scripts take longer than 1 second (e.g., CLI startup overhead is worse than estimated), increase `idleDelayMs` to 2000. The test gets 2 seconds slower per idle cycle but remains reliable.

### If We Need True Synchronization Later

Option B (pod completion tracking) is the right future design. But don't build it now — drive()'s polling is sufficient and doesn't require production code changes. If Phase 4's GOAT test proves too slow or flaky with polling, we can add tracking then.

---

## Verification Plan

During Phase 3 T003/T004 (simple-serial GREEN):

1. Run with verbose onEvent logging
2. Count iterations to completion
3. Measure wall-clock time
4. If >10 iterations or >10s, increase idleDelayMs
5. If consistently <5 iterations, decrease idleDelayMs for speed

Log output should look like:
```
  [drive] iteration: 1 action(s) — start-node(worker-1)
  [drive] idle — waiting for scripts...
  [drive] iteration: 0 action(s) — graph complete
✅ simple-serial: exitReason=complete, iterations=3, totalActions=1, 1.2s
```

---

## Open Questions

### Q1: What if ODS starts multiple pods in one iteration (parallel nodes)?

**RESOLVED**: ONBAS returns one action per `run()` call. Multiple parallel nodes = multiple iterations, each starting one pod. The idle delay between iterations gives each pod time to finish. For 3 parallel pods started in quick succession, the last one's idle delay covers all three.

### Q2: What if the CLI binary isn't built?

**RESOLVED**: Add `skipIf` guard at the describe level. Check for `apps/cli/dist/cli.cjs` existence. Skip all drive tests if CLI not built. Print clear message.

### Q3: Can we make actionDelayMs=0 for speed?

**No** — ODS needs a tick between dispatching a pod and the next settle. With 0 delay, the next iteration could read disk before the previous one's filesystem writes are flushed. 50ms is the minimum safe value.

---

## Decision Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Synchronization mechanism | Tune drive() params (Option A) | No production code changes. Polling already works. |
| idleDelayMs for tests | 1000ms | 1s covers script execution. Tunable if needed. |
| actionDelayMs for tests | 50ms | Fast between actions. 0 is unsafe. |
| maxIterations | 100 | Large safety margin. 3-10 iterations typical. |
| Verbose logging | Always on in tests | DYK#5: debug visibility when chain breaks |
| Future tracking | Defer Option B | Build if GOAT proves flaky with polling |
