# Fix Tasks: Phase 4: Change Notifications & Workflow Integration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restore Unit-Catalog Watcher Coverage
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/central-watcher.service.ts
  - /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/source-watcher.constants.ts
- **Issue**: `.chainglass/units` changes are not guaranteed to enter the watcher pipeline; unit-catalog adapter may never emit events.
- **Fix**:
  1. Add explicit watcher coverage for `<worktree>/.chainglass/units` in central watcher setup, **or** intentionally relax source ignore behavior with equivalent guarantees.
  2. Ensure no duplicate event storms are introduced.
  3. Add an integration/unit test proving `units/<slug>/unit.yaml` and `units/<slug>/templates/*` changes produce `unit-changed`.
- **Patch hint**:
  ```diff
  -const dataPath = `${worktreePath}/.chainglass/data`;
  -watcher.add(dataPath);
  +const dataPaths = [
  +  `${worktreePath}/.chainglass/data`,
  +  `${worktreePath}/.chainglass/units`,
  +];
  +for (const dataPath of dataPaths) {
  +  if (await this.fs.exists(dataPath)) watcher.add(dataPath);
  +}
  ```

### FT-002: Remove Business-Domain Internal Import Violation
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-updated-banner.tsx (or replacement location)
- **Issue**: `workflow-ui` imports `058-workunit-editor` internals directly; violates contract-only cross-domain boundary.
- **Fix**:
  1. Move banner ownership to `workflow-ui` **or** expose a formal contract/public export from `058-workunit-editor`.
  2. Ensure imports are through contract/public entrypoint only.
  3. Update domain map/docs to match final dependency model.
- **Patch hint**:
  ```diff
  -import { WorkUnitUpdatedBanner } from '@/features/058-workunit-editor/components/workunit-updated-banner';
  +import { WorkUnitUpdatedBanner } from '@/features/050-workflow-page/components/workunit-updated-banner';
  ```

### FT-003: Reconcile Phase 4 Domain Manifest and Domain Artifacts
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-plan.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/_platform/events/domain.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md
  - /Users/jordanknight/substrate/058-workunit-editor/docs/domains/domain-map.md
- **Issue**: Manifest and domain docs are stale (wrong path references, missing changed files, missing Phase 4 history/composition updates).
- **Fix**:
  1. Update Phase 4 manifest rows to exact file list/path/domain mappings.
  2. Add Plan 058 Phase 4 history/composition/contracts updates in touched domain docs.
  3. Ensure domain-map edges/nodes/health table reflect real dependency graph.
- **Patch hint**:
  ```diff
  -| `packages/workflow/src/features/058-workunit-editor/workunit-catalog-watcher.adapter.ts` | `_platform/events` | internal | ... |
  +| `packages/workflow/src/features/023-central-watcher-notifications/workunit-catalog-watcher.adapter.ts` | `_platform/events` | internal | ... |
  +| `apps/web/src/features/027-central-notify-events/unit-catalog-domain-event-adapter.ts` | `_platform/events` | internal | ... |
  +| `apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx` | `workflow-ui` | internal | ... |
  ```

### FT-004: Satisfy Full TDD Gate for AC-22..AC-26
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/test/unit/... (new/updated tests for watcher/hook/banner/navigation)
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/tasks/phase-4-change-notifications-workflow-integration/execution.log.md
- **Issue**: Spec requires Full TDD but phase reports no new tests and lacks RED→GREEN evidence.
- **Fix**:
  1. Add tests for:
     - watcher adapter path/filter/debounce behavior
     - unit-catalog event adapter payload shape/scoping
     - banner dismiss/reappear behavior
     - Edit Template + return navigation context handling
  2. Run tests and capture explicit outputs.
  3. Update execution log with AC-linked evidence.
- **Patch hint**:
  ```diff
  -### T004: WorkUnitUpdatedBanner
  -- Created `workunit-updated-banner.tsx` ...
  +### T004: WorkUnitUpdatedBanner
  +- RED: added failing test `workunit-updated-banner.test.tsx::reappears_on_next_change`
  +- GREEN: test passing after dismiss/reappear fix
  +- Evidence: `pnpm vitest test/unit/web/features/.../workunit-updated-banner.test.tsx` (N passed)
  ```

## Medium / Low Fixes

### FT-005: Scope Unit-Catalog Event Payload to Workspace/Worktree
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/unit-catalog-domain-event-adapter.ts
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts
- **Issue**: Payload includes only `unitSlug`; insufficient for context-aware filtering.
- **Fix**: Emit and consume `workspaceSlug` + `worktreePath` (or equivalent scoping fields).
- **Patch hint**:
  ```diff
  -return { unitSlug: event.unitSlug };
  +return {
  +  unitSlug: event.unitSlug,
  +  workspaceSlug: event.workspaceSlug,
  +  worktreePath: event.worktreePath,
  +};
  ```

### FT-006: Preserve `worktree` in Edit-Template Round Trip
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx
- **Issue**: Current URL composition drops worktree context.
- **Fix**: Include `worktree` query parameter in forward and back-navigation links.

### FT-007: Reuse Shared SSE Hook Infrastructure
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/hooks/use-workunit-catalog-changes.ts
- **Issue**: Raw `EventSource` duplicates capabilities in `_platform/events`.
- **Fix**: Refactor hook to reuse `useSSE`/`useWorkspaceSSE` and standard reconnection/event handling.

### FT-008: Adapter File Suffix Compliance
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/unit-catalog-domain-event-adapter.ts
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/027-central-notify-events/start-central-notifications.ts
- **Issue**: Adapter filename does not follow `.adapter.ts` rule.
- **Fix**: Rename to `unit-catalog-domain-event.adapter.ts` and update imports.

### FT-009: Interface Naming Consistency
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/packages/workflow/src/features/023-central-watcher-notifications/workunit-catalog-watcher.adapter.ts
- **Issue**: Interface `UnitCatalogChangedEvent` lacks `I` prefix.
- **Fix**: Rename to `IUnitCatalogChangedEvent` (or document project exception).

### FT-010: Align Banner Copy With Spec (or Update Spec)
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/workunit-updated-banner.tsx
  - /Users/jordanknight/substrate/058-workunit-editor/docs/plans/058-workunit-editor/workunit-editor-spec.md
- **Issue**: Implemented banner text differs from spec wording.
- **Fix**: Update component copy or revise spec AC wording with explicit acceptance.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Domain artifacts and map updated to match final implementation
- [ ] Full TDD evidence added for AC-22..AC-26
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
