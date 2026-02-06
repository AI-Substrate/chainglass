# Code Review: Phase 1 — PositionalGraphReality Snapshot

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 1: PositionalGraphReality Snapshot
**Reviewer**: plan-7-code-review (automated)
**Date**: 2026-02-06
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)
**Mock Usage Policy**: Fakes over mocks (no vi.mock/jest.mock)

---

## A) Verdict

**APPROVE**

No CRITICAL findings. Two HIGH findings are **procedural** (plan progress not updated, TDD accessor cycle skipped) — neither affects code correctness or safety. All code is correct, well-tested (47 tests passing), and cleanly scoped.

---

## B) Summary

Phase 1 delivers the PositionalGraphReality snapshot model: 8 TypeScript interfaces, 7 Zod schemas, a pure builder function, and a view lookup class. Implementation is well-structured, correctly scoped (perfect 1:1 match between task table and diff), and passes all 3280 tests via `just fft`. Two cross-plan edits (unitType on NarrowWorkUnit/NodeStatusResult, surfaced_at on QuestionSchema) are backward compatible. The only gaps are bookkeeping: `plan-6a` was not run to populate footnotes and update the plan's progress checklist.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T006→T007 ✓, T010→T011 ✓; T008→T009 ⚠️ (see TDD-001)
- [x] Tests as docs (assertions show behavior) — 47 tests with descriptive names and clear assertions
- [x] Mock usage matches spec: **Avoid** (Fakes over mocks) — zero vi.mock/jest.mock usage
- [x] Negative/edge cases covered — missing IDs, empty graph, first node no left neighbor, all-complete sentinel, etc.

**Universal:**

- [x] BridgeContext patterns followed — N/A (pure functions, no VS Code extension code)
- [x] Only in-scope files changed — 15 files, all in task table
- [x] Linters/type checks are clean — `just fft`: 3280 tests, 0 failures, no lint warnings
- [x] Absolute paths used (no hidden context) — N/A (pure functions, no filesystem access)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| TDD-001 | HIGH | process | Accessor RED phase skipped — T007 implemented accessors early, T009 was a no-op | Log as acceptable deviation; merge builder+accessor tasks in future plans |
| TDD-002 | MEDIUM | reality.test.ts | Per-test 5-field Test Doc blocks missing; only file-level block exists | Add per-test blocks or update dossier to reflect file-level convention |
| TDD-003 | HIGH | plan.md | Plan task table and progress checklist not updated (all still `[ ]`) | Run `plan-6a-update-progress` |
| LINK-001 | MEDIUM | tasks.md, plan.md | Phase Footnote Stubs empty; plan ledger has placeholders | Run `plan-6a` to populate footnotes for cross-plan edits |
| LINK-002 | MEDIUM | plan.md:731 | Phase 1 progress not marked complete | Update via `plan-6a` |
| TDD-004 | LOW | execution.log.md | T009 log shows no files changed — accurate but unusual for a task | No action needed |
| TDD-005 | LOW | — | No scope creep detected | Positive finding |
| TDD-006 | LOW | — | No mock violations | Positive finding |
| TDD-007 | LOW | tasks.md | Discoveries & Learnings table empty despite 5 DYK insights | Populate table or note Critical Insights section serves same purpose |
| QUAL-001 | LOW | positional-graph.service.ts:1057 | `unitType` fallback to `'agent'` when unit missing | Safe; readyDetail.unitFound catches this |
| QUAL-002 | LOW | reality.view.ts:45-50 | getLeftNeighbor trusts lineIndex/positionInLine consistency | Invariant maintained by builder construction |
| QUAL-003 | LOW | reality.view.ts:26-28 | O(n) linear scan in getLine/getQuestion | Acceptable for expected graph sizes |
| QUAL-004 | LOW | reality.builder.ts:83 | Options normalization assumes string elements | Zod schema guarantees string[] at boundary |
| QUAL-005 | LOW | reality.builder.ts:87 | Double null/undefined check for isSurfaced | Defensively correct |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: Phase 1 is the first phase — no prior phases to regress against.

Full test suite regression check: **3280 tests passed, 0 failures** (via `just fft`).

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity

