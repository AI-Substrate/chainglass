# Code Review: Phase 2: Canvas Core + Layout

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 2: Canvas Core + Layout
**Date**: 2026-02-26
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD (spec), implementation evidence currently reflects Hybrid

## A) Verdict

**REQUEST_CHANGES**

High-severity implementation safety and compliance gaps remain (trusted-root validation, structured error path, TDD evidence, and doctrine/domain traceability), so approval is blocked.

**Key failure areas**:
- **Implementation**: `workflow-actions.ts` trusts unverified worktree paths and can throw uncaught missing-graph errors.
- **Domain compliance**: Domain Manifest/domain docs/domain-map are not current for the full phase file set.
- **Testing**: Full-TDD RED→GREEN evidence is not demonstrated and AC coverage claims exceed the evidence.
- **Doctrine**: `vi.mock()` is used in a touched test file despite the fakes-only rule.

## B) Summary

Phase 2 delivers substantial UI progress (new routes, editor shell, canvas/line/node/toolbox components, actions, and tests), but several blocking review issues remain. The largest implementation risks are in server actions: untrusted `worktreePath` input handling and `Promise.all` usage that can bypass typed error returns. Domain governance artifacts are stale relative to the phase diff, especially Domain Manifest traceability and workflow-ui/domain-map currency. Anti-reinvention checks found overlap with legacy/workgraph and panel-layout concepts, but most are intentional divergence for this phase. Testing evidence is broad but not TDD-complete and does not fully substantiate all claimed AC coverage.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED evidence captured before implementation for phase-critical behavior
- [ ] GREEN evidence captured with concrete command output and pass/fail trail
- [ ] Refactor evidence captured where behavior changed

Universal (all approaches):
- [ ] Only in-scope files changed
- [ ] Linters/type checks clean (phase-level explicit output captured)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts:38-47 | security | `resolveWorkspaceContext()` accepts arbitrary `worktreePath` instead of constraining to known workspace worktrees. | Resolve trusted root via workspace worktree lookup (same pattern as file-actions) and reject unknown paths. |
| F002 | HIGH | /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts:108-115; /Users/jordanknight/substrate/chainglass-048/packages/positional-graph/src/services/positional-graph.service.ts:1220-1223 | error-handling | `loadWorkflow()` calls `getStatus()` in parallel with `load()`; missing graph throws and can bypass typed `errors` return. | Load first, short-circuit on load errors, then call `getStatus()` safely (or map exceptions to typed errors). |
| F003 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md:162-166; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/execution.log.md:11-84 | testing | Spec requires Full TDD, but execution log contains only green-state outcomes without RED→GREEN evidence trail. | Add explicit RED and GREEN command/evidence entries per task (or revise strategy if intentionally changed). |
| F004 | HIGH | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md:27-51; /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-2-canvas-core-layout.txt | domain | Phase file manifest includes many changed files not mapped in Plan 050 Domain Manifest. | Update Domain Manifest to include all touched files/patterns or tighten phase scope diff. |
| F005 | HIGH | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/use-file-filter.test.ts:25-27 | doctrine | `vi.mock()` usage violates fakes-only policy (R-TEST-007). | Replace mock-based dependency substitution with a fake/test harness. |
| F006 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts:84-93 | error-handling | `listWorkflows()` fails whole action if any per-workflow status call throws/fails. | Use `Promise.allSettled` or per-item guard so one bad graph does not blank the full list. |
| F007 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx:36-44 | scope | Line header omits editable label interaction, settings gear placeholder, and delete placeholder called out in phase tasks. | Add the expected header affordances (placeholder behavior acceptable for this phase if wired later). |
| F008 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx:44-49; /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx:17-33 | scope | Template breadcrumb is not wired from page data into `WorkflowTempBar`; required template→instance context is not evidenced. | Flow template source metadata through load result → editor props → temp bar and test it. |
| F009 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md:32-58,80-85 | domain | workflow-ui domain.md is stale (source path, composition/dependency statements, and history not updated for Phase 2 reality). | Update source location, composition dependencies, and add Phase 2 history entry. |
| F010 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md:45-51,67-80 | domain | domain-map workflow-ui node/health summary still indicates panel-layout usage and stale contracts relative to implementation. | Refresh workflow-ui edges/labels and health-summary provider/consumer cells. |
| F011 | MEDIUM | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx; /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx; /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/work-unit-toolbox.test.tsx; /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-list.test.tsx; /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/file-filter.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/file-list.test.ts; /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx | doctrine | Touched/new tests omit required 5-field Test Doc blocks (R-TEST-002). | Add full Test Doc comments to touched/new tests or formally amend doctrine if no longer enforced. |
| F012 | LOW | /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/work-unit-toolbox.tsx:34-36,88-96 | scope | Toolbox renders/searches by slug only; task dossier expects item description display. | Include description in payload/render and include description in search matching. |

## E) Detailed Findings

### E.1) Implementation Quality

