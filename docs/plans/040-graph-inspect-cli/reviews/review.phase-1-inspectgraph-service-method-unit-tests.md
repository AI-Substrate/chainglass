# Review — Phase 1: InspectGraph Service Method + Unit Tests

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode: Full; artifacts resolved from `tasks/phase-1-inspectgraph-service-method-unit-tests/`.
- Testing Approach: **Full TDD**; Mock Usage policy interpreted as **Avoid mocks (fakes-only policy in rules)**.
- Scope: diff stayed within declared phase files.
- Graph/link integrity is **BROKEN** (missing task↔log links, missing footnote sync, plan↔dossier status drift).
- TDD doctrine evidence is insufficient (no RED/GREEN/REFACTOR log trail; per-test Test Doc blocks missing).
- Acceptance criteria coverage confidence is **62.5% (MEDIUM)** with critical gaps (events/questions and 6-node scenario).
- Static checks executed: targeted phase test + `just fft` passed.

## C) Checklist
**Testing Approach: Full TDD**
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Avoid/Targeted/Liberal (no mocks used)
- [ ] Negative/edge cases covered

Universal:
- [x] BridgeContext patterns followed (not applicable to VS Code extension paths in this diff)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (planning artifacts)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| GRA-001 | CRITICAL | `tasks.md`, `execution.log.md` | Task↔Log bidirectional links missing; execution log has no task evidence entries | Populate execution log entries per completed task and add `log#anchor` backlinks in dossier/plan |
| GRA-002 | CRITICAL | `graph-inspect-cli-plan.md`, `tasks.md` | Plan↔Dossier sync broken (implementation commit exists while both tables remain `[ ]`) | Run progress sync (`plan-6a`) and update statuses/log columns consistently |
| AUTH-001 | HIGH | `graph-inspect-cli-plan.md:377+`, `tasks.md:288+` | Footnote authority/ledger not synchronized (placeholders only; no phase footnote stubs) | Add concrete `[^N]` entries in plan ledger and match phase stubs + task Notes |
| TDD-001 | CRITICAL | `inspect.test.ts` | Per-test Test Doc blocks required by R-TEST-002 are missing | Add 5-field Test Doc blocks to each promoted test case |
| TDD-002 | HIGH | `execution.log.md` | No RED/GREEN/REFACTOR evidence in phase execution log | Add chronological RED→GREEN→REFACTOR entries tied to task IDs |
| PLAN-001 | HIGH | `inspect.test.ts` | Planned AC coverage incomplete (no 6-node graph assertion, no explicit eventCount/questions assertions, no missing work-unit fallback test) | Add missing tests first, then re-run phase suite |
| PLAN-002 | HIGH | `inspect.ts` | Implementation diverges from phase brief (uses `nodeStatus.inputPack`; does not load node config/work unit as specified) | Align implementation with planned data sources or log approved deviation |
| COR-001 | HIGH | `inspect.ts:41-43` | Broad catch silently swallows inspect data read failures | Replace silent catch with explicit error collection/reporting in `InspectResult.errors` |
| COV-001 | MEDIUM | phase AC map vs tests | AC→test mapping mostly inferred (no AC IDs in test names/comments) | Add explicit AC IDs to test names/comments and dossier coverage map |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
- Prior completed phases before Phase 1: **none**.
- Tests rerun from prior phases: **0**.
- Contracts broken: **0 detected**.
- Backward compatibility: **N/A for first implementation phase**.
- Verdict: **PASS (no prior phase regression surface)**.

### E.1 Doctrine & Testing Compliance
**Graph integrity verdict**: ❌ **BROKEN**
- Task↔Log: broken (no anchors/backlinks; no dossier/plan task metadata in log).
- Task↔Footnote: broken (no task footnotes mapped to changed files).
- Footnote↔File: broken provenance (ledger placeholders, no node-ID mappings).
- Plan↔Dossier: broken (task statuses/log columns unsynchronized).
- Parent↔Subtask: no subtask evidence to validate.

**Authority conflicts**
- Plan § Change Footnotes Ledger is still placeholder-only while phase changed 7 files.
- Dossier Phase Footnote Stubs remain empty; no synchronized entries.

