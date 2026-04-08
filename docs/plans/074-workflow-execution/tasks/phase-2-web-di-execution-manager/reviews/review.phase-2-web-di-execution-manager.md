# Code Review: Phase 2: Web DI + Execution Manager

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 2: Web DI + Execution Manager
**Date**: 2026-03-15
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**REQUEST_CHANGES**

Phase 2 is close, but it is not ready to approve: `start()` is not idempotent during the `starting` window, the critical stop/idempotence lifecycle semantics are not deterministically verified, and the execution-manager's domain ownership/artifact updates are still inconsistent.

**Key failure areas**:
- **Implementation**: `start()` only treats `running` as idempotent, so two concurrent `start()` calls can launch two `drive()` loops for the same workflow.
- **Domain compliance**: The execution-manager is declared positional-graph-owned but implemented under `apps/web/...` and depends on `IWorkspaceService`, leaving ownership and dependency direction unresolved.
- **Testing**: AC3 and AC5 are not actually proved by the committed tests because the fake drive completes immediately and the "already running" test never asserts the expected result.

## B) Summary

The phase lands most of the intended DI/bootstrap plumbing, and the anti-reinvention pass found no genuine duplication. Live validation also showed that the app boots and the Phase 2 bootstrap does not crash the running server, although the harness remained degraded because CDP never came up.

The blocking issue is correctness: `WorkflowExecutionManager.start()` can be called twice while the first call is still in `starting`, and both calls proceed to `drive()`. I confirmed that behavior with a throwaway repro script that produced two `{started:true}` results and `driveCallsInitial: 2` for the same workflow key.

The second blocker is evidence quality. The current tests do not deterministically exercise stop/idempotence semantics, so AC3 and AC5 are effectively unverified. Domain artifacts also need follow-through: the current manifest, domain doc, and map do not fully reconcile where the execution-manager belongs or which contracts changed.

## C) Checklist

**Testing Approach: Hybrid**

- [ ] TDD coverage proves stop/idempotent lifecycle semantics
- [x] Wiring/bootstrap paths have lightweight verification
- [ ] Critical lifecycle paths are covered with deterministic tests
- [x] Key verification points are documented in the execution log
- [x] Only in-scope files changed
- [x] Linters/type checks clean (per execution log evidence)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts:35-40,84-151` | correctness | `start()` only treats `running` as idempotent. A second call during `starting` creates a second handle and launches a second `drive()` loop for the same workflow. | Treat `starting` as in-flight/idempotent too, reuse the existing handle state, and add a deterministic concurrency test. |
| F002 | HIGH | `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts:101-113,148-159`; `/Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts:55-67` | testing | AC3 and AC5 are not actually verified. The fake `drive()` returns immediately and ignores abort semantics, and the "already running" test never asserts `{started:false, already:true}`. | Add a pending/signal-aware fake drive mode and assert abort, await, cleanup, markNodesInterrupted, and double-start idempotence explicitly. |
| F003 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.ts:56-58` | scope | `destroyPod()` still deletes the pod without terminating it first, which contradicts the Phase 2 T004 done-when contract and leaves the single-pod cleanup path unsafe. | Make `destroyPod()` terminate before deletion, update the interface/fake accordingly, and add/adjust contract tests. |
| F004 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md:41-46`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts:82-86`; `/Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts:19-32` | domain | The execution-manager is declared positional-graph-owned in planning artifacts but lives under `apps/web/src/features/...` and depends on `IWorkspaceService`, creating unresolved ownership and dependency-direction drift. | Reclassify the manager to a web/business integration owner or move it into the positional-graph source tree, then update manifest/map/docs to match. |
| F005 | MEDIUM | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md:44-110`; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md:24-50` | domain-docs | The Domain Manifest and positional-graph domain doc were only partially updated. Several changed files are unmapped, and Phase 2 contracts/concepts/composition changes are not reflected outside `History`. | Update the Domain Manifest, positional-graph `Contracts` / `Composition` / `Concepts` / `Source Location` sections, and the domain map/health summary as needed. |

## E) Detailed Findings

### E.1) Implementation Quality

**F001 — concurrent start race (HIGH)**

`WorkflowExecutionManager.start()` inserts a handle with `status: 'starting'`, but the only idempotence guard is `existing.status === 'running'`. That means a second `start()` arriving before workspace resolution completes will create a second handle and call `drive()` again for the same workflow key.