- F001: Untrusted root selection in workspace context resolution.
- F002: Missing-graph error path escapes typed result contract.
- F006: One status failure can break full workflow list rendering.
- F007: Required line-header controls are not present.
- F008: Template breadcrumb data path is incomplete.
- F012: Toolbox metadata/rendering is narrower than task expectation.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New workflow-ui source files are under expected feature/route trees. |
| Contract-only imports | ✅ | No cross-domain internal import violation detected in reviewed files. |
| Dependency direction | ✅ | No infra→business dependency inversion detected. |
| Domain.md updated | ❌ | F009: workflow-ui domain doc is stale for Phase 2. |
| Registry current | ✅ | `workflow-ui` remains correctly registered in registry.md. |
| No orphan files | ❌ | F004: manifest includes many touched files not mapped in plan Domain Manifest. |
| Map nodes current | ❌ | F010: workflow-ui node/contracts are stale in domain-map. |
| Map edges current | ❌ | F010: workflow-ui edge labels/providers are not current. |
| No circular business deps | ✅ | No business-domain cycle introduced by this phase diff. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| WorkflowEditorLayout | PanelShell/ExplorerPanel layout primitives | _platform/panel-layout | ⚠️ Review: overlap exists, but phase dossier explicitly chose standalone layout; treat as intentional unless architecture is reverted. |
| WorkUnitToolbox | Legacy workgraph toolbox pattern | _platform/workgraph (deprecated) | ✅ Proceed (different domain model and migration target). |
| WorkflowCanvas | Legacy workgraph canvas | _platform/workgraph (deprecated) | ✅ Proceed (new line-based model). |
| WorkflowNodeCard | Legacy workgraph node renderer | _platform/workgraph (deprecated) | ✅ Proceed (new status semantics). |
| WorkflowTempBar | Explorer panel/header concepts | _platform/panel-layout | ✅ Proceed (temporary bridge component by plan decision). |
| workflow-actions | Legacy workgraph API/service surface | _platform/workgraph (deprecated) | ✅ Proceed (new positional-graph flow). |
| WorkflowList | No meaningful equivalent found | — | ✅ Proceed. |

### E.4) Testing & Evidence

**Coverage confidence**: **55%**

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-01 | 65% | Routes/pages exist and render list/editor shell; no route-level behavior verification beyond rendering. |
| AC-02 | 82% | `workflow-canvas.test.tsx` validates line rows/numbering/node placement. |
| AC-03 | 88% | Empty canvas and empty line placeholders are implemented and tested. |
| AC-04 | 20% | Add Line button presence only; no mutation/persistence evidence in Phase 2 artifacts. |
| AC-05 | 35% | Transition text exists, but label editing/settings/delete controls are not implemented/evidenced. |
| AC-06 | 84% | Toolbox grouping/search/collapse/empty states covered by unit tests. |
| AC-10 | 78% | Node card unit type, slug, context badge, and status metadata are tested. |
| AC-11 | 62% | All 8 statuses are enumerated; semantic color/animation verification is partial. |
| AC-20 | 25% | Temp bar supports optional source text but page data path does not supply template source. |
| AC-22b | 38% | Buttons render in page header, but flow/validation behavior is deferred and untested. |
| AC-35 | 42% | Rendering-focused tests exist; broader Full-TDD scope items remain for later phases. |

### E.5) Doctrine Compliance

Project-rules docs are present and enforceable:
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/rules.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/idioms.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/architecture.md
- /Users/jordanknight/substrate/chainglass-048/docs/project-rules/constitution.md

Doctrine findings:
- F005: direct violation of fakes-only policy (`vi.mock`).
- F011: missing required Test Doc format in touched/new tests.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-01 | Workspace-scoped list/editor pages | New page routes + server actions + editor/list components | 65 |
| AC-02 | Line rows and node layout | `workflow-canvas.tsx` + `workflow-canvas.test.tsx` line rendering assertions | 82 |
| AC-03 | Empty workflow/line placeholders | `empty-states.tsx` + placeholder tests | 88 |
| AC-04 | Add line with persistence | Button exists; persistence wiring/evidence absent | 20 |
| AC-05 | Line header controls | Partial (label text + transition only), key controls absent | 35 |
| AC-06 | Toolbox grouping/search | `work-unit-toolbox.tsx` + unit tests for grouping/filter/collapse | 84 |
| AC-10 | Node card fields | `workflow-node-card.tsx` + tests for icon/status/badge/name | 78 |
| AC-11 | 8 status colors/states | Status map has 8 states; tests check status attribute coverage | 62 |
| AC-20 | Template/instance breadcrumb | Temp bar supports optional prop, but page path does not provide data | 25 |
| AC-22b | New blank/new template affordances | Header buttons exist (disabled), modal/validation flow not present | 38 |
| AC-35 | Unit tests with fakes | 4 new workflow-ui test files; TDD/doctrine evidence incomplete | 42 |

