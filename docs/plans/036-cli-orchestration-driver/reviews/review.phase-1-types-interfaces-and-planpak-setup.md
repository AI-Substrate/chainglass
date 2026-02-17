# Code Review: Phase 1 — Types, Interfaces, and PlanPak Setup

**Plan**: 036-cli-orchestration-driver
**Phase**: Phase 1: Types, Interfaces, and PlanPak Setup
**Reviewed**: 2026-02-17
**Diff Range**: Uncommitted changes vs HEAD (`f27ea69`)
**Testing Approach**: Full TDD (fakes over mocks)
**Mock Usage**: Avoid mocks

---

## A) Verdict

**REQUEST_CHANGES**

Code implementation is correct and clean. Graph integrity is broken — footnote system was never populated (plan-6a not run post-implementation). Must fix before merge.

---

## B) Summary

All 8 tasks (T001–T008) implemented correctly. DriveEvent is a proper discriminated union with exactly 4 orchestration-domain types per ADR-0012. FakeGraphOrchestration.drive() works with FIFO queue, call history tracking, and fail-fast on unconfigured state. GraphOrchestration.drive() stub throws clearly. All types are readonly. 4/4 tests pass. `tsc --noEmit` clean. No scope creep. No security or performance issues. PlanPak placement correct. The sole blocker is the missing footnote/provenance chain — zero `[^N]` references, empty footnote stubs, placeholder-only plan ledger.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log: T006 RED → T007 GREEN)
- [x] Tests as docs (assertions show behavior: configured result, FIFO order, history tracking, error throw)
- [x] Mock usage matches spec: Avoid mocks (zero vi.mock/jest.mock — uses real FakeGraphOrchestration)
- [x] Negative/edge cases covered (throws when unconfigured, FIFO last-repeats)

**Universal:**

- [ ] BridgeContext patterns followed — N/A (no VS Code extension code)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean (`tsc --noEmit` pass, biome lint pass per execution log)
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V4 | CRITICAL | tasks.md § Tasks table | Zero `[^N]` footnote references in any task Notes column | Run `plan-6a` to populate footnotes for all 5 cross-plan files |
| V5 | HIGH | tasks.md § Phase Footnote Stubs | Empty footnote stubs section despite phase completion | Populate after V4 is fixed |
| V6 | HIGH | plan.md § 12 Change Footnotes Ledger | Placeholder-only entries (`[To be added]`) never filled | Run `plan-6a` to populate with FlowSpace node IDs |
| V7 | HIGH | plan.md § 12 | Only 2 placeholder slots for 5 cross-plan-edited files | Add entries [^1]–[^5] (minimum) |
| V1 | MEDIUM | execution.log.md | Combined log entries (T002+T003, T004+T005) weaken 1:1 traceability | Split or add sub-anchors for each task ID |
| V3 | MEDIUM | execution.log.md | Log entries lack backlinks to dossier tasks | Add dossier task reference links |
| V8 | MEDIUM | plan.md § 12 | No FlowSpace node IDs in footnote chain | Include node IDs when populating ledger |
| V2 | LOW | tasks.md line 444 | `log#task-t006` shorthand is not a valid markdown anchor | Use full anchor path |
| IMP-1 | LOW | fake-drive.test.ts:18-19 | FakeGraphConfig imported via deep relative path but available from package root | Consider using `@chainglass/positional-graph` import |
| IMP-2 | INFO | T007 | FakeGraphConfig not extended with `driveResults?` — uses internal class state instead | Functionally equivalent, acceptable deviation |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**N/A** — Phase 1 is the first phase of this plan. No prior phases to regress against.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity — ❌ BROKEN

The footnote provenance chain is completely missing. `plan-6a-update-progress` was not run after implementation completed.

**Impact**: Cannot trace from a modified file back to the task that changed it. Breaks File→Task→Plan traversal required for auditing and future phase reviews.

**Violations**:

| ID | Severity | Link Type | Issue | Fix |
|----|----------|-----------|-------|-----|
| V4 | CRITICAL | Task↔Footnote | Zero `[^N]` in any task Notes column | Run `plan-6a --sync-footnotes` |
| V5 | HIGH | Footnote stubs | Phase Footnote Stubs table empty | Populate with entries matching `[^N]` refs |
| V6 | HIGH | Footnote↔File | Plan § 12 has unfilled placeholder entries | Replace with actual file references + node IDs |
| V7 | HIGH | Footnote↔File | 2 placeholder slots insufficient for 5 files | Expand to cover all cross-plan edits |
| V8 | MEDIUM | Footnote↔File | No FlowSpace node IDs in ledger | Add node IDs for traceability |

**Files requiring footnotes** (cross-plan-edits):
1. `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`
2. `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts`
3. `packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts`
4. `packages/positional-graph/src/features/030-orchestration/index.ts`
5. `packages/positional-graph/src/index.ts`

#### TDD Compliance — ✅ PASS

- RED phase documented: T006 → 4 tests failing (`fake.drive is not a function`)
- GREEN phase documented: T007 → 4/4 tests passing
- Test Doc block: All 5 fields present (Why, Contract, Usage Notes, Quality Contribution, Worked Example)
- No mocks: Uses real `FakeGraphOrchestration` implementing `IGraphOrchestration` interface

#### ADR-0012 Compliance — ✅ PASS

