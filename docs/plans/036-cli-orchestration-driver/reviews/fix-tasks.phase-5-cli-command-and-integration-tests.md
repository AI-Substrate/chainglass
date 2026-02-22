# Fix Tasks: Phase 5 — CLI Command and Integration Tests

**Review**: [review.phase-5-cli-command-and-integration-tests.md](./review.phase-5-cli-command-and-integration-tests.md)
**Verdict**: REQUEST_CHANGES
**Date**: 2026-02-17

---

## Blocking Fixes (must resolve before merge)

### FIX-1: Correct task and AC status for deferred integration tests

**Severity**: CRITICAL (F001-F007)
**What**: Tasks T001-T004 and acceptance criteria AC-INT-1/2/3 are marked `[x]` complete but were never implemented.

**Steps**:
1. In `cli-orchestration-driver-plan.md` Phase 5 task table (lines ~429-434):
   - Change status of tasks 5.1-5.4 from `[x]` to `[ ]`
   - Add Notes: "Deferred — see deferral note below"
2. In `cli-orchestration-driver-plan.md` Phase 5 Acceptance Criteria (lines ~442-448):
   - Uncheck AC-INT-1, AC-INT-2, AC-INT-3
   - Update inline note to reference a follow-up plan or debt ticket
3. In `tasks/phase-5-.../tasks.md` dossier task table:
   - Keep T001-T004 as `[ ]` (they already are)
   - Add Notes explaining deferral rationale
4. Add a formal deferral entry to the Deviation Ledger with tracking reference

### FIX-2: Populate footnotes and sync plan↔dossier link graph

**Severity**: HIGH (LINK-1 through LINK-6)
**What**: The Change Footnotes Ledger, Phase Footnote Stubs, and plan↔dossier links are all empty placeholders.

**Steps**:
1. Run `plan-6a-update-progress` to:
   - Populate Change Footnotes Ledger (§12) with entries for all 10 modified files
   - Add FlowSpace node IDs (e.g., `function:apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts:cliDriveGraph`)
   - Populate Phase Footnote Stubs in dossier
   - Add [^N] references to dossier Notes column
   - Add [📋] log links to plan Log column
2. Sync dossier task statuses with plan (T005-T009 should be `[x]`, T001-T004 should be `[ ]`)

---

## Recommended Fixes (should resolve)

### FIX-3: Add NaN guard on --max-iterations

**Severity**: MEDIUM (P5-001)
**File**: `apps/cli/src/commands/positional-graph.command.ts`
**Lines**: ~1783

**What**: `Number.parseInt(options.maxIterations, 10)` returns NaN for non-numeric input → silent no-op.

**Patch**:
```typescript
const maxIterations = Number.parseInt(options.maxIterations, 10);
if (Number.isNaN(maxIterations) || maxIterations < 1) {
  console.error(`Invalid --max-iterations value: ${options.maxIterations}`);
  process.exit(1);
}
const exitCode = await cliDriveGraph(handle, {
  maxIterations,
  verbose: options.verbose,
});
```

**Test** (TDD — write RED first):
```typescript
// In cli-drive-handler.test.ts or positional-graph.command.test.ts
it('rejects NaN max-iterations', async () => {
  // Test the validation logic
});
```

### FIX-4: Add DriveEvent mapping tests

**Severity**: MEDIUM (QUAL-001, QUAL-002)
**File**: `test/unit/cli/features/036-cli-orchestration-driver/cli-drive-handler.test.ts`

**What**: The handler's core responsibility (DriveEvent→stdout mapping) has zero test coverage. The "logs status events" test is a no-op.

**Steps**:
1. Add `setDriveEvents(events: DriveEvent[])` to `FakeGraphOrchestration` so `drive()` invokes `onEvent` callbacks
2. Write tests for:
   - `type: 'status'` → `console.log(message)`
   - `type: 'iteration'` + `verbose: true` → `console.log('[iteration] ...')`
   - `type: 'iteration'` + `verbose: false` → no output
   - `type: 'idle'` + `verbose: true` → `console.log('[idle] ...')`
   - `type: 'idle'` + `verbose: false` → no output
   - `type: 'error'` → `console.error('[error] ...')`
3. Remove or replace the current no-op test at line 82-92

### FIX-5: Replace vi.spyOn with injectable output writer

**Severity**: MEDIUM (MOCK-001)
**File**: `apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts`

**What**: `vi.spyOn(console, 'log')` is Vitest spy machinery. The fakes-over-mocks policy prefers dependency injection.

**Steps**:
1. Add output writer interface to cli-drive-handler.ts:
   ```typescript
   export interface CliOutput {
     log(msg: string): void;
     error(msg: string): void;
   }
   ```
2. Add `output?: CliOutput` to `CliDriveOptions`, default to `console`
3. Update handler to use `output.log()`/`output.error()` instead of `console.log()`/`console.error()`
4. In tests, pass `{ log: (m) => logs.push(m), error: (m) => logs.push(`[stderr] ${m}`) }`
5. Remove all `vi.spyOn` calls

---

## Advisory Fixes (nice to have)

### FIX-6: Add exhaustive switch default

**Severity**: LOW (P5-002)
**File**: `apps/cli/src/features/036-cli-orchestration-driver/cli-drive-handler.ts:30-47`

```typescript
default: {
  const _exhaustive: never = event;
  console.log(`  [unknown] ${(_exhaustive as DriveEvent).type}`);
}
```

### FIX-7: Document TDD cycles in execution log

**Severity**: LOW (TDD-001, TDD-002)
**File**: `execution.log.md`

Add RED phase evidence for T006 and REFACTOR notes for all tasks.
