# Phase 2: Test Graph Infrastructure — Execution Log

**Plan**: 037-codepod-and-goat-integration
**Phase**: Phase 2: Test Graph Infrastructure
**Started**: 2026-02-18T07:20Z
**Testing Approach**: Full TDD (fakes over mocks)

---

## Task T002: dev/test-graphs/ directory + README
**Dossier Task**: T002 | **Plan Task**: 2.2
**Started**: 2026-02-18T07:26Z
**Status**: ✅ Complete

### What I Did
Created `dev/test-graphs/shared/` directory and `dev/test-graphs/README.md` with fixture catalogue documenting directory conventions, usage patterns, and simulation script env vars.

### Files Changed
- `dev/test-graphs/README.md` — NEW: fixture catalogue
- `dev/test-graphs/shared/` — NEW: directory for helpers

**Completed**: 2026-02-18T07:26Z
---

## Task T006: makeScriptsExecutable + T008: completeUserInputNode
**Dossier Task**: T006, T008 | **Plan Task**: 2.6, 2.5
**Started**: 2026-02-18T07:27Z
**Status**: ✅ Complete

### What I Did
Created `dev/test-graphs/shared/helpers.ts` with both helpers:
- `makeScriptsExecutable(dir)` — recursively globs `*.sh`, chmod 0o755
- `completeUserInputNode(service, ctx, slug, nodeId, outputs)` — raises `node:accepted` (source: 'human'), saves outputs, raises `node:completed`

### Files Changed
- `dev/test-graphs/shared/helpers.ts` — NEW: both helpers

**Completed**: 2026-02-18T07:28Z
---

## Task T007: Assertion library
**Dossier Task**: T007 | **Plan Task**: 2.7
**Started**: 2026-02-18T07:28Z
**Status**: ✅ Complete

### What I Did
Created `dev/test-graphs/shared/assertions.ts` with 3 assertions:
- `assertGraphComplete(service, ctx, slug)` — uses `getStatus()`, checks `status === 'complete'`
- `assertNodeComplete(service, ctx, slug, nodeId)` — uses `getNodeStatus()`, checks `status === 'complete'`
- `assertOutputExists(service, ctx, slug, nodeId, outputName)` — uses `canEnd()`, checks `savedOutputs.includes(outputName)`

### Files Changed
- `dev/test-graphs/shared/assertions.ts` — NEW: 3 assertion functions

**Completed**: 2026-02-18T07:29Z
---

## Task T003: RED smoke test
**Dossier Task**: T003 | **Plan Task**: 2.3
**Started**: 2026-02-18T07:29Z
**Status**: ✅ Complete

### What I Did
Created smoke fixture (`dev/test-graphs/smoke/units/ping/unit.yaml` + `scripts/ping.sh`) and smoke test (`test/integration/test-graph-infrastructure.test.ts`). Test imports `withTestGraph` which doesn't exist yet → import error confirms RED.

### RED Evidence
```
Error: Failed to load url ../../dev/test-graphs/shared/graph-test-runner.js
Does the file exist?
Test Files  1 failed (1)
```

### Files Changed
- `dev/test-graphs/smoke/units/ping/unit.yaml` — NEW: minimal code-type fixture
- `dev/test-graphs/smoke/units/ping/scripts/ping.sh` — NEW: trivial echo script
- `test/integration/test-graph-infrastructure.test.ts` — NEW: 2 tests (lifecycle + chmod)

**Completed**: 2026-02-18T07:30Z
---

## Task T004: withTestGraph() implementation
**Dossier Task**: T004 | **Plan Task**: 2.4
**Started**: 2026-02-18T07:30Z
**Status**: ✅ Complete

### What I Did
Created `dev/test-graphs/shared/graph-test-runner.ts` with:
- `withTestGraph(fixtureName, testFn)` — full lifecycle: mkdtemp → mkdir .chainglass/ dirs → cp units → makeScriptsExecutable → buildDiskLoader → createTestServiceStack → testFn → rm -rf
- `buildDiskLoader(workspacePath)` — reads unit.yaml from disk, maps to NarrowWorkUnit (DYK#2 adapter pattern)
- `TestGraphContext` interface with `{ ctx, service, workspacePath }`

Key decisions:
- Composes `createTestServiceStack()` from e2e-helpers (does NOT reinvent service wiring)
- Builds custom `IWorkUnitLoader` adapter that reads unit.yaml via YamlParserAdapter (DYK#2: IWorkUnitLoader is narrow, WorkUnitService is broad)
- Creates its own WorkspaceContext pointing at temp dir (createTestServiceStack makes its own tmpDir but we need ours because that's where units are)

**Completed**: 2026-02-18T07:31Z
---

## Task T005: Smoke test GREEN
**Dossier Task**: T005 | **Plan Task**: 2.8
**Started**: 2026-02-18T07:31Z
**Status**: ✅ Complete

### GREEN Evidence
```
✓ test/integration/test-graph-infrastructure.test.ts (2 tests) 21ms
Test Files  1 passed (1)
Tests  2 passed (2)
```

**Completed**: 2026-02-18T07:31Z
---

## Task T009: just fft
**Dossier Task**: T009 | **Plan Task**: 2.9
**Started**: 2026-02-18T07:32Z
**Status**: ✅ Complete

### What I Did
Ran `just fft`. Fixed 2 lint issues:
1. Import formatting in `fake-agent-instance.test.ts` (biome auto-fixed)
2. `noNonNullAssertion` in smoke test — changed `capturedWorkspacePath!` → `capturedWorkspacePath as string`

### Evidence
```
Test Files  274 passed | 6 skipped (280)
     Tests  3951 passed | 62 skipped (4013)
```

3951 tests (was 3945 → +6 new tests).

**Completed**: 2026-02-18T07:34Z
---



### What I Did
Added optional `onRun` callback to `FakeAgentInstanceOptions` and `FakeAgentInstance`. The callback is invoked during `run()` after event emission but before returning the result. Added `setOnRun()` test helper for runtime replacement.

### RED Phase
- Created `test/unit/shared/features/034-agentic-cli/fakes/fake-agent-instance.test.ts` with 4 tests
- 3 failed (onRun not called, onRun not awaited, setOnRun not a function), 1 passed (backward compat)

### GREEN Phase
- Added `onRun` to `FakeAgentInstanceOptions` interface
- Added `_onRun` private field, constructor assignment
- Added `await this._onRun(options)` call in `run()` after events, before returning
- Added `setOnRun()` test helper method
- All 4 tests pass. Contract tests (24) and pod-manager tests (32) still pass.

### Files Changed
- `packages/shared/src/features/034-agentic-cli/fakes/fake-agent-instance.ts` — Added onRun callback + setOnRun helper
- `test/unit/shared/features/034-agentic-cli/fakes/fake-agent-instance.test.ts` — NEW: 4 tests

**Completed**: 2026-02-18T07:25Z
---

