# Code Review: Phase 1: Panel Infrastructure

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-spec.md
**Phase**: Phase 1: Panel Infrastructure
**Date**: 2026-02-24
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Full TDD

## A) Verdict

**REQUEST_CHANGES**

High-severity correctness and verification gaps remain: ExplorerPanel can stay stuck in edit mode after path selection, and Phase 1 testing evidence does not meet the declared Full TDD bar.

**Key failure areas**:
- **Implementation**: ExplorerPanel `editing` state is initialized from `!filePath` and never reconciled when `filePath` later becomes non-empty.
- **Domain compliance**: Domain map/docs currently mark panel-layout dependency edges as active before file-browser consumption is wired.
- **Testing**: Required Phase 1 checks (Explorer blur/spinner/select-all details and PanelShell/MainPanel behavior) are under-evidenced versus task/spec claims.
- **Doctrine**: New tests use `vi.fn()`/mocking primitives despite the current project rules disallowing mocks.

## B) Summary

Phase 1 code structure is largely aligned with planned scope and domain placement, and the panel-layout domain artifacts were created and registered. However, one implementation bug in ExplorerPanel can produce incorrect UI state after selection changes. Testing evidence quality is insufficient for the declared Full TDD approach and does not convincingly verify all Phase 1 acceptance criteria. Domain-map/documentation is close but currently reflects one dependency edge as active before the corresponding consumption change lands.

## C) Checklist

**Testing Approach: Full TDD**

- [ ] RED→GREEN evidence captured for implemented tasks
- [ ] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented
- [x] Only in-scope files changed
- [ ] Linters/type checks clean (if applicable)
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx:40-51,127 | correctness | `editing` state can remain true after `filePath` transitions from empty to non-empty, keeping input mode visible incorrectly. | Reconcile `editing` on external `filePath` updates (or derive display mode from explicit edit intent). |
| F002 | HIGH | /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx | testing | Declared Full TDD + task claims are not fully evidenced (missing explicit blur-revert, spinner behavior, and select-all assertions). | Add missing assertions/tests and log RED→GREEN evidence in execution log. |
| F003 | HIGH | /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx; /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx; /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/left-panel.test.tsx | doctrine | Tests use `vi.fn()`/mocking primitives while docs/project-rules/rules.md R-TEST-007 forbids them. | Replace with fake implementations or formally update/clarify rules if exceptions are intended for UI callback tests. |
| F004 | MEDIUM | /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | map-edges | Map shows `file-browser -> panel-layout` and `panel-layout -> workspace-url` as active contracts before Phase 3 wiring is implemented. | Mark as planned/future until imports exist, or move note to planned section. |
| F005 | MEDIUM | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-1-panel-infrastructure/execution.log.md | testing-evidence | Execution log gives summary counts but not command transcripts/traceable outputs for independent verification. | Record exact command outputs (or CI run references) per task block. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)**: ExplorerPanel initializes `editing` with `useState(!filePath)` and only syncs `inputValue` on updates. If initialized empty, later non-empty `filePath` does not force display mode, so `showInput = editing || !filePath` can stay true and hide path-display mode.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New Phase 1 source files are under `/apps/web/src/features/_platform/panel-layout/` plus shadcn UI contract file. |
| Contract-only imports | ✅ | No cross-domain internal imports observed in changed Phase 1 code. |
| Dependency direction | ✅ | No infra→business dependency violations detected in Phase 1 code. |
| Domain.md updated | ✅ | `/docs/domains/_platform/panel-layout/domain.md` includes Phase 1 history/composition/contracts. |
| Registry current | ✅ | `/docs/domains/registry.md` includes Panel Layout domain. |
| No orphan files | ✅ | Phase 1 implementation/test files map to panel-layout plan scope; planning artifacts excluded from runtime manifest checks. |
| Map nodes current | ✅ | Panel-layout node present in `/docs/domains/domain-map.md`. |
| Map edges current | ❌ | `file-browser -> panel-layout` and `panel-layout -> workspace-url` are represented as active before wiring is implemented. |
| No circular business deps | ✅ | No business-to-business cycle introduced by Phase 1 artifacts. |

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| PanelShell | BrowserClient inline layout shell | file-browser | Intentional extraction (proceed) |
| PanelHeader | FileTree sticky header block | file-browser | Intentional extraction (proceed) |
| ExplorerPanel | FileViewerPanel path row behavior | file-browser | Intentional extraction (proceed) |
| LeftPanel | None | N/A | proceed |
| MainPanel | Inline content wrapper | file-browser | Intentional extraction (proceed) |

