# Code Review: Phase 5 — ONBAS Walk Algorithm

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 5: ONBAS Walk Algorithm
**Reviewed**: 2026-02-06
**Diff Range**: HEAD (fb5bea6) → working tree (uncommitted)
**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)
**Mock Usage**: Fakes over mocks (no vi.mock/jest.mock ever)

---

## A) Verdict

**APPROVE**

---

## B) Summary

Phase 5 delivers the ONBAS walk algorithm — a pure, synchronous, stateless function that walks a `PositionalGraphReality` and returns the next best `OrchestrationRequest`. The implementation is clean, correct, and well-tested with 45 tests covering all walk paths, 6 node statuses, 3 question sub-states, and 4 no-action reasons. TDD discipline was followed (batch-RED variant: all tests written before implementation). Zero mock framework calls. All files within scope. Graph integrity intact. `just fft` clean (228 files, 3429 tests).

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Fakes only (zero vi.mock/jest.mock/vi.fn/vi.spyOn)
- [x] Negative/edge cases covered
- [x] BridgeContext patterns followed (N/A — pure function, no VS Code APIs)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| OBS-001 | LOW | onbas.ts:117 | `questions.find()` is O(n) per waiting-question node | Accept — graphs have single-digit questions |
| OBS-002 | LOW | onbas.ts:180-191 | `diagnoseStuckLine` returns `all-waiting` for pending-only nodes | Accept — NoActionReason enum has no `pending-blocked` value |
| OBS-003 | INFO | onbas.test.ts | Batch-RED TDD style (42 tests at once, single GREEN) | Accept — RED-GREEN boundary is clear and documented |
| OBS-004 | INFO | onbas.test.ts:1-9 | File-level Test Doc (not per-it-block) | Accept — single-unit test file, per-it would be redundant |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Tests rerun**: `just fft` — 228 test files, 3429 tests, 0 failures.
**Contracts broken**: None. Phase 5 creates new files only; `index.ts` adds exports without modifying existing exports.
**Integration points**: Phase 5 consumes `PositionalGraphReality` (Phase 1) and `OrchestrationRequest` (Phase 2) as types only — no runtime integration changes.
**Backward compatibility**: All prior phase exports intact. No breaking changes.

**Verdict**: PASS

### E.1) Doctrine & Testing Compliance

**Graph Integrity**: ✅ INTACT (0 violations)

| Check | Result |
|-------|--------|
| Task↔Log links | All 4 log anchors resolve correctly |
| Task↔Footnote links | [^18]-[^21] present in both plan and dossier |
| Footnote↔File links | All FlowSpace node IDs resolve to existing files/symbols |
| Plan↔Dossier sync | All 9 tasks show [x] in both plan and dossier |
| Footnote numbering | Sequential [^18]-[^21], continues from [^17] |

**Authority Conflicts**: None. Plan §12 and dossier stubs are fully synchronized.

**TDD Compliance**: PASS
- Tests (T002-T006, T008) written before implementation (T007) — RED phase documented
- 42 tests fail with "Cannot find module" → T007 GREEN → 45 tests pass
- Batch-RED variant accepted for pure-function modules with well-specified contracts

**Mock Usage**: PASS — zero violations
- Only vitest imports: `describe, expect, it`
- FakeONBAS implements IONBAS interface
- buildFakeReality constructs real PositionalGraphReality objects

**Rules Compliance**: PASS
- R-CODE-002: PascalCase classes (IONBAS, ONBAS, FakeONBAS), camelCase functions, I-prefix, Fake-prefix ✓
- R-CODE-003: kebab-case files ✓
- R-TEST-002: Test Doc 5-field block present (file-level) ✓
- R-TEST-006: Tests in `test/unit/positional-graph/` ✓
- R-TEST-007: Zero mock framework calls ✓

### E.2) Semantic Analysis

**Domain logic correctness**: PASS
- Walk visits lines 0→N, nodes by position — AC-3 satisfied
- All 6 node statuses handled correctly in `visitNode` switch
- 3 question sub-states handled correctly: answered→resume-node, unsurfaced→question-pending, surfaced+unanswered→skip
- `transition-blocked` correctly gates subsequent line access
- Graph-level short circuits (isComplete, isFailed) checked before walk
- `diagnoseStuckLine` provides correct diagnostic reasons

