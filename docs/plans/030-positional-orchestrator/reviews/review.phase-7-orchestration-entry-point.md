# Code Review: Phase 7 — Orchestration Entry Point

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 7: Orchestration Entry Point
**Dossier**: tasks/phase-7-orchestration-entry-point/tasks.md
**Reviewer**: plan-7-code-review
**Date**: 2026-02-09
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)

---

## A) Verdict

**REQUEST_CHANGES**

1 HIGH finding (missing state persistence after EHS settle), 2 HIGH bookkeeping gaps (missing footnotes ledger, plan task status not updated). Code quality and test coverage are strong — the functional issue is the only code-level blocker.

---

## B) Summary

Phase 7 delivers a clean two-level orchestration entry point (IOrchestrationService → IGraphOrchestration) composing all six internal collaborators from Phases 1-6. The implementation is well-structured, follows all ADR constraints (useFactory, module registration, fakes-over-mocks), and achieves 24 passing tests across 4 test files with clear Test Doc blocks.

One functional issue exists: `GraphOrchestration.run()` does not persist state after `EventHandlerService.processGraph()` mutates it in memory, causing EHS state changes to be lost when `buildReality()` re-loads from disk. The E2E test in Plan 032 explicitly shows the correct pattern (load → processGraph → persistGraphState → reload).

Plan bookkeeping is incomplete: Phase 7 task statuses in the plan are still `[ ]`, and the Change Footnotes Ledger has no entries for Phases 6 or 7.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log for T004→T005, T006→T007, T008→T009)
- [x] Tests as docs (assertions show behavior — clear test names, meaningful assertions)
- [x] Mock usage matches spec: Fakes over mocks — no `vi.mock`/`jest.mock` found
- [x] Negative/edge cases covered (unconfigured graph throws, max iteration guard, all stop reasons)
- [x] Test Doc blocks present with all 5 fields (Why/Contract/Usage Notes/Quality Contribution/Worked Example) in all 4 test files
- [x] BridgeContext patterns followed (N/A — no VS Code extension code)
- [ ] Only in-scope files changed — PASS with note: `packages/shared/src/index.ts` added but justified as barrel export for new token
- [x] Linters/type checks are clean (tsc --noEmit clean, 226/226 tests pass)
- [x] Absolute paths used (no hidden context assumptions)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| QS-001 | HIGH | graph-orchestration.ts:74-82 | Missing `persistGraphState()` after EHS settle — in-memory mutations lost on reload | Add persist call after processGraph() |
| QS-002 | MEDIUM | graph-orchestration.ts:74-82 | Double state load per iteration (once for EHS, once for buildReality) | Could share single load if persist is added |
| BK-001 | HIGH | positional-orchestrator-plan.md:617-630 | Plan Phase 7 task statuses still `[ ]` — not updated to `[x]` | Run plan-6a to sync task statuses |
| BK-002 | HIGH | positional-orchestrator-plan.md:776-858 | Change Footnotes Ledger missing Phase 6 and Phase 7 entries | Run plan-6a to populate footnotes [^22]-[^N] |
| BK-003 | MEDIUM | tasks.md:447-449 | Phase Footnote Stubs section empty ("Populated by plan-6 during implementation") | Populate with Phase 7 file→footnote mappings |
| BK-004 | MEDIUM | positional-orchestrator-plan.md:742-743 | Phase 6 still shows "READY", Phase 7 shows "Pending" in Progress Tracking | Update to reflect completion |
| SC-001 | LOW | di-tokens.ts:125-133 | 4 tokens added but plan says "Only 1 public DI token" — extra 3 are prerequisite tokens | Acceptable — prerequisite tokens are needed for factory; document in plan |
| DOC-001 | LOW | orchestration-service.ts:39 | `get()` caches handle with first caller's `ctx` — subsequent calls with different ctx get stale ctx | Add JSDoc noting ctx-binding semantics |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun**: All 226 tests in `test/unit/positional-graph/features/030-orchestration/` pass (includes Phases 1-6 tests).

