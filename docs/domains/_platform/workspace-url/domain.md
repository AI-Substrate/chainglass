# Domain: Workspace URL

**Slug**: _platform/workspace-url
**Type**: infrastructure
**Created**: 2026-02-22
**Created By**: extracted from existing codebase (Plan 041 Phase 2)
**Status**: active

## Purpose

Type-safe URL building and search parameter parsing for all workspace-scoped pages. Provides `workspaceHref()` for constructing clean, bookmarkable URLs, and nuqs-based param definitions with server-side caches for zero-boilerplate deep linking. Every workspace page depends on this domain for URL state management.

## Boundary

### Owns
- URL construction for workspace-scoped routes (`/workspaces/{slug}/...`)
- Search parameter definitions (worktree, and the nuqs parser pattern)
- Server-side param caches (`createSearchParamsCache` wrappers)
- `workspaceHref()` URL builder (flat options API, encoding, omit-defaults)
- NuqsAdapter wiring inside the Providers component

### Does NOT Own
- Workspace context resolution (resolving slug + worktree path to filesystem context) -- belongs to a future `workspace` business domain in `packages/workflow`
- Workspace CRUD operations (create, update, delete workspaces) -- belongs to `workspace` domain
- Feature-specific param definitions (e.g., `fileBrowserParams`) -- owned by their respective plan-scoped features, though they compose `workspaceParams` from this domain
- Navigation UI components (sidebar, workspace-nav) -- consume this domain's URL builder

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `workspaceHref(slug, subPath, options?)` | Function | All workspace pages, nav components | Build workspace-scoped URL with flat options object. Omits empty/false/undefined values. |
| `workspaceParams` | Object (nuqs parsers) | All workspace page param caches | Shared `worktree` param definition via `parseAsString` |
| `workspaceParamsCache` | Server cache | Server components needing only worktree | `createSearchParamsCache(workspaceParams)` |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `workspace-url.ts` | URL builder | Nothing (pure function) |
| `workspace.params.ts` | Param definitions | nuqs (parseAsString, createSearchParamsCache) |
| NuqsAdapter in Providers | Context provider | nuqs/adapters/next/app |

## Source Location

Primary: `apps/web/src/lib/`

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/lib/workspace-url.ts` | URL builder (`workspaceHref`) | Cross-cutting. Planned in Phase 2. |
| `apps/web/src/lib/params/workspace.params.ts` | Shared workspace param defs + server cache | Cross-cutting. Planned in Phase 2. |
| `apps/web/src/lib/params/index.ts` | Barrel export for params | Planned in Phase 2. |
| `apps/web/src/components/providers.tsx` | NuqsAdapter wiring | Cross-plan edit (additive). |

### Consumer Notes

| Consumer File | Current Pattern | Migration Status |
|---------------|----------------|-----------------|
| `apps/web/src/components/workspaces/workspace-nav.tsx` | Inline `buildWorktreeUrl()` (lines 81-85) | Will import `workspaceHref` in Phase 2 T003 |
| `apps/web/app/(dashboard)/workspaces/[slug]/page.tsx` | Manual URL template literals | Opportunistic migration (not required) |
| `apps/web/app/(dashboard)/workspaces/[slug]/worktree/page.tsx` | Manual URL template literals | Opportunistic migration |
| `apps/web/src/features/022-workgraph-ui/use-workgraph-api.ts` | Inline `buildApiUrl()` | Opportunistic migration |
| 6 API routes under `/api/workspaces/[slug]/` | `searchParams.get('worktree')` | Opportunistic migration |

## Dependencies

### This Domain Depends On
- **nuqs** (npm package, ~3KB) -- type-safe URL state management for Next.js
- **Next.js App Router** -- `useSearchParams`, route params, `<Link>`

### Domains That Depend On This
- *(All future workspace-scoped features will compose `workspaceParams` and use `workspaceHref()`)*
- Plan 041 file browser (`fileBrowserParams` composes `workspaceParams`)
- Existing workspace pages (opportunistic migration from inline URL construction)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| *(extracted)* | Domain extracted from existing codebase patterns. Inline URL construction exists in 10+ files; this domain formalizes and consolidates it. | 2026-02-22 |
| Plan 041 Phase 2 | Implementation: `workspaceHref()`, `workspaceParams`, NuqsAdapter wiring | Pending |
