# Code Review: Phase 3 — AgentContextService

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 3: AgentContextService
**Dossier**: tasks/phase-3-agentcontextservice/tasks.md
**Reviewer**: plan-7-code-review
**Date**: 2026-02-06

---

## A) Verdict

**APPROVE**

Zero CRITICAL or HIGH findings. All acceptance criteria met. Implementation is a faithful, well-tested pure function utility following Full TDD with fakes over mocks.

---

## B) Summary

Phase 3 delivers `getContextSource()` — a pure function implementing 5 positional context-inheritance rules — plus Zod schemas, type guards, an interface, a class wrapper, and a fake. All 14 tests pass (6 core rules + 8 edge cases). The algorithm correctly walks all previous lines (DYK-I10) and walks left past non-agents (DYK-I13). TDD order is confirmed: T003 (RED) preceded T004 (GREEN). Zero mocks used; test fixtures construct real `PositionalGraphReality` objects. `just fft` clean (3331 tests, lint/format pass). No scope creep — all files within `features/030-orchestration/` per PlanPak.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior via type guards + `fromNodeId` + `reason.length`)
- [x] Mock usage matches spec: Avoid (zero `vi.mock`/`jest.mock`; real fixtures throughout)
- [x] Negative/edge cases covered (8 edge case tests in T005)
- [x] BridgeContext patterns followed — N/A (pure function, no VS Code APIs)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean (`just fft` passes)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| DOC-001 | MEDIUM | plan.md:414,430 | Plan text says `sourceNodeId` but implementation (and workshop) uses `fromNodeId` | Update plan lines 414 and 430 to say `fromNodeId` |
| LINK-001 | MEDIUM | tasks.md:199-207 | Dossier task table Notes column has no log anchor links back to execution.log.md | Add `[log](execution.log.md#task-tNNN)` references to Notes column |
| DOC-002 | LOW | tasks.md:449-453 | Ready Check boxes still unchecked `[ ]` after implementation | Check boxes to confirm pre-implementation audit was done |
| DOC-003 | LOW | execution.log.md | No explicit REFACTOR step label in execution log; T007 auto-format serves as refactor but isn't labeled | Consider labeling T007 as REFACTOR step for traceability |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Verdict: PASS**

Phase 3 creates 4 new files and modifies `index.ts` (barrel exports only). No existing Phase 1 or Phase 2 files were modified. All 3331 tests pass, including all Phase 1 (47 tests) and Phase 2 (37 tests) tests. No contract changes to upstream interfaces. No regression risk.

| Check | Result |
|-------|--------|
| Tests rerun | 3331 passed, 0 failed |
| Contracts broken | 0 |
| Integration points | No shared interfaces modified |
| Backward compatibility | Additive-only changes (new exports) |

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Step 3a)

**Graph Integrity Score: ⚠️ MINOR_ISSUES**

| Validator | Result | Issues |
|-----------|--------|--------|
| Task↔Log | ⚠️ | Log→Task metadata complete (all 7 entries have `Dossier Task` + `Plan Task`). Task→Log links missing in dossier Notes column. |
| Task↔Footnote | ✅ | Plan Notes column has [^6]-[^10]. Dossier Phase Footnote Stubs populated. Sequential numbering correct. |
| Footnote↔File | ✅ | All 5 footnotes point to existing files/symbols. Node ID format correct. All symbols verified. |
| Plan↔Dossier | ✅ | Task mapping correct (3.1→T001+T002, etc.). All statuses [x] match. Plan Log column has [📋] links. |
| Parent↔Subtask | ✅ | No subtasks in this phase. N/A. |

**LINK-001 (MEDIUM)**: Dossier task table Notes column lacks reciprocal log anchor links. Execution log has metadata pointing back to tasks, but tasks don't link forward to log entries. This is a minor navigability gap, not a data integrity break.

#### Authority Conflicts (Step 3c)

