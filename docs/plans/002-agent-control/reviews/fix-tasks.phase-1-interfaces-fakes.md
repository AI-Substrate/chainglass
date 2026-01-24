# Phase 1: Interfaces & Fakes - Fix Tasks

**Date**: 2026-01-22  
**Review Report**: [review.phase-1-interfaces-fakes.md](./review.phase-1-interfaces-fakes.md)  
**Priority**: MEDIUM (recommended before Phase 2, not blocking)

---

## Overview

This document contains actionable fix tasks for the 2 MEDIUM-severity findings from the Phase 1 code review. All tasks are **recommended before Phase 2** to improve test reliability and prevent potential hangs.

**Status**: ❌ REQUEST_CHANGES (2 MEDIUM findings require fixes)

However, given the nature of the findings (test infrastructure improvements) and that all functional requirements are met, **Phase 1 can be merged with a follow-up fix**.

---

## Fix Tasks

### Task FIX-001: Fix exitOnSignal Logic Defect

**Priority**: MEDIUM  
**Finding**: LOGIC-001  
**File**: `packages/shared/src/fakes/fake-process-manager.ts`  
**Lines**: 129-135

#### Problem

The `exitOnSignal` feature prevents normal signal handling when configured. If set to exit only on SIGTERM but SIGINT is sent, the process ignores SIGINT entirely instead of falling through to default behavior.

**Current behavior**:
```typescript
// If exitOnSignal='SIGTERM' is set but SIGINT sent:
if (state.exitOnSignal !== null) {
  if (state.exitOnSignal === signal) {
    this._exitProcess(pid, 128 + this._signalToCode(signal), signal);
  }
  // Don't exit on other signals if exitOnSignal is configured
  return; // ❌ Returns early, process stays running!
}
```

**Impact**: Tests using `exitProcessOnSignal('SIGTERM')` will hang if SIGINT is sent because the process won't respond.

#### Fix

**Option A** (Recommended): Remove the early return and allow normal exit behavior on any signal unless stubborn:

```diff
--- a/packages/shared/src/fakes/fake-process-manager.ts
+++ b/packages/shared/src/fakes/fake-process-manager.ts
@@ -126,15 +126,12 @@ export class FakeProcessManager implements IProcessManager {
       return;
     }
 
-    // Check if process should exit on this specific signal (not earlier ones)
-    if (state.exitOnSignal !== null) {
-      if (state.exitOnSignal === signal) {
-        this._exitProcess(pid, 128 + this._signalToCode(signal), signal);
-      }
-      // Don't exit on other signals if exitOnSignal is configured
-      return;
-    }
-
-    // Default behavior: process exits on any signal
-    this._exitProcess(pid, 128 + this._signalToCode(signal), signal);
+    // Default behavior: process exits on any signal (unless stubborn already handled it)
+    // Note: If exitOnSignal is configured, we still exit on other signals unless stubborn.
+    // The exitOnSignal feature only controls which SPECIFIC signal triggers exit,
+    // not whether the process is immune to other signals.
+    // To make process immune to specific signals, use stubborn mode instead.
+    this._exitProcess(pid, 128 + this._signalToCode(signal), signal);
   }
```

**Option B**: Make exitOnSignal behavior explicit by renaming to `onlyExitOnSignal` and documenting:

```diff
--- a/packages/shared/src/fakes/fake-process-manager.ts
+++ b/packages/shared/src/fakes/fake-process-manager.ts
   exitOnSignal: ProcessSignal | null;
+  onlyExitOnSignal: boolean; // If true, ONLY exit on the specified signal, ignore others
```

**Recommendation**: Use **Option A** - simplify by removing the exitOnSignal blocking behavior. If tests need a process that only responds to specific signals, use `makeProcessStubborn()` and manually call `exitProcess()` on the desired signal.

#### Validation

After fix, add this test to `test/unit/shared/fake-process-manager.test.ts`:

```typescript
it('should exit on any signal even when exitOnSignal is configured', async () => {
  /*
  Test Doc:
  - Why: Verify exitOnSignal doesn't block normal signal handling
  - Contract: exitOnSignal only affects which signal is EXPECTED, not which signals work
  - Usage Notes: If you need immunity to specific signals, use stubborn mode
  - Quality Contribution: Prevents test hangs from unexpected signal immunity
  - Worked Example: exitOnSignal='SIGTERM' + send SIGINT → process still exits (just not the expected signal)
  */
  const handle = await manager.spawn({ command: 'test' });
  
  // Configure to exit on SIGTERM, but send SIGINT instead
  manager.exitProcessOnSignal(handle.pid, 'SIGTERM');
  await manager.signal(handle.pid, 'SIGINT');
  
  // Process should still exit (not hang waiting for SIGTERM)
  const running = await manager.isRunning(handle.pid);
  expect(running).toBe(false);
});
```

Run test:
```bash
pnpm -F @chainglass/shared test test/unit/shared/fake-process-manager.test.ts
```

---

### Task FIX-002: Document Signal Escalation Timing Deviation

