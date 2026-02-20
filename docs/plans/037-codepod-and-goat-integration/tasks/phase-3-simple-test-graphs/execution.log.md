# Phase 3: Simple Test Graphs — Execution Log

**Plan**: 037-codepod-and-goat-integration
**Phase**: Phase 3: Simple Test Graphs
**Started**: 2026-02-20

## Task T001: Workspace Registration in withTestGraph
**Started**: 2026-02-20T13:30
**Status**: ✅ Complete

### What I Did
- Added workspace registration to `withTestGraph()` using `createWorkflowProductionContainer` + `WorkspaceService.add/remove`
- Timestamped workspace slug (`tg-${fixtureName}-${Date.now()}`) prevents registry collisions
- Added `buildDiskWorkUnitService()` export — shared IWorkUnitService for graph + ODS (Workshop 09)
- Added `createTestOrchestrationStack()` export — full orchestration wiring with real ScriptRunner
- Added CLI resolution test proving `--workspace-path` works from registered temp workspace

### Evidence
```
✓ test/integration/test-graph-infrastructure.test.ts (3 tests) 122ms
  ✓ withTestGraph creates workspace, copies units, validates addNode, cleans up
  ✓ makeScriptsExecutable sets +x on .sh files
  ✓ withTestGraph registers workspace so CLI --workspace-path resolves
```

### Files Changed
- `dev/test-graphs/shared/graph-test-runner.ts` — workspace registration, buildDiskWorkUnitService, createTestOrchestrationStack
- `test/integration/test-graph-infrastructure.test.ts` — new CLI resolution test

**Completed**: 2026-02-20T13:33
---

## Task T002: Create simple-serial fixture
**Started**: 2026-02-20T13:34
**Status**: ✅ Complete

### What I Did
Created `dev/test-graphs/simple-serial/units/` with setup (user-input) and worker (code) + simulate.sh script.

### Files Changed
- `dev/test-graphs/simple-serial/units/setup/unit.yaml`
- `dev/test-graphs/simple-serial/units/worker/unit.yaml`
- `dev/test-graphs/simple-serial/units/worker/scripts/simulate.sh`

**Completed**: 2026-02-20T13:35
---

## Task T003+T004: Simple-serial integration test (RED→GREEN)
**Started**: 2026-02-20T13:35
**Status**: ✅ Complete

### What I Did
Wrote `test/integration/orchestration-drive.test.ts` with full orchestration stack wiring. Hit 3 issues:
1. `completeUserInputNode` was using wrong events (node:started doesn't exist, source 'human' not allowed)
2. PodManager writes to `.chainglass/graphs/` not `.chainglass/data/workflows/` — added `ensureGraphsDir` helper
3. Fixed to use `service.startNode()` + `raiseNodeEvent(accepted, agent)` + `service.endNode()`

### Discoveries
- `node:started` is NOT a valid event type — use `service.startNode()` instead
- `node:accepted` only allows sources `agent` or `executor`, not `human`
- PodManager pod-sessions.json path `.chainglass/graphs/<slug>/` is separate from graph data at `.chainglass/data/workflows/<slug>/`

### Evidence
```
✓ simple-serial: exitReason=complete, iterations=3, actions=1, ~1.6s
```

**Completed**: 2026-02-20T13:50
---

## Task T005+T006: Parallel-fan-out fixture + test (RED→GREEN)
**Started**: 2026-02-20T13:51
**Status**: ✅ Complete

### What I Did
Created 5-node parallel fixture. Hit E182 schema validation error on combiner because input names used hyphens (`result-1`) instead of underscores (`result_1`). Fixed to use underscores per schema `^[a-z][a-z0-9_]*$`.

### Discoveries
- Input/output names in unit.yaml must match `^[a-z][a-z0-9_]*$` (underscores only, no hyphens)
- Parallel scripts race on state.json but idleDelayMs=1500ms is sufficient for CLI calls to complete
- ONBAS starts all parallel nodes in one run() call (3 actions)

### Evidence
```
✓ parallel-fan-out: exitReason=complete, iterations=5, actions=4, ~3.3s
```

**Completed**: 2026-02-20T14:06
---

## Task T007+T008: Error-recovery fixture + test (RED→GREEN)
**Started**: 2026-02-20T14:06
**Status**: ✅ Complete

### What I Did
Created 2-node error fixture with script that calls `cg wf node error`. Test asserts exitReason=failed and node status=blocked-error.

### Evidence
```
✓ error-recovery: exitReason=failed, iterations=3, actions=1, ~1.6s
```

**Completed**: 2026-02-20T14:07
---

## Task T009: Quality Gate
**Started**: 2026-02-20T14:07
**Status**: ✅ Complete

### What I Did
Fixed biome lint issues (non-null assertions → type assertions, import ordering, formatting).

### Evidence
```
just fft: 3955 tests passed, 0 failures, lint clean, format clean
```

**Completed**: 2026-02-20T14:11
---

