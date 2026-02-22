# Phase Review: Phase 4 — Real Agent Verification and Polish

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode detected: **Full** (`advanced-e2e-pipeline-plan.md`).
- Diff source: `git diff --unified=3 --no-color 58ed7ec..cb4b152`.
- Testing approach: **Full TDD**; mock policy: **No fakes/no mocks for this plan’s tests** (with recorded deviation for `FakeNodeEventRegistry`).
- Required Full-Mode artifacts for this phase are missing: `tasks.md` and `execution.log.md`.
- Scope is violated against available Phase 4 subtask scope (many out-of-scope files changed without phase dossier justification).
- Cross-phase regression checks passed (`agent-context.test.ts`, `can-run.test.ts`, `just fft`).
- E2E run shows `23/23` assertions passed, but traceability to Phase 4’s `17` contractual assertions is not synchronized in phase artifacts.

## C) Checklist
**Testing Approach: Full TDD**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec/deviation policy
- [x] Negative/edge cases covered

**Universal**
- [x] BridgeContext patterns followed (not a VSCode extension diff)
- [ ] Only in-scope files changed
- [x] Linters/type checks are clean (`just fft` passed)
- [x] Absolute paths used (no hidden CWD assumptions in reviewed code paths)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| P4-001 | CRITICAL | `docs/plans/039-.../tasks/phase-4.../` | Missing required Full-Mode artifacts: `tasks.md` and `execution.log.md`. | Generate Phase 4 dossier/log via plan workflow (`plan-5`, `plan-6a`) before merge. |
| P4-002 | HIGH | `58ed7ec..cb4b152` (25 files) | Scope violation vs Phase 4 subtask scope (expected `ods.ts` + `scripts/test-advanced-pipeline.ts`). | Add explicit phase-level justification/task mapping for each extra path or split into separate phase/subtask. |
| P4-003 | CRITICAL | `advanced-e2e-pipeline-plan.md` + phase docs | Graph integrity broken: Task↔Log/Task↔Footnote/Plan↔Dossier links cannot be validated without phase dossier/log; no Phase 4 footnote ledger entries. | Sync plan/dossier/log and footnotes (plan authority) before approval. |
| P4-004 | HIGH | `packages/positional-graph/src/features/030-orchestration/ods.ts:136-151` | Fire-and-forget execution path lacks `.catch`, risking silent async failure. | Add explicit `.catch` with structured error event/log and failure propagation policy. |
| P4-005 | HIGH | `test/unit/cli/cg-binary-linkage.test.ts:37` | Command-injection risk via shell interpolation (`execSync(cat "${cgPath}")`). | Replace shell call with `fs.readFileSync` or `execFileSync` argv form. |
| P4-006 | HIGH | `scripts/test-advanced-pipeline.ts:407-419` | Subtask ST002 contract drift: label mapping still counter-ordered, not nodeId-keyed as specified. | Implement nodeId→label map or update subtask/plan to canonize new behavior with rationale. |
| P4-007 | MEDIUM | `scripts/test-advanced-pipeline.ts:510` | Assertion gate drift (`23` vs planned `17`) weakens plan traceability. | Update plan/task acceptance text and coverage map, or restore 17-contract gate plus additive checks. |
| P4-008 | MEDIUM | `packages/positional-graph/src/features/030-orchestration/ods.ts:167-175` | Blocking inherited-session retry loop adds up to 5s dispatch latency. | Use event/ready-driven sync or shorter bounded backoff with telemetry. |

## E) Detailed Findings
### E.0 Cross-Phase Regression Analysis
- Prior phase tests rerun on current code:
  - `pnpm test -- --run agent-context.test.ts` ✅ (21 passed)
  - `pnpm test -- --run can-run.test.ts` ✅ (16 passed)
  - `just fft` ✅ (full lint/format/build/test)
- Contracts/integration: no direct break observed in Phase 1/2 context and readiness behavior.
- Tests rerun: 3; failures: 0; contracts broken: 0.

### E.1 Doctrine & Testing Compliance
**Graph integrity (3a): ❌ BROKEN**
- Task↔Log: no Phase 4 `execution.log.md` artifact.
- Task↔Footnote: no Phase 4 dossier footnote stubs; no Phase 4 footnote references in phase tasks.
- Footnote↔File: plan ledger has no Phase 4 entries for touched paths.
- Plan↔Dossier sync: cannot validate (missing `tasks.md`).
- Parent↔Subtask: subtask exists, but parent phase table/log links are not synchronized.

**Authority conflicts (3c): FAIL**
- Plan §15 is primary authority; Phase 4 has no matching derived ledger/stubs, so provenance is incomplete.

**Doctrine gates (4):**
- TDD evidence: FAIL (missing phase execution log with RED/GREEN/REFACTOR trace).
- Mock policy: PASS with documented deviation context.
- Universal/BridgeContext: PASS.
- Plan compliance: FAIL (scope and traceability drift).
- PlanPak: PARTIAL (cross-plan-edit files are acceptable in principle, but many touched files are not mapped to a Phase 4 dossier task table).

**Testing evidence & coverage (5):**
- `just test-advanced-pipeline` output shows complete run and `23/23` assertions passed.
- Required evidence artifacts listed in subtask doc are missing (`001-subtask-fix-session-persistence.execution.log.md`).
- Coverage mapping confidence reduced due missing canonical phase dossier/log links.

