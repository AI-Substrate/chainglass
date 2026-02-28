# Code Review: Phase 3: Demo + Integration + Cleanup

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
**Phase**: Phase 3: Demo + Integration + Cleanup
**Date**: 2026-02-28
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Hybrid

## A) Verdict

**APPROVE**

No HIGH/CRITICAL findings were identified.

**Key failure areas**:
- **Implementation**: `sample-coder` now allows zero required inputs, which weakens runtime correctness guarantees.
- **Domain compliance**: Domain ownership/docs are stale for newly added demo unit assets and updated phase files.
- **Reinvention**: `sample-challenge` overlaps capability already present in `sample-input`.
- **Testing**: Evidence quality is uneven (missing concrete Next.js MCP output and explicit malformed-config test evidence).
- **Doctrine**: One new test name does not follow the required Given-When-Then / `should` naming format.

## B) Summary

Phase 3 implementation is functionally solid and aligns with the intended feature scope for demo workflows, integration coverage, and UI guard behavior. No security or high-severity correctness defects were found in the reviewed diff. Domain compliance has medium-severity documentation/ownership drift (manifest/domain docs not fully current for all changed assets). Testing evidence supports AC-16 strongly, while AC-11 and AC-14 have moderate confidence due to missing direct proof artifacts. Overall: merge-safe with non-blocking follow-up cleanup recommended.

## C) Checklist

**Testing Approach: Hybrid**

- [x] Service-lifecycle and integration validation present for critical paths
- [ ] Explicit RED → GREEN evidence recorded for TDD portions
- [x] Core validation tests present
- [ ] Key verification artifacts (especially Next.js MCP output) captured in execution evidence

Universal (all approaches):
- [x] Only in-scope phase files reviewed
- [x] Lint/type/test evidence reported clean (`just fft` logged)
- [ ] Domain compliance checks fully pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-coder/unit.yaml:7-20 | correctness | All inputs are optional; unit can run with no effective input contract. | Enforce at least one valid input shape (`spec` OR `challenge+language`) via schema or runtime validation. |
| F002 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-challenge/unit.yaml:1-23; /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-language/unit.yaml:1-27 | file-placement | New assets are outside explicitly declared workflow-ui source ownership in domain docs. | Declare ownership for `/.chainglass/units/` assets or move to declared domain-owned path. |
| F003 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md:27-40 | orphan | Domain Manifest does not include all changed Phase 3 files. | Update `## Domain Manifest` with all touched files or document justified exclusions. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:103,136-140 | domain-md | workflow-ui domain doc is stale (still states 8 scenarios; Phase 3 history missing). | Update scenario count/composition and add Plan 054 Phase 3 history entry. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-challenge/unit.yaml:1-23 | reinvention | `sample-challenge` duplicates existing `sample-input` concept in practice. | Prefer reusing/extending `sample-input` unless explicit semantic split is required. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/execution.log.md:23-33 | testing-evidence | T006 claims Next.js MCP validation but provides no MCP command output evidence. | Add concrete MCP evidence (`get_errors`, route checks) to execution log. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/human-input-modal.tsx:36-53; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx:94-99 | testing | AC-11 guard behavior lacks direct, explicit test proof in changed test artifacts. | Add/point to targeted tests for missing `userInput` modal/editor guard paths. |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md:1 | concepts-docs | Domain has contracts but no `## Concepts` section/table. | Add Level-1 Concepts table (Concept \| Entry Point \| What It Does). |
| F009 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/execution.log.md:9-33 | testing-evidence | Hybrid strategy evidence does not explicitly show RED→GREEN transition. | Record one failing pre-change run and one passing post-change run for the lifecycle path. |
| F010 | LOW | /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/submit-user-input-lifecycle.test.ts:212 | doctrine | New test title uses narrative format instead of required `should`/Given-When-Then style. | Rename to compliant behavioral naming format. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (MEDIUM)**: `sample-coder` input contract in `/Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-coder/unit.yaml` was relaxed to all-optional, which permits a no-input execution path. This is not currently shown to break tests, but it weakens contract correctness and can create runtime ambiguity.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | F002: new `/.chainglass/units/*` files are not explicitly covered by declared workflow-ui source ownership. |
| Contract-only imports | ✅ | No cross-domain internal import violations found in reviewed diffs. |
| Dependency direction | ✅ | No infrastructure→business violations identified. |
| Domain.md updated | ❌ | F004: `docs/domains/workflow-ui/domain.md` not updated for Phase 3 changes. |
| Registry current | ✅ | No new domain introduced; `docs/domains/registry.md` remains consistent. |
| No orphan files | ❌ | F003: plan Domain Manifest missing several touched files. |
| Map nodes current | ✅ | Domain nodes present in `docs/domains/domain-map.md`. |
| Map edges current | ✅ | No unlabeled/new-edge violations found for this phase scope. |
| No circular business deps | ✅ | No business-domain cycle findings surfaced. |
| Concepts documented | ⚠️ | F008: `_platform/positional-graph/domain.md` missing `## Concepts` section. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| sample-challenge unit | `sample-input` unit | workflow-ui | ⚠️ Overlap detected (F005) — recommendation: reuse/extend |
| modal missing-config guard | schema + adapter validation paths | _platform/positional-graph | ✅ Proceed (defense-in-depth, no blocking duplication) |

