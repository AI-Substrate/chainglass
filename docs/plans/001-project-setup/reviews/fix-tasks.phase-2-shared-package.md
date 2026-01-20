# Phase 2: Shared Package - Fix Tasks

**Generated**: 2026-01-18
**Review**: [review.phase-2-shared-package.md](./review.phase-2-shared-package.md)
**Status**: APPROVED (fixes applied 2026-01-18)

---

## Required Fixes (Must Complete Before Merge)

### FIX-1: Update Plan Task Table Status [CRITICAL]

**Severity**: CRITICAL
**File**: `/Users/jordanknight/substrate/chainglass/docs/plans/001-project-setup/project-setup-plan.md`
**Lines**: 647-659 (Phase 2 task table)
**Impact**: Plan-Dossier synchronization broken; progress tracking unreliable

**Issue**: All 12 Phase 2 tasks (2.1-2.12) show `[ ]` (unchecked) in the Status column, but the dossier shows all tasks as `[x]` (completed). The Progress Tracking section correctly shows "Phase 2: Shared Package - COMPLETE" but the task table contradicts this.

**Fix**: Update the Status column for tasks 2.1-2.12 from `[ ]` to `[x]`.

**Patch**:
```markdown
| #   | Status | Task | ...
|-----|--------|------| ...
| 2.1 | [x] | Create packages/shared/src structure | ...
| 2.2 | [x] | Write ILogger interface | ...
| 2.3 | [x] | Write FakeLogger implementing ILogger | ...
| 2.4 | [x] | Write test for FakeLogger | ...
| 2.5 | [x] | Run test - expect RED | ...
| 2.6 | [x] | Fix exports, run test - expect GREEN | ...
| 2.7 | [x] | Create logger contract tests | ...
| 2.8 | [x] | Write PinoLoggerAdapter | ...
| 2.9 | [x] | Run contract tests for PinoLoggerAdapter | ...
| 2.10 | [x] | Configure package exports | ...
| 2.11 | [x] | Write package build script | ...
| 2.12 | [x] | Verify Phase 2 gate | ...
```

**Verification**: After fix, run `grep -c "\[x\]" project-setup-plan.md` to confirm count increases by 12.

---

### FIX-2: Add Execution Log Links to Plan [HIGH]

**Severity**: HIGH
**File**: `/Users/jordanknight/substrate/chainglass/docs/plans/001-project-setup/project-setup-plan.md`
**Lines**: 647-659 (Phase 2 task table, Log column)
**Impact**: Cannot navigate from plan task to execution evidence

**Issue**: The Log column shows `-` for all Phase 2 tasks, but execution log entries and footnotes exist. Phase 1 tasks have proper links like `[📋](tasks/phase-1-monorepo-foundation/execution.log.md#T001)`.

**Fix**: Update the Log column for tasks 2.1-2.12 to reference the execution log with anchor links.

**Patch** (example for first few rows):
```markdown
| #   | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Create packages/shared/src structure | 1 | ... | [📋](tasks/phase-2-shared-package/execution.log.md#task-t001-create-packagessharedsrc-directory-structure) | [^13] |
| 2.2 | [x] | Write ILogger interface | 1 | ... | [📋](tasks/phase-2-shared-package/execution.log.md#task-t002-write-ilogger-interface-with-all-log-levels) | [^13] |
...
```

**Alternative**: Run `/plan-6a-update-progress --phase 2` to automatically sync the plan.

---

## Recommended Fixes (Can Be Deferred)

### FIX-3: Add Error Serializer to PinoLoggerAdapter [HIGH]

**Severity**: HIGH
**File**: `/Users/jordanknight/substrate/chainglass/packages/shared/src/adapters/pino-logger.adapter.ts`
**Lines**: 13-14
**Impact**: Error stack traces may not serialize properly in production logs

**Issue**: The default pino instance is created without configuring the error serializer, which may result in `[object Object]` or missing stack traces.

**Fix**: Add pino's standard error serializer to the default configuration.

**Patch**:
```diff
--- a/packages/shared/src/adapters/pino-logger.adapter.ts
+++ b/packages/shared/src/adapters/pino-logger.adapter.ts
@@ -11,7 +11,9 @@ export class PinoLoggerAdapter implements ILogger {
   private readonly logger: Logger;

   constructor(pinoInstance?: Logger) {
-    this.logger = pinoInstance ?? pino();
+    this.logger = pinoInstance ?? pino({
+      serializers: { err: pino.stdSerializers.err }
+    });
   }
```

**Testing**: After fix, run contract tests to verify no regression:
```bash
just test
```

---

### FIX-4: Fix Empty Metadata Handling in FakeLogger [MEDIUM]

