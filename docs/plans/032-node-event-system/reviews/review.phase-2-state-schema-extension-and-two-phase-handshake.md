# Code Review: Phase 2 — State Schema Extension and Two-Phase Handshake

**Plan**: [node-event-system-plan.md](../node-event-system-plan.md)
**Phase**: Phase 2: State Schema Extension and Two-Phase Handshake
**Dossier**: [tasks.md](../tasks/phase-2-state-schema-extension-and-two-phase-handshake/tasks.md)
**Execution Log**: [execution.log.md](../tasks/phase-2-state-schema-extension-and-two-phase-handshake/execution.log.md)
**Diff Range**: Uncommitted changes against `b352af3` (HEAD, Phase 1 commit)
**Date**: 2026-02-07
**Testing Approach**: Full TDD (per constitution and spec)
**Mock Usage**: Fakes over mocks (no `vi.mock`/`jest.mock`)

---

## A) Verdict

**APPROVE**

No CRITICAL or HIGH findings. All gates pass. Two MEDIUM and two LOW findings documented below — all are documentation/consistency issues, not behavioral defects.

---

## B) Summary

Phase 2 replaces the single `'running'` node status with `'starting'` + `'agent-accepted'` (two-phase handshake), adds an optional `events` array to `NodeStateEntrySchema`, and creates `isNodeActive()` / `canNodeDoWork()` predicate helpers. The implementation is clean, correct, and complete. All 3541 tests pass, typecheck is clean, and `just fft` succeeds. The TDD cycle is well-documented in the execution log. The only findings are stale JSDoc comments referencing `'running'` in the service layer, a minor predicate usage inconsistency, and a footnote entry missing `index.ts` and `reality.builder.ts` from the node-ID list.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence): T003 (RED) before T004 (GREEN) documented in execution log
- [x] Tests as docs (assertions show behavior): Test Doc 5-field blocks on all new test files, descriptive test names
- [x] Mock usage matches spec: Fakes over mocks — no `vi.mock`/`jest.mock` found; `simulateAgentAccept()` helpers manipulate state.json directly (not mocks)
- [x] Negative/edge cases covered: `'running'` rejection test, waiting-question canNodeDoWork false, multi-question re-accept

**Universal:**
- [x] BridgeContext patterns followed: N/A (no VS Code extension code in this phase)
- [x] Only in-scope files changed (see §D, §E.1 for details)
- [x] Linters/type checks are clean: `pnpm typecheck` 0 errors; `just fft` clean
- [x] Absolute paths used (no hidden context): All path resolution through service's `pathResolver`

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| DOC-001 | MEDIUM | `positional-graph.service.ts:1773,1872,1875,1947,2024,2027` | 6 stale JSDoc comments still reference `'running'` instead of `'starting'`/`'agent-accepted'` | Update JSDoc to match new status values |
| FN-001 | MEDIUM | `node-event-system-plan.md:§12 [^2]` | Footnote [^2] missing node IDs for `index.ts` (barrel export update) and `reality.builder.ts` (listed in dossier audit but no code changes needed) | Add `file:...index.ts` to footnote; clarify builder had no changes |
| PRED-001 | LOW | `positional-graph.service.ts:1151` | `getLineStatus()` uses inline `status === 'starting' \|\| status === 'agent-accepted'` instead of `isNodeActive()` predicate | Acceptable: `ExecutionStatus` type includes `'pending'`/`'ready'` which `isNodeActive()` doesn't accept. Consider adding a type-compatible overload in a future phase. |
| DOC-002 | LOW | `positional-graph.service.ts:1773,1872` | Method-level JSDoc still says "pending/ready to running" and "running to complete" | Update to "pending → starting" and "agent-accepted → complete" |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Phase 1 tests re-run against Phase 2 code**:
- 94 Phase 1 tests + 16 Phase 2 tests = 110 tests in `032-node-event-system/` — all pass
- 3541 total tests (full suite) — all pass
- No Phase 1 contracts broken
- No integration point regressions

**Verdict**: PASS — no cross-phase regression detected.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Link Validation)

**Task↔Log**: All 11 tasks (T001+T002 merged, T003–T011) have corresponding execution log entries. Each log entry has `Dossier Task` and `Plan Task` metadata with backlinks. Log anchors match heading format (kebab-case). **PASS**

**Task↔Footnote**: All tasks in dossier Notes column reference `[^2]`. Dossier § Phase Footnote Stubs has [^2] entry with 9 FlowSpace node IDs. Plan § 12 has matching [^2] entry. Numbering sequential ([^1] Phase 1, [^2] Phase 2).

**Finding FN-001**: The dossier Pre-Implementation Audit lists 10 files (rows 1-10). The [^2] footnote has 9 node IDs — it includes `state.schema.ts`, `event-helpers.ts:isNodeActive`, `event-helpers.ts:canNodeDoWork`, `positional-graph.service.ts`, `onbas.ts`, `fake-onbas.ts`, `reality.types.ts`, `reality.schema.ts`, `positional-graph-service.interface.ts`. Missing: `index.ts` (row 10 — barrel export update). The `reality.builder.ts` (row 8 in audit) required no code changes per the execution log discovery — this is acceptable but could be noted in the footnote for completeness. **MINOR_ISSUES**

