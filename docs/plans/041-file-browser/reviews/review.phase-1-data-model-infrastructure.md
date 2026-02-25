# Phase Review: phase-1-data-model-infrastructure

## A) Verdict
**REQUEST_CHANGES**

## B) Summary
- Workflow mode: **Full** (`file-browser-spec.md` says `Mode: Full`).
- Testing approach: **Full TDD**; mock policy: **No mocks (fakes only)**.
- Project checks are green (`just fft` passed).
- Graph integrity is **BROKEN** (missing Task↔Log links, footnote sync gaps, plan↔dossier drift).
- Phase scope is partially violated by cross-phase documentation edits in the same diff range.
- Semantic compliance has one critical gap: planned v1→v2 migration behavior is not implemented as documented in the approved plan.
- Additional high issues: T014 test task marked done without test file, plan task table status not synchronized, sortOrder input validation gap.

## C) Checklist
**Testing Approach: Full TDD**

- [ ] Tests precede code (RED-GREEN-REFACTOR evidence)
- [ ] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Avoid mocks (fakes only)
- [x] Negative/edge cases covered
- [ ] BridgeContext patterns followed (not applicable domain, but universal doctrine checks failed)
- [ ] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (no hidden context in task table)

## D) Findings Table
| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| V1 | CRITICAL | tasks.md (Task table) | Completed tasks lack Task↔Log anchors in Notes | Add `execution.log.md#...` anchors for each completed task |
| V2 | CRITICAL | file-browser-plan.md §Phase 1 tasks; tasks.md §Tasks | Plan task statuses `[ ]` conflict with dossier `[x]` and phase complete flag | Sync plan task statuses and log links with dossier via plan-6a update |
| V3 | CRITICAL | tasks.md §Phase Footnote Stubs; file-browser-plan.md §Change Footnotes Ledger | Footnote system not populated/synchronized (no [^N] tags in tasks, empty stubs, placeholder ledger) | Populate footnote tags/stubs/ledger consistently |
| S1 | CRITICAL | packages/workflow/src/adapters/workspace-registry.adapter.ts | Plan/spec still require v1→v2 migration behavior; implementation shifted to defaults-only compatibility | Either implement migration per plan or formally amend plan/spec/acceptance criteria |
| S2 | HIGH | tasks.md T014; missing test file | T014 marked complete but `test/unit/web/app/actions/workspace-actions.test.ts` does not exist | Add T014 tests or mark task waived/deferred with approved deviation |
| S3 | HIGH | execution.log.md RED/GREEN blocks | REFACTOR phase evidence missing across RED→GREEN groups | Add explicit REFACTOR entries (or explicit no-refactor notes) |
| S4 | HIGH | diff scope (`73e27de..6793536`) | Diff includes non-phase docs (spec/research/workshops) outside task Absolute Path(s) | Split unrelated docs into separate commit/phase or justify in dossier scope |
| Q1 | HIGH | apps/web/app/actions/workspace-actions.ts:368-370 | `sortOrder` parsed without strict numeric validation | Validate in Zod (`coerce.number().int().min(0)`) and guard service input |
| Q2 | MEDIUM | apps/web/app/actions/workspace-actions.ts:372-377 | No try/catch/logging around action service path | Add structured error handling + safe ActionState fallback |
| Q3 | MEDIUM | apps/web/app/actions/workspace-actions.ts:388-389 | Broad invalidation on `/` for preference update may over-invalidate | Prefer narrower path/tag invalidation |

## E) Detailed Findings
### E.0 Cross-Phase Regression Analysis
- Prior phases before Phase 1: **none**.
- Result: **Skipped** (foundational phase).
- Tests rerun from prior phases: 0
- Contracts broken: 0

### E.1 Doctrine & Testing Compliance
**Graph integrity (Step 3a): ❌ BROKEN**
- Task↔Log validator: 16 broken links (all completed tasks missing log anchors).
- Task↔Footnote validator: missing footnote tags in task notes; phase stubs empty; plan ledger placeholders only.
- Footnote↔File validator: no valid node-ID entries to validate.
- Plan↔Dossier validator: status drift and log/notes mismatch.
- Parent↔Subtask validator: no subtasks found (pass).