I confirmed this with a read-only repro script (`pnpm exec tsx /tmp/phase2-review-start-race.ts`), which returned:

- first call: `{started:true, already:false, key:"/tmp/wt:g"}`
- second call: `{started:true, already:false, key:"/tmp/wt:g"}`
- `driveCallsInitial: 2`

That is a real behavioral violation of AC5, not just a missing assertion.

**F003 — single-pod destroy contract incomplete (MEDIUM)**

Phase 2's T004 task dossier says `destroyPod(nodeId)` should terminate the running pod before removing it. The real implementation still does a bare `this.pods.delete(nodeId)`. Even if Phase 2 mostly uses `destroyAllPods()` for stop/restart, the single-pod path remains live API surface and is now inconsistent with the stated contract.

**Additional implementation note**

The resume path in `workflow-execution-manager.ts` still performs direct graph-state mutation by loading state, deleting interrupted node entries, and persisting the result from the web-side manager. That did not make the top findings table because the concurrency bug is the urgent blocker, but while fixing F001/F002 it would be worth replacing the current no-op `markNodesInterrupted(..., [])` plus manual mutation with a dedicated positional-graph-owned reset API.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | The plan manifest declares the execution-manager files positional-graph-owned, but the domain doc says positional-graph's primary source tree is `packages/positional-graph/src/`. The new manager files live under `apps/web/src/features/074-workflow-execution/`. |
| Contract-only imports | ❌ | `apps/web/src/lib/di-container.ts:77` imports `AgentManagerService` from `@chainglass/shared/features/034-agentic-cli` instead of the public `@chainglass/shared` export surface. |
| Dependency direction | ❌ | Under the current manifest, positional-graph-owned code depends on `IWorkspaceService` via `ExecutionManagerDeps`, which creates an unresolved infrastructure -> business dependency. |
| Domain.md updated | ❌ | `History` was updated, but `Contracts`, `Composition`, `Source Location`, and `Dependencies` still describe pre-Phase-2 ownership/consumers. |
| Registry current | ✅ | No new domain was created in this phase. |
| No orphan files | ❌ | The manifest does not cover several changed files, including `packages/shared/src/di-tokens.ts`, `apps/cli/src/lib/container.ts`, the fake/support files, `workflow-execution-manager.types.ts`, and the new test file. |
| Map nodes current | ✅ | No new registered domain nodes were required for this phase. |
| Map edges current | ❌ | If the manager remains positional-graph-owned, the new `IWorkspaceService` dependency is missing from `docs/domains/domain-map.md` and its health summary. |
| No circular business deps | ✅ | No new business -> business cycle was identified. |
| Concepts documented | ⚠️ | Phase 2 concepts/contracts such as `cleanup()`, `evict()`, `resetGraphState()`, `markNodesInterrupted()`, and execution-manager lifecycle ownership are not documented in `## Concepts` or aligned supporting sections. |

**F004 — ownership/dependency drift (MEDIUM)**

As currently documented, the manager is positional-graph-owned but implemented in the web app and wired to `IWorkspaceService`. Either the code needs to move into the positional-graph source tree, or the domain ownership needs to move to a web/business integration owner. Right now both interpretations are present at once.

**F005 — domain artifacts incomplete (MEDIUM)**

The Domain Manifest and positional-graph domain doc do not fully describe the actual Phase 2 surface. The result is that the review can reconstruct the intended architecture, but a future agent reading only the docs will still get stale ownership, contract, and composition guidance.

### E.3) Anti-Reinvention

No genuine duplication was found. The new code reuses existing global bootstrap and DI-factory patterns rather than inventing a second execution host that already exists elsewhere.

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `WorkflowExecutionManager` | None | — | Proceed |
| `createWorkflowExecutionManager()` | Existing DI/bootstrap pattern only | `_platform/events` (pattern reuse) | Proceed |
| `getWorkflowExecutionManager()` | Existing globalThis singleton accessor pattern only | `_platform/events` (pattern reuse) | Proceed |
| `ExecutionHandle` / manager types | None | — | Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 33%