**Footnote↔File**: All 9 FlowSpace node IDs in [^2] correspond to files in the diff. Node ID format correct (`file:` and `function:` prefixes with paths). Test files are not in footnotes — this is acceptable (footnotes track source changes). **PASS**

**Plan↔Dossier Sync**: Plan rows 2.1–2.10 all show `[x]` status matching dossier T001+T002–T011 `[x]`. All plan Log columns have `[📋]` links to correct execution log anchors. All plan Notes columns have `[^2]` tags. **PASS**

**Parent↔Subtask**: No subtasks exist for Phase 2. **N/A**

**Graph Integrity Verdict**: ⚠️ MINOR_ISSUES (1 medium — FN-001 missing `index.ts` node ID)

#### Authority Conflicts

Plan § 12 and dossier § Phase Footnote Stubs are in sync for [^2]. Content matches. No authority conflicts. **PASS**

#### TDD Compliance

- **TDD order**: T003 (write predicate tests, RED — "Tests fail, Cannot find module") precedes T004 (implement predicates, GREEN — "all 10 pass"). Execution log documents this clearly. **PASS**
- **Tests as documentation**: Both new test files have file-level and per-test 5-field Test Doc blocks (Why, Contract, Usage Notes, Quality Contribution, Worked Example). Assertions are behavioral and descriptive. **PASS**
- **RED-GREEN-REFACTOR**: T003→T004 is RED→GREEN. T011 documents the REFACTOR cycle (lint fixes, then `simulateAgentAccept()` helpers). **PASS**
- **T010 (backward compat)**: Written as a standalone test file with 6 tests. No explicit RED phase documented — the implementation (events optional field) was already in place from T001+T002. This is acceptable since T010 is a verification test, not a TDD cycle. **ACCEPTABLE**

#### Mock Usage

Zero mock framework usage found in any new or modified test file. All test doubles are explicit state manipulation (`simulateAgentAccept()` / `acceptNodeInState()`) or real service instances with `FakeFileSystem`. **PASS**

### E.2) Semantic Analysis

**Domain logic correctness**: The two-phase handshake semantics are correctly implemented:
- `startNode()` → `'starting'` (orchestrator reserves)
- `canNodeDoWork('starting')` → `false` (agent must accept first)
- `canNodeDoWork('agent-accepted')` → `true` (agent can work)
- `answerQuestion()` → `'starting'` (DYK #1: agent must re-accept after answer)
- `endNode()` only from `['agent-accepted']` (must be doing work to complete)

**Specification drift**: None detected. Implementation matches plan deliverables, Workshop #01 event-state mapping, and DYK #1 decision.

**Finding DOC-001**: 6 JSDoc comments in `positional-graph.service.ts` still reference `'running'`:
- Line 1773: "pending/ready to running" → should be "pending → starting"
- Line 1872: "running to complete" → should be "agent-accepted → complete"
- Line 1875: "only accepts running state" → should be "only accepts agent-accepted state"
- Line 1947: "from a running node" → should be "from an agent-accepted node"
- Line 2024: "back to running" → should be "back to starting"
- Line 2027: "transitions node back to running" → should be "transitions node back to starting"

These are documentation-only issues with no behavioral impact.

### E.3) Quality & Safety Analysis

**Safety Score: 96/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 2)

**Correctness**:
- Guard logic `status === 'pending' || !canNodeDoWork(status)` is correct and type-safe. The `'pending'` check handles the implicit state before narrowing to `NodeExecutionStatus` for `canNodeDoWork()`. ✅
- Dead-code fallback `{ status: 'agent-accepted' }` on line 2006 is immediately overwritten by `status = 'waiting-question'` on line 2008. The initial value is semantically correct (asking a question requires agent-accepted state). ✅
- `endNode()` transition from `['agent-accepted']` only is correct per two-phase handshake. ✅
- `answerQuestion()` → `'starting'` consistently applied in both status mutation (line 2074) and result (line 2082). ✅
- ONBAS switch fall-through `case 'starting': case 'agent-accepted': return null;` correctly treats both as in-progress. ✅
- `reality.builder.ts` uses `runningNodeIds` from service results, not direct status checks — no changes needed. ✅

**Security**: No path traversal, injection, or secrets issues. Changes are status literal swaps and predicate introductions. ✅

**Performance**: No N+1 queries, unbounded scans, or algorithmic regressions. Predicate functions are O(1) comparisons. ✅

**Observability**: No new error paths or logging gaps introduced. Error messages (`nodeNotRunningError`, `invalidStateTransitionError`) continue to use the appropriate status values. ✅

**Verdict**: APPROVE

### E.4) Doctrine Evolution Recommendations (Advisory)

