# Code Review: Phase 1: Orchestration Contracts

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 1: Orchestration Contracts
**Date**: 2026-03-15
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid (Phase 1 expected Full TDD evidence)

## A) Verdict

**REQUEST_CHANGES**

Phase 1 runtime changes look broadly sound, but the phase cannot be approved yet because the TDD evidence is incomplete and the updated manual real-stack coverage does not actually validate the new per-handle orchestration path.

**Key failure areas**:
- **Implementation**: Manual real-agent coverage still inspects a stale outer `PodManager`, and one updated wiring test still calls the obsolete `orchestrationService.run(ctx, graphSlug)` API.
- **Domain compliance**: `## Domain Manifest` omits several Phase 1 production files, and the positional-graph domain doc still lacks the required `## Concepts` section.
- **Testing**: `execution.log.md` does not show RED→GREEN evidence or raw command output for a phase explicitly run as TDD, and AC5 overclaims unchanged-suite verification.
- **Doctrine**: New abort timing tests rely on wall-clock timers and do not fully assert the plan’s `<100ms` drive-level abort bar.

## B) Summary

The reviewed production code in `packages/positional-graph` is narrowly scoped to the intended Phase 1 orchestration-contract changes, and no direct runtime correctness, security, or performance defect was found in the core orchestration implementation. Independent spot-checks plus a targeted Vitest run (`85 passed, 11 skipped`) increased confidence in AC1–AC4, especially around abort handling, interrupted-node behavior, and compound-key isolation. The blocking issues are around evidence and supporting verification: the execution log does not preserve TDD RED/GREEN proof, and the modified manual integration coverage no longer exercises the actual per-handle `PodManager` path introduced by this phase. Domain documentation also needs a small follow-up so the plan manifest and positional-graph domain reference remain current.

## C) Checklist

**Testing Approach: Hybrid (Phase 1 executed as Full TDD)**

- [ ] RED evidence documented for TDD-sensitive tasks
- [ ] GREEN evidence documented with raw command output
- [x] Critical orchestration paths covered by targeted tests
- [ ] Existing orchestration coverage credibly re-verified for AC5

Universal (all approaches):
- [x] Runtime code changes stay within intended positional-graph scope
- [ ] Linters/type checks clean with review-grade evidence
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md:24-109 | testing | Execution log is summary-only for a TDD phase and does not substantiate AC5. | Add per-task RED/GREEN command output and explicit AC verification, or narrow the claim. |
| F002 | HIGH | /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/real-agent-orchestration.test.ts:98-113,201,263-264,285,339-340,364,417-418; /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/orchestration-wiring-real.test.ts:132-148,178-430 | testing | Manual real-stack coverage no longer exercises the handle-local orchestration path. | Capture factory-created per-handle deps and replace obsolete service.run calls with handle.run()/drive(). |
| F003 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md:24-55 | domain compliance | Phase 1 Domain Manifest omits several changed production files. | Add every touched runtime/support file to the file→domain manifest. |
| F004 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md:44-157 | domain compliance | Positional Graph domain doc still lacks the required Concepts table. | Add a Concepts section covering drive stop semantics, interrupted status, and compound handle keys. |
| F005 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/drive.test.ts:402-503 | testing | Drive-level abort tests do not prove the phase’s <100ms bar. | Tighten idle/action delay assertions to <100ms with stable timing control. |
| F006 | MEDIUM | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts:15-64; /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/drive.test.ts:402-503 | doctrine | New abort-path unit tests rely on real timers and wall-clock timing. | Use fake timers or an injectable sleep seam for deterministic unit coverage. |

## E) Detailed Findings

### E.1) Implementation Quality

No direct production runtime correctness, security, or performance defect was found in the reviewed orchestration code paths (`abortable-sleep.ts`, `graph-orchestration.ts`, `onbas.ts`, `orchestration-service.ts`, and related schema updates).

**F002** is still material: the updated manual real-stack coverage is no longer wired to the handle-local path introduced by T008. In particular, `/Users/jordanknight/substrate/074-actaul-real-agents/test/integration/real-agent-orchestration.test.ts` now returns an outer `podManager` that is not the one created inside `createPerHandleDeps()`, and `/Users/jordanknight/substrate/074-actaul-real-agents/test/integration/orchestration-wiring-real.test.ts` still calls `orchestrationService.run(ctx, graphSlug)` instead of resolving a handle first.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New runtime file `abortable-sleep.ts` is under `packages/positional-graph/src/features/030-orchestration/`, matching the declared domain. |
| Contract-only imports | ✅ | No cross-domain internal-import violation was found in the reviewed runtime changes. |
| Dependency direction | ✅ | Phase 1 remains within `_platform/positional-graph`; no infrastructure→business or business→business dependency violation was introduced. |
| Domain.md updated | ✅ | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md` was updated with `074-P1` history and composition details. |
| Registry current | ✅ | No new domain was introduced, so `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md` remains current. |
| No orphan files | ❌ | **F003** — the plan’s `## Domain Manifest` omits several production files touched by the phase diff, including `container.ts`, `abortable-sleep.ts`, `index.ts`, `reality.format.ts`, `reality.schema.ts`, `packages/positional-graph/src/index.ts`, and `state.schema.ts`. |
| Map nodes current | ✅ | No new domain node or topological change was introduced by Phase 1. |
| Map edges current | ✅ | No new cross-domain edge or unlabeled dependency was introduced by Phase 1. |
| No circular business deps | ✅ | No business-domain dependency changes occurred in this phase. |
| Concepts documented | ⚠️ | **F004** — the positional-graph domain doc still lacks the required `## Concepts` table for a contract-bearing domain. |

