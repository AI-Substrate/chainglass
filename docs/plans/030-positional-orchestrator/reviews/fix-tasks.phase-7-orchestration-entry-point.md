# Fix Tasks: Phase 7 — Orchestration Entry Point

**Review**: review.phase-7-orchestration-entry-point.md
**Verdict**: REQUEST_CHANGES
**Date**: 2026-02-09

---

## Blocking Fixes (Must Complete Before Merge)

### Fix 1: QS-001 — Add state persistence after EHS settle (HIGH)

**File**: `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts`
**Lines**: 74-82

**Issue**: `processGraph()` mutates state in memory but changes are never persisted. `buildReality()` re-loads from disk, discarding mutations.

**Fix (TDD — write test first)**:

1. Add a test to `graph-orchestration.test.ts` proving state is persisted after settle:
```typescript
it('persists state after EHS settle', async () => {
  const persistCalls: State[] = [];
  const graphService = {
    ...makeGraphServiceStub(),
    persistGraphState: async (_ctx: WorkspaceContext, _slug: string, state: State) => {
      persistCalls.push(structuredClone(state));
    },
  } as unknown as IPositionalGraphService;
  
  deps = makeDeps({ graphService });
  deps.onbas.setActions([
    { type: 'no-action', graphSlug: 'test-graph', reason: 'graph-complete' },
  ]);
  
  const handle = makeHandle(deps);
  await handle.run();
  
  expect(persistCalls).toHaveLength(1); // 1 iteration = 1 persist
});
```

2. Patch `graph-orchestration.ts`:
```diff
       // 1. Settle: process pending events
       const state = await this.graphService.loadGraphState(this.ctx, this.graphSlug);
       this.eventHandlerService.processGraph(state, 'orchestrator', 'cli');
+      await this.graphService.persistGraphState(this.ctx, this.graphSlug, state);

       // 2. Build reality snapshot
       reality = await this.buildReality();
```

3. Verify: `pnpm test -- test/unit/positional-graph/features/030-orchestration/graph-orchestration.test.ts`

### Fix 2: BK-001 — Update plan task statuses (HIGH)

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`
**Lines**: 617-630

**Action**: Run `plan-6a` or manually update tasks 7.1-7.12 from `[ ]` to `[x]` and add log links + footnote references.

### Fix 3: BK-002 — Populate Change Footnotes Ledger (HIGH)

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`
**Lines**: 776+ (after [^21])

**Action**: Run `plan-6a` to add [^22] through [^N] entries for all Phase 7 changed files with FlowSpace node IDs. Expected entries:

```markdown
[^22]: Phase 7 Task 7.1 (T001) - ORCHESTRATION_DI_TOKENS
  - `file:packages/shared/src/di-tokens.ts`

[^23]: Phase 7 Task 7.2+7.3 (T002+T003) - Orchestration service types and interfaces
  - `file:packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

[^24]: Phase 7 Task 7.4+7.5 (T004+T005) - Fake orchestration service tests + implementation
  - `file:test/unit/positional-graph/features/030-orchestration/fake-orchestration-service.test.ts`
  - `class:packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts:FakeOrchestrationService`
  - `class:packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts:FakeGraphOrchestration`

[^25]: Phase 7 Task 7.6+7.7 (T006+T007) - GraphOrchestration loop tests + implementation
  - `file:test/unit/positional-graph/features/030-orchestration/graph-orchestration.test.ts`
  - `class:packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts:GraphOrchestration`

[^26]: Phase 7 Task 7.8+7.9 (T008+T009) - OrchestrationService caching tests + implementation
  - `file:test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts`
  - `class:packages/positional-graph/src/features/030-orchestration/orchestration-service.ts:OrchestrationService`

[^27]: Phase 7 Task 7.10+7.11 (T010+T011) - Container registration + integration test
  - `file:packages/positional-graph/src/container.ts`
  - `file:test/unit/positional-graph/features/030-orchestration/container-orchestration.test.ts`

[^28]: Phase 7 Task 7.12 (T012) - Barrel index updates
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`
  - `file:packages/positional-graph/src/index.ts`
  - `file:packages/shared/src/index.ts`
```

---

## Recommended Fixes (Non-Blocking)

### Fix 4: BK-003 — Populate dossier Phase Footnote Stubs

**File**: `docs/plans/030-positional-orchestrator/tasks/phase-7-orchestration-entry-point/tasks.md`
**Lines**: 447-449

**Action**: Add Phase Footnote Stubs matching the plan ledger entries [^22]-[^28] above.

### Fix 5: BK-004 — Update Progress Tracking

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`
**Lines**: 737-744

**Action**: Update Phase 6 to `[x] COMPLETE`, Phase 7 to `[x] COMPLETE`.

### Fix 6: DOC-001 — Document ctx-binding semantics

**File**: `packages/positional-graph/src/features/030-orchestration/orchestration-service.ts`
**Lines**: 39

**Action**: Add JSDoc note:
```typescript
/**
 * Get a per-graph orchestration handle. Creates on first call, caches thereafter.
 * NOTE: The ctx from the first call is captured for the handle's lifetime.
 * Subsequent calls with a different ctx for the same slug return the original handle.
 */
```

### Fix 7: SC-001 — Document prerequisite tokens

**File**: `docs/plans/030-positional-orchestrator/positional-orchestrator-plan.md`

**Action**: Update Finding #11 or the Phase 7 description to note that `ORCHESTRATION_DI_TOKENS` contains 1 public service token + 3 prerequisite tokens for factory resolution.

---

## Execution Order

1. Fix 1 (QS-001) — code fix, requires test-first
2. Fix 2 (BK-001) — plan bookkeeping
3. Fix 3 (BK-002) — plan bookkeeping
4. Fix 4-7 — optional, can be done in same pass

**After all fixes**: Re-run `just fft`, then re-run `plan-7-code-review` to verify.
