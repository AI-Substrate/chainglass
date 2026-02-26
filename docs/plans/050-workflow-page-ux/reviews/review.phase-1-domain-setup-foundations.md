# Code Review: Phase 1: Domain Setup + Foundations

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 1: Domain Setup + Foundations
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD (specified in spec; implementation evidence currently reflects Hybrid)

## A) Verdict

**REQUEST_CHANGES**

High-severity testing compliance gaps remain open (missing RED→GREEN evidence and AC-30 mismatch with spec), so approval is blocked.

**Key failure areas**:
- **Domain compliance**: Domain manifest is incomplete for several touched files and domain-map topology/summary are not fully current.
- **Testing**: Full-TDD evidence is incomplete and AC-30 implementation/evidence does not match the spec requirement.
- **Doctrine**: Fake service weakens interface typing via `unknown` and omits explicit public return types in several methods.

## B) Summary

The phase delivers substantial implementation value (domain docs, DI wiring, fake service, doping script, and integration tests), and no material correctness/security defects were found in implementation logic. Domain compliance is partially met, but manifest and domain-map currency checks failed. Anti-reinvention checks found no genuine duplication requiring reuse/extension changes. Testing evidence is the main blocker: the spec requires Full TDD and AC-30 explicitly requires committed sample units plus 8-state coverage, which current script/tests do not fully demonstrate. Coverage confidence for phase ACs is moderate (56%), with AC-30 currently low confidence.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED evidence captured before implementation for phase-critical behaviors
- [ ] GREEN evidence captured after implementation with concrete output
- [ ] Refactor evidence/log notes captured where behavior changed

Universal (all approaches):
- [ ] Only in-scope files changed (manifest currently incomplete)
- [ ] Linters/type checks clean (phase-level explicit clean evidence incomplete)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md:164-166; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md | testing | Spec mandates Full TDD, but execution evidence does not show RED→GREEN ordering/trail. | Add explicit RED and GREEN command evidence per task in execution.log and align task flow to TDD. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md:127-129; /Users/jordanknight/substrate/chainglass-048/scripts/dope-workflows.ts:90-127; /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts:383-391 | testing | AC-30 requires committed `sample-*` units and 8-state coverage; implementation uses generated `demo-*` units and test evidence explicitly excludes `ready`. | Update doping inputs/evidence to satisfy AC-30 exactly (or update spec/tasks if behavior intentionally changed). |
| F003 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:66-79 | domain | Domain Health Summary is not fully current for workflow-ui relationships. | Update consumer/provider cells for workflow-ui and affected providers. |
| F004 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:45-50 | domain | `workflow-ui` depends on `_platform/file-ops` in domain.md, but map edge is missing. | Add labeled `workflowUI -> fileOps` edge with contract labels. |
| F005 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts:195-495 | testing | AC-37 evidence is indirect because tests reconstruct scenarios instead of exercising `scripts/dope-workflows.ts` directly. | Add an integration test that runs the actual script/command and validates outputs. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/fake-positional-graph-service.ts:151,197,212,242,337,347,357,366,376,386,397,459,474,500,507,519 | doctrine | Fake service uses broad `unknown` parameters in multiple public methods, weakening interface-contract fidelity. | Replace `unknown` with interface-native option/payload/filter types. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | domain | Changed domain artifact is not listed in Plan 050 Domain Manifest. | Add file to domain manifest as cross-domain doc update. |
| F008 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/tsconfig.json | domain | Touched file is not listed in Plan 050 Domain Manifest. | Add file to manifest with intended ownership/classification. |
| F009 | LOW | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/index.ts | domain | New file is not listed in Plan 050 Domain Manifest. | Add file to manifest under `_platform/positional-graph`. |
| F010 | LOW | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/index.ts | domain | Touched file is not listed in Plan 050 Domain Manifest. | Add file to manifest under `_platform/positional-graph`. |
| F011 | LOW | /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts | domain | New file is not listed in Plan 050 Domain Manifest. | Add file to manifest under `workflow-ui` test artifacts. |
| F012 | LOW | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md:49-63 | testing | Command claims are present but concrete output artifacts/listings are minimal. | Include command output excerpts and post-run artifact listings for dope flows. |
| F013 | LOW | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | doctrine | Several public fake methods omit explicit return type annotations. | Add explicit `Promise<...Result>` signatures to align with rules/idioms. |

## E) Detailed Findings

### E.1) Implementation Quality

No material correctness, security, error-handling, performance, scope, or pattern violations were identified in the changed implementation files.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New files are placed under expected domain-owned trees. |
| Contract-only imports | ✅ | No cross-domain internal import violations found in reviewed changes. |
| Dependency direction | ✅ | No infra→business dependency-direction violation detected. |
| Domain.md updated | ✅ | workflow-ui domain doc exists and includes history/composition/contracts context. |
| Registry current | ✅ | `workflow-ui` entry exists in registry. |
| No orphan files | ❌ | F007-F011: multiple touched files are not mapped in Plan Domain Manifest. |
| Map nodes current | ❌ | F003: Domain Health Summary provider/consumer cells are stale for workflow-ui relationships. |
| Map edges current | ❌ | F004: Missing labeled `workflowUI -> fileOps` edge. |
| No circular business deps | ✅ | No business-domain cycle introduced by this phase diff. |

