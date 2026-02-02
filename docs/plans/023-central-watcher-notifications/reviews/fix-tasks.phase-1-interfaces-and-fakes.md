# Fix Tasks: Phase 1 - Interfaces & Fakes

**Plan**: 023-central-watcher-notifications  
**Phase**: Phase 1: Interfaces & Fakes  
**Generated**: 2026-01-31  
**Verdict**: REQUEST_CHANGES  
**Blocking Issues**: 3 HIGH severity

---

## Overview

Phase 1 requires fixes for:
1. **Double-start prevention** missing in FakeCentralWatcherService (violates interface contract)
2. **Missing test** for double-start scenario
3. **Bidirectional link violations** (all 9 tasks missing log anchors)

**Testing Approach**: Full TDD - fixes follow RED-GREEN pattern where applicable

---

## Priority 1: CRITICAL (Blocking Phase 2)

### Fix-001: Add Double-Start Prevention to FakeCentralWatcherService

**Severity**: HIGH (blocks Phase 2 TDD)  
**Finding**: CORR-001  
**File**: `/home/jak/substrate/023-central-watcher-notifications/packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts`

**Issue**: `start()` method does not enforce interface contract `@throws Error if already watching`

**Current Code** (lines 59-65):
```typescript
async start(): Promise<void> {
  if (this.startError) throw this.startError;
  this.watching = true;
  this.startCalls.push({ timestamp: Date.now() });
}
```

**Required Fix**:
```typescript
async start(): Promise<void> {
  if (this.startError) throw this.startError;
  if (this.watching) throw new Error('Already watching');  // ADD THIS
  this.watching = true;
  this.startCalls.push({ timestamp: Date.now() });
}
```

**Patch**:
```diff
--- a/packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts
+++ b/packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts
@@ -59,6 +59,7 @@
   async start(): Promise<void> {
     if (this.startError) throw this.startError;
+    if (this.watching) throw new Error('Already watching');
     this.watching = true;
     this.startCalls.push({ timestamp: Date.now() });
   }
```

**Validation**:
```bash
pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts
# Should pass 9 tests (8 existing + 1 new double-start test)
```

---

### Fix-002: Add Test for Double-Start Scenario

**Severity**: HIGH (validates Fix-001)  
**Finding**: TEST-001  
**File**: `/home/jak/substrate/023-central-watcher-notifications/test/unit/workflow/fake-central-watcher.service.test.ts`

**Issue**: Missing test case to validate double-start prevention behavior

**Location**: After existing "should track start() calls" test (approximately line 35)

**Required Test**:
```typescript
it('should throw when calling start() twice without stop()', async () => {
  /*
  Test Doc:
  - Why: Validates interface contract @throws Error if already watching (double-start prevention)
  - Contract: start() rejects when service is already watching, preventing resource leaks and duplicate watchers
  - Usage Notes: Run after basic start tracking test; verifies lifecycle state machine
  - Quality Contribution: Catches double-start bugs in real CentralWatcherService implementation and adapter code
  - Worked Example: 
      Create fake → await start() (watching=true) → 
      await start() again → expect Error('Already watching')
  */
  const fake = new FakeCentralWatcherService();
  
  await fake.start();
  expect(fake.isWatching()).toBe(true);
  
  await expect(fake.start()).rejects.toThrow('Already watching');
  
  // State should remain watching after rejected second start
  expect(fake.isWatching()).toBe(true);
  expect(fake.startCalls).toHaveLength(1); // Only first start recorded
});
```

**Patch**:
```diff
--- a/test/unit/workflow/fake-central-watcher.service.test.ts
+++ b/test/unit/workflow/fake-central-watcher.service.test.ts
@@ -35,6 +35,27 @@
     expect(fake.startCalls).toHaveLength(1);
   });
 
+  it('should throw when calling start() twice without stop()', async () => {
+    /*
+    Test Doc:
+    - Why: Validates interface contract @throws Error if already watching (double-start prevention)
+    - Contract: start() rejects when service is already watching, preventing resource leaks
+    - Usage Notes: Run after basic start tracking test; verifies lifecycle state machine
+    - Quality Contribution: Catches double-start bugs in real CentralWatcherService and adapters
+    - Worked Example: 
+        Create fake → await start() (watching=true) → 
+        await start() again → expect Error('Already watching')
+    */
+    const fake = new FakeCentralWatcherService();
+    
+    await fake.start();
+    expect(fake.isWatching()).toBe(true);
+    
+    await expect(fake.start()).rejects.toThrow('Already watching');
+    
+    expect(fake.isWatching()).toBe(true);
+    expect(fake.startCalls).toHaveLength(1);
+  });
+
   it('should track stop() calls', async () => {
     // ... existing test
   });
```

