# Work Unit Worktree Resolution — Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-03-01
**Spec**: [workunit-worktree-resolution-spec.md](./workunit-worktree-resolution-spec.md)
**Status**: COMPLETE
**Complexity**: CS-2 (small)

## Summary

Work unit pages hardcode `worktreePath: info.path` in `workunit-actions.ts`, making all unit CRUD operations target the main workspace regardless of the active git worktree. This plan threads `?worktree=` through pages, server actions, and components — following the proven pattern from `workflow-actions.ts`. Missing `?worktree=` redirects back to the workspace root rather than silently falling back (per spec Q6).

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| `058-workunit-editor` | existing | **modify** | Fix resolver, thread worktree through pages + components |
| `_platform/positional-graph` | existing | **consume** | `IWorkUnitService` already worktree-aware (no changes) |
| `_platform/workspace-url` | existing | **consume** | `workspaceHref()` already preserves `?worktree=` in nav (no changes) |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/app/actions/workunit-actions.ts` | `058-workunit-editor` | internal | Fix `resolveWorkspaceContext` + add `worktreePath?` to all 8 actions |
| `apps/web/app/(dashboard)/workspaces/[slug]/work-units/page.tsx` | `058-workunit-editor` | internal | Read `searchParams.worktree`, redirect if missing, pass to action + component |
| `apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx` | `058-workunit-editor` | internal | Thread existing worktree param to all data-loading action calls |
| `apps/web/src/features/058-workunit-editor/components/unit-list.tsx` | `058-workunit-editor` | internal | Add `worktreePath?` prop, append `?worktree=` to links |
| `apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx` | `058-workunit-editor` | internal | Add `worktreePath?` prop, thread to save callbacks |
| `apps/web/src/features/058-workunit-editor/components/agent-editor.tsx` | `058-workunit-editor` | internal | Thread `worktreePath` into `saveUnitContent` |
| `apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx` | `058-workunit-editor` | internal | Thread `worktreePath` into `saveUnitContent` |
| `apps/web/src/features/058-workunit-editor/components/user-input-editor.tsx` | `058-workunit-editor` | internal | Thread `worktreePath` into `saveUnitContent` |
| `apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context.ts` | `058-workunit-editor` | internal | Pure worktree validation helper |
| `apps/web/src/features/058-workunit-editor/components/unit-catalog-sidebar.tsx` | `058-workunit-editor` | internal | Add `worktreePath?` prop, append `?worktree=` to links |
| `apps/web/src/features/058-workunit-editor/components/unit-creation-modal.tsx` | `058-workunit-editor` | internal | Pass `worktreePath?` to `createUnit`, include in redirect |
| `apps/web/src/features/058-workunit-editor/components/metadata-panel.tsx` | `058-workunit-editor` | internal | Add `worktreePath?` prop, pass to direct `updateUnit()` calls |
| `test/unit/web/actions/workunit-actions-worktree.test.ts` | `058-workunit-editor` | internal | TDD tests for resolver: valid/invalid/missing worktree, missing workspace |
| `docs/domains/058-workunit-editor/domain.md` | `058-workunit-editor` | internal | Update history with Plan 062 |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `workunit-actions.ts` hardcodes `worktreePath: info.path` and `isMainWorktree: true` — all 8 actions use this broken resolver | Fix resolver to accept `worktreePath?`, validate against `info.worktrees[]` |
| 02 | Critical | Editor page reads `sp.worktree` but only uses it for return link — data loading ignores it | Thread to all 3 `Promise.all` action calls |
| 03 | High | MetadataPanel calls `updateUnit()` directly (not via parent callback) — imports server action and calls with `workspaceSlug, unitSlug` only | Add `worktreePath?` prop, thread to `updateUnit()` call |
| 04 | High | UnitCatalogSidebar constructs links inline without `?worktree=` — users lose worktree context when clicking between units | Add `worktreePath?` prop, append to link hrefs |
| 05 | Medium | Missing `?worktree=` redirect pattern: use `redirect(/workspaces/${slug})` from `next/navigation` (established in worktree/page.tsx) | Apply same pattern in both work-unit pages |
| 06 | Info | Navigation sidebar already handles worktree via `workspaceHref()` — no nav changes needed | Skip nav changes |

## Implementation

**Objective**: Thread worktree context through all work unit pages, server actions, and components so CRUD operations target the correct worktree.
**Testing Approach**: Hybrid — TDD for resolver function (fakes only), lightweight for prop-threading. Next.js MCP + Playwright verification for ACs.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | **TDD RED**: Write tests for `resolveWorkspaceContext(slug, worktreePath?)` — valid worktree resolves correctly, invalid worktree returns error/null, missing worktree returns error/null, missing workspace returns null | test | `/Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts` | Tests written, all RED (failing) | Use fakes only per constitution Principle 4. Create a `FakeWorkspaceService` or use the existing one that controls `getInfo()` return including `worktrees[]`. |
| [x] | T002 | **TDD GREEN** (blocked by T001): Fix `resolveWorkspaceContext` in `workunit-actions.ts` — add `worktreePath?` parameter, validate against `info.worktrees[]`, require worktree (return null if missing). Add `worktreePath?` parameter to all 8 exported actions. | `058-workunit-editor` | `/Users/jordanknight/substrate/058-workunit-editor/apps/web/app/actions/workunit-actions.ts` | Tests from T001 pass GREEN. All 8 actions accept optional `worktreePath`. | Follow `workflow-actions.ts` inline pattern: `info.worktrees.find(w => w.path === worktreePath)`. Per finding 01. |
| [x] | T003 | **Pages**: Thread worktree in both work-unit pages. List page: read `searchParams.worktree`, redirect to `/workspaces/${slug}` if missing, pass to `listUnits()` + `UnitList`. Editor page: thread existing `worktree` param to `loadUnit()`, `loadUnitContent()`, `listUnits()` calls + all child components. Redirect if missing. | `058-workunit-editor` | `/Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/page.tsx`, `/Users/jordanknight/substrate/058-workunit-editor/apps/web/app/(dashboard)/workspaces/[slug]/work-units/[unitSlug]/page.tsx` | Both pages pass worktree to actions; missing `?worktree=` redirects. | Per finding 02 + 05. Use `redirect()` from `next/navigation`. |
| [x] | T004 | **Components**: Add `worktreePath?` prop to `UnitList`, `WorkUnitEditor`, `UnitCatalogSidebar`, `UnitCreationModal`, `MetadataPanel`. Thread to links (`?worktree=` appended with `encodeURIComponent`) and server action calls. Ensure `useCallback` deps arrays include `worktreePath`. | `058-workunit-editor` | `/Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/components/unit-list.tsx`, `workunit-editor.tsx`, `unit-catalog-sidebar.tsx`, `unit-creation-modal.tsx`, `metadata-panel.tsx` | All links include `?worktree=`; all save/create/delete actions receive worktreePath; TypeScript compiles clean. | Per findings 03, 04. MetadataPanel calls `updateUnit()` directly — needs the prop. |
| [x] | T005 | **Verification**: Run `just fft`. Query Next.js MCP for errors on port 3001. Launch Playwright headless, navigate to list page with `?worktree=`, verify units listed. Navigate to editor page, verify content loads. Test missing `?worktree=` redirects. Take screenshots. | all | N/A | `just fft` passes (0 failures). Next.js MCP: 0 errors. Playwright screenshots confirm worktree-correct behavior and redirect on missing param. | Per AC-09, AC-11, AC-12. |
| [x] | T006 | **Domain docs**: Update `058-workunit-editor/domain.md` history with Plan 062. Update domain concepts if worktree threading adds a new concept. | `058-workunit-editor` | `/Users/jordanknight/substrate/058-workunit-editor/docs/domains/058-workunit-editor/domain.md` | History table updated. | |

### Acceptance Criteria

- [x] AC-01: `/work-units?worktree={path}` lists units from specified worktree
- [x] AC-02: `/work-units/{unitSlug}?worktree={path}` loads content from specified worktree
- [x] AC-03: Editing saves to specified worktree
- [x] AC-04: Creating scaffolds in specified worktree
- [x] AC-05: Deleting/renaming operates on specified worktree
- [x] AC-06: Links preserve `?worktree=` between units
- [x] AC-07: Missing `?worktree=` redirects to worktree picker (no silent fallback)
- [x] AC-08: Edit Template round-trip preserves worktree for data ops
- [x] AC-09: `just fft` passes
- [x] AC-10: Unit tests verify resolver validates worktree against `info.worktrees[]`
- [x] AC-11: Next.js MCP: zero compilation/runtime errors
- [x] AC-12: Playwright screenshots confirm correct worktree behavior

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `useCallback` deps miss `worktreePath` → stale closure uses wrong worktree | Low | Medium | Explicit code review of all deps arrays in T004 |
| `redirect()` in Server Component triggers during build/prerender | Low | Medium | Redirect is runtime-only (searchParams are dynamic); verify with `pnpm build` if concerned |
| UnitCreationModal redirect after create loses worktree | Low | Medium | Include `?worktree=` in router.push URL in T004 |
| MetadataPanel auto-save fires before worktreePath prop updates | Very Low | Low | `worktreePath` is static per page render (from searchParams); no stale risk |

### Constitution Compliance

No deviations:
- **Principle 3 (TDD)**: T001 RED → T002 GREEN for resolver
- **Principle 4 (Fakes over Mocks)**: Fakes only per spec Q3
- **Principle 1 (Clean Architecture)**: No dependency direction violations — all changes within `058-workunit-editor` domain
