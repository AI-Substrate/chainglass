# Phase 1: Fix Execution Blockers — Execution Log

**Plan**: 076-harness-workflow-runner
**Phase**: Phase 1: Fix Execution Blockers
**Started**: 2026-03-17
**Baseline**: 5573 tests pass, 80 skipped (391 files)

## Pre-Phase Harness Check

| Check | Status | Duration | Notes |
|-------|--------|----------|-------|
| Boot | ⚠️ DEGRADED | <1s | Docker container running but CDP down. Phase 1 works locally — acceptable. |
| Interact | ✅ | N/A | CLI subprocess (`cg`) works locally |
| Observe | ✅ | N/A | CLI stdout/stderr available |

## Task Log

### T001: Add `pendingErrors` queue to ODS

**Started**: 2026-03-17
**Completed**: 2026-03-17

Changes:
- `ods.types.ts`: Added `drainErrors()` to IODS interface
- `ods.ts`: Added `pendingErrors` Map, `drainErrors()` method, `.catch()` now queues error
- `fake-ods.ts`: Added `pendingErrors`, `drainErrors()`, `simulatePodError()` test helper

### T002: Drive loop drains ODS error queue

**Completed**: 2026-03-17

Changes:
- `graph-orchestration.ts`: Added import of `generateEventId`, drain loop after loadGraphState and before processGraph. Injects `node:error` events directly into in-memory state — no concurrent file access (P1-DYK #1).

### T003-T007: SSE fix, timeout, lock, harness tooling

**Completed**: 2026-03-17

Changes:
- `server-event-route.tsx`: Error serialization uses `error.message + stack + name` instead of raw `error`
- `cli-drive-handler.ts`: Added `timeout` to CliDriveOptions, AbortController with `.unref()`, `handle.cleanup()` after drive
- `positional-graph.command.ts`: Added `--timeout` option (default 600s), filesystem lock with PID validation and SIGTERM cleanup
- `cg-runner.ts`: `checkBuildFreshness()` now throws (fail-fast), checks `apps/cli/src/` and `packages/positional-graph/dist/`. Added `timeout` to `CgExecOptions`, passed to `execFile()` in both `runLocal()` and `runInContainer()`.

### T008: Dogfooding checkpoint

**Started**: 2026-03-17

**Test data creation**: SUCCESS — `harness test-data create env` created units, template, workflow.

**Workflow run**: BLOCKED — pre-existing `_Ie.resolve is not a function` error in CLI DI container. Verified this exists on committed code (stashed our changes, rebuilt, same error). Not caused by Plan 076 changes.

**Discovery**: `cg wf run` has never worked from the CLI in this worktree. The DI container resolution for OrchestrationService fails with a minified error from the esbuild bundle. The `_Ie` symbol is likely `container` from tsyringe, and `.resolve()` fails because the container isn't properly initialized in the CLI entry point path.

All 5573 unit tests pass — the DI issue only manifests in the compiled CLI bundle, not during test execution (tests use their own container setup).
