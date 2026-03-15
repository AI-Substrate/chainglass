# Phase 2: Web DI + Execution Manager — Execution Log

**Plan**: [074 Workflow Execution](../../workflow-execution-plan.md)
**Phase**: Phase 2: Web DI + Execution Manager
**Started**: 2026-03-15
**Status**: In Progress

---

## Pre-Phase Validation

| Check | Status | Notes |
|-------|--------|-------|
| Harness | Skipped | Phase 2 is DI + class-level TDD — harness not needed |
| Baseline tests | ✅ | 384 passed, 2 failed (pre-existing: 040-graph-inspect), 10 skipped |
| Source files | ✅ | All target files exist and match expected structure |
| Typecheck | ✅ | Included in baseline |

**Critical discovery**: `IWorkUnitPod` already has `terminate(): Promise<void>` — both AgentPod and CodePod implement it. T004 is simpler than planned: just add `destroyAllPods()` to IPodManager that calls `terminate()` on each active pod.

---

## Task Log

### Stage 1: DI Prerequisites (T001, T002)

**T001 — De-alias ORCHESTRATION_DI_TOKENS.AGENT_MANAGER**:
- Changed `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` from alias `SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE` to unique `'IOrchestrationAgentManagerService'` in `packages/shared/src/di-tokens.ts`
- Registered Plan 034 `AgentManagerService` (as `OrchestrationAgentManagerService`) in web DI under new token
- Added bridge registration in CLI container: `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER → CLI_DI_TOKENS.AGENT_MANAGER`
- DYK #4: Web adapter factory uses same ClaudeCodeAdapter/SdkCopilotAdapter — web-compatible confirmed

**T002 — Register ScriptRunner + EventHandlerService in web DI**:
- Followed exact CLI pattern from `apps/cli/src/lib/container.ts` L271-299
- ScriptRunner: `new ScriptRunner()` (no deps)
- EHS: `NodeEventRegistry` + `registerCoreEventTypes()` + `createEventHandlerRegistry()` + `NodeEventService` with throw stubs

**T003 — Call registerOrchestrationServices()**:
- Single line: `registerOrchestrationServices(childContainer)` in `apps/web/src/lib/di-container.ts`

**GREEN verification**:
```
$ npx vitest run test/unit/web/di-container.test.ts test/unit/positional-graph/features/030-orchestration/container-orchestration.test.ts
 ✓ 12 tests passed (2 files)
```

### Stage 2: (Merged into Stage 1 — same test run)

### Stage 3: Lifecycle Contracts (T004, T005, T005b)

**T004 — destroyAllPods()**:
- Discovery: `IWorkUnitPod` ALREADY has `terminate(): Promise<void>` — both AgentPod and CodePod implement it!
- Added `destroyAllPods(): Promise<void>` to `IPodManager` interface and `PodManager` implementation
- Implementation: iterates all active pods, calls `terminate()` on each (swallows errors for finished pods), then clears Map
- Updated `FakePodManager` with `destroyAllPods()` + call tracking

**T005 — cleanup() + evict()**:
- Added `cleanup(): Promise<void>` to `IGraphOrchestration` — calls `podManager.destroyAllPods()` then persists sessions
- Added `evict(worktreePath, graphSlug): void` to `IOrchestrationService` — deletes cached handle from Map
- Implemented in `GraphOrchestration` and `OrchestrationService`
- Updated `FakeGraphOrchestration` (cleanupCalls tracker) and `FakeOrchestrationService` (evictCalls tracker)

**T005b — resetGraphState() + markNodesInterrupted()**:
- Added to `IPositionalGraphService` interface
- `markNodesInterrupted()`: loads state, sets 'starting'/'agent-accepted' nodes to 'interrupted', persists
- `resetGraphState()`: loads state, clears all nodes/transitions/questions, sets graph_status to 'pending', persists
- Updated `FakePositionalGraphService` with both methods

**GREEN verification**:
```
$ npx vitest run test/unit/positional-graph/features/030-orchestration/
 ✓ 320 tests passed (19 files)
```

### Stage 4: Execution Manager TDD (T006)

**RED** (test file created, implementation exists but getCalls API wrong):
```
$ npx vitest run test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts
 Tests  1 failed | 13 passed (14)
 — TypeError: graphService.getCalls is not a function
```

**GREEN** (fixed to use `calls.get()` API):
```
$ npx vitest run test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts
 ✓ 14 tests passed (1 file)
```

**Tests cover**:
1. start() → started:true, key correct
2. start() on running → already:true (idempotent)
3. start() → resolves workspace context from service
4. start() → failed when workspace context null
5. stop() → stopped:false when nothing running
6. stop() → sets terminal status
7. restart() → resets state, evicts cache, starts fresh
8. getStatus() → idle for unknown, correct status for known
9. getHandle() → undefined for unknown, handle with correct fields after start
10. listRunning() → empty initially
11. cleanup() → stops all running
12. handleEvent() → updates handle state from DriveEvents

### Stage 5: Bootstrap Plumbing (T007, T008, T009)

**T007 — get-manager.ts**: globalThis getter with descriptive error if not initialized
**T008 — create-execution-manager.ts**: Factory resolves OrchestrationService, PositionalGraphService, WorkspaceService from DI
**T009 — instrumentation.ts**: Added Plan 074 bootstrap block following exact Plan 027 pattern (flag-before-async, dynamic import, try/catch with flag reset, SIGTERM handler)

**GREEN verification**:
```
$ npx vitest run test/unit/positional-graph/features/030-orchestration/ test/unit/web/features/074-workflow-execution/ test/unit/web/di-container.test.ts
 ✓ 343 tests passed (21 files)
```

---

## Discoveries

| Date | Task | Type | Discovery | Resolution |
|------|------|------|-----------|------------|
| 2026-03-15 | T004 | insight | `IWorkUnitPod` already has `terminate()` — AgentPod calls `agentInstance.terminate()`, CodePod calls `scriptRunner.kill()`. No need to add `abort()`. | Simplified T004 to just adding `destroyAllPods()` that calls existing `terminate()` on each pod. |
| 2026-03-15 | T001 | decision | `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` was aliased to `SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE`. De-aliased to `'IOrchestrationAgentManagerService'`. CLI needs bridge registration. | Added bridge in CLI: `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER → CLI_DI_TOKENS.AGENT_MANAGER`. |
| 2026-03-15 | T006 | insight | `FakePositionalGraphService` uses `calls.get('methodName')` for tracking, not `getCalls()`. | Fixed test assertion to use correct API. |


