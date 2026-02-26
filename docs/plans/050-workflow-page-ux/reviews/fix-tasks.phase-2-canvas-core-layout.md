# Fix Tasks: Phase 2: Canvas Core + Layout

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Enforce trusted workspace root in workflow server actions
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts
- **Issue**: `worktreePath` is accepted directly and can target an untrusted path.
- **Fix**: Resolve `worktreePath` only from known workspace worktrees (`info.worktrees`) and reject unknown values with typed errors.
- **Patch hint**:
  ```diff
  - const resolvedWorktreePath = worktreePath ?? info.path;
  + const resolvedWorktreePath = info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path;
  + if (worktreePath && resolvedWorktreePath !== worktreePath) {
  +   return null; // caller returns typed workspace/worktree error
  + }
  ```

### FT-002: Preserve typed error contract in `loadWorkflow`
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts
- **Issue**: Parallel `load()` + `getStatus()` can throw before `loadResult.errors` is checked.
- **Fix**: Load first and short-circuit on errors; then call `getStatus()` (or catch/translate exceptions).
- **Patch hint**:
  ```diff
  - const [loadResult, graphStatus] = await Promise.all([service.load(ctx, graphSlug), service.getStatus(ctx, graphSlug)]);
  - if (loadResult.errors.length > 0) return { errors: loadResult.errors };
  + const loadResult = await service.load(ctx, graphSlug);
  + if (loadResult.errors.length > 0) return { errors: loadResult.errors };
  + const graphStatus = await service.getStatus(ctx, graphSlug);
  ```

### FT-003: Bring testing evidence in line with Full TDD requirements
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-2-canvas-core-layout/execution.log.md
- **Issue**: Execution log shows green outcomes only; RED→GREEN evidence trail is missing.
- **Fix**: Add per-task RED command/output, GREEN command/output, and explicit AC verification references.
- **Patch hint**:
  ```diff
  + ### T005: WorkflowCanvas
  + RED: pnpm vitest test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx -t "shows add line button" (fails: control missing)
  + GREEN: pnpm vitest test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx (passes: control rendered)
  + AC Mapping: AC-02, AC-03, AC-05
  ```

### FT-004: Update domain traceability artifacts for Phase 2
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: Domain Manifest does not map all touched files; workflow-ui domain/map details are stale.
- **Fix**: Add missing file mappings (or path patterns), correct workflow-ui source/dependency/composition metadata, and refresh map edges/health summary.
- **Patch hint**:
  ```diff
  + | `test/unit/web/features/050-workflow-page/*.test.tsx` | workflow-ui | test | Phase 2 rendering/state tests |
  + | `apps/web/src/features/_platform/panel-layout/components/command-palette-dropdown.tsx` | _platform/panel-layout | cross-domain | Phase 2 panel-layout compatibility touch |
  ```

### FT-005: Remove doctrine-breaking `vi.mock()` usage
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/use-file-filter.test.ts
- **Issue**: `vi.mock()` violates R-TEST-007 (fakes-only policy).
- **Fix**: Replace module mock with fake dependency injection/test harness pattern accepted by project rules.
- **Patch hint**:
  ```diff
  - vi.mock('@/features/045-live-file-events', () => ({ useFileChanges: () => mockFileChanges }));
  + const fakeFileChanges = createFakeFileChanges();
  + // pass fakeFileChanges via hook options/provider instead of module mocking
  ```

## Medium / Low Fixes

### FT-006: Make workflow listing resilient to per-item failures
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts
- **Issue**: One failed status lookup can fail the whole list response.
- **Fix**: Use `Promise.allSettled` or per-item guards and return valid summaries for healthy graphs.

### FT-007: Complete Phase 2 header/breadcrumb scope gaps
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-line.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx
- **Issue**: Missing line header controls (editable label/settings/delete placeholders) and incomplete template breadcrumb data flow.
- **Fix**: Add placeholder controls and pass template metadata through editor props.

### FT-008: Improve toolbox metadata fidelity
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/work-unit-toolbox.tsx
  - /Users/jordanknight/substrate/chainglass-048/apps/web/app/actions/workflow-actions.ts (if payload shape needs extension)
- **Issue**: Toolbox only renders/searches slug; phase task expects description rendering.
- **Fix**: Include and render descriptions; include description in search filter.

### FT-009: Add required Test Doc blocks in touched/new tests
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/work-unit-toolbox.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/workflow-list.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/file-filter.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/file-list.test.ts
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/_platform/panel-layout/command-palette-dropdown.test.tsx
- **Issue**: Missing 5-field Test Doc comments per R-TEST-002.
- **Fix**: Add complete Test Doc comments or amend rules if policy changed.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Domain docs/manifests/maps updated to match final phase file set
- [ ] RED→GREEN evidence added for TDD-required tasks
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