**No conflicts.** Plan footnotes [^6]-[^10] match dossier Phase Footnote Stubs. Content synchronized.

#### TDD Compliance

**Compliance: PASS (A-)**

- **TDD order confirmed**: T003 (tests RED — `Cannot find module`) → T004 (implementation GREEN — 6 tests pass)
- **Edge cases**: T005 added 8 more tests, all passed immediately (implementation already handled them)
- **Test Doc block**: All 5 required fields present (Why, Contract, Usage Notes, Quality Contribution, Worked Example)
- **TDD cycle deviation**: Plan prescribes interface → fake → tests-against-fake → implement → contract-tests. Phase 3 adapted: interface → tests-against-real (RED) → implement (GREEN) → edge cases → fake. This is justified — the dossier Non-Goals explicitly notes "pure function has no real/fake parity concern." The fake is an escape hatch, not a test double.

#### Mock Usage

**Compliance: PASS (A)**

Zero mock framework usage. Test file uses `makeNode()`, `makeLine()`, `makeReality()` helper functions to construct real `PositionalGraphReality` objects as plain data with `ReadonlyMap`. Full alignment with "fakes over mocks" policy.

### E.2) Semantic Analysis

**Domain Logic Correctness: PASS**

All 5 context rules implemented exactly per Workshop #3 specification:

| Rule | Spec | Implementation | Verdict |
|------|------|----------------|---------|
| Rule 0 | Non-agent → not-applicable | `node.unitType !== 'agent'` check (line 43) | ✅ Correct |
| noContext | Override → new before positional rules | `'noContext' in node` guard (line 52) | ✅ Correct, forward-compatible |
| Rule 1 | First agent on line 0 → new | `lineIndex === 0 && positionInLine === 0` (line 60) | ✅ Correct |
| Rule 2 | First on line N>0 → walk ALL prev lines | `for (i = lineIndex-1; i >= 0; i--)` (line 69) | ✅ Correct |
| Rule 3 | Parallel → new | `node.execution === 'parallel'` (line 90) | ✅ Correct |
| Rule 4 | Serial not-first → walk left | `for (pos = positionInLine-1; pos >= 0; pos--)` (line 100) | ✅ Correct |

**Edge case verified**: Agent at `(lineIndex=0, positionInLine=1)` correctly falls through Rule 1 (pos≠0), skips Rule 2 (line=0), evaluates Rule 3/4 as expected.

**DOC-001 (MEDIUM)**: Plan text at lines 414 and 430 references `sourceNodeId` field, but implementation (and Workshop #3) uses `fromNodeId`. The workshop is the authoritative source for field naming. Plan text should be updated for consistency.

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 4)
**Verdict: APPROVE**

#### Correctness

No logic defects found. Algorithm order is correct (Rule 0 → noContext → Rule 1 → Rule 2 → Rule 3 → Rule 4 → fallthrough). Walk-back loops are bounded and terminating. All View method return values checked for null/undefined.

#### Security

No security concerns — pure function with no I/O, no user input processing, no file system access, no network calls.

#### Performance

No concerns. Walk-back loops are bounded by graph size (small — typically <20 lines, <50 nodes). View construction is O(1) (wraps existing data). No unbounded allocations.

#### Observability

Not applicable — pure function with no logging, metrics, or side effects. Observability is via `reason` strings on every result (human-readable).

### E.4) Doctrine Evolution Recommendations (Advisory)

**No new ADRs, rules, or idioms recommended.**

Phase 3 follows existing patterns faithfully:
- ✅ Zod-first derivation per ADR-0003
- ✅ `.strict()` on all schemas
- ✅ Separate `.schema.ts` / `.types.ts` file structure
- ✅ Type guards as standalone exported functions
- ✅ Pure function with class wrapper pattern
- ✅ Fake with override map + history + reset pattern

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 0 | 0 | 0 |
| Idioms | 0 | 0 | 0 |
| Architecture | 0 | 0 | 0 |

