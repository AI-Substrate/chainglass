# Code Review: Phase 2: Editor Page — Routes, Layout, Type-Specific Editors

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md
**Phase**: Phase 2: Editor Page — Routes, Layout, Type-Specific Editors
**Date**: 2026-02-28
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

Blocking issues remain in runtime error handling, domain documentation/map currency, and Full-TDD evidence compliance.

**Key failure areas**:
- **Implementation**: Editor page can pass invalid/empty content into JSON parsing path and crash for user-input units.
- **Domain compliance**: New/changed domain artifacts are not fully synchronized (registry, domain.md, domain-map updates).
- **Testing**: Phase-2 implementation added many source files but no phase-specific test files and no RED→GREEN evidence trail.
- **Doctrine**: Project rules require TDD and centralized test evidence for implementation work.

## B) Summary

The implementation is substantial and mostly aligned with planned Phase-2 scope, but there is a concrete error-handling gap in the editor content load path. Domain governance artifacts are behind the code changes: the new business domain and dependency edges are not fully reflected in domain registry/map/domain docs. Reinvention risk is moderate: one language-detection helper appears duplicated and should likely reuse an existing utility. Testing evidence is the largest process gap: the spec declares Full TDD, but the phase diff has no added tests and execution evidence is aggregate only. Overall quality is promising, but not yet review-complete under current project rules.

## C) Checklist

**Testing Approach: Full TDD**

For Full TDD:
- [ ] RED tests were added first for new behavior
- [ ] GREEN evidence captured for implemented behavior
- [ ] REFACTOR stage preserved green status with evidence

Universal (all approaches):
- [x] Only in-scope files changed
- [x] Linters/type checks clean (per execution log claim)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx:15-47 | error-handling | `contentResult.errors` is not checked before handing content to user-input JSON parse path. | Block render when content load fails and show explicit error UI before rendering `WorkUnitEditor`. |
| F002 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/registry.md | domain-compliance | New business domain `058-workunit-editor` is missing from registry and no domain doc exists for it. | Add `docs/domains/058-workunit-editor/domain.md` and register it in `registry.md`. |
| F003 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md | domain-compliance | Domain map does not include the new domain node and labeled dependency edges for Phase 2. | Update mermaid map + Domain Health Summary + labeled edges. |
| F004 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/_computed.diff | testing | Full-TDD strategy declared, but phase diff contains no new/updated tests for new routes/actions/hooks/components. | Add phase-2 tests (unit/integration) and capture RED→GREEN evidence. |
| F005 | HIGH | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/execution.log.md:83-86 | testing | Evidence is aggregate-only (`just fft` summary) and not mapped to acceptance criteria with concrete outputs. | Add per-AC verification evidence (commands + outputs) to execution log. |
| F006 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/041-file-browser/components/code-editor.tsx:12; /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/agent-editor.tsx:4; /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx:4 | contract-imports | Consumers import viewer internals via `/components/code-editor` instead of public contract export. | Import `CodeEditor` from `@/features/_platform/viewer` barrel contract. |
| F007 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md:30-66 | domain-compliance | Domain Manifest is incomplete for several phase-created files (orphan mapping gap). | Add missing file→domain mappings for all new files. |
| F008 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx:17-34 | reinvention | Local extension→language map duplicates existing language detection utility capability. | Reuse/extend `/Users/jordanknight/substrate/058-workunit-editor/apps/web/src/lib/language-detection.ts`. |
| F009 | MEDIUM | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx:57 | error-handling | `JSON.parse(content)` is unguarded in render path for user-input editor. | Wrap parse in safe conversion path and render recoverable error state on invalid payload. |
| F010 | LOW | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-creation-modal.tsx | reinvention | Slug validation behavior overlaps existing naming-modal patterns. | Reuse shared validation helper/pattern to avoid drift. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: Missing error guard between `loadUnitContent()` and render path can propagate invalid payloads to JSON parse branch.
- **F009 (MEDIUM)**: User-input parse is done inline in render (`JSON.parse(content)`), so malformed content can hard-fail rendering.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | New `_platform/hooks/use-auto-save.ts` and several new files are not fully reflected in declared manifest/domain artifacts. |
| Contract-only imports | ❌ | Viewer consumers import internal component path instead of public viewer contract barrel. |
| Dependency direction | ✅ | No infrastructure→business import direction violation found in sampled changes. |
| Domain.md updated | ❌ | No `/docs/domains/058-workunit-editor/domain.md`; touched domains not fully updated for Phase 2 changes. |
| Registry current | ❌ | `registry.md` has no `058-workunit-editor` entry. |
| No orphan files | ❌ | Plan domain manifest omits several changed files from this phase diff. |
| Map nodes current | ❌ | `domain-map.md` node set does not include the new business domain. |
| Map edges current | ❌ | New dependencies/contract edges are not fully represented and labeled for Phase 2. |
| No circular business deps | ✅ | No business→business cycle introduced by reviewed changes. |
| Concepts documented | ⚠️ | Concepts coverage for newly introduced contracts/components is incomplete. |

Domain-specific findings: **F002, F003, F006, F007**.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| Work unit server action scaffold | /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/actions/workflow-actions.ts | workflow-ui | Proceed (pattern reuse acceptable) |
| Slug validation in creation modal | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/050-workflow-page/components/naming-modal.tsx | workflow-ui | Minor overlap (LOW) |
| Code editor language detection map | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/lib/language-detection.ts | _platform/viewer | Recommend reuse/extension (MEDIUM) |

