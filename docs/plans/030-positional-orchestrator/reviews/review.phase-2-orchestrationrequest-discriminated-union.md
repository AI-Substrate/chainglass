# Code Review: Phase 2 — OrchestrationRequest Discriminated Union

**Plan**: positional-orchestrator-plan.md
**Phase**: Phase 2: OrchestrationRequest Discriminated Union
**Dossier**: tasks/phase-2-orchestrationrequest-discriminated-union/tasks.md
**Reviewer**: plan-7-code-review
**Date**: 2026-02-06
**Diff Range**: Uncommitted changes vs HEAD (`bedb67a`)

---

## A) Verdict

**APPROVE**

No CRITICAL or HIGH findings in code quality/safety. All graph integrity issues are MEDIUM (documentation link hygiene). Implementation is correct, well-structured, and faithfully follows Workshop #2.

---

## B) Summary

Phase 2 delivers a clean 4-variant discriminated union `OrchestrationRequest` with Zod schemas, type guards, and exhaustive type checking. All 37 tests pass. No Phase 1 regression (84/84 tests pass). Build succeeds (7/7 packages). The implementation correctly resolves the plan/workshop discrepancy on NoActionReason values (4 per workshop, not 5 per plan). Code follows ADR-0003 (Zod-first), PlanPak placement, and kebab-case naming. Footnotes ledger is populated with valid FlowSpace node IDs. Minor documentation link hygiene issues in dossier task table (missing inline footnote refs).

---

## C) Checklist

**Testing Approach: Full TDD**
**Mock Usage: Fakes over mocks (no vi.mock/jest.mock)**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence) — T003 RED before T004 GREEN documented in exec log
- [x] Tests as docs (assertions show behavior) — 5-field Test Doc present, assertions document schema contracts
- [x] Mock usage matches spec: Avoid mocks — zero mock usage, all tests use real Zod schemas and type guards
- [x] Negative/edge cases covered — strict mode rejection, empty nodeId, invalid graphSlug, boolean defaultValue, undefined answer (DYK-I8)
- [x] BridgeContext patterns followed — N/A (pure data types, no VS Code extension code)
- [x] Only in-scope files changed — 5 source/test files + plan artifact, all in task table
- [x] Linters/type checks are clean — `just fft` clean at 3317 tests
- [x] Absolute paths used — N/A (no file I/O in this phase)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LINK-001 | MEDIUM | dossier tasks.md:294-302 | Dossier task Notes column lacks `[^N]` footnote references | Add footnote refs to Notes column |
| LINK-002 | MEDIUM | exec log / dossier | Log metadata has labels but no markdown backlinks to source docs | Add markdown links to log metadata |
| PLAN-001 | MEDIUM | plan.md:395 | Plan task 2.5 success criteria lists 5 NoActionReasons but implementation uses 4 per workshop | Update plan 2.5 criteria to match workshop (4 values) |
| QS-001 | MEDIUM | schema.ts:33-38 | InputPack uses loose inline schema (`z.record(z.unknown())`) instead of real InputEntry structure | Document as intentional loose boundary or create InputPackSchema |
| QS-002 | LOW | schema.ts:33,47,63,77 | graphSlug regex allows trailing/consecutive hyphens | Consider tightening if not intentional |
| QS-003 | LOW | schema.ts:33,47,63,77 | No max-length on graphSlug/string fields | Add `.max()` for defensive hardening |
| QS-004 | LOW | schema.ts:66 | `options` allows empty array for single/multi question types | Consider `.min(1)` on options array |
| QS-005 | LOW | schema.ts:58-69 | No cross-field validation: single/multi don't require options | Consider `.refine()` for questionType↔options coupling |
| QS-006 | LOW | test.ts:97-109 | Missing graphSlug regex boundary tests (trailing/consecutive hyphens) | Add edge case tests |
| QS-007 | LOW | test.ts:120-129 | No test for answer accepting complex types (object, array, number, null) | Add varied answer type tests |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Result**: PASS — No regressions detected.

- Phase 1 tests (47): All pass
- Phase 2 tests (37): All pass
- Combined (84): All pass
- Build: 7/7 packages successful (all cached)
- No interface/contract changes to Phase 1 deliverables
- `ExecutionStatus` import from Phase 1 verified working

