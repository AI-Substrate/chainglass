# Phase Review — phase-1-codepod-completion-and-scriptrunner

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode: **Full**; Testing Approach: **Full TDD**; Mock Usage: **Avoid mocks (fakes only)**.
- Diff audited: `git diff --unified=3 --no-color 9f6c665..982b75c` (18 files changed).
- Core implementation landed, but review gates fail on missing execution evidence and unsynchronized task/footnote ledgers.
- Contract-test artifact in phase dossier (`test/contracts/script-runner.contract.ts`) is missing.
- Functional correctness issue: ODS can dispatch code pod with empty script path when work unit load fails.

## C) Checklist
**Testing Approach: Full TDD**
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Avoid mocks
- [ ] Negative/edge cases covered
- [ ] Only in-scope files changed
- [ ] Linters/type checks are clean
- [x] Absolute paths used in dossier

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F-001 | CRITICAL | `.../phase-1-codepod-completion-and-scriptrunner/execution.log.md:1-9` | Execution log contains header only; no task-level RED/GREEN/REFACTOR evidence | Add per-task execution entries with anchors and command output references |
| F-002 | HIGH | `.../test/contracts/script-runner.contract.ts` (missing) | Required T002b contract test artifact absent | Add contract test file (Vitest-discoverable) and run it |
| F-003 | HIGH | `.../test/unit/.../pod.test.ts:294-311` | No explicit assertions for `CG_GRAPH_SLUG`, `CG_NODE_ID`, `CG_WORKSPACE_PATH` | Add env assertions via `FakeScriptRunner` run history |
| F-004 | HIGH | `.../packages/positional-graph/src/features/030-orchestration/ods.ts:165-176` | `workUnitService.load()` errors ignored; can produce empty script path | Fail fast on load errors/non-code units before pod creation |
| F-005 | HIGH | `tasks.md` + `codepod-and-goat-integration-plan.md` | Task↔Log, Task↔Footnote, and Plan↔Dossier links unsynced | Update statuses/log links; sync footnotes with plan authority |
| F-006 | MEDIUM | `.../packages/positional-graph/package.json:53-60` | Export changes outside listed phase task paths | Add explicit task justification or isolate to dedicated task |
| F-007 | MEDIUM | `.../script-runner.ts:18-55` | `timeout` option accepted but not enforced | Implement timeout behavior and test it |
| F-008 | MEDIUM | plan + dossier footnote sections | Footnote ledger has placeholders; dossier stubs empty | Generate sequential footnotes for each touched path |

## E) Detailed Findings
### E.0 Cross-Phase Regression Analysis
- Prior completed phases before Phase 1: **none**.
- Regression check against prior phases: **skipped (N/A)**.

### E.1 Doctrine & Testing Compliance
#### Graph integrity (3a)
| ID | Severity | Link Type | Issue | Expected | Fix | Impact |
|----|----------|-----------|-------|----------|-----|--------|
| V1 | HIGH | Task↔Log | No task-level log anchors present | Completed tasks should link to execution anchors | Add task anchors + backlinks | Evidence not navigable |
| V2 | CRITICAL | Task↔Footnote | No task note footnotes for changed files | Every changed task should include `[^N]` | Add note footnotes and ledger entries | File→Task provenance broken |
| V3 | HIGH | Footnote↔File | Plan ledger has placeholders only (`[^1]`, `[^2]`) | Real node/file-linked entries | Replace placeholders with actual entries | Provenance unverifiable |
| V4 | HIGH | Plan↔Dossier | Phase status/log columns not synchronized with implemented diff | Plan/dossier should reflect execution state | Sync via plan-6a/update-progress workflow | Tracking unreliable |

Graph verdict: **BROKEN**.

#### Authority conflicts (3c)
| ID | Severity | Conflict Type | Footnote | Resolution |
|----|----------|---------------|----------|------------|
| AUTH-001 | CRITICAL | content_missing | `[^1]`, `[^2]` | Plan is authority; replace placeholders with concrete ledger entries |
| AUTH-002 | MEDIUM | numbering/evidence gap | all expected phase footnotes | Regenerate sequential footnotes and mirror in dossier |