**Validation**:
```bash
# Before Fix-001: Test should FAIL (RED phase)
pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts
# Expected: 1 failed (new test), 8 passed

# After Fix-001: Test should PASS (GREEN phase)
pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts
# Expected: 9 passed
```

---

### Fix-003: Add Bidirectional Task↔Log Links

**Severity**: HIGH (breaks graph traversability)  
**Finding**: LINK-001  
**Files**: 
- `/home/jak/substrate/023-central-watcher-notifications/docs/plans/023-central-watcher-notifications/tasks/phase-1-interfaces-and-fakes/execution.log.md`
- `/home/jak/substrate/023-central-watcher-notifications/docs/plans/023-central-watcher-notifications/tasks/phase-1-interfaces-and-fakes/tasks.md`

**Issue**: All 9 completed tasks missing log#anchor references in Notes column; execution log missing markdown anchors

**Recommended Tool**: `plan-6a --sync-links --phase "Phase 1: Interfaces & Fakes"`

**Manual Fix** (if plan-6a not available):

**Step 1**: Add markdown anchors to execution.log.md

For each task section, add a `###` heading with anchor:

```diff
--- a/docs/plans/.../execution.log.md
+++ b/docs/plans/.../execution.log.md
@@ -9,6 +9,7 @@
 ## Task T001: Create PlanPak feature directory and package.json exports entry
+### log#task-t001-create-planpak
 **Dossier Task**: T001 | **Plan Task**: 1.0
 **Started**: 2026-01-31
 
@@ -30,6 +31,7 @@
 
 ## Task T002: Define WatcherEvent type and IWatcherAdapter interface
+### log#task-t002-define-watcher
 **Dossier Task**: T002 | **Plan Task**: 1.1
 **Started**: 2026-01-31
 
@@ -46,6 +48,7 @@
 
 ## Task T003: Define ICentralWatcherService interface
+### log#task-t003-define-central
 **Dossier Task**: T003 | **Plan Task**: 1.2
 **Started**: 2026-01-31
```

(Continue for all 9 tasks: T004→T009)

**Step 2**: Update Notes column in tasks.md

```diff
--- a/docs/plans/.../tasks.md
+++ b/docs/plans/.../tasks.md
@@ -217,9 +217,9 @@
 
 | Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
 |--------|------|------|-----|------|--------------|-------------------|------------|----------|-------|
-| [x] | T001 | Create PlanPak feature directory ... | CS-1 | Setup | – | `/home/jak/.../` | Directory exists; ... | – | plan-scoped (dir), cross-cutting (package.json). Plan task ref: 1.0 |
-| [x] | T002 | Define `WatcherEvent` type ... | CS-1 | Core | T001 | `/home/jak/.../watcher-adapter.interface.ts` | Types compile; ... | – | plan-scoped. Plan task ref: 1.1. Per Critical Finding 06 |
-| [x] | T003 | Define `ICentralWatcherService` interface ... | CS-1 | Core | T001 | `/home/jak/.../central-watcher.interface.ts` | Types compile; ... | – | plan-scoped. Plan task ref: 1.2 |
+| [x] | T001 | Create PlanPak feature directory ... | CS-1 | Setup | – | `/home/jak/.../` | Directory exists; ... | – | log#task-t001-create-planpak. Plan task ref: 1.0 |
+| [x] | T002 | Define `WatcherEvent` type ... | CS-1 | Core | T001 | `/home/jak/.../watcher-adapter.interface.ts` | Types compile; ... | – | log#task-t002-define-watcher. Plan task ref: 1.1 |
+| [x] | T003 | Define `ICentralWatcherService` interface ... | CS-1 | Core | T001 | `/home/jak/.../central-watcher.interface.ts` | Types compile; ... | – | log#task-t003-define-central. Plan task ref: 1.2 |
```

(Continue for all 9 tasks)

