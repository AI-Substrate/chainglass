# Phase 1: Orchestration Contracts — Execution Log

**Plan**: [074 Workflow Execution](../../workflow-execution-plan.md)
**Phase**: Phase 1: Orchestration Contracts
**Started**: 2026-03-15
**Status**: In Progress

---

## Pre-Phase Validation

| Check | Status | Notes |
|-------|--------|-------|
| Harness | Skipped | Phase 1 is pure package-level TDD — harness not needed |
| Baseline tests | ✅ | No test files in positional-graph's own test/ dir — tests live in repo root test/unit/ |
| Source files | ✅ | All 5 target files exist and match expected line numbers |

---

## Task Log

_Entries added as each task completes._

### Stage 1: Type Contracts (T001, T002, T005)

**Tasks**: T001 (DriveExitReason + 'stopped'), T002 (DriveOptions + signal), T005 (ExecutionStatus + 'interrupted')

**Files modified**:
- `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts` — Added `'stopped'` to DriveExitReason union (L129), added `signal?: AbortSignal` to DriveOptions (L168)
- `packages/positional-graph/src/features/030-orchestration/reality.types.ts` — Added `'interrupted'` to ExecutionStatus union (L23)
- `packages/positional-graph/src/features/030-orchestration/reality.schema.ts` — Added `'interrupted'` to ExecutionStatusSchema Zod enum
- `packages/positional-graph/src/schemas/state.schema.ts` — Added `'interrupted'` to NodeExecutionStatusSchema Zod enum
- `packages/positional-graph/src/features/030-orchestration/reality.format.ts` — Added `'interrupted'` → `'⏹️'` glyph case

**Evidence**: `tsc --noEmit` passes clean (exit code 0)

**Discovery**: `reality.schema.ts` DOES exist with a Zod ExecutionStatusSchema — the explore agent reported it didn't exist. Also found `state.schema.ts` has a separate `NodeExecutionStatusSchema`. Both needed updating.

### Stage 2: Abortable Sleep (T003)

**Files created**:
- `packages/positional-graph/src/features/030-orchestration/abortable-sleep.ts` — NEW file, uses `node:timers/promises` setTimeout with native AbortSignal

**Test file**: `test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts` — 5 tests
- resolves after delay without signal ✅
- rejects immediately when signal fires during sleep ✅
- rejects immediately with already-aborted signal ✅
- resolves normally with signal provided but not aborted ✅
- throws AbortError (name check) ✅

### Stage 3: drive() Abort (T004)

**Files modified**:
- `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` — Removed inline `sleep()`, imported `abortableSleep()`, added pre-loop abort check, iteration boundary check, try/catch around sleep for AbortError

**Tests added** to `drive.test.ts`: 5 new tests (25 total)
- returns stopped when signal aborts during idle sleep ✅
- returns stopped immediately with already-aborted signal ✅
- emits status event with stopped message on abort ✅
- without signal behaves normally (backwards compatible) ✅
- aborts during action delay sleep ✅
- persists sessions before returning stopped ✅

### Stage 4: ONBAS Interrupted (T006)

**Files modified**:
- `packages/positional-graph/src/features/030-orchestration/onbas.ts` — Added explicit `case 'interrupted': return null` in visitNode, `case 'interrupted': hasRunning = true` in diagnoseStuckLine

**Tests added** to `onbas.test.ts`: 4 new tests (45 total)
- interrupted node is skipped in visitNode ✅
- sole interrupted node → all-waiting ✅
- interrupted + running → all-waiting ✅
- interrupted + blocked-error → all-waiting (NOT graph-failed) ✅

**Discovery**: Without explicit `'interrupted'` handling in diagnoseStuckLine, an interrupted+blocked-error combo incorrectly returns `graph-failed`. The explicit `hasRunning=true` correctly takes priority.

### Stage 5: Cache + Isolation (T007 + T008)

**Files modified**:
- `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts` — Complete rewrite: compound key `${worktreePath}|${graphSlug}`, new `PerHandleDeps` interface, `createPerHandleDeps` factory in deps
- `packages/positional-graph/src/container.ts` — Factory closure wraps PodManager+ODS creation per-handle
- `packages/positional-graph/src/features/030-orchestration/index.ts` — Export PerHandleDeps
- `packages/positional-graph/src/index.ts` — Export PerHandleDeps
- `test/integration/orchestration-wiring-real.test.ts` — Updated to new deps shape
- `test/integration/real-agent-orchestration.test.ts` — Updated to new deps shape
- `test/e2e/positional-graph-orchestration-e2e.ts` — Updated to new deps shape

**Tests**: 8 tests in orchestration-service.test.ts (3 existing + 2 compound key + 3 isolation)
- same slug returns same handle ✅
- different slug returns different handles ✅
- handle has correct graphSlug ✅
- different worktreePath + same slug → different handles ✅
- same worktreePath + same slug → same handle ✅
- each handle gets its own PodManager and ODS ✅
- factory not called for cached handle ✅
- destroyPod on handle A does not affect handle B ✅

**Decision**: Used factory pattern (`createPerHandleDeps: () => PerHandleDeps`) instead of raw deps. Keeps OrchestrationService loosely coupled — only interface imports, no concrete class imports.

---

## Phase 1 Summary

**Total**: 8/8 tasks complete ✅
**Tests**: 320 pass across 19 orchestration test files + 2 integration tests
**New test files**: 1 (abortable-sleep.test.ts)
**New source files**: 1 (abortable-sleep.ts)
**Modified source files**: 8
**Modified test files**: 4 (drive.test.ts, onbas.test.ts, orchestration-service.test.ts + 3 integration)

