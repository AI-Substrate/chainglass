# Code Review: Phase 5 Subtask 001 — Drop Backward Compatibility Layer

**Plan**: [node-event-system-plan.md](../node-event-system-plan.md)
**Phase**: Phase 5: Service Method Wrappers
**Subtask**: [001-subtask-drop-backward-compat.md](../tasks/phase-5-service-method-wrappers/001-subtask-drop-backward-compat.md)
**Execution Log**: [001-subtask-drop-backward-compat.execution.log.md](../tasks/phase-5-service-method-wrappers/001-subtask-drop-backward-compat.execution.log.md)
**Diff Range**: Uncommitted changes vs HEAD (`93fbd45`)
**Reviewer**: AI Agent
**Date**: 2026-02-08

---

## A) Verdict

**APPROVE**

No CRITICAL or HIGH findings. All gates pass. The removal is well-justified by Workshop 04, correctly executed, and verified by 148 passing event-system tests and 3579 total tests (per execution log).

---

## B) Summary

This subtask removes the redundant `deriveBackwardCompatFields()` function from the raiseEvent pipeline. The function re-derived `pending_question_id` and `error` from the event log, but event handlers already write these fields directly during execution. Removing it simplifies the pipeline from 6 to 5 steps (validate → create → append → handle → persist). The deletion of 61 lines of source and 237 lines of tests is clean, with no broken references in source code. Planning documents (spec AC-15, dossier, flight plan, plan) are comprehensively updated. The `[—] Eliminated` convention for T001/T002 preserves traceability. Workshop 04 predicted zero test failures, and that prediction was confirmed.

---

## C) Checklist

**Testing Approach: Full TDD (per plan § Testing Philosophy)**

This subtask is a **removal**, not a feature addition. The TDD validation is inverted: existing tests must continue to pass without the removed code.

- [x] No new tests needed (removal subtask — validation is existing test continuity)
- [x] Mock usage matches spec: Fakes over mocks (no vi.mock/jest.mock)
- [x] Existing handler tests verify pending_question_id and error writes (event-handlers.test.ts: 23 unit + 4 E2E)
- [x] Existing raiseEvent pipeline tests pass without compat step (raise-event.test.ts: 22 tests → 148 total)

**Universal:**
- [x] Only in-scope files changed (4 source/test + 4 docs — all listed in subtask task table)
- [x] No BridgeContext concerns (no VS Code extension code)
- [x] Absolute paths used in dossier task table
- [x] Linters/type checks clean (per execution log: `just fft` clean, 3579 tests, 0 failures)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | LOW | Plan [^12] vs Dossier [^12] | Minor content mismatch — plan adds "Workshop 04 prediction confirmed." suffix | Sync dossier stub to match plan (plan is authority) |
| V2 | LOW | `packages/positional-graph/dist/` | Stale `derive-compat-fields.d.ts` in dist/ (build artifact) | Run `pnpm build` or `just clean && just build` to refresh dist |
| V3 | LOW | tasks.md T005/T006 Notes | Notes still reference "Depends on T002" even though dependency column was updated to `–` and `T003` respectively | Clean up residual T002 references in Notes text |
| V4 | LOW | tasks.md AC-7 Coverage Matrix | AC-7 flow still lists `derive-compat-fields.ts` in Files in Flow column | Remove deleted file from AC-7 row |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

No cross-phase regression concerns. This subtask removes code that was added in Phase 4. The removal is validated by all Phase 1-4 tests continuing to pass (148 event-system tests, 3579 total). The compat layer had no consumers outside the raiseEvent pipeline.

### E.1) Doctrine & Testing Compliance

**Graph Integrity: ⚠️ MINOR_ISSUES**

**Task↔Log Links (ST001-ST006)**:
- All 6 ST tasks marked [x] complete in dossier ✅
- All 6 have matching execution log headings (ST001-ST006) ✅
- Each log entry has Dossier Task metadata ✅
- Each log entry has Status: Completed ✅
- All log entries reference [^12] ✅

