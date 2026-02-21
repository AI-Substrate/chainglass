# Review: Phase 2 — Readiness Gate and Status Pipeline

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Workflow mode resolved as **Full** (`advanced-e2e-pipeline-plan.md` line 7).
- Diff reviewed from `reviews/phase-2-readiness-gate-and-status-pipeline.diff` (5 files, in-scope).
- Functional implementation of `contextFromReady` is coherent and tests pass for gate behavior.
- Regression checks against Phase 1 context tests pass.
- Blocking findings are in graph/provenance sync (Task↔Log/Footnote, Plan↔Dossier authority) and test documentation doctrine.
- Because HIGH/CRITICAL findings exist, phase is not merge-ready.

## C) Checklist
**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN evidence present in execution log narrative)
- [ ] Tests as docs (assertions show behavior + required Test Doc block format)
- [x] Mock usage matches spec: Avoid/No mocks
- [x] Negative/edge cases covered
- [x] BridgeContext patterns followed / N/A for this phase (no VS Code extension path logic added)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean (`just fft` passed)
- [x] Absolute paths used in dossier paths

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | HIGH | `tasks/.../tasks.md:133-140` | Completed tasks do not include `log#anchor` trace links in Notes | Add per-task log anchors and backfill execution headings/anchors |
| V2 | HIGH | `tasks/.../execution.log.md:15-57` | Execution entries lack explicit `Dossier Task` and `Plan Task` backlink metadata | Add backlink metadata block per task entry |
| V3 | CRITICAL | `tasks/.../tasks.md:221-227`, `plan.md:488-491` | Dossier footnote stubs empty while plan ledger has phase footnote `[^2]` | Sync phase stubs and task notes to plan ledger authority |
| V4 | HIGH | `plan.md:288-295` | Plan task table Log/Notes columns are unsynchronized (`-`) for completed Phase 2 tasks | Populate [📋] log links and footnote refs for 2.1–2.6 |
| V5 | HIGH | `plan.md:490-491` | Footnote ledger lacks FlowSpace node-ID provenance format required for graph traversal | Convert ledger entries to node-ID based references and map to touched files |
| V6 | HIGH | `test/unit/positional-graph/can-run.test.ts:335-427` | New tests do not include full Test Doc 5-field block required by rules | Add required Test Doc blocks to each promoted test |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
- Prior phase analyzed: **Phase 1: Context Engine — Types, Schema, and Rules**.
- Re-run checks:
  - `pnpm test -- --run can-run` ✅
  - `pnpm test -- --run agent-context` ✅ (21/21)
  - `just fft` ✅
- Tests rerun: 2 targeted + full suite via `just fft`.
- Failures introduced by Phase 2: **0**.
- Contract regression findings: **none** (no public API removals; `CanRunResult.gate` union expanded compatibly).
- Integration boundary findings: **none**.
- Backward compatibility findings: **none**.

### E.1 Doctrine & Testing Compliance

#### Graph integrity (Step 3a synthesis)
| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| G1 | HIGH | Task↔Log | Completed tasks have no log anchors in Notes | Each `[x]` task links to execution anchor | Add `log#...` refs to Notes | Weak execution traceability |
| G2 | HIGH | Task↔Log | Log entries lack Dossier/Plan task backlinks | Each entry has `Dossier Task` + `Plan Task` metadata | Add backlink metadata block | Breaks bidirectional navigation |
| G3 | CRITICAL | Task↔Footnote | Dossier footnote stubs empty while plan has `[^2]` | Dossier stubs mirror plan authority | Sync via `plan-6a --sync-footnotes` semantics | Breaks File→Task traversal |
| G4 | HIGH | Plan↔Dossier | Plan Log/Notes columns not synced for completed 2.x tasks | Plan status/log/notes aligned with dossier | Update plan rows 2.1–2.6 with links/footnotes | Progress ledger unreliable |
| G5 | HIGH | Footnote↔File | Plan footnote uses plain text file list, not FlowSpace node-ID provenance | Node-ID format and mapping to modified symbols | Record node IDs per touched file/method | Provenance graph non-traversable |

Graph integrity verdict: **❌ BROKEN** (contains CRITICAL/HIGH).

