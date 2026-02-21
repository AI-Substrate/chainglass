# Review — Phase 1: InspectGraph Service Method + Unit Tests (Subtask 001)

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode: **Full** (`tasks/phase-1-inspectgraph-service-method-unit-tests/` exists); reviewed subtask `001-subtask-enrich-inspectresult-data-model`.
- Diff basis: `git diff --unified=3 --no-color 3365e80..615d2d3`.
- Testing strategy from plan: **Full TDD**; mock policy: **avoid mocks**.
- Scope mostly aligns with subtask intent, but graph-link/footnote governance is still broken.
- Security/correctness issues found in enrichment path (path traversal + failure propagation + silent catch).
- Validation evidence: targeted subtask tests and `just fft` pass.

## C) Checklist
**Testing Approach: Full TDD**
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence complete per-task)
- [ ] Tests as docs (all required Test Doc fields present)
- [x] Mock usage matches spec: Avoid/Targeted/Liberal (no mocking framework use)
- [ ] Negative/edge cases covered (missing `waitForPrevious` / positive context cases)

Universal:
- [ ] BridgeContext patterns followed (hardcoded workspace path found in test)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (planning artifacts)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| GRA-001 | HIGH | `001-subtask-enrich-inspectresult-data-model.md`, `...execution.log.md` | Task↔Log bidirectional links missing for ST001-ST008 | Add per-task log anchors + `Plan Task`/`Dossier Task` backlinks |
| GRA-002 | HIGH | `graph-inspect-cli-plan.md:379-380` | Footnote ledger still placeholder-only (`[^1]`, `[^2]`) | Replace placeholders with concrete node/file entries and sync dossier stubs |
| GRA-003 | HIGH | `graph-inspect-cli-plan.md`, subtask dossier | Task↔Footnote and Footnote↔File provenance unresolved | Add [^N] references on changed task rows; map each to modified paths |
| PLAN-001 | HIGH | `inspect.test.ts:363-367,423-427,460-464` | Test Doc blocks incomplete (missing Usage Notes, Quality Contribution, Worked Example) | Complete all 5 required fields per R-TEST-002 |
| SEC-001 | HIGH | `positional-graph.service.ts:1311-1315` | `data/outputs/*` path can traverse outside node outputs dir | Resolve/normalize path and enforce containment under `.../data/outputs` |
| COR-001 | HIGH | `positional-graph.service.ts:1329-1334` | `loadNodeConfig()` throw may fail entire inspect result | Catch per-node failure and keep partial node result |
| OBS-001 | HIGH | `positional-graph.service.ts:1313-1325` | `catch {}` swallows metadata read failures silently | Surface structured warning/error context in result/log |
| PERF-001 | HIGH | `positional-graph.service.ts:1303-1339` | Unbounded Promise fan-out for node/output file reads | Bound concurrency and cap reads for metadata extraction |
| PLAN-002 | MEDIUM | subtask dossier ST005 vs diff | ST005 contract says adapter change, but adapter file unchanged | Update dossier contract or implement adapter path |
| TEST-001 | MEDIUM | `inspect.test.ts:840-850` | ST003 misses explicit `waitForPrevious` and positive context scenarios | Add assertions for `waitForPrevious`, `contextFrom`, `noContext: true` |
| UNI-001 | MEDIUM | `inspect.test.ts:870-872` | Hardcoded `/workspace/...` test path coupling | Build from runtime test context/path resolver |
| REG-001 | MEDIUM | plan vs parent task table | Subtask complete but parent T008 remains unchecked/no completion note | Sync parent task status/notes/log links |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
- Prior completed phases before Phase 1: **none**.
- Tests rerun from prior phases: **0**.
- Contracts broken across prior phases: **0 detected**.
- Backward compatibility: **N/A (first phase)**.
- Verdict: **PASS**.

### E.1 Doctrine & Testing Compliance
**Graph integrity verdict**: ❌ **BROKEN**

| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|---|---|---|---|---|---|---|
| V1 | HIGH | Task↔Log | ST001..ST008 rows have no log anchors | Completed tasks link to concrete log sections | Add per-task `log#...` links in Notes | Cannot trace implementation evidence from tasks |
| V2 | HIGH | Log↔Task | Log sections missing `Plan Task`/`Dossier Task` backlinks | Each log entry declares both backlinks | Add metadata under each ST section | Reverse navigation broken |
| V3 | HIGH | Task↔Footnote | No [^N] references on modified task rows | Modified tasks reference concrete footnotes | Add [^N] per changed row | File-to-task provenance missing |
| V4 | HIGH | Footnote↔File | Plan ledger entries are placeholders only | Concrete node/file mappings per footnote | Replace placeholders and sync | Provenance invalid |
| V5 | MEDIUM | Parent↔Subtask | Registry shows complete but parent T008 remains unsynced | Parent notes/status reflect subtask completion | Sync parent task row | Progress ambiguity |