**F003**: update `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md` so the Phase 1 `## Domain Manifest` reflects every production file changed by commit `4a08b804`.

**F004**: add a `## Concepts` table to `/Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md` and include the new Phase 074 concepts (`drive()` stop semantics, `ExecutionStatus='interrupted'`, and compound orchestration handle keys).

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| abortable sleep utility | None | None | Proceed |
| Per-handle dependency factory / `PerHandleDeps` isolation | None | None | Proceed |
| compound cache key for `worktreePath|graphSlug` isolation | Existing composite-key pattern in fakes (`${ctx.worktreePath}|${slug}`) | `_platform/workflow` fakes; `_platform/workgraph` fakes | Extend existing pattern |
| interrupted execution status handling | None | None | Proceed |

No genuine cross-domain reinvention was found. The only reuse signal was the existing composite-key pattern already present in fake adapters/services, which this phase followed correctly.

### E.4) Testing & Evidence

**Coverage confidence**: 52%

Reviewer spot-check: `pnpm vitest run test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts test/unit/positional-graph/features/030-orchestration/drive.test.ts test/unit/positional-graph/features/030-orchestration/onbas.test.ts test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts test/integration/orchestration-wiring-real.test.ts test/integration/real-agent-orchestration.test.ts test/e2e/positional-graph-orchestration-e2e.ts` completed with `85 passed, 11 skipped`; the run also emitted an unrelated `tsconfig-paths` warning while scanning a built standalone artifact under `apps/cli/dist/web/standalone/apps/web/tsconfig.json`.

**F001** remains blocking: `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md` records summaries but not the RED→GREEN command/output trail expected for a phase explicitly executed as TDD.

**F002** also blocks approval: the modified manual real-stack coverage no longer validates the actual per-handle orchestration path introduced by T008.

**F005**: the drive-level abort tests demonstrate “not 10 seconds” behavior, but they do not yet prove the plan’s `<100ms` bar at the `drive()` layer.

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 83 | `test/unit/positional-graph/features/030-orchestration/drive.test.ts:402-438` covers abort-during-idle and already-aborted signal behavior; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md:56-63` lists the same cases. |
| AC2 | 46 | `test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts:22-41` proves the utility aborts in `<100ms`, but `drive.test.ts:402-503` only asserts `<500ms` at the `drive()` layer and has no action-delay `<100ms` assertion. |
| AC3 | 87 | `test/unit/positional-graph/features/030-orchestration/onbas.test.ts` includes interrupted-node skip and stuck-line behavior; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md:69-75` documents the cases. |
| AC4 | 90 | `test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts:117-231` covers compound-key caching and per-handle isolation. |
| AC5 | 24 | `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md:104-109` asserts a passing summary, but the phase edits existing tests and does not attach raw verification output showing which pre-existing suites still pass unchanged. |

### E.5) Doctrine Compliance

**F006**: the new abort-path unit tests rely on real timers and wall-clock duration checks, which conflicts with `R-TEST-005` in `/Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/rules.md`.

Additional low-severity advisories not escalated into blocking findings:
- `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts` uses one file-level Test Doc block instead of a 5-field Test Doc inside each `it(...)` case.
- `/Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts` seeds `FakePodManager.createPod()` with `{} as unknown as IScriptRunner`; using `FakeScriptRunner` would better match the project’s fakes-only doctrine.

### E.6) Harness Live Validation

Harness status: **UNHEALTHY**

Checks performed: AC-1 through AC-5 were all **SKIP**.

Evidence:
- `just harness doctor --wait 60` failed while trying to bring the harness to a healthy state.
- `just harness build && just harness dev && just harness health` rebuilt and restarted the harness, but health remained degraded (`terminal` up, app/MCP/CDP not fully healthy).
- The Phase 1 acceptance criteria are package-level orchestration contracts and do not have a reliable live app surface in the current harness even when the app boots.

