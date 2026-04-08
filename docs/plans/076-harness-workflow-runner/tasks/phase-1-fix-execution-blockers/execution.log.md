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
**Completed**: 2026-03-17

**Test data creation**: SUCCESS — `harness test-data create env` created units, template, workflow.

**Pre-existing bugs found and fixed during dogfooding**:

1. **CLI DI bug** (`_Ie.resolve is not a function`): esbuild bundled `@github/copilot-sdk` which uses `module.createRequire()` internally — minified to `var _Ie = {}`. Fixed by externalizing the package and using dynamic `import()` for CopilotClient. Committed as `b5c7f60d`.

2. **Workspace resolution bug** (`Graph 'test-workflow' not found`): `cg template instantiate` puts graphs in `.chainglass/instances/` but `PositionalGraphService` reads from `.chainglass/data/workflows/`. Changed `createWorkflow()` to use `cg wf create` + line/node operations directly. Committed as `c58cb3a3`.

**Workflow run output** (after fixes):
```
$ cg wf run test-workflow --verbose --timeout 30 --workspace-path ...

Graph: test-workflow (pending)
─────────────────────────────
  Line 0: 
  Line 1: ⬜ test-user-input-9c9
  Line 2: ⚪ test-agent-c7b
  Line 3: ⚪ test-code-e88 → ⚪ test-agent-2d0
─────────────────────────────
  Progress: 0/4 complete
  [idle] No actions — polling
  ... (repeats — waiting for user-input node completion)
```

**Result**: Nodes display correctly. Graph status renders. Drive loop polls with idle events. Timeout works (exits cleanly after 30s). Filesystem lock created and cleaned. This matches expected behavior — the graph is waiting for the user-input node to be completed before ONBAS can dispatch subsequent nodes.

**AC-5 (Pod failures visible)**: ODS now queues errors → drive loop drains → node:error event. Verified in code, will be exercised when a pod actually fails.
**AC-13 (Nodes progress past "starting")**: Graph runs and renders status. Nodes will progress once user-input is completed and agents are available.
