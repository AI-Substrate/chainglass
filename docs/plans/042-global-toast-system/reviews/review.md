# Code Review: Simple Mode

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-spec.md
**Phase**: Simple Mode
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD with fakes

## A) Verdict

**REQUEST_CHANGES**

Blocking issues remain in testing doctrine compliance, AC/spec mismatches in conflict/refresh toast behavior, and missing execution evidence for AC-14.

## B) Summary

Implementation lands core toast infrastructure (`sonner`, global `<Toaster />`, and initial wiring) and removes workgraph inline toast state as intended.  
Domain artifacts are mostly current, but plan/domain-map consistency has gaps (`workgraph-ui` formalization/edge labeling and manifest completeness for lockfile/test/package artifacts).  
Testing evidence is insufficient for Full TDD expectations: new tests rely on mocks and mostly validate the mocked API rather than production call sites.  
Acceptance evidence is partial; AC-14 cannot be validated due to missing execution log/test command output.

## C) Checklist

**Testing Approach: Full TDD with fakes**

- [ ] Red/green evidence captured (execution log missing)
- [ ] Fakes used instead of mocks
- [ ] Core validation tests present for critical paths
- [ ] Acceptance criteria mapped to concrete evidence
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts:17-26 | doctrine | Uses `vi.mock`/`vi.fn`, violating project fake-only test policy (R-TEST-007 / Constitution Principle 4). | Replace mock-based tests with fake-based tests aligned to project testing doctrine. |
| F002 | HIGH | /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts:30-89 | testing | Tests mostly assert mocked API calls and do not execute browser/workgraph production flows, so regressions in wiring can pass undetected. | Add behavior-focused tests that trigger real save/conflict/external-change paths and assert emitted notifications via allowed fake strategy. |
| F003 | HIGH | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:173-177 | scope | AC-09 expects explicit conflict toast with title+description; implementation uses generic `toast.promise` error string callback. | Add explicit conflict branch toast (`toast.error('Save conflict', { description })`) or update plan/spec to the implemented contract. |
| F004 | HIGH | /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/execution.log.md | evidence | Execution log is missing; AC-14 (`just fft` passes) has no verifiable evidence. | Provide execution log and quality command output, then re-run review. |
| F005 | MEDIUM | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx:141-145,183-194 | scope | Refresh flows currently show no toast feedback despite plan task wording requiring save/refresh feedback. | Add `toast.info` for refresh actions or narrow/update the plan acceptance language. |
| F006 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md:27 | domain | Domain manifest references `(workgraph-ui)` but no registered domain slug exists in registry. | Register the domain (and domain.md) or map this file to an existing registered domain consistently. |
| F007 | MEDIUM | /home/jak/substrate/041-file-browser/docs/domains/domain-map.md:42-45 | domain | Domain map calls out workgraph-ui as consumer but domain/edge governance is informal and not fully aligned to registry conventions. | Formalize domain and ensure dependency edge labeling remains canonical with registry + map alignment. |
| F008 | MEDIUM | /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts:32-87 | doctrine | Tests do not include required 5-field Test Doc blocks (R-TEST-002). | Add required Test Doc blocks for each test (or equivalent rule-compliant structure). |
| F009 | LOW | /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md:20-29 | domain | Domain manifest omits touched files (`apps/web/package.json`, `pnpm-lock.yaml`, new test file). | Add these files to manifest or document explicit exclusion policy for lockfile/infra artifacts. |
| F010 | LOW | /home/jak/substrate/041-file-browser/apps/web/src/components/ui/toaster.tsx | reinvention | New toast component overlaps prior ad-hoc workgraph inline toast behavior (expected migration overlap). | Proceed; keep central notifications domain as single reusable implementation. |

## E) Detailed Findings

### E.1) Implementation Quality

- High: conflict-path toast behavior does not match stated AC-09 contract (F003).  
- Medium: refresh handlers do not emit toast feedback despite plan scope text (F005).  
- High: verification tests do not exercise critical production wiring paths (F002).

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New toaster component is in `_platform/notifications` area (`apps/web/src/components/ui/toaster.tsx`). |
| Contract-only imports | ✅ | No cross-domain internal import violation identified in changed source. |
| Dependency direction | ✅ | No infra→business direction violation observed in changed code. |
| Domain.md updated | ✅ | Notifications domain doc includes Plan 042 updates and toaster source location. |
| Registry current | ❌ | `workgraph-ui` appears in plan/map references but is not a registered domain slug. |
| No orphan files | ❌ | Plan domain manifest omits changed package/lock/test files. |
| Map nodes current | ✅ | Notifications map node contains toast contract and consumer overview. |
| Map edges current | ❌ | Workgraph consumer relationship is documented informally and not fully normalized with registry conventions. |
| No circular business deps | ✅ | No cycle evidence from changed artifacts. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Toaster wrapper | Existing ad-hoc inline toast behavior replaced | _platform/notifications | ✅ proceed (intended consolidation) |
| toast integration test suite | Existing project testing doctrine exists | project-rules | ⚠ adapt to fake-based testing doctrine |

