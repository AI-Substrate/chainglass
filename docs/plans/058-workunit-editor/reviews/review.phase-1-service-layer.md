# Code Review: Phase 1: Service Layer — Extend IWorkUnitService with CRUD

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md
**Phase**: Phase 1: Service Layer — Extend IWorkUnitService with CRUD
**Date**: 2026-02-28
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness and evidence gaps remain in rename cascade behavior and verification coverage.

**Key failure areas**:
- **Implementation**: Rename cascade is effectively disabled in production DI wiring and rename swallows write failures.
- **Domain compliance**: Domain artifacts are stale (domain.md + phase Domain Manifest mapping).
- **Testing**: AC19 (node.yaml slug cascade) is not verified by current contract tests.
- **Doctrine**: New/rewritten contract tests do not include required Test Doc blocks.

## B) Summary

The phase delivers substantial CRUD functionality and broad contract coverage for fake/real parity, but critical rename behavior is not reliably enforced at runtime. `WorkUnitService` currently accepts an optional `pathResolver`, while the container registers it without that dependency, which can make rename cascade a no-op. The rename flow also swallows write failures and still returns `errors: []`, so partial-failure states are hidden. Domain documentation and manifest metadata were not fully updated for this phase, and test evidence does not sufficiently prove AC19.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED evidence captured before implementation for CRUD behaviors
- [x] Contract tests run against both fake and real implementations
- [ ] GREEN evidence demonstrates AC19 cascade behavior
- [ ] Acceptance criteria have direct, explicit evidence links

Universal (all approaches):
- [ ] Only in-scope files changed
- [x] Linters/type checks clean (per execution log evidence)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/container.ts:57-62; /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:388-393 | correctness | Rename cascade may be skipped in production because `pathResolver` is optional and not injected by container registration. | Make `pathResolver` required in `WorkUnitService` and inject it in DI registration; fail fast if missing. |
| F002 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:360-377, 420-432 | error-handling | Rename flow swallows `unit.yaml` and `node.yaml` rewrite failures and still reports success (`errors: []`). | Capture and return structured partial-failure errors in `RenameUnitResult`; do not silently succeed on write failures. |
| F003 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.ts:180-214 | testing | Contract tests do not verify `unit_slug` rewrite cascade in workflow/template `node.yaml` files (AC19). | Add rename cascade tests that seed node.yaml references, run rename, and assert rewritten `unit_slug` and `updatedFiles`. |
| F004 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts:330-333; /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.ts:181-187 | error-handling | E190 was added but `delete()` currently surfaces raw adapter exceptions instead of typed delete-failed errors. | Catch delete FS failures and return `workunitDeleteFailedError` in `DeleteUnitResult.errors`. |
| F005 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/_platform/positional-graph/domain.md:47-55, 139-154 | domain-md | Domain contract/history still reflect read-oriented `IWorkUnitService` and omit Plan 058 Phase 1 changes. | Update Contracts/Composition/History for CRUD operations and rename cascade behavior. |
| F006 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md:35-42 | domain | Phase 1 Domain Manifest omits changed files (`index.ts`, `workunit-service.contract.test.ts`). | Add explicit Domain Manifest rows for omitted changed files. |
| F007 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.ts:46-215 | doctrine | Rewritten tests do not include required 5-field Test Doc blocks (R-TEST-002 / constitution §3.2). | Add Test Doc comments (Why, Contract, Usage Notes, Quality Contribution, Worked Example) for each test (or each equivalent grouped behavior block). |
| F008 | LOW | /Users/jordanknight/substrate/058-workunit-editor/apps/web/next-env.d.ts:1-3 | scope | Generated Next.js file changed during service-layer phase; outside declared phase scope. | Remove incidental generated-file change from this phase or document explicit rationale. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Runtime DI currently constructs `WorkUnitService(adapter, fs, yamlParser)` without `pathResolver`, so rename cascade can return no updates even when references exist.
- **F002 (HIGH)**: Rename path catches write failures and returns success, violating partial-failure reporting expectations from phase task intent.
- **F004 (MEDIUM)**: Delete error code E190 exists but is not wired into `delete()` failure handling.
- **F008 (LOW)**: Out-of-scope generated file drift included in patch.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | Phase code changes remain within expected `_platform/positional-graph` and test paths. |
| Contract-only imports | ✅ | No cross-domain internal import violations observed in changed files. |
| Dependency direction | ✅ | No new infrastructure→business dependency violations introduced in this diff. |
| Domain.md updated | ❌ | `/docs/domains/_platform/positional-graph/domain.md` not updated for Plan 058 Phase 1 CRUD contract expansion. |
| Registry current | ✅ | No new domains introduced; registry remains consistent. |
| No orphan files | ❌ | Domain Manifest omits changed files (`index.ts`, contract runner test). |
| Map nodes current | ✅ | Domain set unchanged; domain-map nodes remain valid. |
| Map edges current | ✅ | No new domain edges required by this phase were introduced. |
| No circular business deps | ✅ | No new business-domain cycles introduced. |
| Concepts documented | ⚠️ | Domain document lacks explicit Concepts section for new/expanded contract capabilities. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `create()` scaffolding flow | Similar legacy implementation in `_platform/workgraph` | `_platform/workgraph` (deprecated) | Acceptable migration overlap (non-blocking) |
| `update()/delete()/rename()` write lifecycle | None found | N/A | Proceed |
| Adapter write helpers (`ensure/remove/rename`) | Existing adapter pattern analogs | `_platform/positional-graph` / workflow adapters | Extend pattern (non-blocking) |
| Rename cascade updater | No existing reusable slug-rewrite utility | N/A | Proceed, but fix F001/F002 |

### E.4) Testing & Evidence