### E.1) Doctrine & Testing Compliance

#### Graph Integrity

**Graph Integrity: ⚠️ MINOR_ISSUES**

| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| LINK-001 | MEDIUM | Task↔Footnote | Dossier task Notes column lacks `[^N]` inline references | Each task Notes should have `[^N]` | Run plan-6a --sync-footnotes | Cannot navigate from dossier task to footnote directly |
| LINK-002 | MEDIUM | Task↔Log | Log entries have metadata labels but no markdown links | `**Dossier Task**: [T001](../tasks.md#t001)` format | Add markdown links to log entries | Navigation requires manual search |

**Positive findings:**
- Plan task table: All 6 tasks have `[📋]` log links and `[^N]` footnote refs ✅
- Dossier Phase Footnote Stubs: All 5 stubs match plan ledger content ✅
- Plan Change Footnotes Ledger: 5 sequential footnotes, no gaps ✅
- Footnote↔File: 11/11 node IDs valid, all files exist, all functions verified ✅
- Plan↔Dossier status: All tasks [x] in both tables ✅

#### Authority Conflicts

**No conflicts.** Plan § 12 and dossier Phase Footnote Stubs are synchronized ([^1]-[^5] match in both locations).

#### TDD Compliance

**PASS** — Full TDD cycle documented:
- T003 (RED): Tests written, guards not yet implemented → expected import failure
- T004 (GREEN): Guards implemented → 37 tests pass
- T005: NoActionReason tests combined in T003 file for cohesion
- T007 (REFACTOR): Biome formatting fixes, barrel update, `just fft` clean

#### Mock Usage Compliance

**PASS** — Zero mock usage. All tests use real Zod schemas, real type guard functions, real fixture objects. No `vi.mock`, `jest.mock`, `sinon`, or any mock framework detected. Fully aligned with "Fakes over mocks" policy.

### E.2) Semantic Analysis

**PASS** — Implementation faithfully follows Workshop #2 design.

**Verified alignments:**
- 4 variant types match exactly: `start-node`, `resume-node`, `question-pending`, `no-action`
- All field names, types, and optionality match Workshop #2 lines 124-295
- `NoActionReason`: Correctly uses 4 values from Workshop #2, NOT 5 from plan task 2.5
- `OrchestrationExecuteResult`: Named differently from Workshop's `OrchestrationResult` — deliberate disambiguation per dossier (avoids Phase 7 collision)
- `InputPack` inline schema follows `reality.schema.ts:107-110` precedent

**PLAN-001 (MEDIUM)**: Plan task 2.5 success criteria says "Tests cover all `NoActionReason` values: `graph-complete`, `graph-failed`, `all-running`, `all-waiting`, `empty-graph`" — but workshop is authoritative and specifies 4 values only. Implementation correctly follows workshop. Plan criteria text should be updated.

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 1, LOW: 5)
**Verdict: APPROVE**

#### Correctness
No logic defects found. Type guards are simple and correct (`req.type === 'literal'`). `isNodeLevelRequest` correctly uses `!== 'no-action'`. `getNodeId` correctly delegates to `isNodeLevelRequest`. Exhaustive switch compiles and runs.

#### Security
No vulnerabilities. Pure data types with no I/O, no file access, no network calls. Zod `.strict()` rejects extra properties, preventing injection of unexpected fields.

#### Performance
No concerns. Zod schema creation is module-level (singleton). Parse calls are O(1) for field validation. Type guards are O(1) string comparisons.

#### Observability
N/A — Phase 2 is pure data types with no runtime behavior to observe. Logging/metrics responsibility falls on consumers (ONBAS, ODS).

#### QS-001 (MEDIUM): Loose InputPack Schema
The `inputs` field in `StartNodeRequestSchema` uses `z.object({ inputs: z.record(z.unknown()), ok: z.boolean() })` instead of the real `InputPack` structure (`Record<string, InputEntry>` where `InputEntry` has `status` + `detail` fields). This is documented as intentional per the dossier: "InputPack comes from existing service output and is already validated at source." The workshop references a non-existent `./input.schema.js` import. The inline schema is a pragmatic resolution.

