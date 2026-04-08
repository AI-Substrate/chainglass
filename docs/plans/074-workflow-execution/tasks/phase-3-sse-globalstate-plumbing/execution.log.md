# Execution Log: Phase 3 — SSE + GlobalState Plumbing

**Plan**: 074-workflow-execution
**Phase**: Phase 3: SSE + GlobalState Plumbing
**Started**: 2026-03-15

---

## Baseline

```
Test Files  2 failed | 385 passed | 10 skipped (397)
     Tests  4 failed | 5508 passed | 80 skipped (5592)
```

Pre-existing failures: 2 in `040-graph-inspect/inspect-format.test.ts` (unrelated).

---

## Harness Validation

Skipped — Phase 3 is SSE/state wiring. Primary testing is unit-level (mapEvent, broadcast calls). Harness browser automation not required for this phase.

---

## Task Log

### T001: Add WorkflowExecution to WorkspaceDomain ✅
Added `WorkflowExecution: 'workflow-execution'` to `WorkspaceDomain` const. Verified with tsx: `WorkspaceDomain.WorkflowExecution === 'workflow-execution'` → true.

### T002: Add channel to WORKSPACE_SSE_CHANNELS ✅
Added `'workflow-execution'` to the channels array in layout.tsx. Now 7 channels registered.

### T003: Create workflowExecutionRoute ✅
Created `apps/web/src/lib/state/workflow-execution-route.ts` following work-unit-state-route.ts pattern exactly. Maps `execution-update` → 4 properties (status, iterations, lastEventType, lastMessage). Maps `execution-removed` → remove instance. Uses `key` field as instanceId.

### T004: Add route to SERVER_EVENT_ROUTES ✅
Imported workflowExecutionRoute and added to SERVER_EVENT_ROUTES array in state-connector.tsx. Replaced the "Phase 3 will add agentStateRoute here" comment.

### T005: Wire handleEvent + broadcastStatus + broadcastRemoval ✅
- Added `broadcast` function to `ExecutionManagerDeps` interface
- Added `SerializableExecutionStatus` type (DYK #1)
- Added `getSerializableStatus()` method to IWorkflowExecutionManager interface + implementation
- Added `broadcastStatus(handle)` private method — broadcasts `execution-update` with handle state
- Added `broadcastRemoval(key)` private method — broadcasts `execution-removed` (DYK #2)
- Wired broadcasts at all 6 DYK #5 call sites:
  1. start() → 'starting'
  2. start() → 'running'
  3. handleEvent() → iteration/idle/status/error
  4. .then() → 'completed'/'stopped'/'failed'
  5. .catch() → 'failed'
  6. stop() → 'stopping'
- Added broadcastRemoval in restart() before handle deletion
- All 17 existing tests pass (broadcast added as vi.fn() to deps)

### T006: Inject sseManager broadcast dep ✅
Updated create-execution-manager.ts to import `sseManager` and pass `sseManager.broadcast.bind(sseManager)` as the broadcast dep.

### T007-T009: Server Actions ✅
Created `apps/web/app/actions/workflow-execution-actions.ts` with 4 server actions:
- `runWorkflow(slug, worktreePath, graphSlug)` → calls manager.start()
- `stopWorkflow(worktreePath, graphSlug)` → calls manager.stop()
- `restartWorkflow(slug, worktreePath, graphSlug)` → calls manager.restart()
- `getWorkflowExecutionStatus(worktreePath, graphSlug)` → returns SerializableExecutionStatus (DYK #1)
All actions: `'use server'`, `requireAuth()`, try/catch with error propagation.

### T010: Tests ✅
**Route descriptor tests** (7 tests in workflow-execution-route.test.ts):
- channel + stateDomain + multiInstance assertions
- 4 properties declared
- execution-update maps all 4 properties
- execution-update handles missing optional fields
- execution-removed returns remove update
- Unknown types return null
- Missing key returns null

**Manager broadcast tests** (5 tests added to workflow-execution-manager.test.ts):
- Broadcasts starting+running on start()
- Broadcasts stopping on stop()
- Broadcasts execution-removed on restart()
- Broadcasts during handleEvent from drive loop
- getSerializableStatus returns clean snapshot without internal refs

```
Test Files  2 passed (2)
     Tests  29 passed (29)   # 22 manager + 7 route
```

## Final Test Results

```
Test Files  2 failed | 386 passed | 10 skipped (398)
     Tests  4 failed | 5520 passed | 80 skipped (5604)
```

+1 test file, +12 tests vs baseline. Same 2 pre-existing failures (040-graph-inspect). Zero regressions.