**Task↔Footnote Links**:
- [^12] exists in both plan ledger and dossier stubs ✅
- [^12] content matches between plan and dossier **with minor difference** (V1): plan has extra "Workshop 04 prediction confirmed." suffix
- Footnote numbering sequential: [^1]-[^12] with no gaps ✅
- [^4]/[^5] gap exists but is pre-existing (from prior phases, not this subtask)

**Footnote↔File Links**:
- [^12] lists 6 FlowSpace node IDs ✅
- All 6 point to files in the diff ✅
- 2 files marked DELETED are confirmed deleted from working tree ✅
- Node ID format correct (`file:<path>`) ✅

**Parent↔Subtask Links**:
- Subtask 001 in registry → file exists ✅
- Registry status updated to `[x] Complete` in uncommitted diff ✅
- Subtask dossier has Parent Context § with T001, T002 ✅
- T001/T002 in parent dossier reference subtask 001 ✅
- T001/T002 marked `[—] Eliminated` (consistent) ✅

**Authority Conflicts (Plan § 12 vs Dossier Stubs)**:
- One minor conflict (V1): plan [^12] has extra text. Plan is authority — dossier should sync.
- No CRITICAL or HIGH authority conflicts.

**Testing Compliance**:
- Full TDD approach: N/A for removal subtask (no new code to TDD)
- Validation approach correct: existing tests prove redundancy ✅
- Mock usage: No mocks used ✅

### E.2) Semantic Analysis

**Redundancy Verification**: CONFIRMED CORRECT

The deleted `deriveBackwardCompatFields()` function performed two derivations:

1. **`pending_question_id`**: Walked events backwards to find latest unanswered `question:ask`. The handler `handleQuestionAsk` (line 50) writes `pending_question_id = event.event_id` directly, and `handleQuestionAnswer` (line 69) clears it to `undefined`. These are identical results.

2. **`error`**: Found latest `node:error` event payload. The handler `handleNodeError` (lines 39-43) writes `error = { code, message, details }` directly from the same payload. Identical result.

**Edge case analysis**: The only scenario where derivation could differ from handler writes is if multiple `question:ask` events exist without corresponding answers. The handler always sets `pending_question_id` to the LATEST ask's event_id (because it overwrites on each ask). The compat function walked backwards and found the latest unanswered ask. In the current system, a second ask would overwrite the first handler write — identical behavior. For the `error` field, multiple errors: the handler always writes the latest, the compat function found the latest — identical.

**Conclusion**: No semantic correctness issues. Removal is safe.

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2)

**Correctness**: The raise-event.ts modification is clean — removed import, removed call, updated comments. No orphaned code. The pipeline flow comment accurately reflects the new 5-step flow.

**Security**: No security concerns. No secrets, no path traversal, no injection vectors in the changes.

**Performance**: Slight improvement — removed an O(n) walk over events that ran after every handler. For nodes with many events, this was unnecessary computation.

**Observability**: No logging changes. The pipeline still produces the same event trail for debugging.

**Stale dist/ artifact (V2)**: `packages/positional-graph/dist/features/032-node-event-system/derive-compat-fields.d.ts` still exists as a build artifact. This is harmless (dist/ is not committed) but should be cleaned on next build.

### E.4) Doctrine Evolution Recommendations

**Advisory — does not affect verdict.**

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 0 | 0 | 0 |
| Idioms | 1 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

**Idiom Candidate (IDIOM-REC-001)**:
- **Title**: `[—] Eliminated` Convention for Removed Tasks
- **Pattern**: When tasks are removed from a dossier, use `[—] Eliminated` status instead of deleting rows, to preserve footnote references and cross-links.
- **Evidence**: ST004 in this subtask; Discoveries & Learnings table entry "Used `[—] Eliminated` convention"
- **Priority**: LOW — useful convention but may already be in project norms

**Positive Alignment**:
- Implementation correctly follows PlanPak (all deleted files within `features/032-node-event-system/`)
- Workshop-driven decision making (Workshop 04 → Option C) is well-documented with clear traceability
- `[—] Eliminated` convention preserves graph integrity (footnote refs unbroken)

---

## F) Coverage Map

This subtask is a removal — acceptance criteria are validated by test continuity, not by new test assertions.