**Contracts checked**: No breaking changes to prior phase interfaces. Phase 7 only consumes prior phase exports (ONBAS, ODS, buildPositionalGraphReality, etc.) without modifying them.

**Integration points**: Phase 7 correctly composes:
- Phase 1: `buildPositionalGraphReality()` called in `buildReality()`
- Phase 2: `OrchestrationRequest` used as ONBAS output / ODS input
- Phase 3: `AgentContextService` wired into ODS deps in container
- Phase 4: `PodManager` wired into ODS deps in container
- Phase 5: `ONBAS.getNextAction()` called in the loop
- Phase 6: `ODS.execute()` called in the loop
- Plan 032: `IEventHandlerService.processGraph()` called as settle step

**Verdict**: PASS — no cross-phase regressions detected.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity

**Link validation**: Partially broken.
- **Task↔Log**: All 13 tasks (T001-T013) have corresponding execution log entries. ✅
- **Task↔Footnote**: No footnotes assigned to Phase 7 tasks. ❌ (BK-002, BK-003)
- **Plan↔Dossier sync**: Plan task statuses not updated — all still `[ ]` in plan despite `[x]` in dossier. ❌ (BK-001)
- **Graph integrity score**: ❌ BROKEN (missing footnotes, status desync)

#### TDD Compliance

- **TDD order**: PASS. Execution log confirms RED→GREEN pattern for T004→T005, T006→T007, T008→T009. Tests were written before implementations, confirmed by "All N tests RED (import fails)" entries.
- **Tests as documentation**: PASS. Test names clearly describe behavior (e.g., "single iteration: start-node then no-action", "max iteration guard stops the loop"). Assertions are explicit and readable.
- **RED-GREEN-REFACTOR evidence**: PASS. T013 is the explicit REFACTOR step (biome check --write, just fft).
- **Test Doc blocks**: PASS. All 4 test files have complete 5-field Test Doc blocks with meaningful content.

#### Mock Usage

- **Policy**: Fakes over mocks
- **Compliance**: PASS. Zero `vi.mock` or `jest.mock` calls found. All test doubles implement real interfaces:
  - `FakeONBAS` implements `IONBAS`
  - `FakeODS` implements `IODS`
  - `FakeEventHandlerService` implements `IEventHandlerService`
  - `FakeOrchestrationService` implements `IOrchestrationService`
  - `FakeGraphOrchestration` implements `IGraphOrchestration`
  - `makeGraphServiceStub()` uses `as unknown as IPositionalGraphService` (partial stub, not mock)

#### ADR Compliance

- **ADR-0004** (Decorator-Free DI): PASS. `registerOrchestrationServices()` uses `useFactory` pattern. No decorators.
- **ADR-0009** (Module Registration): PASS. `registerOrchestrationServices(container)` exported from `container.ts`. Prerequisites documented in JSDoc.
- **ADR-0010** (Central Event Notification): N/A for Phase 7 (no domain events emitted from loop per Non-Goals).

### E.2) Semantic Analysis

#### QS-001: Missing State Persistence After EHS Settle (HIGH)

**File**: `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts:74-82`

**Issue**: `EventHandlerService.processGraph()` mutates the `state` object in memory (stamps events, changes node statuses) but the mutations are never persisted to disk. The immediately following `buildReality()` call re-loads state from disk via `graphService.loadGraphState()`, which returns the pre-mutation state.

**Spec requirement**: The E2E validation script in Plan 032 (`node-event-system-visual-e2e.ts`) demonstrates the correct pattern at lines 437-456:
```typescript
state = await service.loadGraphState(ctx, GRAPH_SLUG);
const settle = ehs.processGraph(state, 'orchestrator', 'cli');
await service.persistGraphState(ctx, GRAPH_SLUG, state);  // <-- THIS IS MISSING
```