**Violations**:
- **HIGH**: AC5 is not actually verified. The test at `workflow-execution-manager.test.ts:101-113` waits for the first run to complete and never asserts `{started:false, already:true}`.
- **HIGH**: AC3 is not actually verified. The stop test at `workflow-execution-manager.test.ts:148-159` allows the run to complete before `stop()` and accepts any terminal state.
- **MEDIUM**: AC1 has only indirect evidence (instrumentation wiring + live boot); there is no focused test proving `getWorkflowExecutionManager()` is usable after bootstrap.
- **MEDIUM**: The execution log overstates lifecycle coverage compared with the actual assertions that landed.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 20% | `apps/web/instrumentation.ts:56-71` assigns `globalThis.__workflowExecutionManager`; harness live validation saw app boot cleanly and found no workflow-execution initialization error, but there is no direct test of `getWorkflowExecutionManager()`. |
| AC2 | 70% | `workflow-execution-manager.test.ts:91-99` verifies start returns `started:true`; `201-209` verifies a handle exists; `232-285` verifies drive events update the handle. This is good partial proof, but it still does not assert drive call history or signal wiring. |
| AC3 | 10% | The stop test at `148-159` does not keep the workflow alive long enough to exercise abort/await semantics, and the fake drive returns immediately at `fake-orchestration-service.ts:55-67`. |
| AC4 | 60% | `workflow-execution-manager.test.ts:164-177` proves `resetGraphState()` and `evict()` are called and that restart returns `started:true`, but it does not prove a fresh handle/drive cycle beyond those side effects. |
| AC5 | 5% | Independent repro confirmed the bug; the committed test never asserts the idempotent return shape while a run is active. |

### E.5) Doctrine Compliance

The main doctrine/rules concern is test determinism. `workflow-execution-manager.test.ts` uses real timer sleeps at lines 108, 152, 168, 189, 223, and 280, which conflicts with the project's no-sleeps unit test guidance and contributes directly to the weak lifecycle assertions above.

Lower severity note: the new test file also omits the documented 5-field `Test Doc` blocks. That is not the reason for the REQUEST_CHANGES verdict, but it should be cleaned up while the lifecycle tests are being strengthened.

### E.6) Harness Live Validation

Harness was configured but not fully healthy.

- **Harness status**: `UNHEALTHY`
- **Live validation outcome**: non-blocking, limited but useful
- **Why non-blocking**: Phase 2 is server-side DI/lifecycle plumbing with no safe read-only UI control for start/stop/restart yet.

| AC | Method | Result | Evidence |
|----|--------|--------|----------|
| AC1 | Harness health/doctor, `curl`, route load, MCP error check, log inspection | PASS | App and MCP were up; `curl http://127.0.0.1:3101/api/health` returned `{"status":"ok"}`; `/workspaces` rendered; MCP reported no browser errors; no `[workflow-execution] Failed to initialize` message was observed. |
| AC2 | Read-only live probe | SKIP | No non-mutating surface exists yet to invoke `manager.start()` safely. |
| AC3 | Read-only live probe | SKIP | No running workflow existed to stop, and validating stop would require mutating state. |
| AC4 | Read-only live probe | SKIP | No existing execution was available to restart, and validating restart would require mutating state. |
| AC5 | Read-only live probe | SKIP | Double-start idempotence cannot be exercised live in read-only mode without seeded workflow data or a safe probe surface. |

Raw harness evidence showed the app was up but CDP never became available, so `just harness doctor --wait 120` ended with `E109` / CDP unavailable on `:9223`.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | `getWorkflowExecutionManager()` returns a valid manager after server start | `apps/web/instrumentation.ts:56-71` bootstrap logic; harness live boot showed no initialization failure, but there is no direct focused assertion of the getter contract | 20% |
| AC2 | `manager.start(ctx, slug)` creates an execution handle and begins `drive()` | Start/handle/event tests in `workflow-execution-manager.test.ts`; partial evidence only | 70% |
| AC3 | `manager.stop(worktreePath, slug)` aborts `drive()` and awaits completion | No deterministic proof; fake drive resolves immediately and stop test accepts any terminal status | 10% |
| AC4 | `manager.restart(ctx, slug)` clears graph state and starts fresh | Restart test proves reset + evict side effects, but not a full fresh lifecycle | 60% |
| AC5 | Calling `start()` twice for the same workflow is idempotent | Committed test does not assert the contract, and a direct repro showed two `drive()` invocations | 5% |