### E.4) Testing & Evidence

**Coverage confidence**: **78%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-11 | 68 | Guard code added in modal/editor; execution log claims modal tests pass but lacks guard-specific test proof. |
| AC-14 | 76 | Execution log states dope scenarios and integration tests pass; proof is narrative rather than raw command output. |
| AC-16 | 92 | New multi-node lifecycle test added and assertions directly validate downstream gate readiness after both submissions. |

### E.5) Doctrine Compliance

- **F010 (LOW)**: `R-TEST-002` naming guidance from `/Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md` is not followed by one new test title.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-11 | Missing `user_input` config shows error state | Guard added in modal/editor (`human-input-modal.tsx`, `workflow-editor.tsx`), but no explicit guard-path test evidence in changed test files | 68 |
| AC-14 | `just dope` generates user-input demo workflow | Execution log reports successful dope workflow generation and passing dope tests | 76 |
| AC-16 | Integration path opens downstream gates after submit/complete | New multi-node test in `submit-user-input-lifecycle.test.ts` verifies before/partial/after readiness and `inputsAvailable` | 92 |

**Overall coverage confidence**: **78%**

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -20
git --no-pager show --name-status --pretty='format:COMMIT %H %s' 95b7c5c --
git --no-pager show --name-status --pretty='format:COMMIT %H %s' be8d005 --
PLAN_DIR='/Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input' && REVIEWS_DIR="$PLAN_DIR/reviews" && COMMITS='95b7c5c be8d005' && FILES=$(git --no-pager show --name-only --pretty='' $COMMITS | sed '/^$/d' | sort -u) && BASE=$(git --no-pager rev-parse 95b7c5c^) && git --no-pager diff --no-color "$BASE..be8d005" -- $FILES > "$REVIEWS_DIR/_computed.diff"
git --no-pager diff --name-status "$BASE..be8d005" -- $FILES
rg "Testing Strategy|AC-[0-9]{2}|Acceptance Criteria" /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
rg "8 demo workflow scenarios|demo workflow scenarios" /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
rg "^## Concepts" /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: APPROVE

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-spec.md
**Phase**: Phase 3: Demo + Integration + Cleanup
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/reviews/review.phase-3-demo-integration-cleanup.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-challenge/unit.yaml | Created | workflow-ui (ownership drift) | Yes |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-coder/unit.yaml | Modified | workflow-ui | Yes |
| /Users/jordanknight/substrate/chainglass-048/.chainglass/units/sample-language/unit.yaml | Created | workflow-ui (ownership drift) | Yes |
| /Users/jordanknight/substrate/chainglass-048/apps/web/next-env.d.ts | Modified | workflow-ui | Yes (manifest/exclusion note) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/human-input-modal.tsx | Modified | workflow-ui | Yes (add explicit AC-11 evidence) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Modified | workflow-ui | Yes (add explicit AC-11 evidence) |
| /Users/jordanknight/substrate/chainglass-048/scripts/dope-workflows.ts | Modified | workflow-ui | No |
| /Users/jordanknight/substrate/chainglass-048/test/unit/positional-graph/submit-user-input-lifecycle.test.ts | Modified | test | Yes (test naming rule) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/execution.log.md | Created | planning artifact | Yes (add MCP + RED/GREEN evidence) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/tasks.fltplan.md | Modified | planning artifact | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/tasks/phase-3-demo-integration-cleanup/tasks.md | Modified | planning artifact | No |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | Modified | planning artifact | Yes (domain manifest sync) |

### Required Fixes (if REQUEST_CHANGES)

Not required (verdict is **APPROVE**).

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md | `## Domain Manifest` missing changed-file coverage for Phase 3 |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Source/capability metadata stale (scenario count and Plan 054 Phase 3 history) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | Missing `## Concepts` section/table |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/054-unified-human-input/unified-human-input-plan.md --phase "Phase 3: Demo + Integration + Cleanup"