- DriveEvent: 4 types (iteration, idle, status, error) — all orchestration-domain
- Zero agent/pod/event-handler imports in types file
- IPodManager import in graph-orchestration.ts is interface-only (accepted per Finding 01)
- Litmus test: "Can I define DriveEvent without importing anything from agent or pod domains?" — **Yes**

#### Plan Compliance — ✅ PASS

All 8 tasks implemented matching their Validation column criteria:

| Task | Status | Note |
|------|--------|------|
| T001 | PASS | PlanPak folder with .gitkeep |
| T002 | PASS | 5 types, proper discriminated union |
| T003 | PASS | drive() on IGraphOrchestration |
| T004 | PASS | Optional podManager, constructor stores |
| T005 | PASS | Stub throws with phase reference |
| T006 | PASS | 4 tests, 5-field Test Doc, no mocks |
| T007 | PASS | FIFO queue, setDriveResult, getDriveHistory |
| T008 | PASS | 5 types in both barrels |

#### Scope Creep — ✅ CLEAN

No unexpected files. No excessive changes. Plan progress checkboxes updated (standard plan-6a tracking).

#### PlanPak — ✅ PASS

- Plan-scoped: PlanPak folder (T001) and test file (T006) in correct locations
- Cross-plan-edits: All 5 files remain in 030-orchestration feature folder (original owner)

### E.2) Semantic Analysis

No semantic issues found. Types match spec and workshop design exactly:

- DriveExitReason: `'complete' | 'failed' | 'max-iterations'` ✅
- DriveResult: `exitReason`, `iterations`, `totalActions` (all readonly) ✅
- DriveEvent: Discriminated union with typed payloads per variant ✅
- DriveOptions: `maxIterations?`, `actionDelayMs?`, `idleDelayMs?`, `onEvent?` with async-capable callback ✅

### E.3) Quality & Safety Analysis

**Safety Score: 96/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2)

| Area | Verdict | Notes |
|------|---------|-------|
| Correctness | ✅ | FIFO logic uses `Math.min(index, length-1)` — matches existing `run()` pattern, no off-by-one |
| Type Safety | ✅ | All fields readonly, proper discriminated union, `_options` prefix for unused stub param |
| Error Handling | ✅ | Fake throws descriptive error with graph slug when unconfigured |
| Security | N/A | Types-only phase, no I/O |
| Performance | ✅ | `driveHistory` unbounded but test-scoped; `getDriveHistory()` returns spread copy (immutable) |
| Observability | N/A | Types-only phase |

### E.4) Doctrine Evolution Recommendations (Advisory)

No new ADRs, rules, or idioms recommended for this phase. Phase 1 is purely additive types — no architectural decisions emerged beyond what's already documented in ADR-0012.

**Positive Alignment**: Implementation correctly follows ADR-0012 domain boundaries and ADR-0004 options-object pattern.

---

## F) Coverage Map

**Testing Approach**: Full TDD
**Overall Coverage Confidence**: 90%

| AC | Description | Test | Confidence | Notes |
|----|-------------|------|------------|-------|
| AC-P1-1 | `drive()` on IGraphOrchestration | `returns configured DriveResult` | 100% | Direct behavioral validation via fake |
| AC-P1-2 | DriveEvent has exactly 4 types | TypeScript compilation | 75% | Type-level enforcement, no runtime test (appropriate for types) |
| AC-P1-3 | FakeGraphOrchestration implements drive() | All 4 tests | 100% | FIFO, history, error case covered |
| AC-P1-4 | GraphOrchestrationOptions includes podManager | TypeScript compilation | 75% | Type-level, constructor stores field |
| AC-P1-5 | `just fft` clean | Execution log evidence | 100% | 266 passed, 6 skipped, +4 new tests |

---

## G) Commands Executed

```bash
# Phase tests
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/fake-drive.test.ts
# Result: 4/4 passed

# Type check
npx tsc --noEmit -p packages/positional-graph/tsconfig.json
# Result: clean (exit 0)

# Diff generation
git --no-pager diff HEAD -- packages/ apps/ test/
# Result: 211 lines across 5 modified + 2 new files
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

**Blocking issues** (must fix before merge):
1. Run `plan-6a-update-progress` to populate the footnote system:
   - Add `[^1]`–`[^5]` to dossier task Notes for cross-plan-edit tasks
   - Fill Phase Footnote Stubs table in dossier
   - Replace plan § 12 placeholders with actual FlowSpace node IDs and file paths

**Non-blocking suggestions** (fix if convenient):
2. Split combined execution log entries (T002+T003, T004+T005) into individual anchors
3. Fix `log#task-t006` shorthand in Discoveries table
4. Consider package-root import for `FakeGraphConfig` in test file

**After fixes**: Rerun `plan-7-code-review` to verify graph integrity is restored, then APPROVE.

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag(s) | Plan Ledger Node ID |
|--------------------|----------------|---------------------|
| `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts` | _(missing)_ | _(missing)_ |
| `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | _(missing)_ | _(missing)_ |
| `packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts` | _(missing)_ | _(missing)_ |
| `packages/positional-graph/src/features/030-orchestration/index.ts` | _(missing)_ | _(missing)_ |
| `packages/positional-graph/src/index.ts` | _(missing)_ | _(missing)_ |
| `apps/cli/src/features/036-cli-orchestration-driver/.gitkeep` | N/A (plan-scoped) | N/A |
| `test/unit/positional-graph/features/030-orchestration/fake-drive.test.ts` | N/A (plan-scoped) | N/A |