**Positive Alignment**: The `getContextSource()` bare-function-plus-thin-class-wrapper pattern (DYK-I9) is a clean idiom that could be formalized, but it's already documented in the workshop and dossier.

---

## F) Coverage Map

**Overall Coverage Confidence: 85%**

| Acceptance Criterion | Test(s) | Confidence | Notes |
|---------------------|---------|------------|-------|
| AC-5: Non-agent → not-applicable | `Rule 0: code node`, `Rule 0: user-input node` | 100% | Explicit tests for both non-agent types |
| AC-5: First on line 0 → new | `Rule 1: first agent on line 0` | 100% | Direct test |
| AC-5: Cross-line → inherit | `Rule 2: inherits from previous line`, `walk-back skips non-agent lines`, `no agent on any previous line` | 100% | Core + 2 edge cases |
| AC-5: Parallel → new | `Rule 3: parallel agent` | 100% | Direct test |
| AC-5: Serial → inherit from left | `Rule 4: left agent neighbor`, `walks past code`, `walks past user-input`, `inherits from parallel`, `no agent left` | 100% | Core + 4 edge cases |
| AC-5: Every result has reason | `Reason strings: all variants` | 75% | Behavioral match but no explicit criterion ID in test name |
| AC-5: Pure function | N/A (structural) | 50% | Verified by code inspection, not test assertion |
| AC-5: `just fft` clean | T007 evidence | 100% | 3331 tests, 0 failures |

**Narrative tests**: The "Reason strings" test at the end of the test file validates all 3 variants in a single test. It's a behavioral match but could benefit from explicit criterion ID in the test name.

---

## G) Commands Executed

```bash
# Phase 3 unit tests
pnpm vitest run test/unit/positional-graph/features/030-orchestration/agent-context.test.ts
# Result: 14 passed (14)

# Full verification
just fft
# Result: 3331 tests passed, 0 failures, lint + format clean
```

---

## H) Decision & Next Steps

**Verdict: APPROVE**

No blocking issues. The 2 MEDIUM findings are documentation-only and do not affect code correctness or behavior.

**Recommended follow-ups (non-blocking)**:
1. Update plan lines 414 and 430: `sourceNodeId` → `fromNodeId` (DOC-001)
2. Add log anchor links to dossier task table Notes column (LINK-001)
3. Check Ready Check boxes in dossier (DOC-002)

**Next phase**: Phase 4 (WorkUnitPods and PodManager) — run `/plan-5-phase-tasks-and-brief --phase "Phase 4: WorkUnitPods and PodManager"`

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote(s) | Node ID(s) in Plan Ledger |
|-------------------|-------------|---------------------------|
| `packages/positional-graph/src/features/030-orchestration/agent-context.schema.ts` | [^6] | `file:packages/positional-graph/src/features/030-orchestration/agent-context.schema.ts` |
| `packages/positional-graph/src/features/030-orchestration/agent-context.types.ts` | [^6] | `file:packages/positional-graph/src/features/030-orchestration/agent-context.types.ts` |
| `packages/positional-graph/src/features/030-orchestration/agent-context.ts` | [^8] | `function:...agent-context.ts:getContextSource`, `class:...agent-context.ts:AgentContextService` |
| `packages/positional-graph/src/features/030-orchestration/fake-agent-context.ts` | [^9] | `class:...fake-agent-context.ts:FakeAgentContextService` |
| `test/unit/positional-graph/features/030-orchestration/agent-context.test.ts` | [^7] | `file:test/unit/positional-graph/features/030-orchestration/agent-context.test.ts` |
| `packages/positional-graph/src/features/030-orchestration/index.ts` | [^10] | `file:packages/positional-graph/src/features/030-orchestration/index.ts` |

All 6 diff-touched files have corresponding footnotes. Footnote range [^6]-[^10] is sequential with no gaps. Next available footnote: [^11].