The `NodeEventService.handleEvents()` comment (line 68) explicitly states: "The caller is responsible for persisting state after this method returns."

**Impact**: EHS state changes (event stamps, status transitions) are silently discarded each iteration. This means:
- Events are re-processed on every iteration (they never appear stamped)
- Status transitions from event handlers don't take effect
- The orchestration loop may behave incorrectly when events are present

**Current tests don't catch this** because `FakeEventHandlerService` is a no-op that doesn't actually mutate state.

**Fix**:
```diff
       // 1. Settle: process pending events
       const state = await this.graphService.loadGraphState(this.ctx, this.graphSlug);
       this.eventHandlerService.processGraph(state, 'orchestrator', 'cli');
+      await this.graphService.persistGraphState(this.ctx, this.graphSlug, state);

       // 2. Build reality snapshot
       reality = await this.buildReality();
```

**Severity**: HIGH — functional defect causing silent data loss, though currently mitigated by the fact that Phase 8 E2E tests will likely catch this.

#### QS-002: Double State Load Per Iteration (MEDIUM)

**File**: `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts:74-82,128-134`

**Issue**: Each loop iteration loads `graphService.loadGraphState()` twice: once at line 78 for EHS settle, and once inside `buildReality()` at line 131. After fixing QS-001 (adding persist), this becomes: load → mutate → persist → load again → build reality. The second load is necessary for correctness (to pick up any concurrent external mutations), but it's a performance consideration.

**Impact**: 2x I/O per iteration. Acceptable for single-process in-memory orchestration (per plan assumption), but worth noting.

**Fix**: No immediate fix needed. Could optimize later by passing the settled state directly to `buildReality()` if concurrent mutation is not a concern.

**Severity**: MEDIUM — performance observation, not a bug. Plan explicitly states "Performance optimization" is a non-goal.

### E.3) Quality & Safety Analysis

#### Correctness

- **Logic flow**: The settle → decide → act loop is correctly structured. ONBAS decides, exit check on `no-action` type, ODS executes, action recorded.
- **Stop reason mapping**: `mapStopReason()` correctly maps `graph-complete` and `graph-failed` to their respective values, and all others to `no-action`. The `reason` parameter is `string | undefined` matching the `NoActionRequest` schema.
- **Max iteration guard**: Correctly implemented at 100 iterations default, configurable. Returns `MAX_ITERATIONS` error code.
- **Handle caching**: `Map<string, IGraphOrchestration>` correctly caches by slug. No eviction needed per plan assumptions (lightweight handles, process-lifetime caching).

#### Security

No security issues found. Code operates on local filesystem only, no user input parsing, no network calls, no secrets handling.

#### Performance

- **Handle caching**: Effective — prevents re-creation of handles per call. No unbounded growth concern (bounded by number of graphs).
- **Loop iterations**: Bounded by `maxIterations` (default 100). Each iteration does 2 async calls minimum (loadGraphState + getStatus). Acceptable for single-process design.
- **`Promise.all` in buildReality()**: Good — parallelizes `getStatus` and `loadGraphState`.

#### Observability

- **DOC-001**: `OrchestrationService.get()` caches the handle with the first caller's `ctx`. If a subsequent caller provides a different `ctx` for the same `graphSlug`, they get a handle bound to the original `ctx`. This is by design (per Workshop #7: "Captured ctx at .get() time") but should be documented more explicitly.

### E.4) Doctrine Evolution Recommendations (Advisory)

#### Positive Alignment

- Implementation correctly follows ADR-0004 (useFactory), ADR-0009 (module registration), and the fakes-over-mocks convention.
- PlanPak placement rules followed: plan-scoped files in `features/030-orchestration/`, cross-cutting in traditional locations.
- Test Doc blocks present and meaningful in all test files.

#### Observations