| Criterion | Test Coverage | Confidence | Notes |
|-----------|--------------|------------|-------|
| ST001: raiseEvent no longer calls compat | 22 raiseEvent tests pass without compat call | 100% | Pipeline verified by existing tests |
| ST002: Files deleted, barrel clean | TypeScript compiles, 148 tests pass with 8 files (down from 9) | 100% | Compilation is the assertion |
| ST003: AC-15 reflects handler-written | Manual — spec text review | 75% | Doc change, no automated test |
| ST004: Dossier T001/T002 eliminated | Manual — doc structure review | 75% | Doc change, no automated test |
| ST005: Flight plan updated | Manual — doc structure review | 75% | Doc change, no automated test |
| ST006: All tests pass | 3579 tests, 0 failures via `just fft` | 100% | Full suite regression proof |

**Overall Coverage Confidence**: 88% (code criteria at 100%, doc criteria at 75%)

---

## G) Commands Executed

```bash
# Verification of event system tests
pnpm vitest run --reporter=verbose test/unit/positional-graph/features/032-node-event-system/
# Result: 148 passed (8 files)

# Check for remaining source references to deleted function
grep -r "deriveBackwardCompatFields" packages/ test/ --include="*.ts"
# Result: Only dist/ artifact (stale build output)

# Diff analysis
git --no-pager diff HEAD --stat
git --no-pager diff HEAD --unified=3 --no-color -- packages/ test/
git --no-pager diff HEAD --unified=3 --no-color -- docs/

# Footnote sync check
diff <(grep -A 10 '^\[^12\]' plan) <(grep -A 10 '^\[^12\]' dossier)
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — ready to commit.

**Before committing**:
1. (Optional, LOW) Sync dossier [^12] stub to match plan ledger (add "Workshop 04 prediction confirmed." suffix)
2. (Optional, LOW) Clean up residual "Depends on T002" text in T005/T006 Notes columns
3. (Optional, LOW) Remove `derive-compat-fields.ts` from AC-7 Coverage Matrix Files in Flow column
4. Run `just fft` one final time before commit

**After committing**:
- Proceed to Subtask 002 (remove inline handlers from raiseEvent pipeline)
- Then resume Phase 5 main implementation (T003-T011)

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Node ID(s) |
|--------------------|-----------------|------------------------|
| `packages/positional-graph/src/features/032-node-event-system/raise-event.ts` | [^12] | `file:packages/positional-graph/src/features/032-node-event-system/raise-event.ts` — removed compat import and call |
| `packages/positional-graph/src/features/032-node-event-system/derive-compat-fields.ts` | [^12] | `file:packages/positional-graph/src/features/032-node-event-system/derive-compat-fields.ts` — DELETED |
| `test/unit/positional-graph/features/032-node-event-system/derive-compat-fields.test.ts` | [^12] | `file:test/unit/positional-graph/features/032-node-event-system/derive-compat-fields.test.ts` — DELETED |
| `packages/positional-graph/src/features/032-node-event-system/index.ts` | [^12] | `file:packages/positional-graph/src/features/032-node-event-system/index.ts` — removed compat barrel export |
| `docs/plans/032-node-event-system/node-event-system-spec.md` | [^12] | `file:docs/plans/032-node-event-system/node-event-system-spec.md` — AC-15 updated |
| `docs/plans/032-node-event-system/tasks/phase-5-service-method-wrappers/tasks.md` | [^12] | `file:docs/plans/032-node-event-system/tasks/phase-5-service-method-wrappers/tasks.md` — T001/T002 eliminated |
| `docs/plans/032-node-event-system/node-event-system-plan.md` | [^12] | (Plan itself — ledger, Finding 03, Phase 5 description, Subtasks Registry) |
| `docs/plans/032-node-event-system/tasks/phase-5-service-method-wrappers/tasks.fltplan.md` | [^12] | (Flight plan — not separately tracked in footnote, listed in subtask dossier) |

All 8 diff-touched files accounted for. All have [^12] coverage. The flight plan (`tasks.fltplan.md`) is listed in the subtask dossier's task table (ST005) but not as a separate node ID in [^12] — this is acceptable since it's a derived planning artifact, not source code.