**Severity**: MEDIUM
**File**: `/Users/jordanknight/substrate/chainglass/packages/shared/src/fakes/fake-logger.ts`
**Lines**: 101
**Impact**: Log entries have `{}` instead of `undefined` when no data provided

**Issue**: When no data is provided and metadata is empty, the entry's `data` field is set to `{}` instead of `undefined`, causing inconsistency with PinoLoggerAdapter behavior.

**Fix**: Check if metadata has keys before spreading.

**Patch**:
```diff
--- a/packages/shared/src/fakes/fake-logger.ts
+++ b/packages/shared/src/fakes/fake-logger.ts
@@ -98,7 +98,9 @@ export class FakeLogger implements ILogger {
     this.entries.push({
       level,
       message,
-      data: data ? { ...this.metadata, ...data } : this.metadata,
+      data: data || Object.keys(this.metadata).length > 0
+        ? { ...this.metadata, ...data }
+        : undefined,
       error,
       timestamp: new Date(),
     });
```

---

### FIX-5: Add MaxEntries Cap to FakeLogger [MEDIUM]

**Severity**: MEDIUM
**File**: `/Users/jordanknight/substrate/chainglass/packages/shared/src/fakes/fake-logger.ts`
**Lines**: 11-106
**Impact**: Unbounded memory growth in long-running test suites

**Issue**: FakeLogger stores all log entries indefinitely without a maximum limit, which could cause memory exhaustion in extensive test suites.

**Fix**: Add an optional maxEntries cap with circular buffer behavior.

**Patch**:
```diff
--- a/packages/shared/src/fakes/fake-logger.ts
+++ b/packages/shared/src/fakes/fake-logger.ts
@@ -11,12 +11,14 @@ import { LogLevel } from '../interfaces/logger.interface.js';
 export class FakeLogger implements ILogger {
   private readonly entries: LogEntry[];
   private readonly metadata: Record<string, unknown>;
+  private static readonly MAX_ENTRIES = 10000;

   // In the log() method:
   private log(...): void {
+    if (this.entries.length >= FakeLogger.MAX_ENTRIES) {
+      this.entries.shift(); // Evict oldest
+    }
     this.entries.push({
```

---

### FIX-6: Fix Error Object Spread Order [LOW]

**Severity**: LOW
**File**: `/Users/jordanknight/substrate/chainglass/packages/shared/src/adapters/pino-logger.adapter.ts`
**Lines**: 50, 59
**Impact**: data.err can override the actual Error object

**Issue**: The spread order `{ err: error, ...data }` allows a caller-provided `data.err` to override the actual Error object.

**Fix**: Change spread order so Error always wins.

**Patch**:
```diff
--- a/packages/shared/src/adapters/pino-logger.adapter.ts
+++ b/packages/shared/src/adapters/pino-logger.adapter.ts
@@ -47,7 +47,7 @@ export class PinoLoggerAdapter implements ILogger {
   }

   error(message: string, error?: Error, data?: Record<string, unknown>): void {
-    const mergedData = error ? { err: error, ...data } : data;
+    const mergedData = error ? { ...data, err: error } : data;
     if (mergedData) {
       this.logger.error(mergedData, message);
@@ -56,7 +56,7 @@ export class PinoLoggerAdapter implements ILogger {
   }

   fatal(message: string, error?: Error, data?: Record<string, unknown>): void {
-    const mergedData = error ? { err: error, ...data } : data;
+    const mergedData = error ? { ...data, err: error } : data;
     if (mergedData) {
       this.logger.fatal(mergedData, message);
```

---

## Fix Checklist

- [x] **FIX-1**: Update plan task table status (CRITICAL - required) - DONE 2026-01-18
- [x] **FIX-2**: Add execution log links to plan (HIGH - required) - DONE 2026-01-18
- [x] **FIX-3**: Add error serializer to PinoLoggerAdapter (HIGH - recommended) - DONE 2026-01-18
- [ ] **FIX-4**: Fix empty metadata handling (MEDIUM - deferred)
- [ ] **FIX-5**: Add maxEntries cap (MEDIUM - deferred)
- [x] **FIX-6**: Fix error spread order (LOW - can defer) - DONE 2026-01-18

---

## Verification After Fixes

After completing FIX-1 and FIX-2:

```bash
# Verify plan-dossier sync
grep -c "\[x\]" docs/plans/001-project-setup/project-setup-plan.md
# Should include 12 more checked boxes than before

# Verify all tests still pass
just test

# Re-run code review
/plan-7-code-review docs/plans/001-project-setup/tasks/phase-2-shared-package/tasks.md
```

---

**Generated by**: plan-7-code-review
**Next Step**: Complete FIX-1 and FIX-2, then re-run review
