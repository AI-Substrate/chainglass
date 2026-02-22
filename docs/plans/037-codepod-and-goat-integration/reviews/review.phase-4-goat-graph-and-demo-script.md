# Phase 4 Code Review — GOAT Graph and Demo Script

## A) Verdict

**REQUEST_CHANGES**

Reason: graph-integrity/documentation links are broken (CRITICAL/HIGH), and current quality gate run is not clean (`just fft` failed on `event-id.test.ts`).

---

## B) Summary

1. Workflow mode resolved as **Full Mode**.
2. Canonical phase diff used: `1568265^..1568265` (implementation commit for Phase 4).
3. Functional implementation scope is largely correct (GOAT fixtures, helpers/assertions, integration test, demo script, justfile).
4. Critical plan/dossier link hygiene is incomplete (missing task log anchors and missing dossier footnote sync to plan ledger).
5. Cross-phase regression tests (`test-graph-infrastructure`, `orchestration-drive`) pass.
6. Current `just fft` run fails on `generateEventId` uniqueness test (1 failing test).
7. Testing approach is Full TDD with fakes-over-mocks policy; mock policy appears compliant.

---

## C) Checklist

**Testing Approach: Full TDD**  
**Mock Usage Policy: Fakes over mocks (no `vi.mock`/`jest.mock`)**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence fully auditable in artifacts)
- [x] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec
- [x] Negative/edge cases covered in GOAT sequence
- [ ] BridgeContext/authority graph links intact (Task↔Log, Task↔Footnote, Plan↔Dossier)
- [x] Only in-scope implementation files changed (for `1568265^..1568265`)
- [ ] Linters/type checks clean (`just fft` currently fails)
- [x] Absolute paths used in dossier task table

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | `tasks/phase-4.../tasks.md:259-267` | Completed tasks T001-T009 do not include `log#...` anchors in Notes | Add per-task `log#...` anchors in dossier Notes and align with execution headings |
| V2 | HIGH | `tasks/phase-4.../tasks.md` + plan §13 | Dossier has no synced Phase Footnote Stubs for `[^18]..[^22]` | Run `plan-6a --sync-footnotes` and add `[^18]..[^22]` references in task Notes |
| V3 | HIGH | `/tmp/phase4-fft.log` (`event-id.test.ts:71`) | `just fft` failed (`expected 99 to be 100`) | Stabilize `generateEventId` uniqueness behavior and rerun `just fft` |
| V4 | HIGH | `execution.log.md:56-90`, `tasks.md:431+` | Full TDD RED/GREEN trace is merged; RED evidence not independently auditable | Split T005/T006 evidence with explicit failing test artifact before GREEN |
| V5 | MEDIUM | `test/integration/orchestration-drive.test.ts:402-414` | `questionId` is cast without explicit null guard | Validate `questionId` and throw explicit error when missing |
| V6 | MEDIUM | `dev/test-graphs/goat/units/error-node/scripts/recovery-simulate.sh:13-24` | Marker-file flow can leave ambiguous recovery state if interrupted | Set marker only after successful error emission (or add trap/atomic pattern) |
| V7 | MEDIUM | plan Phase 4 table vs dossier | Plan 4.1 wording references `graph.setup.ts`; implementation uses inline graph setup in test | Align plan wording to implemented/approved dossier scope |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

- Prior-phase regression tests rerun:
  - `pnpm test -- --run test/integration/test-graph-infrastructure.test.ts` ✅
  - `pnpm test -- --run test/integration/orchestration-drive.test.ts` ✅
- Additional gate:
  - `just fft` ❌ (1 failing unit test unrelated to GOAT path)
- Contracts/integration boundaries reviewed:
  - No Phase 2/3 integration contract break detected in targeted integration suites.

Regression findings:

| ID | Severity | Prior Phase | Issue | Evidence | Fix |
|----|----------|-------------|-------|----------|-----|
| REG-001 | LOW | Phase 2 | Infrastructure regression suite passed | `test-graph-infrastructure.test.ts` 3/3 pass | None |
| REG-002 | LOW | Phase 3 | Orchestration regression suite passed | `orchestration-drive.test.ts` 4/4 pass | None |
| REG-003 | HIGH | Cross-phase gate | `just fft` failed (`event-id` uniqueness) | `/tmp/phase4-fft.log` | Fix `generateEventId` flake and rerun gate |

### E.1) Doctrine & Testing Compliance

#### Step 3a Graph Integrity (Bidirectional Links)

Graph integrity verdict: **❌ BROKEN**

| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| G1 | CRITICAL | Task↔Log | T001-T009 rows lack `log#...` anchors in dossier Notes | Completed tasks should point to execution evidence | Add `log#...` anchor per task row | Breaks task→evidence traversal |
| G2 | HIGH | Task↔Footnote | Dossier task rows and stubs not synced to plan `[^18]..[^22]` | Dossier and plan ledgers aligned | Sync via `plan-6a` and add notes tags | Breaks task→file provenance path |
| G3 | MEDIUM | Task↔Log | Anchor naming mismatch for combined T005/T006 entries | Plan/dossier links resolve to actual headings | Normalize heading/link slugs | Degrades traceability |

#### Step 3c Authority Conflicts (Plan is authority)