Live validation was therefore **non-blocking but unavailable** for this review.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC1 | `drive({signal})` returns `{exitReason:'stopped'}` when signal aborts | `drive.test.ts:402-438`; reviewer-targeted Vitest run (`25` drive tests passed) | 83 |
| AC2 | Abort during sleep returns within `<100ms` | `abortable-sleep.test.ts:22-41`; `drive.test.ts:402-503` only partially proves drive-layer timing | 46 |
| AC3 | ONBAS skips `'interrupted'` nodes | `onbas.test.ts` interrupted-node cases; `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md:69-75` | 87 |
| AC4 | Different worktreePaths with same graphSlug get different handles | `orchestration-service.test.ts:117-231`; reviewer-targeted Vitest run (`8` service tests passed) | 90 |
| AC5 | All existing orchestration tests pass unchanged | Summary-only claim in `/Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md:104-109`; evidence weakened by changed/skip-only integration coverage | 24 |

**Overall coverage confidence**: 52%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -12
git --no-pager diff 4a08b804^ 4a08b804 > /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/reviews/_computed.diff
git --no-pager diff --name-status 4a08b804^ 4a08b804
pnpm vitest run test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts test/unit/positional-graph/features/030-orchestration/drive.test.ts test/unit/positional-graph/features/030-orchestration/onbas.test.ts test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts test/integration/orchestration-wiring-real.test.ts test/integration/real-agent-orchestration.test.ts test/e2e/positional-graph-orchestration-e2e.ts
just harness doctor --wait 60
just harness build && just harness dev && just harness health
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md
**Spec**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md
**Phase**: Phase 1: Orchestration Contracts
**Tasks dossier**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/tasks.md
**Execution log**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md
**Review file**: /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/reviews/review.phase-1-orchestration-contracts.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | needs-fix | docs/plan | Expand Domain Manifest coverage |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-spec.md | reviewed | docs/spec | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/tasks.md | reviewed | docs/phase | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md | needs-fix | docs/phase | Add RED/GREEN evidence and explicit AC verification |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/reviews/_computed.diff | review-artifact | review | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/registry.md | reviewed | docs/domains | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/domain-map.md | reviewed | docs/domains | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | needs-fix | _platform/positional-graph | Add Concepts section |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/rules.md | reviewed | project-rules | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/idioms.md | reviewed | project-rules | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/architecture.md | reviewed | project-rules | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/project-rules/constitution.md | reviewed | project-rules | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/container.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/abortable-sleep.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/index.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/onbas.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/orchestration-service.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts | reviewed | _platform/positional-graph | Optional comment cleanup |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/reality.format.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/reality.schema.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/features/030-orchestration/reality.types.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/index.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/packages/positional-graph/src/schemas/state.schema.ts | reviewed | _platform/positional-graph | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts | needs-fix | _platform/positional-graph (tests) | Use deterministic timers and add per-it Test Docs |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/drive.test.ts | needs-fix | _platform/positional-graph (tests) | Use deterministic timers and enforce <100ms at drive level |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/onbas.test.ts | reviewed | _platform/positional-graph (tests) | No |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts | reviewed | _platform/positional-graph (tests) | Optional FakeScriptRunner cleanup |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/real-agent-orchestration.test.ts | needs-fix | _platform/positional-graph (tests) | Capture the handle-local PodManager/ODS path |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/orchestration-wiring-real.test.ts | needs-fix | _platform/positional-graph (tests) | Use get(...).run()/drive() instead of obsolete service.run |
| /Users/jordanknight/substrate/074-actaul-real-agents/test/e2e/positional-graph-orchestration-e2e.ts | reviewed | _platform/positional-graph (tests) | No direct action in this review |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/tasks/phase-1-orchestration-contracts/execution.log.md | Add RED/GREEN command output and explicit AC verification notes | Phase 1 is TDD-heavy, but the current log only records summaries and overstates AC5 evidence |
| 2 | /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/real-agent-orchestration.test.ts | Capture the per-handle PodManager/ODS created inside createPerHandleDeps | Current assertions inspect an unused outer PodManager, so the updated manual coverage misses the real T008 path |
| 3 | /Users/jordanknight/substrate/074-actaul-real-agents/test/integration/orchestration-wiring-real.test.ts | Replace obsolete orchestrationService.run(ctx, graphSlug) calls with handle-based calls | The current manual wiring test still calls a nonexistent API and cannot validate the new contract |
| 4 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | Add all changed production files to the Phase 1 Domain Manifest | The plan’s file→domain map is incomplete for the reviewed diff |
| 5 | /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Add a Concepts section for the new orchestration semantics | The domain doc remains below the review requirement for contract-bearing domains |
| 6 | /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/drive.test.ts; /Users/jordanknight/substrate/074-actaul-real-agents/test/unit/positional-graph/features/030-orchestration/abortable-sleep.test.ts | Make abort-path tests deterministic and assert the <100ms drive-level bar | Current timing tests rely on wall-clock sleeps and only partially prove AC2 |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md | `## Domain Manifest` omits several Phase 1 production files changed by commit `4a08b804` |
| /Users/jordanknight/substrate/074-actaul-real-agents/docs/domains/_platform/positional-graph/domain.md | Add required `## Concepts` table and include Phase 074 orchestration concepts |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/074-actaul-real-agents/docs/plans/074-workflow-execution/workflow-execution-plan.md --phase 'Phase 1: Orchestration Contracts'
