# Code Review: Phase 3 — Graph Status View

**Plan**: 036-cli-orchestration-driver
**Phase**: Phase 3: Graph Status View
**Commit Range**: `ca992e6..355e522`
**Date**: 2026-02-17
**Testing Approach**: Full TDD (fakes over mocks)
**Mock Usage**: Avoid mocks (fakes only)

---

## A) Verdict

**APPROVE** ✅

Code quality is excellent. All 7 acceptance criteria met. All 20 tests pass. `just fft` clean. No CRITICAL/HIGH findings in code, security, or performance. ADR-0012 fully compliant. Graph integrity documentation gaps exist (footnotes not populated) but are administrative — fixable via `plan-6a` without code changes.

---

## B) Summary

Phase 3 delivers `formatGraphStatus()` — a pure function rendering graph progress as a compact, log-friendly string. Implementation is clean: 94 lines of source, 277 lines of tests (20 tests), and a 227-line gallery script with 11 visual scenarios. The function correctly maps 8 `ExecutionStatus` values to 6 glyphs, handles serial/parallel separators, and produces accurate progress lines. No domain boundary violations (ADR-0012). No regressions in Phase 1/2 tests (27/27 passing). The only substantive findings are: (1) footnotes/log links not populated by plan-6a, and (2) TDD phasing was collapsed from 3 RED→GREEN cycles to 2.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN evidence in execution log)
- [x] Tests as docs (assertions show behavior, Test Doc block present with all 5 fields)
- [x] Mock usage matches spec: Avoid (zero vi.mock/jest.mock, fakes only)
- [x] Negative/edge cases covered (7 edge cases including empty graph, missing node)
- [x] Only in-scope files changed (minor: package barrel not in dossier paths — justified)
- [x] Linters/type checks clean (`just fft` exit 0)
- [x] Absolute paths used (no hidden context)
- [ ] BridgeContext patterns followed — N/A (no VS Code extension code)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| LINK-001 | HIGH | execution.log.md:all | Missing Dossier Task / Plan Task metadata in log entries | Run plan-6a to add metadata blocks |
| LINK-002 | HIGH | tasks.md:179-182 | No log anchor references in task Notes columns | Run plan-6a to add log links |
| FN-001 | HIGH | plan.md:544-545 | Change Footnotes Ledger still placeholder text | Run plan-6a to populate footnotes |
| FN-002 | HIGH | tasks.md:315-317 | Phase Footnote Stubs table completely empty | Run plan-6a to populate stubs |
| TDD-001 | MEDIUM | execution.log.md | T001+T003 collapsed: all 20 tests written in T001 instead of T001(core)+T003(edge) | Document deviation in log |
| SCOPE-001 | LOW | packages/.../src/index.ts | Package barrel modified but not listed in T004 Absolute Path(s) | Add to dossier post-hoc |
| C1 | LOW | reality.format.ts:55,65 | Redundant Map.get() — same nodeId fetched twice | Use existing `node` variable |
| C2 | LOW | reality.format.ts:65-67 | Missing node defaults to serial separator implicitly | Add clarifying comment |
| C3 | LOW | reality.format.ts:80 | Empty line (nodeIds=[]) renders as `"Line N: "` with trailing space | Skip or label empty lines |
| O1 | LOW | graph-status-format.test.ts | No test for standalone `status: 'ready'` (only `pending+ready:true` tested) | Add test for `ready` status value |
| O2 | LOW | graph-status-format.test.ts | No test for `default` branch in getGlyph (❓ fallback) | Add test with invalid status cast |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Result**: ✅ PASS — No regressions detected.

| Prior Phase | Tests | Result |
|-------------|-------|--------|
| Phase 2 (Prompt Templates) | 7/7 | ✅ All passing |
| Phase 3 (Graph Status View) | 20/20 | ✅ All passing |

No contract violations, no integration point breakage, no backward compatibility issues. Phase 3 is additive-only (new files + barrel exports).

### E.1) Doctrine & Testing Compliance

#### Graph Integrity — ❌ BROKEN (documentation only)

**Link Validation** (Task↔Log, Task↔Footnote, Footnote↔File):

| Link Type | Status | Issue |
|-----------|--------|-------|
| Task↔Log | ❌ | No log anchors in dossier Notes; no Dossier Task/Plan Task metadata in log |
| Task↔Footnote | ❌ | No [^N] citations in any task Notes column |
| Footnote↔File | ❌ | Plan ledger has placeholder text; dossier stubs empty |
| Plan↔Dossier | ✅ | Plan task statuses match dossier (all [x]) |

**Root cause**: `plan-6a` was not run during implementation to populate footnotes and add bidirectional links.