**Authority conflicts (Step 3c): FAIL**
- Primary ledger (plan §Change Footnotes Ledger) is placeholder-only.
- Dossier phase footnote stubs are unpopulated.
- No traceable file→task→ledger provenance chain.

**Testing doctrine (Step 4 & 5)**
- TDD validator: FAIL (missing REFACTOR evidence; T014/T015 RED→GREEN inconsistency).
- Mock validator: PASS (0 mock instances; fakes-only policy respected).
- Plan compliance validator: FAIL (migration expectation drift, T014 acceptance gap, scope creep docs).
- Universal validator: FAIL (test-doc doctrine incompleteness reported; scope mismatch reported).

### E.2 Semantic Analysis
- **CRITICAL**: Migration requirement drift against approved plan/spec language.
- **HIGH**: Auto-assignment semantics still represented as required in planning docs but deferred in phase execution docs.
- **HIGH**: `sortOrder` validation contract can persist invalid numeric state.

### E.3 Quality & Safety Analysis
**Safety Score: -10/100** (CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 0)  
**Verdict: REQUEST_CHANGES**

- Correctness/Security HIGH: invalid `sortOrder` acceptance path.
- Correctness/Observability MEDIUM: missing action-level try/catch with structured log.
- Performance MEDIUM: over-broad cache invalidation for small preference mutation.

### E.4 Doctrine Evolution Recommendations (Advisory)
- Add/Update ADR: codify schema-superset compatibility decision vs formal migration requirement.
- New ADR/rule: atomic write contract (`tmp + rename`) as persistence standard.
- New rule: thin server-action testing policy under no-mocks doctrine.
- New idiom: typed defaults-merge loader for backward-compatible JSON evolution.

## F) Coverage Map (Acceptance Criteria ↔ Evidence)
| Criterion | Evidence | Confidence |
|---|---|---|
| AC-40 (preferences field) | entity + service tests and code updates | 75% |
| AC-41 (migration behavior) | defaults-merge tests exist, formal migration behavior not fully aligned to plan wording | 50% |
| AC-42 (adapter/service update methods) | contract + service tests present | 75% |
| AC-43 (server action) | implementation exists; dedicated tests missing (T014 gap) | 25% |
| AC-12 (auto-assigned identity) | palette constants added; creation auto-assignment deferred | 25% |
| AC-13 (storage + graceful missing prefs) | adapter spread-with-defaults + tests | 75% |

**Overall coverage confidence: 54% (MEDIUM)**

Narrative tests/coverage gaps:
- Server action coverage is narrative/indirect (service-level only).
- Migration behavior is partially inferred from compatibility logic, not explicit migration flow.

## G) Commands Executed
- `git --no-pager status --short`
- `git --no-pager log --oneline --decorate -n 20`
- `git --no-pager diff --name-only 73e27de..6793536`
- `git --no-pager diff --unified=3 --no-color 73e27de..6793536 > /tmp/phase1.diff`
- `just fft`

## H) Decision & Next Steps
- **Decision**: REQUEST_CHANGES before merge.
- Fix high/critical issues from `fix-tasks.phase-1-data-model-infrastructure.md`.
- Re-run `just fft`, then rerun plan-7 review for this phase.

## I) Footnotes Audit
| Diff Path | Task Footnote Tag(s) in tasks.md | Plan Ledger Node-ID Link(s) |
|---|---|---|
| apps/web/app/actions/workspace-actions.ts | none | none |
| apps/web/src/features/041-file-browser/index.ts | none | none |
| packages/workflow/src/adapters/workspace-registry.adapter.ts | none | none |
| packages/workflow/src/constants/workspace-palettes.ts | none | none |
| packages/workflow/src/entities/workspace.ts | none | none |
| packages/workflow/src/services/workspace.service.ts | none | none |
| test/contracts/workspace-registry-adapter.contract.ts | none | none |
| test/unit/workflow/workspace-entity.test.ts | none | none |
| test/unit/workflow/workspace-service.test.ts | none | none |

Audit result: **FAILED** (no usable footnote provenance graph for touched files).
