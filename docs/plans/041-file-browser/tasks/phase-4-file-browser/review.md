# Code Review: Phase 4: File Browser

**Plan**: `/home/jak/substrate/041-file-browser/docs/plans/041-file-browser/file-browser-plan.md`  
**Date**: 2026-02-24  
**Reviewer**: Automated (plan-7-v2)

## Summary

Phase 4 has substantial implementation progress, but core browser behaviors are still not wired end-to-end and there are material path-security gaps. Domain docs are partially updated but have ownership/path drift and map currency issues. Anti-reinvention checks found genuine duplication around viewer rendering and language detection utilities.

## Findings

### Critical (must fix)
| # | File | Issue | Recommendation |
|---|------|-------|---------------|
| 1 | `apps/web/src/features/041-file-browser/services/directory-listing.ts`, `apps/web/app/api/workspaces/[slug]/files/route.ts` | Directory/worktree inputs are not safely bounded to the workspace (absolute `dirPath` and user-supplied `worktree` are trusted), enabling out-of-scope filesystem reads. | Validate `worktree` against workspace-owned paths, resolve `dir` via `IPathResolver.resolvePath`, and reject absolute/untrusted paths before any `readDir`/git call. |

### High (should fix)
| # | File | Issue | Recommendation |
|---|------|-------|---------------|
| 1 | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | File selection never loads content (`readFileAction` imported but never called), so viewer panel stays empty. | Call `readFileAction` on select and hydrate `fileData`/`editContent`. |
| 2 | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Save/refresh handlers are TODO stubs, so edit/save flow is non-functional. | Wire `onSave` to `saveFileAction` and `onRefresh` to re-read current file data. |
| 3 | `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | Edit/preview/diff modes render ad-hoc text blocks; `CodeEditor`, `MarkdownViewer`, and `DiffViewer` are not integrated despite phase requirements. | Replace placeholder rendering with contract components and use `CodeEditor` for edit mode. |
| 4 | `apps/web/src/features/041-file-browser/services/file-actions.ts` | Symlink boundary check uses naive `startsWith(worktreePath)` and is prefix-bypassable (`/workspace` vs `/workspace-evil`). | Use separator-safe containment check (or `path.relative`) and allow only exact root or true descendants. |
| 5 | `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`, `apps/web/app/api/workspaces/[slug]/files/route.ts` | Changed-files filter is effectively broken (`handleLoadChanged` unused; route ignores `changed=true`). | Implement changed-files route path and invoke loading when filter mode is enabled. |
| 6 | `docs/plans/041-file-browser/tasks/phase-4-file-browser/tasks.md`, `docs/domains/file-browser/domain.md` | Phase artifacts claim `apps/web/app/actions/file-actions.ts`, but implementation is in `apps/web/src/features/041-file-browser/services/file-actions.ts`; ownership metadata is stale. | Align task/domain docs with actual path (or relocate file to declared location) and update composition/source tables. |

### Medium (consider)
| # | File | Issue | Recommendation |
|---|------|-------|---------------|
| 1 | `test/unit/web/features/041-file-browser/` | Dossier references API-route tests (`files-api.test.ts`) that are missing; no route-level test coverage found. | Add route tests or correct dossier claims. |
| 2 | `apps/web/src/lib/language-detection.ts` | Local detectLanguage copy duplicates `packages/shared/src/lib/language-detection.ts`, increasing drift risk. | Export a browser-safe shared contract and consume that instead of copying logic. |
| 3 | `apps/web/src/features/041-file-browser/services/file-actions.ts` | Atomic write logic is reimplemented while similar helpers exist in other packages. | Extract/reuse shared atomic-write utility for consistency. |
| 4 | `docs/domains/domain-map.md` | Domain map lacks health summary and does not fully reflect current contract-level drift findings. | Update map metadata/health summary and edge labels to match current implementation. |

## Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ❌ | `file-actions` path differs from declared phase/domain path; additional browser client file is outside declared task paths. |
| Contract-only imports | ❌ | `file-actions.ts` imports `@/lib/language-detection` (internal app path) rather than a domain/public contract. |
| Dependency direction | ✅ | No clear infra → business reverse dependency observed. |
| Domain.md updated | ❌ | History updated, but Composition/Source location data is stale for current file locations. |
| Registry current | ✅ | Domain registry includes expected domains for this phase. |
| No orphan files | ❌ | `apps/web/src/lib/server/git-diff-action.ts` ownership is unclear in current domain docs; phase file mapping drift exists. |
| Map nodes current | ✅ | All registered domains appear in domain map. |
| Map edges current | ❌ | Edge/contract metadata is not fully current with implementation and map health reporting is incomplete. |
| No circular business deps | ✅ | Only one active business domain (`file-browser`), no business cycle detected. |

## Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `FileViewerPanel` rendering branches | `FileViewer`, `MarkdownViewer`, `DiffViewer` already exist | `_platform/viewer` | ⚠️ Review |
| `detectLanguage` utility copy (`apps/web/src/lib/language-detection.ts`) | `packages/shared/src/lib/language-detection.ts` | shared/platform utility | ⚠️ Review |
| `saveFileAction` atomic tmp+rename logic | `packages/workgraph/src/services/atomic-file.ts` and `packages/positional-graph/src/services/atomic-file.ts` | workgraph/positional-graph | ⚠️ Review |
| `directory-listing.ts` | No strong duplicate found | — | ✅ Clean |
| `changed-files.ts` | No strong duplicate found | — | ✅ Clean |

## Verdict

**NEEDS FIXES**

Must address critical/high items before phase sign-off: secure path/worktree validation, wire browser read/save/refresh flows, integrate real viewer/editor components, fix symlink boundary check, and reconcile domain/task ownership metadata.