- **Prerequisite tokens pattern**: The addition of `AGENT_ADAPTER`, `SCRIPT_RUNNER`, `EVENT_HANDLER_SERVICE` to `ORCHESTRATION_DI_TOKENS` establishes a pattern of grouping prerequisite tokens alongside the main service token. This is a reasonable convention but differs from the plan's "only 1 public token" statement. Consider documenting this pattern in rules.md if it becomes common.

---

## F) Coverage Map

### Acceptance Criteria Coverage

| AC | Description | Test Files | Confidence | Notes |
|----|-------------|-----------|------------|-------|
| AC-10 | Two-level pattern: service → handle | orchestration-service.test.ts (3 tests), container-orchestration.test.ts (3 tests), fake-orchestration-service.test.ts (7 tests) | 100% | Explicit: same handle for same slug, different handles for different slugs, DI resolution works |
| AC-11 | Orchestration loop: reality → ONBAS → ODS → repeat | graph-orchestration.test.ts (11 tests) | 100% | Explicit: single/multi iteration, all stop reasons, max guard, timestamps, EHS settle |
| AC-14 | Input wiring flows through | graph-orchestration.test.ts (implicit via start-node action carrying inputs) | 75% | Behavioral match: inputs passed in start-node request, but no explicit AC-14 test name |

**Overall coverage confidence**: 92% (excellent)

### Narrative Tests

None identified — all tests map to specific acceptance criteria or design contracts.

---

## G) Commands Executed

```bash
# All orchestration tests
pnpm test -- test/unit/positional-graph/features/030-orchestration/
# Result: 226 passed (11 files)

# Type checking
pnpm exec tsc --noEmit -p packages/positional-graph/tsconfig.json
pnpm exec tsc --noEmit -p packages/shared/tsconfig.json
# Result: clean

# Diff computation
git --no-pager diff HEAD -- packages/
git diff --no-index /dev/null <new-files>
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

### Required Before Merge (Blocking)

1. **Fix QS-001**: Add `await this.graphService.persistGraphState(this.ctx, this.graphSlug, state)` after `this.eventHandlerService.processGraph()` in `graph-orchestration.ts`. Add a test proving state is persisted after settle (e.g., verify `graphService.persistGraphState` was called each iteration).

2. **Fix BK-001**: Run `plan-6a` to update plan task statuses from `[ ]` to `[x]` for tasks 7.1-7.12.

3. **Fix BK-002**: Run `plan-6a` to populate Change Footnotes Ledger with Phase 7 entries ([^22] onwards), mapping each changed file to its FlowSpace node ID.

### Recommended (Non-Blocking)

4. **Fix BK-003**: Populate Phase Footnote Stubs in dossier tasks.md.
5. **Fix BK-004**: Update Progress Tracking section in plan.
6. **Fix DOC-001**: Add JSDoc to `OrchestrationService.get()` noting ctx-binding semantics.
7. **Fix SC-001**: Update plan text to acknowledge prerequisite tokens alongside the public service token.

### After Fixes

Re-run `plan-6` for fixes, then re-run `plan-7` to verify. Once APPROVE, merge and advance to Phase 8 (`plan-5-phase-tasks-and-brief`).

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Entry |
|-------------------|-----------------|-------------------|
| `packages/shared/src/di-tokens.ts` | — | ❌ Missing |
| `packages/shared/src/index.ts` | — | ❌ Missing |
| `packages/positional-graph/src/container.ts` | — | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/index.ts` | — | ❌ Missing |
| `packages/positional-graph/src/index.ts` | — | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts` | — | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts` | — | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | — | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts` | — | ❌ Missing |
| `test/.../fake-orchestration-service.test.ts` | — | ❌ Missing |
| `test/.../graph-orchestration.test.ts` | — | ❌ Missing |
| `test/.../orchestration-service.test.ts` | — | ❌ Missing |
| `test/.../container-orchestration.test.ts` | — | ❌ Missing |

**Status**: No Phase 7 footnotes exist in either the plan ledger or the dossier stubs. All 13 files lack footnote coverage.
