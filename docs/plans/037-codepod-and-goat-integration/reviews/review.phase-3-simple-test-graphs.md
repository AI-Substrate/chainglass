# Review Report — Phase 3: Simple Test Graphs

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Workflow mode: **Full**.
- Diff range reviewed: `33c525d..9bc1e7b` (canonical diff generated to session artifact).
- Testing approach from plan: **Full TDD**.
- Mock policy from plan: **Fakes over mocks (avoid mocks)**.
- Regression guard: **PASS** (no prior-phase regressions detected; integration + full suite currently passing).
- Main blockers are graph-integrity/authority issues (missing task↔log anchors and missing Phase 3 footnotes) plus portability issue (hardcoded absolute CLI path checks).
- `just fft` passed locally.

## C) Checklist
**Testing Approach: Full TDD**
- [x] Tests precede code (RED/GREEN intent documented)
- [ ] Tests as docs (task/log linkage and per-task evidence not fully traceable)
- [x] Mock usage matches spec: Avoid mocks
- [x] Negative/edge cases covered (parallel + failure path present)

Universal:
- [ ] BridgeContext/portability patterns followed (hardcoded absolute CLI paths)
- [ ] Only in-scope files changed (non-goal scope drift in shared helper extraction)
- [x] Linters/type checks are clean (`just fft` passed)
- [ ] Absolute-path assumptions avoided (machine-specific path checks present)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | tasks/phase-3-simple-test-graphs/tasks.md:196-206 | Completed tasks missing required `log#...` anchors in Notes | Add per-task log anchors in Notes and sync via plan-6a |
| V2 | CRITICAL | codepod-and-goat-integration-plan.md:508-541 + phase-3 task rows | Phase 3 footnote provenance missing in plan ledger and phase rows | Add Phase 3 [^N] ledger entries and references for changed files/node-IDs |
| V3 | HIGH | tasks/phase-3-simple-test-graphs/tasks.md:333-338 | Phase Footnote Stubs section is blank | Populate stubs and sync to plan ledger |
| V4 | HIGH | execution.log.md (all task headings) | Log entries miss explicit `Dossier Task` and `Plan Task` metadata backlinks | Add task metadata + backlinks under each task heading |
| V5 | HIGH | test/integration/orchestration-drive.test.ts:25-28 | Hardcoded machine path for CLI availability check | Resolve CLI availability via PATH or repo-relative path |
| V6 | HIGH | test/integration/test-graph-infrastructure.test.ts:17-20 | Hardcoded machine path for CLI availability check | Resolve CLI availability via PATH or repo-relative path |
| V7 | MEDIUM | test/integration/orchestration-drive.test.ts:163-173 | Parallel test does not assert combiner output existence required by T006 | Add explicit combiner output assertion |
| V8 | MEDIUM | test/integration/orchestration-drive.test.ts:214-221 | Error-recovery test omits graph-level `failed` status assertion required by T008 | Add graph status assertion |
| V9 | MEDIUM | dev/test-graphs/shared/graph-test-runner.ts | Shared orchestration helper extraction conflicts with documented Phase 3 non-goal | Either re-inline wiring or amend plan/non-goal with explicit rationale |

## E) Detailed Findings

### E.0 Cross-Phase Regression Analysis
- Prior phase logs reviewed (`phase-1`, `phase-2`) and current validation reruns checked.
- Result: **PASS**.
- Tests rerun: full suite via `just fft` plus targeted phase integration tests.
- Failures: 0.
- Contract breaks: 0 detected.
- Integration boundaries: no regressions observed in Phase 2 helpers used by Phase 3 tests.

### E.1 Doctrine & Testing Compliance
**Graph integrity (Step 3a): ❌ BROKEN**
- Task↔Log violations: all completed tasks T001–T009 missing `log#...` note anchors.
- Log metadata violations: execution log headings missing explicit `Dossier Task` + `Plan Task` backlink metadata.
- Task↔Footnote violations: Phase 3 tasks lack [^N] references; phase footnote stubs empty; plan ledger not updated for Phase 3.
- Footnote↔File validation: no valid Phase 3 node-ID ledger entries were available to validate.

**Authority conflicts (Step 3c): FAIL**
- Plan §12 is authoritative, but it does not contain Phase 3 provenance entries; dossier is also unsynced/blank.
- Resolution: run plan-6a footnote sync and add canonical Phase 3 ledger entries in plan first, then dossier.

**Doctrine gates (Step 4)**
- TDD: partial pass; RED/GREEN intent exists, but traceability/doc rigor incomplete due broken task-log-footnote graph.
- Mock usage: pass (no mock framework usage detected).
- Universal/rules: portability issue from hardcoded absolute paths; explicit rules compliance gap.

**Testing evidence & coverage (Step 5)**
- Evidence artifacts present: `execution.log.md` exists and has task narratives/evidence.
- Core integration tests exist for serial/parallel/error topologies and pass.
- Two acceptance assertions are incomplete (combiner output existence; graph failed status assertion).

### E.2 Semantic Analysis
- **HIGH**: machine-specific CLI path checks can skip/disable required end-to-end validation in non-local environments.
- **MEDIUM**: AC/T006 validation incomplete (missing combiner output assertion).
- **MEDIUM**: AC/T008 validation incomplete (missing graph failed status assertion).

### E.3 Quality & Safety Analysis
**Safety Score: -130/100** (CRITICAL: 2, HIGH: 4, MEDIUM: 3, LOW: 0)
**Verdict: REQUEST_CHANGES**