Authority verdict: **FAIL**.

#### Doctrine validators (4)
- TDD validator: **FAIL (HIGH)** — no RED/GREEN/REFACTOR evidence in log.
- Mock policy validator: **PASS** — no `vi.mock`/`jest.mock` in phase diff.
- Plan compliance validator: **FAIL** — missing contract artifact and incomplete AC-specific assertions.

#### Testing evidence (5)
- `pnpm test -- --run test/unit/positional-graph/features/030-orchestration/script-runner.test.ts` → PASS
- `pnpm test -- --run test/contracts/script-runner.contract.ts` → FAIL (`No test files found`)
- `pnpm test -- --run test/unit/positional-graph/features/030-orchestration/` → PASS
- `just fft` → PASS

### E.2 Semantic Analysis
| ID | Severity | File:Lines | Issue | Spec Requirement | Impact | Fix |
|----|----------|------------|-------|------------------|--------|-----|
| SEM-001 | HIGH | `.../ods.ts:165-176` | Code-path dispatch proceeds with empty `scriptPath` when unit load fails | AC-07 (ODS resolves script path correctly) | Runtime script execution failure path | Return explicit orchestration error when load has errors/no code unit |
| SEM-002 | HIGH | `.../pod.test.ts:294-311` | AC-02 implemented but not asserted | AC-02 (CG_* env vars passed) | Regression can ship undetected | Add explicit CG_* assertions |

### E.3 Quality & Safety Analysis
**Safety Score: -50/100** (CRITICAL: 1, HIGH: 4, MEDIUM: 3, LOW: 0)  
**Verdict: REQUEST_CHANGES**

- Correctness (HIGH): ODS ignores load errors and may create invalid code-pod params.
- Correctness (MEDIUM): ScriptRunner ignores `timeout`.
- Security (MEDIUM): joined script path lacks containment validation.
- Observability (HIGH): execution log has no implementer evidence.

### E.4 Doctrine Evolution Recommendations (Advisory)
- **Rule candidate (MEDIUM)**: orchestration dispatch must fail fast on dependency load errors.
- **Idiom candidate (MEDIUM)**: contract tests should follow `*.contract.test.ts` naming for discovery consistency.
- **Positive alignment**: DI registrations use factory pattern (ADR-0004 aligned).

## F) Coverage Map
| AC | Mapping | Confidence |
|----|---------|------------|
| AC-01 | `pod-manager.types.ts`, `pod-manager.ts`, `pod.code.ts` | 75% |
| AC-02 | `pod.code.ts` implemented; no direct test assertion | 50% |
| AC-03 | `pod.test.ts` asserts `INPUT_*` env vars | 100% |
| AC-04 | `script-runner.test.ts` execute flow | 100% |
| AC-05 | `script-runner.test.ts` stdout/stderr/exit assertions | 100% |
| AC-06 | `script-runner.test.ts` kill path | 100% |
| AC-07 | `ods.ts` implementation; no focused assertion | 50% |
| AC-08 | constructor stores unitSlug; no behavior assertion | 25% |
| AC-31 | `just fft` run succeeded | 100% |

Overall coverage confidence: **77.8%**.  
Weak mappings: **AC-02, AC-07, AC-08**.

## G) Commands Executed
```bash
git --no-pager diff --unified=3 --no-color 9f6c665..982b75c
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/script-runner.test.ts
pnpm test -- --run test/contracts/script-runner.contract.ts
pnpm test -- --run test/unit/positional-graph/features/030-orchestration/
just fft
```

## H) Decision & Next Steps
- Decision: **REQUEST_CHANGES**.
- Apply fixes in `fix-tasks.phase-1-codepod-completion-and-scriptrunner.md`.
- Re-run implementation update and then re-run this phase review.

## I) Footnotes Audit
All 18 diff-touched paths currently have **no mapped footnote tags in phase tasks** and **no concrete node-ID entries in plan ledger**.

