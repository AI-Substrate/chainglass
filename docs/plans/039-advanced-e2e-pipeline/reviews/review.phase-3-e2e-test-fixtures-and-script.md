# Phase Review: Phase 3 — E2E Test Fixtures and Script

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Mode detected: **Full**.
- Diff source: `git diff --unified=3 --no-color c5d0ce9..58ed7ec` (scoped to phase files).
- Testing approach: **Full TDD**; mock policy: **No fakes, no mocks**.
- Scope guard: phase files are in-scope.
- Blocking issues found in graph integrity, TDD evidence, plan compliance, and security/observability.
- Cross-phase regression checks rerun for Phase 1/2 targets and passed.

## C) Checklist
**Testing Approach: Full TDD**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [ ] Mock usage matches spec: Avoid/No fakes
- [ ] Negative/edge cases covered

**Universal**
- [x] BridgeContext patterns followed (not applicable in this non-VSCode diff)
- [x] Only in-scope files changed
- [ ] Linters/type checks are clean (vitest emits tsconfig-path parsing warnings)
- [x] Absolute paths used (no hidden context assumptions in changed code)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F-001 | CRITICAL | `scripts/test-advanced-pipeline.ts:266-267` | Uses `FakeNodeEventRegistry` while plan policy says no fakes/mocks for this plan's tests. | Replace with real registry or explicitly document/approve policy deviation in plan artifacts. |
| F-002 | HIGH | `tasks/phase-3.../execution.log.md` | Required execution log artifact is missing. | Create phase execution log with task-by-task RED/GREEN/REFACTOR evidence and command outputs. |
| F-003 | HIGH | `tasks.md:129-141`, `plan.md:488+` | No Phase 3 footnotes in task Notes/stubs/ledger; graph provenance links are broken. | Run plan progress sync and footnote sync (`plan-6a`), add footnotes for each touched path. |
| F-004 | HIGH | `scripts/test-advanced-pipeline.ts:537-544` | Isolation proof is incomplete (`prog-a != prog-b` missing). | Add explicit assertion for `programmer-a !== programmer-b`. |
| F-005 | HIGH | `scripts/test-advanced-pipeline.ts:518-557` | AC-12 ordering check and full AC-13 non-empty output checks are missing. | Add line-order timestamp assertions and non-empty checks for all agent outputs. |
| F-006 | HIGH | `scripts/test-advanced-pipeline.ts:459-471` | Plan asks phase banners per line; only line 0 banner exists. | Add explicit line 1/2/3 phase banners in drive events. |
| F-007 | HIGH | `scripts/test-advanced-pipeline.ts:182-183` | Adapter `terminate()` signature/behavior appears incompatible with adapter contract (missing sessionId passthrough). | Match interface contract and delegate with sessionId. |
| F-008 | HIGH | `scripts/test-advanced-pipeline.ts:110,562-566` | Session IDs logged in cleartext. | Mask session IDs in logs (`prefix…suffix`) or omit. |
| F-009 | HIGH | `scripts/test-advanced-pipeline.ts:134-147` | Tool args/results are logged raw; can leak sensitive prompt/tool data. | Redact sensitive fields and log bounded metadata only. |
| F-010 | MEDIUM | `spec-writer/unit.yaml`, `summariser/unit.yaml`, script wiring | Output naming drifts from plan text (`language-1`/`final-report` vs underscore forms). | Normalize naming or update plan/tasks explicitly with rationale and synchronized references. |
| F-011 | MEDIUM | `scripts/test-advanced-pipeline.ts` | Q&A polling recomputes full reality each idle cycle. | Throttle polling and stop once required Q&A is satisfied. |
| F-012 | MEDIUM | `justfile:67-68` | Recipe uses `npx tsx` while task validation text says `pnpm tsx`. | Align command or update task validation text. |

## E) Detailed Findings
### E.0 Cross-Phase Regression Analysis
- Prior-phase tests rerun:
  - `pnpm test -- --run agent-context.test.ts` ✅ (21 passed)
  - `pnpm test -- --run can-run.test.ts` ✅ (16 passed)
- Contracts/integration: no regression detected in Phase 1/2 context/readiness behavior.
- Tests rerun: 2, failures: 0, contracts broken: 0.

### E.1 Doctrine & Testing Compliance
**Graph integrity (3a): ❌ BROKEN**
- Task↔Log: execution log missing (cannot validate backlinks/anchors).
- Task↔Footnote: no `[^\N]` references on phase tasks; phase footnote stubs empty; no Phase 3 ledger entries.
- Footnote↔File: ledger entries are non-FlowSpace filename lists (format invalid for node-ID rules).

**Authority conflicts (3c): FAIL**
- Plan is primary authority; phase dossier and plan ledger are not synchronized for Phase 3 provenance.
- Resolution: sync plan/dossier footnotes and task notes before merge.