**Overall coverage confidence**: 33%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
git --no-pager diff 4ab184c7..a0f5db2e > /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/reviews/_computed.diff
git --no-pager diff --name-status 4ab184c7..a0f5db2e
git --no-pager diff --numstat 4ab184c7..a0f5db2e
git --no-pager show --stat --summary a0f5db2e --
pnpm exec tsx /tmp/phase2-review-start-race.ts
cd harness && pnpm exec tsx src/cli/index.ts dev
cd harness && pnpm exec tsx src/cli/index.ts doctor --wait 120
curl http://127.0.0.1:3101/api/health
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 2: Web DI + Execution Manager
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/reviews/review.phase-2-web-di-execution-manager.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/cli/src/lib/container.ts | Modified | positional-graph cross-domain | Add to/reconcile Domain Manifest if ownership remains unchanged |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/instrumentation.ts | Modified | positional-graph cross-domain | Re-test bootstrap after manager ownership/concurrency fixes |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/create-execution-manager.ts | Added | web feature / positional-graph (conflict) | Reconcile ownership and dependency direction |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/get-manager.ts | Added | web feature / positional-graph (conflict) | Reconcile ownership |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts | Added | web feature / positional-graph (conflict) | Fix concurrent start; consider dedicated resume/reset API |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts | Added | web feature / positional-graph (conflict) | Reconcile ownership + `IWorkspaceService` dependency |
| /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/lib/di-container.ts | Modified | positional-graph cross-domain | Prefer public export surface for Plan 034 import |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Modified | docs | Update contracts/composition/concepts/source/dependencies |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/execution.log.md | Added | plan artifact | Update evidence after fixes |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/tasks.fltplan.md | Added | plan artifact | None |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-2-web-di-execution-manager/tasks.md | Added | plan artifact | None |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | Modified | positional-graph fake | Extend only if needed for deterministic lifecycle assertions |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts | Modified | positional-graph fake | Add pending/signal-aware drive mode |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-pod-manager.ts | Modified | positional-graph fake | Mirror real destroy semantics if `destroyPod()` becomes async/terminating |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts | Modified | positional-graph | None identified in this review |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/orchestration-service.ts | Modified | positional-graph | None identified in this review |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts | Modified | positional-graph contract | Update domain docs/concepts for new methods |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.ts | Modified | positional-graph | Make `destroyPod()` terminate before delete |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts | Modified | positional-graph contract | Consider async `destroyPod()` signature to support termination |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts | Modified | positional-graph contract | Update domain docs and consider dedicated interrupted-node reset API |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/services/positional-graph.service.ts | Modified | positional-graph | Consider moving interrupted-node reset logic fully into the domain |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/shared/src/di-tokens.ts | Modified | shared contract | Add to Domain Manifest or document companion-file ownership rule |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts | Added | test | Replace timer waits with deterministic lifecycle assertions |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts | Make `start()` idempotent for both `starting` and `running` states so a second call cannot launch a second `drive()` loop. | Current behavior violates AC5 and was confirmed with a direct repro (`driveCallsInitial: 2`). |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/web/features/074-workflow-execution/workflow-execution-manager.test.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts | Add deterministic pending/signal-aware fake drive behavior and assert AC3/AC5 explicitly (abort, await, cleanup, markNodesInterrupted, idempotent second start). | The current tests do not prove the critical lifecycle contracts and allowed the start-race bug to land. |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts; /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/fake-pod-manager.ts | Make `destroyPod()` terminate before removal and align the fake/interface/tests with that contract. | Phase 2 marked T004 complete, but the single-pod destroy path still skips termination. |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md; /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Reconcile execution-manager ownership, dependency direction, manifest coverage, and Phase 2 concepts/contracts documentation. | The current artifacts disagree about where the manager belongs and which dependencies/contracts changed. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | Domain Manifest coverage for all changed Phase 2 files and the final owner of execution-manager files |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Updated Contracts, Composition, Source Location, Dependencies, and Concepts for Phase 2 surface |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | Edge/health summary update if execution-manager remains positional-graph-owned |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md | Only update if ownership resolution creates or formally reassigns a registered domain |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md --phase "Phase 2: Web DI + Execution Manager"