**Coverage confidence**: 69%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC1 | 80% | `create()` contract tests validate unit creation across all unit types. |
| AC2 | 25% | No test explicitly validates scaffold file layout/content. |
| AC3 | 95% | Duplicate slug path explicitly asserts E188. |
| AC17 | 70% | Delete behavior validated functionally, but no direct directory-removal assertion. |
| AC18 | 75% | Rename behavior tested for slug-level effects. |
| AC19 | 20% | No contract test asserts `node.yaml` `unit_slug` cascade rewrites. |
| AC27 | 70% | Tests exercise mutations via `IWorkUnitService` contract entry points. |
| AC28 | 95% | Contract suite runs against fake + real implementations. |
| AC29 | 90% | Shared contract tests are executed for both implementations. |

### E.5) Doctrine Compliance

- **F007 (MEDIUM)**: Test Doc requirement is not met in rewritten contract tests (`docs/project-rules/rules.md` R-TEST-002; `constitution.md` §3.2).
- No additional high-confidence doctrine violations were confirmed as newly introduced by this phase.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-1 | Create unit with type/slug/description | `create()` tests cover create success and load/list visibility. | 80 |
| AC-2 | Scaffold with boilerplate content | No assertions on boilerplate file content/paths. | 25 |
| AC-3 | Duplicate slug rejected | E188 asserted in duplicate create test. | 95 |
| AC-5 | Edit description and version | Update test checks success but not persisted value assertions. | 45 |
| AC-10 | Manage inputs (service layer) | No explicit input patch semantics assertion in contract suite. | 35 |
| AC-11 | Manage outputs (service layer) | No explicit output patch semantics assertion in contract suite. | 35 |
| AC-12 | Input name validation (service layer) | No dedicated contract assertions for invalid input name pattern. | 30 |
| AC-13 | `data_type` conditional handling | No explicit contract assertions for type-specific validation. | 30 |
| AC-14 | Reserved params handling | No explicit contract assertions for reserved params behavior. | 25 |
| AC-15 | At least one output enforced | No explicit contract assertion enforcing minimum outputs. | 30 |
| AC-16 | Delete unit | Delete success tested. | 85 |
| AC-17 | Deletion removes directory | Functional post-delete load failure tested; no direct filesystem assertion. | 70 |
| AC-18 | Rename unit | Rename happy path and slug availability tested. | 75 |
| AC-19 | Rename rewrites `node.yaml` refs | Missing direct cascade verification in tests. | 20 |
| AC-20 | Rename returns affected summary | No assertion on `updatedFiles` summary quality/completeness. | 35 |
| AC-27 | Mutations through `IWorkUnitService` | Contract suite invokes mutation contract methods directly. | 70 |
| AC-28 | Fake service supports writes | Fake implementation participates and passes write contract tests. | 95 |
| AC-29 | Fake/real parity via contracts | Both implementations run same contract suite. | 90 |

**Overall coverage confidence**: **58%**

## G) Commands Executed

```bash
git --no-pager diff --stat && git --no-pager diff --staged --stat && git --no-pager status --short && git --no-pager log --oneline -12
mkdir -p docs/plans/058-workunit-editor/reviews && { git --no-pager diff --no-ext-diff; echo; echo '---STAGED-DIFF---'; git --no-pager diff --staged --no-ext-diff; } > docs/plans/058-workunit-editor/reviews/_computed.diff
{ echo '---NAME-STATUS-UNSTAGED---'; git --no-pager diff --name-status; echo '---NAME-STATUS-STAGED---'; git --no-pager diff --staged --name-status; echo '---UNTRACKED---'; git --no-pager ls-files --others --exclude-standard; }
git --no-pager diff -- packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts | sed -n '1,260p'
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md
**Phase**: Phase 1: Service Layer — Extend IWorkUnitService with CRUD
**Tasks dossier**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-1-service-layer/tasks.md
**Execution log**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-1-service-layer/execution.log.md
**Review file**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/review.phase-1-service-layer.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/next-env.d.ts | Modified | workflow-ui (generated) | Remove from phase diff or justify |
| /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/fake-workunit.service.ts | Modified | _platform/positional-graph | Keep, no blocker found |
| /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/index.ts | Modified | _platform/positional-graph | Add to Domain Manifest |
| /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit-errors.ts | Modified | _platform/positional-graph | Wire E190 into delete failure path |
| /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit-service.interface.ts | Modified | _platform/positional-graph | Keep; ensure docs reflect expanded contract |
| /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.adapter.ts | Modified | _platform/positional-graph | Keep, no blocker found |
| /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts | Modified | _platform/positional-graph | Fix F001/F002/F004 |
| /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.test.ts | Modified | test | Add to Domain Manifest |
| /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.ts | Modified | test | Add AC19 cascade tests + Test Doc comments |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/container.ts and /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts | Inject required `pathResolver` and remove silent no-op cascade path | Rename cascade currently can be skipped in production |
| 2 | /Users/jordanknight/substrate/058-workunit-editor/packages/positional-graph/src/features/029-agentic-work-units/workunit.service.ts | Return partial-failure errors from rename and stop swallowing write failures | Prevent false success on failed unit/node rewrites |
| 3 | /Users/jordanknight/substrate/058-workunit-editor/test/contracts/workunit-service.contract.ts | Add explicit AC19 cascade assertions for node.yaml rewrite and `updatedFiles` | Critical acceptance criterion currently unverified |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/_platform/positional-graph/domain.md | Plan 058 Phase 1 history entry; CRUD contract updates; Concepts section updates |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md | Domain Manifest rows for changed files (`index.ts`, `workunit-service.contract.test.ts`) |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md --phase "Phase 1: Service Layer"