### E.4) Testing & Evidence

**Coverage confidence**: 61%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 65 | `toast.promise(... success: 'File saved')` and richColors toaster present; no rendered icon/color proof. |
| AC-02 | 58 | Error path exists through `toast.promise`; no UI-level color/icon proof. |
| AC-03 | 60 | `toast.warning/info` invoked in tests; visual evidence absent. |
| AC-04 | 35 | No explicit stacking verification evidence. |
| AC-05 | 30 | No explicit duration test/evidence. |
| AC-06 | 90 | `closeButton` set on global toaster. |
| AC-07 | 88 | Toaster theme follows `resolvedTheme`; mounted inside provider tree. |
| AC-08 | 86 | Save flow uses `toast.promise` success message. |
| AC-09 | 42 | Conflict flow lacks explicit title+description contract from plan. |
| AC-10 | 95 | Workgraph external change now uses `toast.info`. |
| AC-11 | 98 | Inline workgraph toast state/timer/div removed. |
| AC-12 | 84 | Tests demonstrate toast calls from non-component function/callback contexts. |
| AC-13 | 97 | Sonner mocked in tests without rendering toaster portal. |
| AC-14 | 5 | No execution log or command output artifact to verify `just fft`. |

### E.5) Doctrine Compliance

- High: violates R-TEST-007 (no mocking libraries).  
- Medium: violates R-TEST-002 (missing required Test Doc blocks).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | success toast styling/icon | `toaster.tsx` richColors + save success message | 65 |
| AC-02 | error toast styling/icon | `toast.promise` error callback + test API usage | 58 |
| AC-03 | warning/info variants | test calls for `toast.warning/info` | 60 |
| AC-04 | stacking | no direct verification artifact | 35 |
| AC-05 | auto-dismiss ~4s | no direct verification artifact | 30 |
| AC-06 | close button | `closeButton` prop in toaster wrapper | 90 |
| AC-07 | dark mode | `resolvedTheme` mapping + provider mount | 88 |
| AC-08 | save success feedback | `handleSave` uses `toast.promise` success | 86 |
| AC-09 | conflict toast with description | generic promise error callback only | 42 |
| AC-10 | workgraph external change toast | `toast.info('Graph updated from external change')` | 95 |
| AC-11 | remove inline workgraph toast | no inline toast state/div remains | 98 |
| AC-12 | callable from hooks/utils | test utility/callback call cases | 84 |
| AC-13 | testable without Toaster render | `sonner`-level API assertions | 97 |
| AC-14 | quality gates pass | missing execution log evidence | 5 |

**Overall coverage confidence**: 61%

## G) Commands Executed

```bash
git --no-pager status --short
git --no-pager diff --name-status
git --no-pager log --oneline -n 8
git --no-pager show --pretty=format: --unified=3 50bc02f > /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/reviews/_computed.diff
git --no-pager show --name-status --pretty=format: 50bc02f
rg -n "042-global-toast|global toast|sonner|toaster" /home/jak/substrate/041-file-browser
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md  
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-spec.md  
**Phase**: Simple Mode  
**Tasks dossier**: inline in plan  
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/execution.log.md (missing)  
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/reviews/review.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/src/components/ui/toaster.tsx | reviewed | _platform/notifications | none |
| /home/jak/substrate/041-file-browser/apps/web/src/components/providers.tsx | reviewed | _platform/notifications | none |
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | reviewed | file-browser | adjust conflict/refresh toast behavior |
| /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/workgraphs/[graphSlug]/workgraph-detail-client.tsx | reviewed | workgraph-ui (informal) | none |
| /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts | reviewed | file-browser | replace mocks/add doctrine-compliant tests |
| /home/jak/substrate/041-file-browser/docs/domains/_platform/notifications/domain.md | reviewed | _platform/notifications | none |
| /home/jak/substrate/041-file-browser/docs/domains/registry.md | reviewed | docs/domains | resolve workgraph-ui registration mismatch |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | reviewed | docs/domains | align edge/domain governance |
| /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md | reviewed | plan | complete manifest mappings |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts | Remove `vi.mock`/`vi.fn`; use fake-based approach and required Test Doc blocks | Required by rules/constitution |
| 2 | /home/jak/substrate/041-file-browser/test/unit/web/features/042-global-toast/toast-integration.test.ts | Add tests that execute production save/conflict/external-change flows | Current tests miss real wiring regressions |
| 3 | /home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Implement explicit conflict toast contract and clarify/implement refresh toast coverage | Align with AC-09 and plan scope |
| 4 | /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md | Add missing changed-file manifest entries and domain normalization notes | Avoid orphan manifest files |
| 5 | /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/execution.log.md | Add execution evidence for quality gates (`just fft`) | Required to validate AC-14 |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/registry.md | Register/formalize `workgraph-ui` or remove informal domain label usage |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Ensure consumer/domain relationship labeling stays canonical with registry governance |
| /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md | Domain manifest entries for all touched files (package/lock/test) |

### Next Step

/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/042-global-toast-system/global-toast-system-plan.md --phase "Simple Mode remediation"