Domain compliance findings: F003, F004, F007, F008, F009, F010, F011.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| FakePositionalGraphService | Pattern match: `/Users/jordanknight/substrate/chainglass-048/packages/workflow/src/fakes/fake-template-service.ts` (pattern reference, not duplicate capability) | _platform/positional-graph | ✅ Proceed |
| Doping script (`dope-workflows.ts`) | Similar script pattern: `/Users/jordanknight/substrate/chainglass-048/scripts/generate-templates.ts` (different purpose/outcome) | workflow-ui | ✅ Proceed |
| Doping integration test | No equivalent workflow-doping validation suite found | workflow-ui | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: **56%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-28 | 58% | Spec requirement in workflow-page-ux-spec.md:127; command wiring in justfile diff; execution-log claim present but limited concrete artifact output. |
| AC-29 | 74% | justfile and script support clean/single/all flows; execution-log records command runs. |
| AC-30 | 28% | Spec requires sample-* units + all 8 states; script uses generated demo-* units and tests explicitly skip `ready` as runtime-computed. |
| AC-37 | 62% | Integration tests exist for scenarios, but they do not execute the script command path directly. |

Testing findings: F001, F002, F005, F012.

### E.5) Doctrine Compliance

Doctrine/rules docs are present at:
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/idioms.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/architecture.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/constitution.md

Findings:
- F006: Public fake method signatures overuse `unknown` and loosen interface fidelity.
- F013: Several public fake methods omit explicit return types.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-28 | `just dope` creates demo workflows | justfile targets + execution log claims + script scenarios | 58 |
| AC-29 | dope clean/single/redope commands | script arg handling + justfile wiring + execution log | 74 |
| AC-30 | demo workflows use sample units and cover all 8 states | spec text vs script/test mismatch (`demo-*` units; `ready` excluded in test) | 28 |
| AC-37 | automated validation test exists | `test/integration/dope-workflows.test.ts` present and scenario tests pass | 62 |

**Overall coverage confidence**: **56%**

## G) Commands Executed

```bash
git --no-pager diff --stat && git --no-pager diff --staged --stat && git --no-pager status --short && git --no-pager log --oneline -12
commits=$(git --no-pager log --oneline -30 | grep -i 'Plan 050 Phase 1' | awk '{print $1}'); for c in $commits; do git --no-pager show --name-status --pretty='' $c; done
BASE=$(git rev-parse ae7da5f^)
git --no-pager diff --name-status "${BASE}..HEAD" -- docs/domains/workflow-ui/domain.md docs/domains/registry.md docs/domains/domain-map.md apps/web/src/lib/di-container.ts apps/web/tsconfig.json docs/domains/_platform/positional-graph/domain.md packages/positional-graph/src/fakes/fake-positional-graph-service.ts packages/positional-graph/src/fakes/index.ts packages/positional-graph/src/index.ts scripts/dope-workflows.ts justfile test/integration/dope-workflows.test.ts
git --no-pager diff "${BASE}..HEAD" -- docs/domains/workflow-ui/domain.md docs/domains/registry.md docs/domains/domain-map.md apps/web/src/lib/di-container.ts apps/web/tsconfig.json docs/domains/_platform/positional-graph/domain.md packages/positional-graph/src/fakes/fake-positional-graph-service.ts packages/positional-graph/src/fakes/index.ts packages/positional-graph/src/index.ts scripts/dope-workflows.ts justfile test/integration/dope-workflows.test.ts > /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 1: Domain Setup + Foundations
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-1-domain-setup-foundations.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/di-container.ts | Modified | workflow-ui (cross-domain) | No immediate code change required from this review |
| /Users/jordanknight/substrate/chainglass-048/apps/web/tsconfig.json | Modified | workflow-ui/tooling | Add to Domain Manifest (F008) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/positional-graph/domain.md | Modified | _platform/positional-graph | Add to Domain Manifest (F007) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Modified | cross-domain | Update health summary + add file-ops edge (F003, F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md | Modified | cross-domain | No blocking issues |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Added | workflow-ui | No blocking issues |
| /Users/jordanknight/substrate/chainglass-048/justfile | Modified | cross-domain/workflow-ui | Ensure AC-28/29 evidence captured (F012) |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | Added | _platform/positional-graph | Tighten types and explicit returns (F006, F013) |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/index.ts | Added | _platform/positional-graph | Add to Domain Manifest (F009) |
| /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/index.ts | Modified | _platform/positional-graph | Add to Domain Manifest (F010) |
| /Users/jordanknight/substrate/chainglass-048/scripts/dope-workflows.ts | Added | workflow-ui | Align AC-30 with spec (F002) |
| /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts | Added | workflow-ui test | Add script-path test and align AC-30 evidence (F005, F011) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-1-domain-setup-foundations/execution.log.md | Add explicit RED→GREEN evidence entries for phase-critical tasks | Required by Full TDD strategy (F001) |
| 2 | /Users/jordanknight/substrate/chainglass-048/scripts/dope-workflows.ts | Use committed sample work units and ensure AC-30 state coverage expectation is met | Spec mismatch blocks approval (F002) |
| 3 | /Users/jordanknight/substrate/chainglass-048/test/integration/dope-workflows.test.ts | Add test that executes actual script command path and validates outputs | AC-37 evidence currently indirect (F005) |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Add orphan touched files to Domain Manifest | Domain traceability gap (F007-F011) |
| 5 | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Update health summary + add workflowUI→fileOps labeled edge | Domain map currency/edge completeness gaps (F003, F004) |
| 6 | /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/fakes/fake-positional-graph-service.ts | Replace `unknown` params with interface types and add explicit public return types | Doctrine/contract fidelity issue (F006, F013) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Domain Manifest entries for touched files (apps/web/tsconfig.json, docs/domains/_platform/positional-graph/domain.md, packages/positional-graph/src/fakes/index.ts, packages/positional-graph/src/index.ts, test/integration/dope-workflows.test.ts) |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | workflowUI→fileOps edge and health summary row/consumer updates |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase 'Phase 1: Domain Setup + Foundations'