**Algorithm accuracy**: PASS
- First-match semantics: walk returns immediately on first actionable node
- DYK-I1 handled: `question.options?.map((o) => o.label)` maps QuestionOption[] → string[]
- Defensive handling: missing nodes (`continue`), missing questions (`return null`), unknown statuses (`default: return null`)

**Specification drift**: None detected

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2)

| Category | Findings |
|----------|----------|
| Correctness | No defects found. All paths tested, all edge cases handled. |
| Security | Minimal surface — pure function, no I/O, no user-controlled interpolation. |
| Performance | `questions.find()` O(n) acceptable for real-world sizes (LOW). |
| Observability | Pure function by design — no logging appropriate (AC-4). |

### E.4) Doctrine Evolution Recommendations (Advisory)

| # | Pattern | Codify As | Priority | Evidence |
|---|---------|-----------|----------|----------|
| DE-1 | Pure function + thin class wrapper | R-ARCH-XXX | HIGH | Phase 3 (getContextSource+AgentContextService), Phase 5 (walkForNextAction+ONBAS) |
| DE-2 | buildFake* test fixture builder | R-TEST-XXX | MEDIUM | fake-onbas.ts: buildFakeReality() with partial overrides |
| DE-3 | Table-driven tests via it.each | R-TEST-XXX | LOW | onbas.test.ts: it.each(skipStatuses) |
| DE-4 | File-level Test Doc for single-unit files | R-TEST-002 clarification | MEDIUM | onbas.test.ts lines 1-9 |

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| Rules | 2 | 1 | 1 |
| Idioms | 1 | 0 | 0 |

---

## F) Coverage Map

| Acceptance Criterion | Test(s) | Confidence | Type |
|---------------------|---------|------------|------|
| AC-3: Walk visits lines 0→N, nodes by position | T003: 7 multi-line tests | 100% | Explicit |
| AC-3: Each status maps to correct action/skip | T002 (5), T004 (8), T005 (8), T006 (8) | 100% | Explicit |
| AC-4: Pure, synchronous, stateless | T008: 4 purity tests | 100% | Explicit |
| Question lifecycle (3 sub-states) | T004: 8 question tests | 100% | Explicit |
| `just fft` clean | T009 execution log | 100% | Explicit |

**Overall coverage confidence**: 100% — all criteria have explicit test mapping with clear behavioral assertions.
**Narrative tests**: 0 (all tests map directly to acceptance criteria).

---

## G) Commands Executed

```bash
# Test run (Phase 5 only)
pnpm vitest run test/unit/positional-graph/features/030-orchestration/onbas.test.ts
# Result: 45 tests passed (5ms)

# Full quality check
just fft
# Result: 228 test files passed, 3429 tests passed, 41 skipped
```

---

## H) Decision & Next Steps

**Verdict**: APPROVE — zero HIGH/CRITICAL findings, all gates pass.

**Next Steps**:
1. Commit Phase 5 changes
2. Proceed to Phase 6 planning (`/plan-5` for Phase 6: ODS Action Handlers)

**Doctrine Evolution** (optional follow-up):
- Consider codifying the "pure function + thin class wrapper" pattern (DE-1) as it's now proven across 2 phases
- Consider adding buildFake* builder convention to idioms.md (DE-2)

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote(s) | Node-ID Link(s) |
|-------------------|-------------|------------------|
| `onbas.types.ts` | [^18] | `file:...onbas.types.ts` |
| `fake-onbas.ts` | [^18] | `class:...fake-onbas.ts:FakeONBAS`, `function:...fake-onbas.ts:buildFakeReality` |
| `onbas.test.ts` | [^19] | `file:...onbas.test.ts` |
| `onbas.ts` | [^20] | `function:...onbas.ts:walkForNextAction`, `class:...onbas.ts:ONBAS` |
| `index.ts` | [^21] | `file:...index.ts` |

All diff-touched files have corresponding footnotes. All footnotes have valid FlowSpace node IDs. Numbering is sequential ([^18]-[^21]).