**Overall coverage confidence**: **55%**

## G) Commands Executed

```bash
git --no-pager diff --stat && git --no-pager diff --staged --stat
git --no-pager status --short && git --no-pager log --oneline -30 -- docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md apps/web/src/features/050-workflow-page apps/web/app/actions/workflow-actions.ts test/unit/web/features/050-workflow-page ':(literal)apps/web/app/(dashboard)/workspaces/[slug]/workflows' apps/web/src/lib/navigation-utils.ts
mkdir -p docs/plans/050-workflow-page-ux/reviews && git --no-pager diff --name-status f32e646..da3725c > docs/plans/050-workflow-page-ux/reviews/_manifest.phase-2-canvas-core-layout.txt && git --no-pager diff --unified=3 f32e646..da3725c > docs/plans/050-workflow-page-ux/reviews/_computed.diff
rg -n "async getStatus\\(ctx: WorkspaceContext, graphSlug: string\\)" packages/positional-graph/src/services/positional-graph.service.ts
rg -n "throw new Error|not found|getStatus\\(" packages/positional-graph/src/services/positional-graph.service.ts
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
**Spec**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-spec.md
**Phase**: Phase 2: Canvas Core + Layout
**Tasks dossier**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/tasks.md
**Execution log**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/execution.log.md
**Review file**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-2-canvas-core-layout.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx | Modified | file-browser | Review scope inclusion (F004/F011) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx | Added | workflow-ui | Fix breadcrumb wiring (F008) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/workflows/page.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts | Added | workflow-ui | Fix trusted root + load/status error path + list resilience (F001/F002/F006) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/empty-states.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/work-unit-toolbox.tsx | Added | workflow-ui | Add description support (F012) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx | Added | workflow-ui | Verify AC-04 behavior/evidence (F003) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor-layout.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx | Added | workflow-ui | Add missing header controls (F007) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-list.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx | Added | workflow-ui | Align breadcrumb format/wiring (F008) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/types.ts | Added | workflow-ui | No blocker |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx | Modified | _platform/panel-layout | Review scope inclusion (F004/F011) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Modified | _platform/panel-layout | Review scope inclusion (F004) |
| /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/navigation-utils.ts | Modified | workflow-ui (cross-domain nav) | No blocker |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/file-browser/domain.md | Modified | file-browser docs | Review scope inclusion (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/049-ux-enhancements/feature-2-file-filter/tasks/execution.log.md | Modified | plan docs | Review scope inclusion (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff | Modified | review artifact | No blocker |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.txt | Added | review artifact | Review scope inclusion (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/fix-tasks.phase-1-domain-setup-foundations.md | Added | review artifact | Review scope inclusion (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/review.phase-1-domain-setup-foundations.md | Modified | review artifact | Review scope inclusion (F004) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/dyk.phase-2.md | Added | plan artifact | No blocker |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/execution.log.md | Added | plan artifact | Add RED→GREEN evidence and AC mapping (F003) |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/tasks.fltplan.md | Added | plan artifact | No blocker |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/tasks.md | Added | plan artifact | No blocker |
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Modified | plan artifact | Update Domain Manifest mappings (F004) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/file-filter.test.ts | Modified | file-browser tests | Add Test Doc blocks (F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/file-list.test.ts | Modified | file-browser tests | Add Test Doc blocks (F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/use-file-filter.test.ts | Modified | file-browser tests | Remove `vi.mock`, add Test Doc blocks (F005/F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/work-unit-toolbox.test.tsx | Added | workflow-ui tests | Add Test Doc blocks (F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx | Added | workflow-ui tests | Add Test Doc blocks (F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-list.test.tsx | Added | workflow-ui tests | Add Test Doc blocks (F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx | Added | workflow-ui tests | Add Test Doc blocks (F011) |
| /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx | Modified | _platform/panel-layout tests | Add Test Doc blocks (F011) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts | Enforce trusted worktree root selection and reject unknown worktree paths | Prevent arbitrary-root server action execution (F001) |
| 2 | /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts | Remove unsafe parallel `load`/`getStatus` call path; preserve typed error contract | Avoid uncaught missing-graph errors and 500 responses (F002) |
| 3 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/execution.log.md | Add explicit RED→GREEN TDD evidence and align AC claim confidence | Spec requires Full TDD evidence and current log is incomplete (F003) |
| 4 | /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md; /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md; /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | Update Domain Manifest/domain.md/domain-map to current phase topology and touched files | Domain traceability and architecture map are stale (F004/F009/F010) |
| 5 | /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/use-file-filter.test.ts | Replace `vi.mock` with fake-based approach | Mandatory doctrine rule violation (F005) |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md | Domain Manifest entries/patterns covering all phase-touched files |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md | Phase 2 history entry, source path correction, dependency/composition currency |
| /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md | workflow-ui edge labels/providers and health summary currency |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md --phase 'Phase 2: Canvas Core + Layout'
