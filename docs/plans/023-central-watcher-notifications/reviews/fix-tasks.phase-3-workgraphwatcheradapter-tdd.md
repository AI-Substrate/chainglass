# Fix Tasks: Phase 3 — WorkGraphWatcherAdapter (TDD)

**Plan**: 023-central-watcher-notifications
**Phase**: Phase 3: WorkGraphWatcherAdapter (TDD)
**Generated**: 2026-02-01 (plan-7-code-review)
**Parent Review**: [review.phase-3-workgraphwatcheradapter-tdd.md](./review.phase-3-workgraphwatcheradapter-tdd.md)

---

## Priority Summary

**CRITICAL**: 0
**HIGH**: 0
**MEDIUM**: 7 (4 link fixes + 3 observability)
**LOW**: 6

**Recommendation**: Fix MEDIUM items before Phase 4 integration testing. LOW items can be deferred to post-merge or Phase 5.

---

## MEDIUM Priority Fixes (Fix Before Phase 4)

### FIX-001 [MEDIUM] — Add Exception Logging to Subscriber Error Handling

**Finding ID**: OBS-001
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 71-72

**Issue**: Silent exception swallowing in subscriber callbacks. No way to debug why subscribers fail.

**Impact**: When a subscriber throws an error, developers have zero visibility into what broke or which subscriber failed. This makes production troubleshooting impossible.

**Fix**:

```diff
--- a/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
+++ b/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
@@ -68,8 +68,12 @@
     for (const callback of this.subscribers) {
       try {
         callback(changedEvent);
-      } catch {
+      } catch (error) {
         // Error isolation: one throwing subscriber must not block others
+        console.warn(`[${this.name}] Subscriber callback threw`, {
+          graphSlug: changedEvent.graphSlug,
+          workspaceSlug: changedEvent.workspaceSlug,
+          error,
+        });
       }
     }
   }
```

**Testing**: After applying patch, manually trigger a subscriber error and verify console output contains structured warning with graphSlug, workspaceSlug, and error details.

**Command**:
```bash
cd /home/jak/substrate/023-central-watcher-notifications
# Apply patch manually or via editor
npx vitest run workgraph-watcher.adapter.test.ts  # Verify no test breakage
```

---

### FIX-002 [MEDIUM] — Fix Task↔Log Link Mismatches (T001-T004)

**Finding IDs**: LINK-001, LINK-002, LINK-003, LINK-004
**File**: `docs/plans/023-central-watcher-notifications/tasks/phase-3-workgraphwatcheradapter-tdd/tasks.md`
**Lines**: 184-187 (task table Notes column)

**Issue**: Task table references individual log anchors (`#task-t002-red`, `#task-t003-red`, `#task-t004-red`) but execution log combined these into a single section (`#tasks-t002-t004-red`). T001 also missing log anchor entirely.

**Impact**: Broken navigation links. Users clicking `[📋 log]` will get 404 anchor errors.

**Fix**:

**T001 (line 184)**: Add log anchor to Notes column:

Before:
```markdown
| [x] | T001 | Define `WorkGraphChangedEvent` type in adapter file | CS-1 | Setup | – | `/home/jak/...` | Type has: `graphSlug: string`, ... | – | plan-scoped. Ref: `workspace-change-notifier.interface.ts:28-55` |
```

After:
```markdown
| [x] | T001 | Define `WorkGraphChangedEvent` type in adapter file | CS-1 | Setup | – | `/home/jak/...` | Type has: `graphSlug: string`, ... | – | [📋 log](execution.log.md#task-t001-setup). plan-scoped. Ref: `workspace-change-notifier.interface.ts:28-55` |
```

**T002-T004 (lines 185-187)**: Update anchor to combined section:

Before (T002):
```markdown
| [x] | T002 | Write tests: state.json change detection and filtering (RED) | CS-2 | Test | T001 | `/home/jak/...` | Tests cover: ... | – | [📋 log](execution.log.md#task-t002-red) |
```

After (T002):
```markdown
| [x] | T002 | Write tests: state.json change detection and filtering (RED) | CS-2 | Test | T001 | `/home/jak/...` | Tests cover: ... | – | [📋 log](execution.log.md#tasks-t002-t004-red) |
```

Repeat for T003 and T004 (change `#task-t003-red` → `#tasks-t002-t004-red`, `#task-t004-red` → `#tasks-t002-t004-red`).