**Validation**:
```bash
# Check markdown link validity
grep -n "log#task-t" docs/plans/.../tasks/phase-1-interfaces-and-fakes/tasks.md
# Should show: 9 matches (one per task in Notes column)

grep -n "### log#task-t" docs/plans/.../tasks/phase-1-interfaces-and-fakes/execution.log.md
# Should show: 9 matches (one per task section)
```

---

## Priority 2: ADVISORY (Non-Blocking)

### Fix-004: Add Error Isolation to simulateEvent()

**Severity**: MEDIUM (improves test reliability)  
**Finding**: OBS-001  
**File**: `/home/jak/substrate/023-central-watcher-notifications/packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts`

**Issue**: One failing adapter can prevent remaining adapters from receiving events during tests

**Current Code** (lines 97-101):
```typescript
simulateEvent(event: WatcherEvent): void {
  for (const adapter of this.adapters) {
    adapter.handleEvent(event);  // If this throws, loop stops
  }
}
```

**Recommended Fix**:
```typescript
simulateEvent(event: WatcherEvent): void {
  for (const adapter of this.adapters) {
    try {
      adapter.handleEvent(event);
    } catch (error) {
      // Isolate adapter failures - all adapters should receive events
      // Real service will handle errors differently (logging, etc.)
      // For fake, we silently continue to ensure test reliability
    }
  }
}
```

**Patch**:
```diff
--- a/packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts
+++ b/packages/workflow/src/features/023-central-watcher-notifications/fake-central-watcher.service.ts
@@ -97,7 +97,12 @@
   simulateEvent(event: WatcherEvent): void {
     for (const adapter of this.adapters) {
-      adapter.handleEvent(event);
+      try {
+        adapter.handleEvent(event);
+      } catch (error) {
+        // Isolate adapter failures - all adapters should receive events
+        // Real service will handle errors differently (logging, etc.)
+      }
     }
   }
 }
```

**Rationale**: Prevents cascade failures in tests where one adapter throws. Real CentralWatcherService (Phase 2) should handle errors appropriately (likely with logging).

**Validation**: No new test needed - existing tests should continue to pass.

---

## Execution Order

**TDD-Style Workflow** (RED-GREEN pattern):

1. **FIX-002 FIRST** (RED): Add double-start test
   - Run: `pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts`
   - Expected: 1 failed, 8 passed
   
2. **FIX-001 SECOND** (GREEN): Fix FakeCentralWatcherService.start()
   - Run: `pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts`
   - Expected: 9 passed
   
3. **FIX-003**: Add bidirectional links (documentation fix)
   - Tool: `plan-6a --sync-links` OR manual edits
   
4. **FIX-004** (Optional): Add error isolation
   - Run: `pnpm vitest run test/unit/workflow/fake-central-watcher.service.test.ts`
   - Expected: 9 passed (no change, improvement is internal)

---

## Final Validation Checklist

After completing all fixes:

```bash
# Type checking
pnpm tsc --noEmit
# Expected: Clean exit (no errors)

# Linting
just lint
# Expected: 755 files checked, 0 violations

# Phase 1 tests
pnpm vitest run test/unit/workflow/fake-watcher-adapter.test.ts test/unit/workflow/fake-central-watcher.service.test.ts
# Expected: 2 test files, 13 tests (was 12), 0 failures

# Full test suite
just check
# Expected: All tests passing (should maintain 2706+ tests passing)

# Link validation
grep -c "log#task-t" docs/plans/.../tasks/phase-1-interfaces-and-fakes/tasks.md
# Expected: 9 (all tasks have log anchors)
```

---

## Re-Review Trigger

After fixes applied:

```bash
plan-7-code-review \
  --phase "Phase 1: Interfaces & Fakes" \
  --plan "/home/jak/substrate/023-central-watcher-notifications/docs/plans/023-central-watcher-notifications/central-watcher-notifications-plan.md" \
  --diff-file "/home/jak/.copilot/session-state/0089feb5-a535-448e-b7cf-7b8bd03ee7c5/files/phase-1.diff"
```

**Expected Verdict**: ✅ APPROVE (all HIGH issues resolved)

---

## Notes

- **Why Fix-002 before Fix-001?** TDD discipline: write failing test (RED) before implementation (GREEN)
- **Fix-003 can run in parallel** with Fix-001/002 (documentation fix, doesn't affect code)
- **Fix-004 is optional** but recommended for test robustness
- All fixes maintain existing test coverage (12 tests → 13 tests)
- No changes to public API surface