**Priority**: LOW (documentation only)  
**Finding**: SEM-002  
**File**: `packages/shared/src/fakes/fake-process-manager.ts`  
**Lines**: 103-104

#### Problem

FakeProcessManager uses 1ms delay between signals instead of 2s intervals per AC-14 spec. This is intentional for test performance, but the spec still says "2-second intervals."

**Current code**:
```typescript
// Wait between signals (minimal for fake; real would be 2s)
await new Promise((resolve) => setTimeout(resolve, 1));
```

#### Fix

**Option A**: Update the comment to be more explicit:

```diff
--- a/packages/shared/src/fakes/fake-process-manager.ts
+++ b/packages/shared/src/fakes/fake-process-manager.ts
-      // Wait between signals (minimal for fake; real would be 2s)
-      await new Promise((resolve) => setTimeout(resolve, 1));
+      // Wait between signals (1ms for test speed; real ProcessManager uses 2s per AC-14)
+      // This deviation is intentional to keep tests fast while preserving escalation sequence
+      await new Promise((resolve) => setTimeout(resolve, 1));
```

**Option B**: Add a configurable delay for testing different timing scenarios:

```typescript
export class FakeProcessManager implements IProcessManager {
  private _signalEscalationDelayMs = 1; // Default: fast for tests

  /** Configure signal escalation delay (default: 1ms for speed) */
  setSignalEscalationDelay(ms: number): void {
    this._signalEscalationDelayMs = ms;
  }

  async terminate(pid: number): Promise<void> {
    // ...
    await new Promise((resolve) => setTimeout(resolve, this._signalEscalationDelayMs));
  }
}
```

**Recommendation**: Use **Option A** (just improve the comment). The 1ms delay is appropriate for a test fake. If Phase 3 needs to verify real 2s timing, that should be in the real ProcessManager integration tests, not the fake.

#### Validation

No code change needed if using Option A. Just verify comment clarity:

```bash
grep -A2 "Wait between signals" packages/shared/src/fakes/fake-process-manager.ts
```

---

## Optional Enhancements (LOW Priority)

These are **not required** but would improve code quality:

### Enhancement E-001: Add Missing Edge Case Tests

**Finding**: TDD-001, TDD-002  
**Priority**: LOW

Add tests for:
1. Null/undefined prompt handling in FakeAgentAdapter
2. Signal on already-terminated process in FakeProcessManager

**Test patches**:

```typescript
// test/unit/shared/fake-agent-adapter.test.ts
it('should handle undefined prompt gracefully', async () => {
  const fake = new FakeAgentAdapter();
  const result = await fake.run({ prompt: undefined as any });
  expect(result.sessionId).toBeDefined();
  expect(result.status).toBe('completed');
});

// test/unit/shared/fake-process-manager.test.ts
it('should ignore signal on already-exited process', async () => {
  const handle = await manager.spawn({ command: 'test' });
  manager.exitProcess(handle.pid, 0);
  
  // Signal after exit should not throw
  await expect(manager.signal(handle.pid, 'SIGINT')).resolves.not.toThrow();
  
  // Verify signal was still recorded
  const signals = manager.getSignalsSent(handle.pid);
  expect(signals).toContain('SIGINT');
});
```

### Enhancement E-002: Add Bounded History Arrays

**Finding**: SEC-001, SEC-002, SEC-003  
**Priority**: LOW

Prevent unbounded memory growth in test doubles:

```typescript
export class FakeProcessManager implements IProcessManager {
  private readonly _maxHistorySize = 1000; // Configurable limit
  
  async spawn(options: SpawnOptions): Promise<ProcessHandle> {
    this._spawnHistory.push({ ...options });
    
    // Trim history if exceeds limit
    if (this._spawnHistory.length > this._maxHistorySize) {
      this._spawnHistory.shift(); // Remove oldest
    }
    // ...
  }
}
```

**Alternative**: Just ensure tests call `reset()` in `afterEach()` blocks.

---

## Testing Strategy

### Regression Tests

After applying fixes, run full test suite:

```bash
# All tests
pnpm run test

# Phase 1 specific
pnpm -F @chainglass/shared test test/contracts/agent-adapter.contract.test.ts
pnpm -F @chainglass/shared test test/contracts/process-manager.contract.test.ts
pnpm -F @chainglass/shared test test/unit/shared/fake-agent-adapter.test.ts
pnpm -F @chainglass/shared test test/unit/shared/fake-process-manager.test.ts
```

**Expected**: All 53 Phase 1 tests should still pass after fixes.

### New Tests

Add the validation test from FIX-001 to verify the exitOnSignal fix.

---

## Acceptance Criteria for Fixes

- [ ] FIX-001: exitOnSignal logic allows normal signal handling (patch applied, validation test passes)
- [ ] FIX-002: Signal escalation timing deviation documented (comment improved)
- [ ] All existing tests still pass (53/53 Phase 1 tests green)
- [ ] New validation test added and passing (exitOnSignal behavior)

---

**Fix Tasks Complete** - Ready for Phase 2 after FIX-001 applied.