- Correctness: incomplete AC assertions (V7, V8).
- Security: no direct vulnerabilities found in diff.
- Performance: no blocking regressions; idle-delay tuning is noted but acceptable for current deterministic tests.
- Observability: execution log traceability metadata insufficient for bidirectional navigation/audit.

### E.4 Doctrine Evolution Recommendations (Advisory)
- ADR candidates:
  - Clarify `.chainglass/graphs/<slug>/` pod runtime artifact semantics alongside `.chainglass/data/workflows/`.
  - Clarify workspace registration precondition for CLI `--workspace-path` driven orchestration tests.
- Rules candidates:
  - Add rule requiring portable CLI availability checks (no machine-specific absolute paths in tests).
  - Add rule for orchestration integration synchronization strategy documentation when delay tuning is used.
- Idioms candidates:
  - Canonical simulation-script idiom (`accept/save/end` and error path with `--workspace-path`).
  - Canonical user-input completion event sequence idiom.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-10/11 workspace registration | `test/integration/test-graph-infrastructure.test.ts` workspace registration + CLI resolution test | 75% |
| AC-15 scripts accept/save/end | `simulate.sh` files across serial + parallel + combiner | 75% |
| AC-16 error command path | `error-simulate.sh` uses `cg wf node error ... --code SCRIPT_FAILED` | 100% |
| AC-19 workspace-path propagation | all fixture scripts include `--workspace-path "$CG_WORKSPACE_PATH"` | 100% |
| AC-20 serial completion | integration test `simple-serial` | 75% |
| AC-21 parallel completion | integration test `parallel-fan-out` (status assertions present) | 65% |
| AC-22 error-recovery failure | integration test `error-recovery` (graph failed assertion missing) | 60% |
| AC-23 status assertions | node-level assertions present; graph-level for failure missing | 50% |
| AC-31 quality gate | `just fft` passed | 100% |

**Overall coverage confidence:** **78%** (LOW risk, but improve explicit AC mapping and two missing assertions).
**Narrative test note:** tests are behavior-oriented but do not explicitly tag AC IDs.

## G) Commands Executed
```bash
git --no-pager status --short
git --no-pager log --oneline --decorate -n 25
git --no-pager diff --unified=3 --no-color 33c525d..9bc1e7b > /home/jak/.copilot/session-state/42894c05-f579-4530-9662-7d08e11e2b42/files/phase3.diff
git --no-pager diff --name-only 33c525d..9bc1e7b
pnpm build --filter=@chainglass/cli
pnpm test -- --run test/integration/orchestration-drive.test.ts
pnpm test -- --run test/integration/test-graph-infrastructure.test.ts
just fft
```

## H) Decision & Next Steps
- **Decision:** REQUEST_CHANGES.
- **Required before approval:** fix V1–V6 (all CRITICAL/HIGH).
- After fixes, rerun:
  1. `pnpm test -- --run test/integration/orchestration-drive.test.ts`
  2. `pnpm test -- --run test/integration/test-graph-infrastructure.test.ts`
  3. `just fft`
- Then rerun `/plan-7-code-review` for the same phase.

## I) Footnotes Audit
| Diff-touched path | Footnote tag(s) in Phase dossier | Node-ID link(s) in plan ledger |
|---|---|---|
| dev/test-graphs/error-recovery/units/fail-node/scripts/error-simulate.sh | none | none |
| dev/test-graphs/error-recovery/units/fail-node/unit.yaml | none | none |
| dev/test-graphs/error-recovery/units/setup/unit.yaml | none | none |
| dev/test-graphs/parallel-fan-out/units/combiner/scripts/simulate.sh | none | none |
| dev/test-graphs/parallel-fan-out/units/combiner/unit.yaml | none | none |
| dev/test-graphs/parallel-fan-out/units/parallel-1/scripts/simulate.sh | none | none |
| dev/test-graphs/parallel-fan-out/units/parallel-1/unit.yaml | none | none |
| dev/test-graphs/parallel-fan-out/units/parallel-2/scripts/simulate.sh | none | none |
| dev/test-graphs/parallel-fan-out/units/parallel-2/unit.yaml | none | none |
| dev/test-graphs/parallel-fan-out/units/parallel-3/scripts/simulate.sh | none | none |
| dev/test-graphs/parallel-fan-out/units/parallel-3/unit.yaml | none | none |
| dev/test-graphs/parallel-fan-out/units/setup/unit.yaml | none | none |
| dev/test-graphs/shared/graph-test-runner.ts | none | none |
| dev/test-graphs/shared/helpers.ts | none | none |
| dev/test-graphs/simple-serial/units/setup/unit.yaml | none | none |
| dev/test-graphs/simple-serial/units/worker/scripts/simulate.sh | none | none |
| dev/test-graphs/simple-serial/units/worker/unit.yaml | none | none |
| test/integration/orchestration-drive.test.ts | none | none |
| test/integration/test-graph-infrastructure.test.ts | none | none |
| docs/plans/037-codepod-and-goat-integration/tasks/phase-3-simple-test-graphs/tasks.md | none | none |
| docs/plans/037-codepod-and-goat-integration/tasks/phase-3-simple-test-graphs/execution.log.md | none | none |
| docs/plans/037-codepod-and-goat-integration/codepod-and-goat-integration-plan.md | none | none |