**Doctrine validators (4):**
- TDD validator: HIGH (missing RED/GREEN/REFACTOR evidence due missing execution log).
- Mock policy validator: CRITICAL (fake registry usage conflicts with no-fake/no-mock policy).
- Universal/Bridge validator: PASS.
- Plan compliance validator: HIGH (T010/T011/T013 gaps).
- PlanPak validator: PASS (placements match manifest).

**Testing evidence & coverage (5):**
- Evidence artifact required by phase doc is missing (`execution.log.md`).
- Coverage mapping confidence: **62.5%** (MEDIUM).

### E.2 Semantic Analysis
- AC-10 isolation requirement only partially implemented (missing `prog-a != prog-b` assertion).
- AC-12 ordering requirement not explicitly asserted.
- AC-13 non-empty output requirement only partially asserted.
- Naming drift between plan vocabulary and implementation output keys increases requirement traceability risk.

### E.3 Quality & Safety Analysis
**Safety Score: -210/100** (CRITICAL: 1, HIGH: 7, MEDIUM: 3, LOW: 0)  
**Verdict: REQUEST_CHANGES**

- Correctness:
  - Potential adapter contract mismatch around terminate signature/passthrough.
- Security:
  - Cleartext session ID logging.
- Observability:
  - Raw tool args/results logged without redaction.
  - Some output-read failures are swallowed with low diagnostic detail.
- Performance:
  - Repeated full status/reality recomputation every idle tick.

### E.4 Doctrine Evolution Recommendations (Advisory)
- ADR candidate: formalize real-agent E2E harness pattern (fixtures + drive loop + assertion matrix).
- Rules candidate: require phase execution log presence for completed phases.
- Rules/idioms candidate: avoid private-member introspection in assertions; add QuestionWatcher idiom.
- Architecture update: document advanced pipeline topology pattern as canonical verification harness.

## F) Coverage Map
| Acceptance Criterion | Evidence | Confidence |
|---|---|---|
| AC-8 all 6 nodes complete | `assertGraphComplete` + per-node completion checks | 100% |
| AC-9 session chain equality | explicit `spec == reviewer`, `reviewer == summariser` checks | 100% |
| AC-10 isolation | `prog-a != spec`, `prog-b != spec` only; missing `prog-a != prog-b` | 75% |
| AC-11 Q&A handshake | prompt includes ask command + answered question count check | 75% |
| AC-12 line ordering | no explicit timestamp/order assertion | 0% |
| AC-13 non-empty outputs | only subset output-existence checks | 25% |

**Overall coverage confidence: 62.5% (MEDIUM).**  
Narrative tests detected where checks are inferred rather than criterion-tagged; add AC IDs in assertion labels/comments.

## G) Commands Executed
```bash
git --no-pager status --short
git --no-pager log --oneline --decorate -- dev/test-graphs/advanced-pipeline scripts/test-advanced-pipeline.ts justfile
git --no-pager diff --unified=3 --no-color c5d0ce9..58ed7ec -- dev/test-graphs/advanced-pipeline scripts/test-advanced-pipeline.ts justfile
pnpm tsx scripts/test-advanced-pipeline.ts --help
just test-advanced-pipeline --help
pnpm test -- --run agent-context.test.ts
pnpm test -- --run can-run.test.ts
just fft
```

## H) Decision & Next Steps
- Approval owner: human reviewer after fixes and rerun of this review phase.
- Required before merge:
  1. Complete fix tasks in `fix-tasks.phase-3-e2e-test-fixtures-and-script.md`.
  2. Re-run `plan-6` for fixes and update phase artifacts.
  3. Re-run `plan-7-code-review` for Phase 3.

## I) Footnotes Audit
| Diff-touched path | Footnote tag(s) in phase dossier | Node-ID link(s) in plan ledger |
|---|---|---|
| `dev/test-graphs/advanced-pipeline/units/human-input/unit.yaml` | None | None |
| `dev/test-graphs/advanced-pipeline/units/spec-writer/unit.yaml` | None | None |
| `dev/test-graphs/advanced-pipeline/units/spec-writer/prompts/main.md` | None | None |
| `dev/test-graphs/advanced-pipeline/units/programmer-a/unit.yaml` | None | None |
| `dev/test-graphs/advanced-pipeline/units/programmer-a/prompts/main.md` | None | None |
| `dev/test-graphs/advanced-pipeline/units/programmer-b/unit.yaml` | None | None |
| `dev/test-graphs/advanced-pipeline/units/programmer-b/prompts/main.md` | None | None |
| `dev/test-graphs/advanced-pipeline/units/reviewer/unit.yaml` | None | None |
| `dev/test-graphs/advanced-pipeline/units/reviewer/prompts/main.md` | None | None |
| `dev/test-graphs/advanced-pipeline/units/summariser/unit.yaml` | None | None |
| `dev/test-graphs/advanced-pipeline/units/summariser/prompts/main.md` | None | None |
| `scripts/test-advanced-pipeline.ts` | None | None |
| `justfile` | None | None |