**Authority conflicts (Plan wins):**
- Plan §Change Footnotes Ledger has placeholders only; dossier stubs empty/unresolved.
- Resolution: synchronize with concrete plan-ledger entries and matching dossier references.

**Testing doctrine:**
- Approach: **Full TDD**.
- Mock policy: compliant (no `vi.mock/jest.mock/spyOn`).
- Drift: Test Doc completeness fails rule requirement (5-field requirement not fully met).
- RED/GREEN evidence present; REFACTOR evidence is weakly documented (no explicit refactor checkpoint).

**Doctrine compliance score (excluding advisory evolution):**
- Counts: CRITICAL 0, HIGH 8, MEDIUM 4, LOW 0
- Score: `100 - (8*50) - (4*10) = -340`
- Verdict: **FAIL**

### E.2 Semantic Analysis
- Subtask objective (add events/orchestratorSettings/fileMetadata) is implemented and tests pass.
- **Spec/plan drift**: ST005 dossier still claims adapter method change path; implementation moved to service-level enrichment.
- **Behavioral gap**: missing explicit test coverage for `waitForPrevious` and positive context inheritance paths weakens AC-6 confidence.

### E.3 Quality & Safety Analysis
**Safety Score: -150/100** (CRITICAL: 0, HIGH: 5, MEDIUM: 2, LOW: 0)
**Verdict: REQUEST_CHANGES**

- **Security (HIGH)**: output path traversal risk via permissive `data/outputs/*` prefix check + path join.
- **Correctness (HIGH)**: per-node config load failure can reject entire inspect call.
- **Observability (HIGH)**: metadata read failures swallowed silently (`catch {}`).
- **Performance (HIGH/MEDIUM)**: unbounded concurrent file reads and full-file memory reads for metadata.

### E.4 Doctrine Evolution Recommendations (Advisory)
- New ADR candidate: formalize two-stage inspect assembly (feature compose + service enrichment).
- ADR update candidate: clarify inspect payload boundary under ADR-0012.
- Rules candidate: enforce dossier/implementation strategy sync when implementation approach changes.
- Idiom candidates: lean event-stamp mapping; binary detection via char-code scan.
- Positive alignment: no mocking frameworks; Promise batching used; domain boundary intent mostly preserved.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-3 file metadata for `data/outputs/*` | `file metadata (ST004)` tests assert filename/size/extract | 75% |
| AC-4 event log data availability | `events array (ST002)` tests assert mapped event fields + count parity | 75% |
| AC-6 compact context settings | only execution/default assertions; no positive `waitForPrevious/contextFrom/noContext` assertions | 50% |
| AC-7 enriched JSON payload | enriched fields observed through `inspectGraph()` assertions | 75% |

**Overall coverage confidence:** **68.75% (MEDIUM)**

Narrative/weak mappings:
- AC IDs are present in comments, but not encoded in test names.
- Add explicit positive-path context tests and AC-linked names/comments for stronger mapping.

## G) Commands Executed
```bash
git --no-pager log --oneline --decorate -n 15
git --no-pager diff --unified=3 --no-color 3365e80..615d2d3
pnpm --silent vitest run test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts
just fft
rg -n "\[\^\d+\]:|\[\^\d+\]|\*\*Plan Task\*\*|\*\*Dossier Task\*\*|RED|GREEN|REFACTOR" docs/plans/040-graph-inspect-cli/tasks/phase-1-inspectgraph-service-method-unit-tests/001-subtask-enrich-inspectresult-data-model*.md docs/plans/040-graph-inspect-cli/graph-inspect-cli-plan.md
```

## H) Decision & Next Steps
- Approval owner: phase implementer + reviewer.
- Required action: apply `fix-tasks.phase-1-inspectgraph-service-method-unit-tests.md` (tests-first for TDD), then rerun `/plan-6-implement-phase` for targeted fixes and rerun `/plan-7-code-review`.

## I) Footnotes Audit
| Diff-touched Path | Footnote Tag(s) in Dossier | Node-ID Link(s) in Plan Ledger | Result |
|---|---|---|---|
| `packages/positional-graph/src/features/040-graph-inspect/inspect.types.ts` | none | placeholder only (`[^1]`, `[^2]`) | FAIL |
| `packages/positional-graph/src/features/040-graph-inspect/inspect.ts` | none | placeholder only | FAIL |
| `packages/positional-graph/src/features/040-graph-inspect/index.ts` | none | placeholder only | FAIL |
| `packages/positional-graph/src/services/positional-graph.service.ts` | none | placeholder only | FAIL |
| `test/unit/positional-graph/features/040-graph-inspect/inspect.test.ts` | none | placeholder only | FAIL |
| `.../001-subtask-enrich-inspectresult-data-model.md` | none | placeholder only | FAIL |
| `.../001-subtask-enrich-inspectresult-data-model.execution.log.md` | none | placeholder only | FAIL |
| `graph-inspect-cli-plan.md` | n/a | placeholders only | FAIL |