### E.2 Semantic Analysis
- ST002 contract mismatch: implementation evidence still indicates order-based labeling path rather than explicit nodeId mapping requirement from subtask.
- Acceptance contract drift: run reports 23 assertions while plan phase criteria remain 17.
- Scope drift introduces semantic traceability risk because multiple new files are not mapped to explicit Phase 4 tasks.

### E.3 Quality & Safety Analysis
**Safety Score: -210/100** (CRITICAL: 2, HIGH: 4, MEDIUM: 2, LOW: 0)  
**Verdict: REQUEST_CHANGES**

- Correctness:
  - Missing `.catch` on fire-and-forget execute path (`ods.ts`).
- Security:
  - Shell interpolation in test (`cg-binary-linkage.test.ts`) can execute injected command content.
- Performance:
  - Inherited-session blocking retry loop can add 5s/node tail latency.
  - Repeated persistence/write amplification risk noted in orchestration persistence paths.
- Observability:
  - Limited telemetry around inherit-retry fallback decisions; hard to diagnose race behavior.

### E.4 Doctrine Evolution Recommendations (Advisory)
- New rule candidate: any fire-and-forget promise chain must terminate with `.catch` and structured context logging.
- New rule candidate: test helpers must avoid shell interpolation for file reads.
- Idiom candidate: codify nodeId-based label mapping for E2E harnesses where dispatch order can vary.
- Architecture docs update: add explicit session-persistence timing model and accepted fallback behavior in `docs/how/context-inheritance.md`.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-8 E2E passes | `just test-advanced-pipeline` run shows complete graph and pass summary | 100% |
| AC-9 inheritance proven | session chain output: spec-writer = reviewer = summariser | 100% |
| AC-10 isolation proven | distinct sessions for programmer-a/programmer-b/spec-writer | 100% |
| AC-11 Q&A handshake | output includes question answered + resumed completion | 100% |
| AC-12 line ordering | explicit assertion line for programmer start after spec completion | 100% |
| AC-13 outputs non-empty | assertions exist, but report shows some “(not readable)” display and not all plan artifacts mapped | 75% |
| AC-14 shakedown complete | workshops/subtask exist; but no canonical phase dossier/log trace | 50% |

**Overall coverage confidence: 89.3% (LOW risk), but traceability confidence is MEDIUM due missing phase artifacts.**

## G) Commands Executed
```bash
git --no-pager log --oneline --decorate --max-count=80
git --no-pager log --oneline --decorate -- docs/plans/039-advanced-e2e-pipeline/tasks/phase-4-real-agent-verification-and-polish scripts/test-advanced-pipeline.ts packages/positional-graph/src/features/030-orchestration/ods.ts docs/plans/039-advanced-e2e-pipeline/workshops/04-e2e-shakedown-findings.md docs/plans/039-advanced-e2e-pipeline/workshops/05-faster-feedback-loops.md
git --no-pager diff --name-only 58ed7ec..cb4b152
git --no-pager diff --stat 58ed7ec..cb4b152
git --no-pager diff --unified=3 --no-color 58ed7ec..cb4b152 > docs/plans/039-advanced-e2e-pipeline/reviews/phase-4-real-agent-verification-and-polish.diff
just test-advanced-pipeline
just fft
pnpm test -- --run agent-context.test.ts
pnpm test -- --run can-run.test.ts
```

## H) Decision & Next Steps
- Approval owner: human reviewer after traceability and blocking findings are fixed.
- Required before merge:
  1. Generate missing Phase 4 dossier and execution log artifacts; sync parent/subtask links.
  2. Add Phase 4 footnotes (plan ledger + phase notes/stubs) for all diff-touched paths.
  3. Address HIGH/CRITICAL code findings (P4-004, P4-005, P4-006).
  4. Re-run `/plan-7-code-review` for Phase 4 after fixes.

## I) Footnotes Audit
| Diff-touched path | Footnote tag(s) in phase dossier | Node-ID link(s) in plan ledger |
|---|---|---|
| `packages/positional-graph/src/features/030-orchestration/ods.ts` | None (phase dossier missing) | None (Phase 4 ledger entry missing) |
| `scripts/test-advanced-pipeline.ts` | None (phase dossier missing) | None (Phase 4 ledger entry missing) |
| `packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts` | None | None |
| `packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md` | None | None |
| `packages/positional-graph/src/features/030-orchestration/node-resume-prompt.md` | None | None |
| `scripts/test-copilot-serial.ts` | None | None |
| `test/unit/cli/cg-binary-linkage.test.ts` | None | None |
| `test/unit/positional-graph/features/030-orchestration/drive.test.ts` | None | None |
| `test/unit/positional-graph/features/030-orchestration/ods-agent-wiring.test.ts` | None | None |
| `docs/plans/039-advanced-e2e-pipeline/workshops/04-e2e-shakedown-findings.md` | None | None |
| `docs/plans/039-advanced-e2e-pipeline/workshops/05-faster-feedback-loops.md` | None | None |
| `docs/plans/039-advanced-e2e-pipeline/tasks/phase-4-real-agent-verification-and-polish/001-subtask-fix-session-persistence.md` | None | None |
| `docs/plans/039-advanced-e2e-pipeline/tasks/phase-4-real-agent-verification-and-polish/001-subtask-fix-session-persistence.fltplan.md` | None | None |