| ID | Severity | Conflict Type | Footnote | Resolution |
|----|----------|---------------|----------|------------|
| AUTH-001 | HIGH | missing_in_dossier | `[^18]..[^22]` | Apply plan authority; update dossier stubs and task notes to match plan §13 |
| AUTH-002 | MEDIUM | numbering_gap_in_dossier | phase-local | Add sequential phase stubs and references for changed files |

#### Step 4 Doctrine Gates

- TDD validator: **FAIL** (insufficient standalone RED evidence artifact; REFACTOR stage not explicitly evidenced).
- Mock policy validator: **PASS** (`vi.mock`/`jest.mock` usage not found in phase implementation diff).
- Plan compliance: mostly pass; medium drift on wording (`graph.setup.ts`) and RED evidence visibility.

#### Step 5 Testing Evidence & Coverage

- Evidence artifacts present:
  - `tasks/phase-4.../execution.log.md` ✅
- Approach-specific checks:
  - Full TDD structure present, but RED/REFACTOR evidence should be more explicit for strict auditability.

### E.2) Semantic Analysis

No high-confidence semantic/business-rule violations were identified in Phase 4 implementation diff (`1568265^..1568265`).

### E.3) Quality & Safety Analysis

**Safety Score: 80/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 2, LOW: 0)  
**Verdict: APPROVE (advisory for this section only)**

Findings:

1. `test/integration/orchestration-drive.test.ts` (MEDIUM): missing explicit guard if `questionId` cannot be extracted before `answerNodeQuestion`.
2. `dev/test-graphs/goat/units/error-node/scripts/recovery-simulate.sh` (MEDIUM): marker-file timing can produce ambiguous state if interrupted between marker touch and fail emission.

### E.4) Doctrine Evolution Recommendations (Advisory)

- New ADRs suggested: 0
- ADR updates suggested: 0
- Rule updates suggested: 1 (require explicit RED evidence artifact link in Full TDD execution logs for combined tasks)
- Idiom updates suggested: 1 (phase dossier template should include mandatory `log#...` + `[^N]` linkage per completed row)
- Positive alignment:
  - GOAT sequence implementation matches phase objective and acceptance structure.
  - Fakes-over-mocks doctrine respected in implementation changes.

| Category | New | Updates | Priority HIGH |
|----------|-----|---------|---------------|
| ADRs | 0 | 0 | 0 |
| Rules | 0 | 1 | 0 |
| Idioms | 0 | 1 | 0 |
| Architecture | 0 | 0 | 0 |

---

## F) Coverage Map (Acceptance Criteria ↔ Evidence)

Scoring model: 100 explicit criterion ID in test; 75 behavioral match; 50 inferred; 0 no evidence.

| Criterion | Evidence | Confidence |
|-----------|----------|------------|
| AC-17 | `question-simulate.sh` invokes `cg wf node ask` | 100 |
| AC-18 | `recovery-simulate.sh` fail-then-success behavior | 100 |
| AC-24 | GOAT 6-line setup in integration test | 75 |
| AC-25 | 4 drive/intervention phases asserted | 75 |
| AC-26 | final node/output assertions (`assertOutputExists`, complete checks) | 75 |
| AC-27 | reusable helper/assertion additions in shared test utilities | 75 |
| AC-28 | `scripts/drive-demo.ts` visual progression logging | 75 |
| AC-29 | `justfile` recipe `drive-demo` | 100 |
| AC-30 | demo prints `status` event message output | 75 |
| AC-31 | `just fft` clean gate | 0 (current run failed) |

**Overall coverage confidence: 75% (MEDIUM)**  
Narrative mapping note: criteria IDs are not embedded in test names; mappings are behavioral rather than explicit-ID.

---

## G) Commands Executed

```bash
git --no-pager diff --name-status 1568265^..1568265
git --no-pager diff --unified=3 --no-color 1568265^..1568265 > .../phase4-impl.diff
pnpm build --filter=@chainglass/cli
pnpm test -- --run test/integration/test-graph-infrastructure.test.ts
pnpm test -- --run test/integration/orchestration-drive.test.ts
npx tsx scripts/drive-demo.ts
just fft
```

---

## H) Decision & Next Steps

- Decision owner: reviewer/phase approver for Plan 037.
- Required before APPROVE:
  1. Repair task-link and footnote synchronization (graph integrity blockers).
  2. Resolve failing `just fft` test and rerun gate.
  3. Add explicit RED evidence linkage for strict Full TDD audit trail.

---

## I) Footnotes Audit

Plan ledger authority entries for this phase: `[^18]..[^22]` in plan §13.

| Diff-touched path (implementation) | Dossier footnote tag(s) in task rows | Plan ledger node-ID/file linkage |
|------------------------------------|---------------------------------------|----------------------------------|
| `dev/test-graphs/goat/units/**` | Missing in task row notes | `[^18]` |
| `test/integration/orchestration-drive.test.ts` | Missing in task row notes | `[^19]` |
| `scripts/drive-demo.ts` | Missing in task row notes | `[^20]` |
| `justfile` | Missing in task row notes | `[^21]` |
| Quality gate (`all`) | Missing in task row notes | `[^22]` |

Footnote traversal status: **Not synchronized** (plan has entries; dossier task table does not reference them).
