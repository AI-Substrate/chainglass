# Execution Log: Phase 4 — Change Notifications & Workflow Integration

**Started**: 2026-03-01
**Completed**: 2026-03-01
**Phase**: Phase 4: Change Notifications & Workflow Integration
**Plan**: [workunit-editor-plan.md](../../workunit-editor-plan.md)

---

## Task Log

### T001: Verify CentralWatcherService paths
- **No-op**: Source watcher already watches entire worktree root (line 293: `watcher.add(wt.path)`), which includes `.chainglass/units/`. No code changes needed (DYK #1 confirmed).

### T002: WorkUnitCatalogWatcherAdapter
- Created `workunit-catalog-watcher.adapter.ts` in `023-central-watcher-notifications/` (DYK #5)
- Follows WorkflowWatcherAdapter pattern: self-filter by regex, 200ms debounce, subscriber dispatch with error isolation
- Regex: `/units\/([^/]+)\/(unit\.yaml|templates\/.+)$/`
- Exported from feature barrel + workflow package index

### T003: State event + hook (SSE-based)
- Created `use-workunit-catalog-changes.ts` — subscribes to `/api/events/unit-catalog` SSE channel
- Returns `{ changed, dismiss, lastChanged }` — changed becomes true on SSE event, dismiss hides until next
- Discovery: GlobalStateSystem requires domain registration + React context — SSE is the established pattern for server→client events. Switched from state system to SSE approach.

### T004: WorkUnitUpdatedBanner
- Created `workunit-updated-banner.tsx` — dismissible banner with Refresh button
- Neutral wording: "Work unit templates have changed. Refresh to load latest." (DYK #2)
- Placed at page layout level in workflow editor page, above `<WorkflowEditor>` (DYK #4)
- Refresh calls `router.refresh()` + `dismiss()`

### T005: Edit Template button
- Added `onEditTemplate` prop to `NodePropertiesPanelProps`
- Button shown when `node.unitSlug` exists (DYK #3 — confirmed unitSlug is on NodeStatusResultBase)
- Navigates to `/workspaces/[slug]/work-units/[unitSlug]?from=workflow&graph=[graphSlug]`
- Styled with blue variant to differentiate from existing violet/gray buttons

### T006: Return navigation from editor
- Editor page reads `searchParams.from` and `searchParams.graph` (async Next.js 16 pattern)
- Passes `returnToWorkflow` prop to WorkUnitEditor
- Renders "← Back to Workflow" link above content editor when `from=workflow`

### T007: Register adapter in DI
- Added `UnitCatalog` to `WorkspaceDomain` enum in shared package
- Created `UnitCatalogDomainEventAdapter` following WorkflowDomainEventAdapter pattern
- Registered in `start-central-notifications.ts`: create adapter, register with watcher, subscribe events

## Evidence

- **Tests**: 335 files, 4744 tests passed (no new tests — infrastructure wiring)
- **`just fft`**: passes clean
- **TypeScript**: `tsc --noEmit` passes clean
- **Packages built**: shared + workflow rebuilt successfully