**Verification**:
```bash
# Check links resolve
cd /home/jak/substrate/023-central-watcher-notifications/docs/plans/023-central-watcher-notifications/tasks/phase-3-workgraphwatcheradapter-tdd
grep -n "#tasks-t002-t004-red" execution.log.md  # Should find anchor at line 30
```

---

### FIX-003 [MEDIUM] — Add Debug Logging for Event Flow

**Finding ID**: OBS-002
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 53-75

**Issue**: No debug logging for filtered events (path didn't match) or dispatched events (successful dispatch). Difficult to diagnose event flow issues in production.

**Impact**: Cannot tell if events are not being received, being filtered out, or being dispatched but not processed.

**Fix** (optional — can defer to post-merge):

Add debug logging at two points:

1. **After line 57** (event filtered out):

```typescript
handleEvent(event: WatcherEvent): void {
  const match = event.path.match(STATE_JSON_REGEX);
  if (!match) {
    // Optional debug log
    // console.debug(`[${this.name}] Event filtered (path not matched)`, { path: event.path });
    return;
  }
  // ... rest of method
}
```

2. **Before line 68** (event dispatched):

```typescript
const changedEvent: WorkGraphChangedEvent = {
  graphSlug,
  workspaceSlug: event.workspaceSlug,
  worktreePath: event.worktreePath,
  filePath: event.path,
  timestamp: new Date(),
};

// Optional debug log
// console.debug(`[${this.name}] Dispatching event`, { graphSlug, workspaceSlug: event.workspaceSlug, subscriberCount: this.subscribers.size });

for (const callback of this.subscribers) {
  // ...
}
```

**Note**: Commented out by default to avoid log noise. Enable for debugging sessions.

**Alternative**: Use a lightweight structured logger (if available in the project) instead of `console.debug`.

---

### FIX-004 [MEDIUM] — Add Logging for Subscription Lifecycle

**Finding ID**: OBS-003
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 77-82

**Issue**: No logging when subscribers are added or removed. Cannot audit subscriber registration patterns.

**Impact**: Difficult to debug scenarios where expected subscribers are missing or accidentally unsubscribe.

**Fix** (optional — can defer to post-merge):

```diff
--- a/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
+++ b/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
@@ -76,8 +76,11 @@
 
   onGraphChanged(callback: GraphChangedCallback): () => void {
     this.subscribers.add(callback);
+    // console.debug(`[${this.name}] Subscriber added`, { count: this.subscribers.size });
     return () => {
       this.subscribers.delete(callback);
+      // console.debug(`[${this.name}] Subscriber removed`, { count: this.subscribers.size });
     };
   }
 }
```

**Note**: Commented out by default. Enable for debugging subscriber lifecycle issues.

---

## LOW Priority Fixes (Can Defer)

### FIX-005 [LOW] — Apply Defensive Subscriber Snapshot Pattern

**Finding ID**: CORR-001
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 68-74

**Issue**: Iterating over `this.subscribers` Set while callbacks could synchronously call `unsubscribe()`, potentially causing skipped callbacks.

**Impact**: If a subscriber callback synchronously unsubscribes itself or another subscriber, the iteration could skip remaining callbacks. This is an edge case but violates defensive programming principles.

**Fix**:

```diff
--- a/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
+++ b/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
@@ -66,7 +66,8 @@
       timestamp: new Date(),
     };
 
-    for (const callback of this.subscribers) {
+    const snapshot = [...this.subscribers];
+    for (const callback of snapshot) {
       try {
         callback(changedEvent);
       } catch (error) {
```

**Testing**: Add a test case where a subscriber unsubscribes itself during callback and verify all subscribers still get notified.

---

### FIX-006 [LOW] — Validate GraphSlug Non-Empty

**Finding ID**: CORR-002
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 59

**Issue**: No validation that graphSlug captured group is non-empty string. Edge case: `work-graphs//state.json` would capture empty string.

**Impact**: Could confuse consumers expecting non-empty slugs.

**Fix**:

```diff
--- a/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
+++ b/packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts
@@ -54,6 +54,9 @@
   handleEvent(event: WatcherEvent): void {
     const match = event.path.match(STATE_JSON_REGEX);
     if (!match) {
+      return;
+    }
+    if (!match[1]) {
       return;
     }
```

**Testing**: Add test case with edge-case path (`/wt/.chainglass/data/work-graphs//state.json`) and verify no event is emitted.

---

### FIX-007 [LOW] — Add Metrics Infrastructure (Future Work)

**Finding ID**: OBS-004
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 53-75

**Issue**: No counters/histograms for event processing: events received, filtered, dispatched, subscriber callback duration.

**Impact**: Cannot monitor SLOs around event processing latency or detect degradation over time.

**Fix**: Defer to future work. Requires project-wide metrics infrastructure (e.g., Prometheus client, StatsD).

**Suggested Metrics**:
- `workgraph_watcher_events_received_total` (counter)
- `workgraph_watcher_events_filtered_total` (counter)
- `workgraph_watcher_events_dispatched_total` (counter)
- `workgraph_watcher_subscriber_callback_duration_seconds` (histogram)

---

### FIX-008 [LOW] — Path Normalization (Defense-in-Depth)

**Finding ID**: SEC-002
**File**: `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
**Lines**: 54

**Issue**: Regex path matching could be bypassed with URL-encoded or non-normalized paths (e.g., `work-graphs%2F../other/state.json`).

**Impact**: Defense-in-depth only. Low risk since `WatcherEvent` paths come from filesystem watchers which use real normalized paths, not user input.

**Fix** (if paths could ever come from untrusted sources):

```typescript
import { normalize } from 'node:path';

handleEvent(event: WatcherEvent): void {
  const normalizedPath = normalize(event.path);
  const match = normalizedPath.match(STATE_JSON_REGEX);
  // ... rest of method
}
```

**Recommendation**: Skip this fix unless security audit identifies a path injection risk in upstream code.

---

## Testing After Fixes

### Minimal Test Plan (MEDIUM fixes only)

```bash
cd /home/jak/substrate/023-central-watcher-notifications

# 1. Apply FIX-001 (exception logging)
# Edit workgraph-watcher.adapter.ts manually

# 2. Apply FIX-002 (link fixes)
# Edit tasks.md manually

# 3. Run tests to verify no breakage
npx vitest run workgraph-watcher.adapter.test.ts

# Expected: ✓ 16 passed (16)

# 4. Type check
pnpm exec tsc --noEmit

# Expected: No errors

# 5. Verify links resolve
grep -n "#task-t001-setup" docs/plans/023-central-watcher-notifications/tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md
grep -n "#tasks-t002-t004-red" docs/plans/023-central-watcher-notifications/tasks/phase-3-workgraphwatcheradapter-tdd/execution.log.md

# Expected: Both anchors found

# 6. Manual test for exception logging (create throwingSubscriber test)
# See test example below
```

### Test for Exception Logging (FIX-001)

Add this test to `workgraph-watcher.adapter.test.ts` after line 260:

```typescript
it('should log error context when subscriber throws', () => {
  /*
  Test Doc:
  - Why: Verify FIX-001 — exception logging for debugging
  - Contract: Throwing subscriber logs error with graphSlug and workspaceSlug context
  - Usage Notes: Check console output manually or spy on console.warn
  - Quality Contribution: Ensures production debugging visibility
  - Worked Example: Subscriber throws → console.warn called with structured error
  */
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  
  adapter.onGraphChanged(() => {
    throw new Error('Test error');
  });
  
  adapter.handleEvent(makeEvent(stateJsonPath('my-graph')));
  
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    '[workgraph-watcher] Subscriber callback threw',
    expect.objectContaining({
      graphSlug: 'my-graph',
      workspaceSlug: 'my-ws',
      error: expect.any(Error),
    })
  );
  
  consoleWarnSpy.mockRestore();
});
```

**Note**: This test uses `vi.spyOn` which violates "Fakes only" policy. Skip this test or use a manual console check instead.

---

## Summary

**MEDIUM Fixes (4 items)**: Fix before Phase 4
- FIX-001: Exception logging (CRITICAL for debugging)
- FIX-002: Link fixes (breaks navigation)
- FIX-003: Event flow logging (optional — defer if time-constrained)
- FIX-004: Subscription lifecycle logging (optional — defer if time-constrained)

**LOW Fixes (4 items)**: Defer to post-merge or Phase 5
- FIX-005: Defensive snapshot pattern
- FIX-006: Empty slug validation
- FIX-007: Metrics infrastructure (future work)
- FIX-008: Path normalization (security hardening)

**Estimated Effort**:
- FIX-001 + FIX-002: **15 minutes** (4 line changes + 4 link updates)
- FIX-003 + FIX-004: **10 minutes** (add commented debug logs)
- FIX-005 to FIX-008: **30 minutes** (defensive patterns + tests)

**Total**: ~55 minutes to address all findings. **Minimum viable**: 15 minutes (FIX-001 + FIX-002 only).