### E.4) Testing & Evidence

**Coverage confidence**: 58%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-10 | 78 | Explorer handler chain tests exist, including stop-on-first-true behavior. |
| AC-26 | 30 | No direct test evidence for PanelShell composition behavior in changed tests. |
| AC-27 | 82 | PanelHeader/LeftPanel tests cover title/buttons/callbacks. |
| AC-28 | 25 | No direct MainPanel behavior assertions in changed tests. |

### E.5) Doctrine Compliance

- **F003 (HIGH)**: R-TEST-007 in `/docs/project-rules/rules.md` states no `vi.fn()`/mocking primitives; Phase 1 tests currently use `vi.fn()` and mock-based callback assertions.

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-10 | ExplorerPanel handler chain composable | `/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx` handler-chain case | 78 |
| AC-26 | PanelShell composes Explorer+Left+Main | Implementation present in `/apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx`; no direct test coverage in changed tests | 30 |
| AC-27 | PanelHeader consistency | `/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx`, `/left-panel.test.tsx` | 82 |
| AC-28 | MainPanel wraps content with flex/overflow | Implementation present in `/apps/web/src/features/_platform/panel-layout/components/main-panel.tsx`; no direct test coverage in changed tests | 25 |

**Overall coverage confidence**: 58%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager log --oneline -10
git --no-pager log --oneline -- apps/web/src/features/_platform/panel-layout | head -n 20
git --no-pager log --oneline -- test/unit/web/features/_platform/panel-layout | head -n 20
git --no-pager status --short --untracked-files=all -- apps/web/src/features/_platform/panel-layout test/unit/web/features/_platform/panel-layout apps/web/src/components/ui/resizable.tsx docs/plans/043-panel-layout
# computed diff written to:
# /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/reviews/_computed.diff
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
**Spec**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-spec.md
**Phase**: Phase 1: Panel Infrastructure
**Tasks dossier**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-1-panel-infrastructure/tasks.md
**Execution log**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-1-panel-infrastructure/execution.log.md
**Review file**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/reviews/review.phase-1-panel-infrastructure.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | reviewed | panel-layout | Yes (F001) |
| /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx | reviewed | panel-layout | Yes (F002, F003) |
| /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/panel-header.test.tsx | reviewed | panel-layout | Yes (F003) |
| /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/left-panel.test.tsx | reviewed | panel-layout | Yes (F003) |
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | reviewed | docs/domains | Yes (F004) |
| /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-1-panel-infrastructure/execution.log.md | reviewed | docs/plans | Yes (F005) |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /home/jak/substrate/041-file-browser/apps/web/src/features/_platform/panel-layout/components/explorer-panel.tsx | Reconcile edit/display mode when `filePath` changes from empty to non-empty | Prevent stuck input mode after selection changes |
| 2 | /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/explorer-panel.test.tsx | Add missing explicit assertions for blur revert, spinner behavior, and focus select-all | Bring tests in line with task/spec claims |
| 3 | /home/jak/substrate/041-file-browser/test/unit/web/features/_platform/panel-layout/*.test.tsx | Replace mock primitives or align rule docs to current policy | Satisfy doctrine/rules consistency |
| 4 | /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Mark pre-wiring edges as planned/future | Keep domain map implementation-accurate |
| 5 | /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-1-panel-infrastructure/execution.log.md | Add traceable RED→GREEN evidence and command outputs | Meet Full TDD evidence standard |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /home/jak/substrate/041-file-browser/docs/domains/domain-map.md | Active edge state should reflect implemented imports |

### Next Step

/plan-6-v2-implement-phase --plan /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md --phase 'Phase 1: Panel Infrastructure'