**Fix**: Run `plan-6a --phase "Phase 3: Graph Status View"` to sync all links and footnotes.

#### Authority Conflicts — N/A

No conflicts between plan and dossier content (both align on task descriptions and statuses). Only gap is the unpopulated footnote infrastructure.

#### TDD Compliance — ⚠️ MINOR

- **TDD-001** (MEDIUM): Execution log shows T001 wrote all 20 tests (core + edge) in one step, then T002+T003 went GREEN together. The dossier prescribed 3 distinct RED→GREEN cycles. Tests are comprehensive and correct — the deviation is procedural, not qualitative.
- Mock usage: ✅ Zero mocks. All fixtures via `buildFakeReality()`.
- ADR-0012: ✅ Single import from `reality.types.js`. No event/agent/pod leakage.

### E.2) Semantic Analysis

**No findings.** Implementation correctly maps all 8 `ExecutionStatus` values to 6 glyphs per the dossier glyph table. Separator logic correctly uses the right node's `execution` field. Progress counting correctly uses `completedCount`, `totalNodes`, and `blockedNodeIds.length`. All behaviors match spec requirements.

### E.3) Quality & Safety Analysis

**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 5)

**Correctness**: No logic defects. Pure function with no state mutation. Three LOW cosmetic items (C1-C3).

**Security**: No vulnerabilities. Pure function on typed internal data → plain string. No interpolation, injection, or untrusted input risks.

**Performance**: No issues. Linear iteration over `lines × nodes` with O(1) Map lookups. String array + join pattern is optimal.

**Observability**: Two LOW test coverage gaps (O1: standalone `ready` status, O2: `default` ❓ fallback). Both code paths exist and are correct; they lack dedicated test assertions.

### E.4) Doctrine Evolution Recommendations (Advisory)

**Positive Alignment**:
- ADR-0012 (Workflow Domain Boundaries): Implementation correctly follows — zero cross-domain imports.
- "Fakes over mocks" policy: Exemplary usage of `buildFakeReality()` throughout.

**No new ADRs, rules, or idioms recommended.** Phase 3 is a small, well-scoped pure function that follows all existing patterns.

---

## F) Coverage Map

| AC | Description | Test Coverage | Confidence |
|----|-------------|--------------|------------|
| AC-P3-1 | Pure function: `PositionalGraphReality` → `string` | `formatGraphStatus` signature, 20 tests exercise it | 100% |
| AC-P3-2 | All 6 status glyphs | 8 glyph tests (lines 33-101) cover all statuses | 90% (missing standalone `ready`) |
| AC-P3-3 | Serial `→` and parallel `│` separators | Tests at lines 103-129 | 100% |
| AC-P3-4 | Progress line N/M + failure count | Tests at lines 131-159, edge cases 188-217 | 100% |
| AC-P3-5 | No event-domain leaks | Import check: only `reality.types.js` | 100% |
| AC-P3-6 | Log-friendly: no ANSI | Test at line 161 with `\x1b[` check | 100% |
| AC-P3-7 | `just fft` clean | Exit code 0, 268 files passed, 3905 tests | 100% |

**Overall Coverage Confidence**: 99% — one minor gap (standalone `ready` status) in AC-P3-2.

---

## G) Commands Executed

```bash
# Diff computation
git diff ca992e6..355e522

# Quality gate
just fft  # exit 0

# Phase 2 regression
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/prompt-selection.test.ts  # 7/7

# Phase 3 tests
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/graph-status-format.test.ts  # 20/20
```

---

## H) Decision & Next Steps

**Verdict**: APPROVE ✅

The code is correct, complete, well-tested, and ADR-compliant. All acceptance criteria are met. No regressions.

**Recommended before merge** (non-blocking):
1. Run `plan-6a` to populate footnotes and add bidirectional log links
2. Add test for standalone `status: 'ready'` (O1) — takes ~30 seconds
3. Optionally address C1 (redundant Map.get) — cosmetic only

**Next phase**: Phase 4 (drive() Implementation) — restart at `/plan-5`.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Node-ID Links | Status |
|-------------------|-----------------|---------------|--------|
| `packages/.../030-orchestration/reality.format.ts` | — | — | ❌ No footnote |
| `test/.../graph-status-format.test.ts` | — | — | ❌ No footnote |
| `packages/.../030-orchestration/index.ts` | — | — | ❌ No footnote |
| `packages/.../src/index.ts` | — | — | ❌ No footnote |
| `scripts/graph-status-gallery.ts` | — | — | ❌ No footnote |

**Root cause**: `plan-6a` not run during Phase 3 implementation.
**Fix**: Run `plan-6a --phase "Phase 3: Graph Status View"` to populate all footnotes.