| Category | Recommendation | Priority | Evidence |
|----------|---------------|----------|----------|
| Idiom | `simulateAgentAccept()` test helper pattern appears in 4 test files with slight variations (sync vs async, different variable names). Consider extracting to a shared test utility in `test/helpers/` for Phase 3+ consistency. | MEDIUM | execution-lifecycle.test.ts, output-storage.test.ts, input-retrieval.test.ts, question-answer.test.ts |
| Rule | Phase 2 discovered that `transitionNodeState()` is not a centralized map — transitions are distributed across callers. Consider documenting this in `idioms.md` or a discovery note for future contributors. | LOW | Execution log T006 discovery |
| Idiom | The `isNodeActive()` / `canNodeDoWork()` predicate pattern (single-responsibility status classification) is clean and reusable. Document in idioms.md as the preferred way to add status-dependent logic. | LOW | event-helpers.ts |

---

## F) Coverage Map

| Acceptance Criterion | Test File(s) | Assertion(s) | Confidence |
|---------------------|-------------|-------------|------------|
| AC-6: Two new statuses replace `running` | schemas.test.ts, execution-lifecycle.test.ts | `NodeExecutionStatusSchema.parse('starting')`, `result.status === 'starting'`, `safeParse('running').success === false` | 100% — explicit criterion tests |
| AC-17: State schema backward compatible | backward-compat.test.ts | 6 tests: old format parses, empty events parses, mixed state parses, running rejected, all new statuses accepted | 100% — dedicated test file |
| Predicates tested | event-helpers.test.ts | 10 tests covering all status × predicate combinations | 100% — comprehensive coverage |
| All existing tests updated | execution-lifecycle, output-storage, input-retrieval, question-answer, can-run, collate-inputs, schemas, status, execution-errors, cli-workflow, e2e | Status literal updates + `simulateAgentAccept()` helpers | 100% — 3541 tests pass |
| `just fft` clean | Execution log T011 | "all green", "234 passed, 5 skipped, 3541 tests" | 100% — verified independently |

**Overall coverage confidence**: 100% — all criteria have explicit test references.

---

## G) Commands Executed

```bash
pnpm test                  # 234 files, 3541 tests pass (0 failures)
pnpm typecheck             # 0 errors
pnpm vitest run test/unit/positional-graph/features/032-node-event-system/  # 110 tests pass (Phase 1 + 2)
grep -rn "'running'" packages/positional-graph/src/ --include="*.ts"  # 0 matches in source
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — merge Phase 2 and advance to Phase 3 (raiseEvent Core Write Path).

**Before merge** (optional but recommended):
1. Fix DOC-001: Update 6 stale JSDoc comments in `positional-graph.service.ts` (lines 1773, 1872, 1875, 1947, 2024, 2027)
2. Fix FN-001: Add `file:packages/positional-graph/src/features/032-node-event-system/index.ts` to [^2] node IDs in both plan §12 and dossier §Phase Footnote Stubs

**After merge**:
- Start Phase 3 with `/plan-5 --phase "Phase 3: raiseEvent Core Write Path"`
- Consider extracting `simulateAgentAccept()` to shared test utility before Phase 3 (per E.4 recommendation)
- Phase 3 task briefs should prominently document DYK #1 (`answerQuestion() → 'starting'`) to prevent subagent drift

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag | Node ID(s) in Plan §12 |
|-------------------|-------------|----------------------|
| `packages/positional-graph/src/schemas/state.schema.ts` | [^2] | `file:packages/positional-graph/src/schemas/state.schema.ts` |
| `packages/positional-graph/src/features/032-node-event-system/event-helpers.ts` | [^2] | `function:...event-helpers.ts:isNodeActive`, `function:...event-helpers.ts:canNodeDoWork` |
| `packages/positional-graph/src/services/positional-graph.service.ts` | [^2] | `file:packages/positional-graph/src/services/positional-graph.service.ts` |
| `packages/positional-graph/src/features/030-orchestration/onbas.ts` | [^2] | `file:packages/positional-graph/src/features/030-orchestration/onbas.ts` |
| `packages/positional-graph/src/features/030-orchestration/fake-onbas.ts` | [^2] | `file:packages/positional-graph/src/features/030-orchestration/fake-onbas.ts` |
| `packages/positional-graph/src/features/030-orchestration/reality.types.ts` | [^2] | `file:packages/positional-graph/src/features/030-orchestration/reality.types.ts` |
| `packages/positional-graph/src/features/030-orchestration/reality.schema.ts` | [^2] | `file:packages/positional-graph/src/features/030-orchestration/reality.schema.ts` |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | [^2] | `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` |
| `packages/positional-graph/src/features/032-node-event-system/index.ts` | [^2] | ⚠️ **MISSING** — barrel export updated but no node ID in footnote |
| Test files (13 files) | — | Not tracked in footnotes (test files excluded by convention) |
| `docs/plans/032-node-event-system/node-event-system-plan.md` | — | Plan artifact (not tracked in footnotes) |