**Recommendation**: Add a code comment noting the intentional loose boundary, or create `InputPackSchema` in a future phase when the full structure is needed.

### E.4) Doctrine Evolution Recommendations (Advisory)

No new ADR, rules, or idioms candidates identified. Phase 2 is a pure data definition phase with no novel patterns beyond what's already documented in ADR-0003 (Zod-first schemas).

**Positive alignment:**
- ADR-0003 (Zod schemas as source of truth): Correctly applied — all types via `z.infer<>`
- PlanPak: All files in `features/030-orchestration/` feature folder
- Constitution: Kebab-case naming, 5-field Test Doc

---

## F) Coverage Map

| Acceptance Criterion | Test(s) | Confidence |
|---------------------|---------|------------|
| AC-2: 4-type discriminated union with exhaustive checking | `Exhaustive type checking > switch covers all 4 types` (line 305-328) | 100% — explicit exhaustive `never` check |
| Each variant self-contained (ODS needs no lookups) | `Schema: StartNodeRequest parses valid data` + 3 variant parse tests | 75% — behavioral match, no explicit AC-ID in test name |
| Type guards correct for all variants | `isStartNodeRequest > returns true/false` × 4 guards + `isNodeLevelRequest` + `getNodeId` (lines 226-297) | 100% — explicit guard test per variant |
| `just fft` clean | Execution log T007 evidence: 3317 tests, 0 failures | 100% — explicit evidence |
| NoActionReason values (4 per workshop) | `NoActionReason > parses valid reason` × 4 + `rejects invalid reason value` (lines 334-365) | 100% — explicit per-value coverage |
| Schema strict mode rejects extras | 4 tests: `rejects extra properties (strict mode)` per variant (lines 97, 127, 163, 194) | 100% — explicit per-variant |
| Zod discriminated union rejects unknown type | `OrchestrationRequestSchema > rejects unknown type value` (line 207) | 100% — explicit |

**Overall Coverage Confidence: 96%** (one criterion at 75%, rest at 100%)

**Narrative tests**: None detected — all tests map to specific acceptance criteria or workshop design elements.

---

## G) Commands Executed

```bash
# Phase 2 tests
pnpm vitest run test/unit/positional-graph/features/030-orchestration/orchestration-request.test.ts
# Result: 37 passed, 0 failed

# Cross-phase regression (Phase 1 + Phase 2)
pnpm vitest run test/unit/positional-graph/features/030-orchestration/
# Result: 84 passed (47 Phase 1 + 37 Phase 2), 0 failed

# Build check
pnpm build
# Result: 7 successful, 7 total (all cached)
```

---

## H) Decision & Next Steps

**Decision**: APPROVE — Phase 2 implementation is correct, well-tested, and follows all plan/workshop/ADR constraints.

**Recommended (non-blocking) improvements before commit:**

1. **PLAN-001**: Update plan task 2.5 success criteria to say "4 values" not "5 values" (reflects workshop authority). The current text lists `all-running` and `empty-graph` which were correctly excluded from implementation.

2. **LINK-001**: Add `[^N]` footnote references to dossier task Notes column for graph traversability (run `plan-6a --sync-footnotes`).

3. **QS-001**: Add a code comment in `orchestration-request.schema.ts` at line 35 noting that InputPack schema is intentionally loose (validated at source).

**Next**: Commit Phase 2 changes, then advance to Phase 3 (AgentContextService) via `/plan-5`.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote(s) | Node IDs in Ledger |
|-------------------|-------------|--------------------|
| `orchestration-request.schema.ts` | [^1] | `file:packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.ts` |
| `orchestration-request.types.ts` | [^1], [^4] | `file:packages/positional-graph/src/features/030-orchestration/orchestration-request.types.ts` |
| `orchestration-request.test.ts` | [^2] | `file:test/unit/positional-graph/features/030-orchestration/orchestration-request.test.ts` |
| `orchestration-request.guards.ts` | [^3] | 6× `function:...orchestration-request.guards.ts:{name}` |
| `index.ts` | [^5] | `file:packages/positional-graph/src/features/030-orchestration/index.ts` |

**All diff-touched files have corresponding footnotes.** Footnote numbering is sequential ([^1]-[^5]), no gaps or duplicates. All 11 node IDs resolve to existing files/functions.