**Testing doctrine**
- Approach identified: Full TDD.
- Mock policy: no runtime mocks found (`vi.mock/jest.mock/spyOn/fn` absent).
- TDD evidence missing in execution artifacts (no RED/GREEN/REFACTOR trail).
- Test quality rule R-TEST-002 violated (per-test Test Doc blocks missing).

### E.2 Semantic Analysis
- `inspectGraph()` returns a coherent `InspectResult`, but implementation does not fully match planned method composition requirements:
  - Planned: `loadNodeConfig()` + work unit loader fallback path.
  - Actual: relies on `nodeStatus.inputPack` and `nodeStatus.unitType` only.
- This creates spec/plan drift for traceability and potentially misses fallback semantics expected by Phase 1 tasks.

### E.3 Quality & Safety Analysis
**Safety Score: -10/100** (CRITICAL: 0, HIGH: 1, MEDIUM: 4, LOW: 0)
**Verdict: REQUEST_CHANGES**

- **Correctness (HIGH)**: silent catch in `inspect.ts` can hide output-read failures.
- **Security**: no new direct injection/path-traversal issues observed in this phase diff.
- **Performance (MEDIUM)**: per-node output reads are batched per node but still N+1 by design; acceptable only with documented small-graph assumption.
- **Observability (MEDIUM)**: failure suppression without surfaced diagnostic context reduces debuggability.

### E.4 Doctrine Evolution Recommendations (Advisory)
- **Rules update candidate (MEDIUM)**: add explicit requirement that phase execution logs must include task backlinks (`Plan Task`, `Dossier Task`) before marking status complete.
- **Idiom update candidate (LOW)**: add idiom for "phase evidence sync" (task table status + log anchor + footnote in one update step).
- **Positive alignment**: phase stayed within planned file-scope boundaries.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| `inspectGraph()` returns complete `InspectResult` for a 6-node graph | Only 2-node scenario tested (`returns all nodes with status complete`) | 25% |
| Output data values and file output paths distinguished correctly | `file output detection` and `returns output values` tests | 75% |
| Events counted per node, questions extracted from state | No explicit assertions on `eventCount` or `questions` | 0% |
| Duration computed from startedAt/completedAt | `computes durationMs from timestamps` test | 100% |
| In-progress and error states handled gracefully | `in-progress` and `error states` tests | 75% |
| All unit tests pass; no regressions | phase tests + `just fft` pass | 100% |

**Overall coverage confidence**: **62.5% (MEDIUM)**

Narrative tests detected: all AC mappings are inferred (no AC IDs in test names/comments).

## G) Commands Executed
```bash
git --no-pager status --short
git --no-pager log --oneline -n 8
git --no-pager diff --unified=3 --no-color 6858a47..3b34ad0
pnpm --silent vitest run test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts
just fft
rg -n "\[📋\]|\[\^\d+\]|\| 1\.[0-9] \| \[[ x~!]\]" docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/tasks.md
rg -n "Dossier Task|Plan Task|RED|GREEN|REFACTOR|T00|Task" docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/execution.log.md
rg -n "vi\.mock|jest\.mock|vi\.spyOn|vi\.fn|sinon|mock" test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts
```

## H) Decision & Next Steps
- Decision owner: phase implementer + reviewer.
- Required next step: complete fix tasks in `fix-tasks.phase-1-inspectgraph-service-method-unit-tests.md`, rerun `/plan-6` for this phase, then rerun `/plan-7`.

## I) Footnotes Audit
| Diff-touched Path | Footnote Tag(s) in Phase Dossier | Node-ID Link(s) in Plan Ledger | Result |
|---|---|---|---|
| `docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/execution.log.md` | none | none | FAIL |
| `packages/positional-graph/src/features/040-graph-inspect/index.ts` | none | none | FAIL |
| `packages/positional-graph/src/features/040-graph-inspect/inspect.ts` | none | none | FAIL |
| `packages/positional-graph/src/features/040-graph-inspect/inspect.types.ts` | none | none | FAIL |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | none | none | FAIL |
| `packages/positional-graph/src/services/positional-graph.service.ts` | none | none | FAIL |
| `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts` | none | none | FAIL |