### E.4) Testing & Evidence

**Coverage confidence**: 52%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-4 | 32 | Route/refresh behavior exists, but no evidence proving workflow toolbox updates without refresh. |
| AC-6 | 58 | `useAutoSave` integrated for metadata/content, but no targeted persistence tests in diff. |
| AC-7 | 80 | Agent editor uses shared `CodeEditor` with markdown and autosave wiring. |
| AC-8 | 82 | Code editor language detection + shell support wiring present. |
| AC-9 | 73 | User-input form builder present with conditional options and min-2 enforcement. |
| AC-21 | 92 | Sidebar nav entry added before Workflows in `navigation-utils.ts`. |

### E.5) Doctrine Compliance

- **R-TEST-001 / Constitution Principle 3 (HIGH)**: Full-TDD is declared, but phase diff has no added tests for substantial implementation changes (**F004**).
- **R-TEST-006 alignment gap (MEDIUM)**: Task dossier references colocated test movement guidance, conflicting with centralized test doctrine expectations.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-4 | New unit appears in catalog without refresh | `unit-creation-modal.tsx` uses `router.push` + `router.refresh`; no direct toolbox verification artifact | 32 |
| AC-6 | Metadata auto-save to disk | `metadata-panel.tsx` + `use-auto-save.ts` integration shown in diff | 58 |
| AC-7 | Agent prompt editing with markdown highlighting | `agent-editor.tsx` uses `CodeEditor` `language="markdown"` | 80 |
| AC-8 | Code script editing with language detection | `code-unit-editor.tsx` filename-based detection + shell support in shared editor | 82 |
| AC-9 | User-input configuration | `user-input-editor.tsx` supports question type/prompt/options/default and autosave | 73 |
| AC-21 | Sidebar navigation entry before Workflows | `navigation-utils.ts` adds `work-units` before `workflows` | 92 |

**Overall coverage confidence**: 52%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -10
git --no-pager diff 01024d9..54b5cbd > /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/_computed.diff
git --no-pager diff --name-status 01024d9..54b5cbd
git --no-pager diff --name-only 01024d9..54b5cbd | rg '^test/|\.test\.(ts|tsx)$' || true
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
**Spec**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md
**Phase**: Phase 2: Editor Page — Routes, Layout, Type-Specific Editors
**Tasks dossier**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/tasks.md
**Execution log**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/execution.log.md
**Review file**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/reviews/review.phase-2-editor-page.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx | created | 058-workunit-editor | Yes (F001) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/page.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/actions/workunit-actions.ts | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/package.json | modified | cross-domain | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/041-file-browser/components/code-editor.tsx | modified | file-browser | Yes (F006) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/agent-editor.tsx | created | 058-workunit-editor | Yes (F006) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx | created | 058-workunit-editor | Yes (F006, F008) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/metadata-panel.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/save-indicator.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-catalog-sidebar.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-creation-modal.tsx | created | 058-workunit-editor | Yes (F010) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-list.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/user-input-editor.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor-layout.tsx | created | 058-workunit-editor | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx | created | 058-workunit-editor | Yes (F009) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/_platform/hooks/use-auto-save.ts | created | _platform/hooks | Yes (F007) |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/_platform/viewer/components/code-editor.tsx | created | _platform/viewer | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/_platform/viewer/index.ts | created | _platform/viewer | No |
| /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/lib/navigation-utils.ts | modified | cross-domain | No |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/execution.log.md | created | plan-artifact | Yes (F005) |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/tasks.fltplan.md | modified | plan-artifact | No |
| /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/tasks.md | modified | plan-artifact | Yes (F007) |
| /Users/jordanknight/substrate/058-workunit-editor/pnpm-lock.yaml | modified | dependency-lock | No |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx | Guard `contentResult.errors` and stop render on failed content load | Prevent user-input parse-time crash path |
| 2 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx | Replace inline `JSON.parse` with safe parse + fallback UI | Avoid render crashes on malformed payloads |
| 3 | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/registry.md | Add `058-workunit-editor` domain registration | Keep registry current with implemented domain |
| 4 | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md | Create domain doc (Purpose/Boundary/Contracts/Composition/History/Concepts) | Domain compliance requires domain artifact |
| 5 | /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md | Add node + labeled edges + health summary updates | Domain topology must reflect current dependencies |
| 6 | /Users/jordanknight/substrate/058-workunit-editor/test/... | Add phase-2 tests and RED→GREEN evidence | Required by Full TDD + doctrine |
| 7 | /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-2-editor-page/execution.log.md | Add per-AC command/output evidence | Current evidence is too aggregate for verification |
| 8 | /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/041-file-browser/components/code-editor.tsx; /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/agent-editor.tsx; /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx | Import viewer contract barrel instead of internal path | Enforce contract-only cross-domain usage |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/registry.md | `058-workunit-editor` entry |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md | New domain node, labeled dependency edges, health summary row updates |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md | Full domain definition + Concepts table |
| /Users/jordanknight/substrate/058-workunit-editor/docs/domains/file-browser/domain.md | History/composition update for CodeEditor extraction and re-export |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md --phase 'Phase 2: Editor Page — Routes, Layout, Type-Specific Editors'