#### Authority conflicts (Step 3c)
- `AUTH-001` (CRITICAL): plan has `[^2]`, dossier phase footnote table is empty.
- `AUTH-002` (HIGH): task notes in dossier do not carry footnote tags for changed files.
- Authority resolution: **Plan § Change Footnotes Ledger is primary**; dossier must be updated to match plan, then plan log columns synchronized.

#### Testing strategy compliance (Step 4/5)
- Approach detected: **Full TDD**.
- Mock policy: **No mocks** honored.
- RED/GREEN evidence: present narratively for T001/T002 in execution log.
- Rule drift: new tests lack required 5-field Test Doc blocks (rules.md R-TEST-002/003).
- Coverage confidence: **85% overall** (see section F); no critical acceptance criterion is untested.

### E.2 Semantic Analysis
- No semantic/business-rule defects found in gate behavior:
  - `canRun()` adds explicit context-target completion gate.
  - `getNodeStatus()` and `reality.builder.ts` propagate gate state consistently.
- Specification alignment: matches Phase 2 objective and ACs for context readiness gating.

### E.3 Quality & Safety Analysis
**Safety Score: 100/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0)
**Verdict: APPROVE (quality/safety dimension only)**

- Correctness: no logic defects observed in diff.
- Security: no new injection/path/auth/secrets risks introduced.
- Performance: O(1) target lookup on `state.nodes`; no unbounded additions.
- Observability: neutral; no regression from baseline.

### E.4 Doctrine Evolution Recommendations (Advisory)
- **Rules update candidate (MEDIUM)**: add explicit rule for mandatory plan↔dossier↔execution backlink fields on completed tasks.
- **Idioms update candidate (LOW)**: add idiom snippet for readiness-gate additions requiring synchronized updates in `CanRunResult`, `NodeStatusResult.readyDetail`, and reality builder pass-through.
- **Positive alignment**: implementation follows ADR-0011/0012 intent (domain concept + orchestration boundary).

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-3 block until context target complete | `can-run.test.ts` Gate 5 test: incomplete target => not ready | 100% |
| AC-3 allow when target complete | `can-run.test.ts` Gate 5 test: complete target => contextFromReady true | 100% |
| Gate transparent without contextFrom | `can-run.test.ts` Gate 5 test: no contextFrom => true | 100% |
| Invalid target blocked in readiness gate | `can-run.test.ts` nonexistent target => not ready | 100% |
| Belt runtime guard still works | `agent-context.test.ts` R2 invalid/nonexistent/self-reference pass | 75% (behavioral linkage) |
| Existing gates still function | existing gate tests in `can-run.test.ts` and full suite pass | 75% (behavioral linkage) |

Overall coverage confidence: **91.7%**.
Narrative tests detected: **none** in targeted Phase 2 tests.
Recommendation: add explicit AC IDs in test names/comments for traceability.

## G) Commands Executed
```bash
git --no-pager status --short
git --no-pager log --oneline -n 25
git --no-pager diff --unified=3 --no-color -- <phase2 target files> > reviews/phase-2-readiness-gate-and-status-pipeline.diff
pnpm test -- --run input-resolution   # no matching tests in repo pattern
pnpm test -- --run can-run
pnpm test -- --run agent-context
just fft
```

## H) Decision & Next Steps
- Decision owner: human reviewer/sponsor for Plan 039.
- Required before approval:
  1. Fix graph/provenance sync findings (V1–V5).
  2. Add required Test Doc blocks for new promoted tests (V6).
  3. Re-run `plan-6a` style progress/footnote synchronization and regenerate review.

## I) Footnotes Audit
| Diff-touched path | Footnote tag in phase dossier | Plan ledger entry | Node-ID link status |
|---|---|---|---|
| `packages/positional-graph/src/services/input-resolution.ts` | Missing | `[^2]` includes file | Missing node ID |
| `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | Missing | `[^2]` includes file | Missing node ID |
| `packages/positional-graph/src/services/positional-graph.service.ts` | Missing | `[^2]` includes file | Missing node ID |
| `packages/positional-graph/src/features/030-orchestration/reality.builder.ts` | Missing | `[^2]` includes file | Missing node ID |
| `test/unit/positional-graph/can-run.test.ts` | Missing | `[^2]` includes file | Missing node ID |

