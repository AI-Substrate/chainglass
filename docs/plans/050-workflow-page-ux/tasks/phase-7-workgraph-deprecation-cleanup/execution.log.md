# Execution Log: Phase 7 — Workgraph Deprecation + Cleanup

**Phase**: Phase 7: Workgraph Deprecation + Cleanup
**Started**: 2026-02-27

---

## T001: Execute workgraph reference audit

**Status**: ✅ Complete
**Started**: 2026-02-27T02:38Z

Audit completed during dossier preparation. Full blast radius documented in tasks.md Pre-Implementation Check table. Key findings:

- **42 files** total with workgraph references across codebase
- **22 files** in `apps/web/` to DELETE or MODIFY
- **17 files** in feature 022 folder (DELETE entire dir)
- **18 test files** in `test/unit/web/features/022-workgraph-ui/` (DELETE)
- **1 test file** at `test/unit/workflow/workgraph-watcher.adapter.test.ts` (DELETE — DYK insight: outside 022 dir)
- **1 integration test** at `test/integration/workflow/features/023/central-watcher.integration.test.ts` (VERIFY)
- Worktree page (`worktree/page.tsx`) imports WorkGraphUIService — must update
- DI container has ~20 lines of workgraph registrations
- `.next/standalone/` has stale copies — exclude from grep, clear cache

**Evidence**: grep audit output in prior conversation context.

---

## T002: Delete workgraph pages + API routes + legacy workflow pages

**Dossier Task**: T002
**Status**: Completed

### Changes Made

- Deleted `apps/web/app/(dashboard)/workspaces/[slug]/workgraph/` (3 files)
- Deleted `apps/web/app/api/workgraph/` (4 files)
- Deleted legacy `/workflow` page
- Deleted legacy `/workflows` pages (4+ files)
- Deleted orphaned units API route

### Evidence

- `find apps/web/app -path "*workgraph*"` → 0 results
- `find apps/web/app -path "*workflow*"` → returns only workspace-scoped routes
- ACs satisfied: AC-31, AC-33

---

## T003: Delete Plan 022 feature folder + orphaned Plan 011 components

**Dossier Task**: T003
**Status**: Completed

### Changes Made

- Deleted `apps/web/src/features/022-workgraph-ui/` (17 files)
- Deleted `apps/web/src/components/workflow/` (11 files)
- Deleted `apps/web/src/components/workflows/` (1 file)
- Deleted `apps/web/src/components/ui/workflow-breadcrumb.tsx`
- Deleted `apps/web/src/hooks/useFlowState.ts`
- Deleted `apps/web/src/hooks/usePhaseSimulation.ts`

### Evidence

- Feature 022 folder removed entirely
- `grep` for imports of deleted modules → 0 results
- AC satisfied: AC-31

---

## T004: Remove WorkGraph*Adapter + unregister from central notifications

**Dossier Task**: T004
**Status**: Completed

### Changes Made

- Deleted `packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts`
- Deleted `apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter.ts`
- Modified `packages/workflow/src/.../index.ts` — removed workgraph adapter export
- Modified `packages/workflow/src/index.ts` — removed re-export
- Modified `start-central-notifications.ts` — removed workgraph adapter wiring
- Modified `027 index.ts` — removed export

### Evidence

- AC satisfied: AC-34

---

## T005: Remove workgraph DI registrations + update worktree page

**Dossier Task**: T005
**Status**: Completed

### Changes Made

- Modified `apps/web/src/lib/di-container.ts` — removed ~20 lines: `WORKGRAPH_DI_TOKENS` import, `registerWorkgraphServices` call, `WorkGraphUIService` registration, test fakes
- Modified `apps/web/app/(dashboard)/workspaces/[slug]/worktree/page.tsx` — replaced `WorkGraphUIService` with `IPositionalGraphService`, renamed "WorkGraphs" card → "Workflows" card

### Evidence

- `grep -ri workgraph apps/web/src/lib/di-container.ts` → 0 results

---

## T006: Delete Plan 022 test files + update cross-referencing tests

**Dossier Task**: T006
**Status**: Completed

### Changes Made

- Deleted `test/unit/web/features/022-workgraph-ui/` (18 files)
- Deleted `test/unit/web/027-central-notify-events/workgraph-domain-event-adapter.test.ts`
- Deleted `test/unit/workflow/workgraph-watcher.adapter.test.ts` (DYK insight #1 — outside 022 dir)
- Deleted `test/unit/web/hooks/use-flow-state.test.tsx`
- Deleted `test/ui/workflow-views.test.tsx`
- Deleted `test/integration/web/workflow-page.test.tsx`
- Deleted `test/integration/027-central-notify-events/watcher-to-notifier.integration.test.ts`
- Modified `test/unit/web/features/042-global-toast/toast-integration.test.ts` — removed workgraph toast test
- Modified `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` — changed `WorkspaceDomain.Workgraphs` → `Workflows`
- Modified `test/integration/workflow/features/023/central-watcher.integration.test.ts` — removed `WorkGraphWatcherAdapter` end-to-end describe block

### Evidence

- All deleted test files confirmed absent
- Remaining tests compile and pass with updated references

---

## T007: Clean remaining workgraph references

**Dossier Task**: T007
**Status**: Completed

### Changes Made

- Modified `packages/shared/src/.../workspace-domain.ts` — deprecated `WorkspaceDomain.Workgraphs` with `@deprecated` JSDoc
- Modified `apps/web/src/lib/params/workspace.params.ts` — updated comment: "workgraphs" → "workflows"
- Modified `apps/web/src/features/027-central-notify-events/file-change-domain-event-adapter.ts` — updated comment removing `WorkgraphDomainEventAdapter` reference
- Removed `@chainglass/workgraph` from `apps/web/package.json` dependencies

### Evidence

- `grep -ri workgraph apps/web/src/` → 0 results
- `grep -ri workgraph apps/web/app/` → 0 results

---

## T008: Update domain-map.md + registry.md + workflow-ui/domain.md

**Dossier Task**: T008
**Status**: Completed

### Changes Made

- Modified `docs/domains/domain-map.md` — removed workgraph node + edges from mermaid diagram, updated health summary table
- Modified `docs/domains/registry.md` — changed workgraph status to "removed from web"
- Modified `docs/domains/workflow-ui/domain.md` — added Phase 7 history entry

### Evidence

- Domain documentation reflects current architecture post-deprecation

---

## T009: Final validation

**Dossier Task**: T009
**Status**: Completed

### Evidence

- `pnpm test` → 323 passed, 2 failed (pre-existing CSS class mismatches from Phase 4), 9 skipped
- `grep -ri workgraph apps/web/src/` → exit code 1 (zero results)
- `grep -ri workgraph apps/web/app/` → exit code 1 (zero results)
- Next.js MCP `get_errors` → "No errors detected"
- Next.js MCP `get_routes` → zero workgraph routes, workflow routes present
- Browser validation: workflow editor renders correctly, worktree page shows "Workflows" card
- Commit: `a42e27f`

---