| Check | Result | Severity |
|-------|--------|----------|
| Scope guard (diff ↔ task table) | ✅ Perfect 1:1 match — 15 code/test files | PASS |
| Task ↔ Log links | ✅ All 12 tasks have log entries with Dossier Task + Plan Task IDs | PASS |
| Task ↔ Footnote links | ⚠️ Footnote stubs empty; plan ledger has placeholders | MEDIUM |
| Footnote ↔ File links | ⚠️ 3 cross-plan source files lack footnotes | MEDIUM |
| Plan progress tracking | ⚠️ Phase 1 not marked complete in plan checklist | MEDIUM |

**Graph Integrity Score**: ⚠️ MINOR_ISSUES (0 high/critical graph violations; 3 medium bookkeeping gaps)

#### Authority Conflicts

No conflicts detected. Plan and dossier are in agreement on all completed statuses.

#### TDD Compliance

**TDD-001 (HIGH)**: The accessor RED phase was effectively skipped. The builder function in T007 naturally produces all accessor fields (readyNodeIds, currentLineIndex, isComplete, etc.) as part of its return value — they are plain readonly properties, not computed getters. When T008 wrote accessor tests (intended as RED), they passed immediately because T007 had already populated these fields. T009 logged "Accessors already implemented in builder (T007)" — the task was a no-op.

**Root cause**: The `PositionalGraphReality` interface defines accessors as plain readonly fields, not computed properties. The builder must populate them at construction time. This makes builder + accessor tasks inseparable.

**Severity justification**: HIGH because TDD order is a core doctrine requirement. However, the code is correct and all tests pass — this is a process observation, not a code defect.

**Fix**: Log as an acceptable deviation for Phase 1. In future plans, merge builder+accessor tasks when the return type makes them inseparable.

**TDD-002 (MEDIUM)**: The dossier (T006, T008, T010) specifies "5-field Test Doc on each `it()`" but only a single file-level Test Doc block exists at the top of reality.test.ts. The file-level block is high quality and covers all 5 required fields. The plan says "Every test file includes the 5-field Test Doc comment block" — which the file-level block satisfies. The dossier is more specific ("on each it()") and was not followed.

**Fix**: Either add per-test blocks or update the dossier to reflect file-level convention (which is sufficient for a single-file test suite).

#### Mock Usage

✅ **CLEAN** — zero vi.mock/jest.mock usage. Tests construct plain objects directly (GraphStatusResult, State, NodeStatusResult) as pure function inputs. Fully compliant with "Fakes over mocks" policy.

---

### E.2) Semantic Analysis

No semantic issues detected. Implementation correctly follows Workshop #1 specifications with all 5 DYK clarifications applied:

| DYK | Decision | Implementation |
|-----|----------|----------------|
| DYK-I1 | Skip phantom `inferUnitType()` | ✅ Builder reads `NodeStatusResult.unitType` directly |
| DYK-I2 | Normalize options `string[]` → `{ key, label }[]` | ✅ Builder maps `s → { key: s, label: s }` |
| DYK-I3 | `currentLineIndex = lines.length` when all complete | ✅ Past-the-end sentinel implemented |
| DYK-I4 | Skip top-level Zod schema | ✅ Only leaf schemas defined |
| DYK-I5 | `unitType` required (not optional) | ✅ Required on both `NarrowWorkUnit` and `NodeStatusResult` |

---

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 5)
**Verdict: APPROVE**

All 5 findings are LOW severity observations confirming the code is correct:

1. **QUAL-001**: `unitType` fallback to `'agent'` — safe; `readyDetail.unitFound` catches missing units upstream
2. **QUAL-002**: `getLeftNeighbor` index safety — invariant maintained by builder construction
3. **QUAL-003**: O(n) linear scans in view — acceptable for expected graph sizes (<20 lines)
4. **QUAL-004**: Options normalization assumes strings — Zod schema guarantees `string[]` at boundary
5. **QUAL-005**: Double null/undefined check — defensively correct, explicit intent

---

### E.4) Doctrine Evolution Recommendations

**Advisory — does not affect verdict.**

| Category | Recommendation | Priority | Evidence |
|----------|---------------|----------|----------|
| Idiom | Result type pattern: builder returns readonly interfaces with `ReadonlyMap` for collection fields | MEDIUM | reality.types.ts — consistent use of `readonly` + `ReadonlyMap` |
| Idiom | Normalization at builder boundary: convert external formats (string[]) to internal formats ({ key, label }[]) | LOW | reality.builder.ts:83 — options normalization |
| Rule | Pure function builders should not have side effects or I/O | MEDIUM | reality.builder.ts — exemplary pure function |
| Architecture | Feature folder 030-orchestration follows PlanPak convention with barrel index | LOW | index.ts — clean re-exports |

---

## F) Coverage Map

**Testing Approach**: Full TDD
**Total Tests**: 47 (12 builder + 10 accessor + 25 view)

| AC | Description | Test Coverage | Confidence |
|----|-------------|---------------|------------|
| AC-1 | Snapshot captures full graph state | T006: empty graph, single-line, multi-line, mixed statuses, questions (3 states), pod sessions, line properties, readyDetail | 100% — explicit behavioral tests |
| AC-14 (P1) | InputPack included in snapshot | T006: "preserves InputPack on NodeReality" — full InputPack with sources and data | 100% — explicit test |
| (implicit) | Pre-computed accessors correct | T008: isComplete, isFailed, readyNodeIds, currentLineIndex (DYK-I3), pendingQuestions, totalNodes/completedCount, waitingQuestionNodeIds, blockedNodeIds, completedNodeIds | 100% — 10 explicit tests |
| (implicit) | View lookups correct | T010: getNode, getLine, getLineByIndex, getNodesByLine, getLeftNeighbor, getFirstAgentOnPreviousLine, getQuestion, getPodSession, isFirstInLine, getCurrentLine | 100% — 25 explicit tests including edge cases |

**Overall Coverage Confidence**: 100% — all acceptance criteria have explicit, behavioral tests.

**Narrative tests**: None. All 47 tests map directly to specific behavioral requirements.

---

## G) Commands Executed

```bash
# Phase tests
pnpm test -- --reporter=verbose test/unit/positional-graph/features/030-orchestration/
# Result: 47 passed, 0 failed (8ms)

# Full quality gate
just fft
# Result: 3280 tests passed, 0 failures, no lint warnings (78s)
```

---

## H) Decision & Next Steps

**Decision**: APPROVE

**Required before merge**:
1. Run `plan-6a-update-progress` to:
   - Update plan task table (1.1-1.7) from `[ ]` to `[x]`
   - Update Phase 1 progress checklist from `- [ ] ... - Pending` to `- [x] ... - Complete`
   - Populate Change Footnotes Ledger [^1] and [^2] with cross-plan edit details
   - Populate Phase Footnote Stubs in tasks.md

**Recommended** (not blocking):
2. Consider adding per-test Test Doc blocks to match dossier specification, or update dossier to reflect file-level convention
3. Populate Discoveries & Learnings table in tasks.md with the 5 DYK insights

**Next phase**: After updating progress, proceed to `/plan-5-phase-tasks-and-brief` for Phase 2 (OrchestrationRequest Discriminated Union).

---

## I) Footnotes Audit

| Diff-Touched Path | Type | Footnote Tag(s) | Node-ID Link(s) |
|-------------------|------|-----------------|-----------------|
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | cross-plan edit | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/schemas/state.schema.ts` | cross-plan edit | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/services/positional-graph.service.ts` | cross-plan edit | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/index.ts` | plan-scoped (new) | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/reality.types.ts` | plan-scoped (new) | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/reality.schema.ts` | plan-scoped (new) | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/reality.builder.ts` | plan-scoped (new) | ❌ Missing | ❌ Missing |
| `packages/positional-graph/src/features/030-orchestration/reality.view.ts` | plan-scoped (new) | ❌ Missing | ❌ Missing |
| `test/unit/positional-graph/features/030-orchestration/reality.test.ts` | plan-scoped (new) | ❌ Missing | ❌ Missing |
| `test/unit/positional-graph/test-helpers.ts` | test update | N/A (derivative) | N/A |
| `test/unit/positional-graph/can-run.test.ts` | test update | N/A (derivative) | N/A |
| `test/unit/positional-graph/collate-inputs.test.ts` | test update | N/A (derivative) | N/A |
| `test/unit/positional-graph/input-retrieval.test.ts` | test update | N/A (derivative) | N/A |
| `test/unit/positional-graph/input-wiring.test.ts` | test update | N/A (derivative) | N/A |
| `test/unit/positional-graph/status.test.ts` | test update | N/A (derivative) | N/A |

**Note**: All footnotes are missing because `plan-6a-update-progress` was not run during implementation. This is a bookkeeping gap, not a code issue.
