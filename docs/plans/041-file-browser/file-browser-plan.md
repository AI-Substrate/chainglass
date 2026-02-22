# File Browser & Workspace-Centric UI Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-22
**Spec**: [file-browser-spec.md](./file-browser-spec.md)
**Status**: DRAFT

**Workshops**:
- [deep-linking-system.md](./workshops/deep-linking-system.md) — URL state management with nuqs
- [ux-vision-workspace-experience.md](./workshops/ux-vision-workspace-experience.md) — Product vibe, UX, attention system
- [workspace-preferences-data-model.md](./workshops/workspace-preferences-data-model.md) — Emoji, color, registry v2

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: Data Model & Infrastructure](#phase-1-data-model--infrastructure)
7. [Phase 2: Deep Linking & URL State](#phase-2-deep-linking--url-state)
8. [Phase 3: UI Overhaul — Landing Page & Sidebar](#phase-3-ui-overhaul--landing-page--sidebar)
9. [Phase 4: File Browser](#phase-4-file-browser)
10. [Phase 5: Attention System & Polish](#phase-5-attention-system--polish)
11. [Phase 6: Documentation](#phase-6-documentation)
13. [Cross-Cutting Concerns](#cross-cutting-concerns)
14. [Complexity Tracking](#complexity-tracking)
15. [Progress Tracking](#progress-tracking)
16. [ADR Ledger](#adr-ledger)
17. [Deviation Ledger](#deviation-ledger)
18. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The Chainglass web app is a prototype dashboard with placeholder pages. Workspaces are second-class citizens buried in navigation. There's no way to browse files, edit code, or view diffs within a workspace. The UI doesn't communicate fleet status (running agents, attention needed) at a glance.

**Solution**:
- Extend the Workspace entity with preferences (emoji, accent color, starred) via registry v2 migration
- Install nuqs for type-safe URL state management enabling deep linking across all pages
- Replace the landing page with a workspace card grid showing fleet status
- Restructure the sidebar to be workspace-scoped (Browser, Agents, Workflows) with a "Dev" collapsed section
- Build a file browser with tree view, CodeMirror 6 editor, markdown preview, and git diff viewer
- Add an attention system that bubbles agent errors from agent → workspace → landing page → browser tab title
- Ensure all pages are responsive (phone, tablet, desktop)

**Expected outcomes**:
- Every page state is URL-representable (bookmarkable, pinnable)
- Users identify workspaces at a glance via emoji + color
- File browsing, editing, and diffing works within any workspace
- Agent fleet status visible on landing page without drilling in
- All pages work on phone, tablet, and desktop

---

## Technical Context

### Current System State
- Next.js 16 with App Router, Turbopack, React 19
- Workspace data model: `IWorkspaceService`, `WorkspaceContext`, 23 real worktrees in substrate
- Existing viewer components: FileViewer, DiffViewer, MarkdownViewer, MermaidRenderer (all functional)
- DI via TSyringe (decorator-free, RSC-compatible)
- Shiki server-side syntax highlighting
- shadcn/ui component library, Tailwind CSS v4
- SSE infrastructure via `useWorkspaceSSE` hook + `CentralEventNotifierService`

### Integration Requirements
- `packages/workflow` — Workspace entity, registry adapter, service interfaces
- `apps/web` — UI components, API routes, server actions, DI container
- `packages/shared` — IFileSystem, IPathResolver, agent interfaces

### Constraints
- No mocks — fakes only (project-established idiom)
- Full TDD — tests first for all new code
- PlanPak file management — feature code at `apps/web/src/features/041-file-browser/`
- Sidebar always visible (collapsed to icons on landing page)
- Responsive: all pages must work at 375px, 768px, 1440px

---

## Critical Research Findings

### 01: Registry Migration Must Be Atomic (Critical)
**Sources**: [R1-01]
**Problem**: `WorkspaceRegistryAdapter.writeRegistry()` uses plain `fs.writeFile()`. A crash mid-write corrupts the registry (all workspaces lost).
**Solution**: Write to `.tmp` file, then `fs.rename()` (atomic on POSIX). Back up v1 before migration.
**Action**: Implement atomic write in Phase 1. Unit test with FakeFileSystem simulating write failure.
**Affects**: Phase 1

### 02: Symlink Escape Risk in File Browser (Critical)
**Sources**: [R1-02]
**Problem**: `PathResolverAdapter` checks `..` traversal but not symlinks that escape workspace. A symlink at `/workspace/link → /etc/passwd` would pass path validation.
**Solution**: After resolving path, call `fs.realpath()` (or Node.js `fs.promises.realpath`) and verify the real path is still within workspace bounds.
**Action**: Add realpath check in file read/write server actions (Phase 4).
**Affects**: Phase 4

### 03: No Conflicts in Provider Chain for nuqs (High)
**Sources**: [I1-02]
**Problem**: None — the existing provider chain (`ThemeProvider` → `QueryClientProvider`) is clean.
**Solution**: Add `NuqsAdapter` wrapping the existing providers in `layout.tsx`.
**Action**: Wire in Phase 2.
**Affects**: Phase 2

### 04: Sidebar Refactor Blast Radius (High)
**Sources**: [R1-04, I1-08]
**Problem**: `DashboardSidebar` is shared by all 21+ pages via the route group layout. Changing it affects everything.
**Solution**: Restructure incrementally. The sidebar is already modular (`SidebarGroup`s). Add workspace-scoped group conditionally, move NAV_ITEMS to "Dev" section. Test all major routes after change.
**Action**: Phase 3 handles this as a focused refactor.
**Affects**: Phase 3

### 05: git ls-files Pattern Established (High)
**Sources**: [I1-05]
**Problem**: File tree needs to list workspace files respecting `.gitignore`.
**Solution**: Use `git ls-files --full-name` via the same `execFile` + array args pattern as `GitWorktreeResolver`. Graceful fallback to `readDir` for non-git workspaces.
**Action**: Implement in Phase 4 file listing API.
**Affects**: Phase 4

### 06: Save Conflict Race Window (High)
**Sources**: [R1-07]
**Problem**: `stat()` → check mtime → `writeFile()` has a race window. Another process could write between check and write.
**Solution**: Atomic write pattern: check mtime, write to `.tmp`, `rename()` to target. Document as best-effort (not designed for multi-process sync). Accept the narrow race window — this is a dev tool, not a database.
**Action**: Implement in Phase 4 save server action.
**Affects**: Phase 4

### 07: nuqs + Next.js 16 Compatibility Unverified (High)
**Sources**: [R1-08]
**Problem**: nuqs hasn't been tested with Next.js 16 + Turbopack in this project.
**Solution**: Phase 2 starts with a spike: install nuqs, wire adapter, verify one param works end-to-end before building on it. If incompatible, fall back to custom hooks (more boilerplate, but proven).
**Action**: First task in Phase 2 is integration verification.
**Affects**: Phase 2

### 08: Feature Folder Pattern Established (High)
**Sources**: [I1-06]
**Problem**: None — clear pattern from `features/022-workgraph-ui/`.
**Solution**: Follow exactly: barrel `index.ts`, fakes alongside reals, types in separate file.
**Action**: Phase 1 creates `features/041-file-browser/` structure.
**Affects**: All phases

### 09: Large File Handling (Medium)
**Sources**: [R1-06]
**Problem**: `IFileSystem.readFile()` has no size limit. Opening a 100MB file would crash.
**Solution**: Check `stat().size` before `readFile()`. Configurable limit (default 5MB viewer, 1MB editor). Binary detection via null-byte scan.
**Action**: Implement in Phase 4 file read action.
**Affects**: Phase 4

### 10: CodeMirror 6 No Known Turbopack Issues (Medium)
**Sources**: [I1-04]
**Problem**: None confirmed — but lazy loading is recommended to control bundle size.
**Solution**: Dynamic `import()` for CodeMirror, only when edit mode selected. Language extensions loaded on demand.
**Action**: Implement in Phase 5 editor component.
**Affects**: Phase 5

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: Complex feature with security-critical file operations, data migration, and path validation. Project has established TDD patterns across all packages.
- **Focus Areas**: File operations (security, conflict detection), registry migration (data integrity), URL params (type safety), workspace preferences (CRUD).

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Mock Usage
- **No mocks.** Fakes only — use established fakes: `FakeFileSystem`, `FakeWorkspaceRegistryAdapter`, `FakeWorkspaceContextResolver`, `FakeGitWorktreeResolver`, `FakeProcessManager`.
- New fakes: `FakeFileBrowserService` (if service created)
- All fakes registered in `createTestContainer()`

### Test Documentation
Every test includes:
```
Purpose: [what truth this test proves]
Quality Contribution: [how this prevents bugs]
Acceptance Criteria: [measurable assertions]
```

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| File browser components | plan-scoped | `apps/web/src/features/041-file-browser/` | Serves only this plan |
| File tree component | plan-scoped | `apps/web/src/features/041-file-browser/` | Plan-specific UI |
| Editor wrapper | plan-scoped | `apps/web/src/features/041-file-browser/` | Plan-specific UI |
| URL param definitions | plan-scoped | `apps/web/src/features/041-file-browser/params/` | Deep linking params |
| `workspaceHref()` | cross-cutting | `apps/web/src/lib/workspace-url.ts` | Used by all workspace pages |
| Workspace palettes | cross-cutting | `packages/workflow/src/constants/` | Used by entity + web UI |
| Workspace entity changes | cross-plan-edit | `packages/workflow/src/entities/workspace.ts` | Extends existing entity |
| Registry adapter changes | cross-plan-edit | `packages/workflow/src/adapters/workspace-registry.adapter.ts` | Migration logic |
| File server actions | plan-scoped | `apps/web/app/actions/file-actions.ts` | File CRUD operations |
| File API route | plan-scoped | `apps/web/app/api/workspaces/[slug]/files/route.ts` | Directory listing |
| Landing page | cross-plan-edit | `apps/web/app/(dashboard)/page.tsx` | Replaces existing |
| Sidebar | cross-plan-edit | `apps/web/src/components/dashboard-sidebar.tsx` | Restructures existing |
| Browser page | plan-scoped | `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | New route |
| Navigation utils | cross-plan-edit | `apps/web/src/lib/navigation-utils.ts` | Restructures NAV_ITEMS |
| NuqsAdapter wiring | cross-cutting | `apps/web/app/layout.tsx` | App-wide provider |

---

## Phase 1: Data Model & Infrastructure

**Objective**: Extend the Workspace entity with preferences, implement registry v1→v2 migration, create feature folder structure, and add workspace palettes.

**Deliverables**:
- Workspace entity with `preferences` field (emoji, color, starred, sortOrder)
- Registry v1→v2 migration with atomic writes
- `WorkspacePreferences` type and `DEFAULT_PREFERENCES` constant
- Emoji and color palette constants
- `IWorkspaceRegistryAdapter.update()` method
- `IWorkspaceService.updatePreferences()` method
- `updateWorkspacePreferences` server action
- Feature folder: `apps/web/src/features/041-file-browser/`

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Registry corruption during migration | Low | Critical | Atomic writes + backup before migration |
| Breaking existing workspace tests | Medium | High | Run all workspace contract/unit tests after changes |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Create `apps/web/src/features/041-file-browser/` with `index.ts` barrel | 1 | Directory exists, barrel file exports nothing yet | - | PlanPak setup (T000) |
| 1.2 | [ ] | Write tests for `WorkspacePreferences` type and `DEFAULT_PREFERENCES` | 1 | Tests verify default values, type shape | - | `test/unit/workflow/workspace-entity.test.ts` |
| 1.3 | [ ] | Write tests for `Workspace.withPreferences()` immutable update | 2 | Tests verify new entity returned, original unchanged, partial merge | - | Extend existing entity tests |
| 1.4 | [ ] | Write tests for `Workspace.toJSON()` with preferences | 1 | Tests verify preferences serialized in output | - | |
| 1.5 | [ ] | Implement `WorkspacePreferences` type, `DEFAULT_PREFERENCES`, and entity changes | 2 | All tests from 1.2-1.4 pass | - | `packages/workflow/src/entities/workspace.ts` |
| 1.6 | [ ] | Create workspace palette constants | 1 | Emoji palette (~30), color palette (~10) exported | - | `packages/workflow/src/constants/workspace-palettes.ts` |
| 1.7 | [ ] | Write tests for v1→v2 registry migration function | 2 | Tests: v1 input → v2 output, random emoji/color assigned, all fields preserved, empty workspaces array | - | `test/unit/workflow/registry-migration.test.ts` |
| 1.8 | [ ] | Write tests for atomic write in registry adapter | 2 | Tests: write to .tmp then rename, verify data integrity, handle write failure | - | Extend contract tests |
| 1.9 | [ ] | Implement migration function + atomic write in `WorkspaceRegistryAdapter` | 3 | All tests from 1.7-1.8 pass. `readRegistry()` migrates v1→v2. `writeRegistry()` uses tmp+rename. | - | |
| 1.10 | [ ] | Write tests for `IWorkspaceRegistryAdapter.update()` | 2 | Tests: update preferences, update non-existent workspace errors, partial update | - | Extend contract tests |
| 1.11 | [ ] | Implement `update()` on real + fake adapters | 2 | Contract tests pass for both real and fake | - | |
| 1.12 | [ ] | Write tests for `IWorkspaceService.updatePreferences()` | 2 | Tests: partial update, palette validation, non-existent workspace | - | `test/unit/workflow/workspace-service.test.ts` |
| 1.13 | [ ] | Implement `updatePreferences()` on `WorkspaceService` | 2 | All tests from 1.12 pass | - | |
| 1.14 | [ ] | Write tests for `updateWorkspacePreferences` server action | 2 | Tests: valid update, invalid emoji rejected, missing slug | - | `test/unit/web/app/actions/` |
| 1.15 | [ ] | Implement `updateWorkspacePreferences` server action | 2 | All tests from 1.14 pass | - | `apps/web/app/actions/workspace-actions.ts` |
| 1.16 | [ ] | Register `update()` in DI containers (production + test) | 1 | `createProductionContainer()` and `createTestContainer()` updated | - | `apps/web/src/lib/di-container.ts` |
| 1.17 | [ ] | Run full test suite — verify no regressions | 1 | `just fft` passes | - | |

### Acceptance Criteria
- [ ] AC-40, AC-41, AC-42, AC-43 (Data Model) satisfied
- [ ] AC-12, AC-13 (Visual Identity — storage) satisfied
- [ ] All existing workspace tests still pass
- [ ] Registry migration is non-destructive (v1 fields untouched)

---

## Phase 2: Deep Linking & URL State

**Objective**: Install and wire nuqs for type-safe URL state management. Create the workspace URL kit (`workspaceHref()`, param definitions) that all subsequent phases depend on.

**Deliverables**:
- `nuqs` installed and `NuqsAdapter` wired in root layout
- `workspaceHref()` helper
- `workspaceParams` definition (worktree)
- `fileBrowserParams` definition (dir, file, mode, changed)
- Server-side `createSearchParamsCache` for each param set

**Dependencies**: None (can run in parallel with Phase 1)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| nuqs incompatible with Next.js 16 / Turbopack | Low | High | First task is integration spike; fallback to custom hooks |
| Provider ordering conflicts | Low | Medium | Test SSR hydration after wiring |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Install `nuqs`, wire `NuqsAdapter` in root layout, verify build passes | 2 | `pnpm add nuqs && pnpm build` succeeds. `pnpm dev` starts without errors. Navigate to `/workspaces` and `/` — no hydration errors in console. Turbopack compat confirmed. | - | Spike: verify Turbopack compat. If fails, fall back to custom hooks per Finding 07. |
| 2.2 | [ ] | Write tests for `workspaceHref()` | 2 | Tests: basic URL, with worktree, with params, omits empty/false/undefined | - | `test/unit/web/lib/workspace-url.test.ts` |
| 2.3 | [ ] | Implement `workspaceHref()` | 1 | All tests from 2.2 pass | - | `apps/web/src/lib/workspace-url.ts` |
| 2.4 | [ ] | Write tests for `workspaceParams` (server-side cache) | 1 | Tests: empty params → defaults, populated params parsed correctly | - | |
| 2.5 | [ ] | Write tests for `fileBrowserParams` (server-side cache) | 2 | Tests: defaults, all params populated, invalid mode falls back | - | |
| 2.6 | [ ] | Implement param definitions + server caches | 2 | All tests from 2.4-2.5 pass | - | `apps/web/src/features/041-file-browser/params/` |
| 2.7 | [ ] | Write tests for `parseWorkspacePageProps()` helper | 1 | Tests: extracts slug + worktree from Next.js page props | - | |
| 2.8 | [ ] | Implement `parseWorkspacePageProps()` | 1 | Tests from 2.7 pass | - | `apps/web/src/lib/workspace-url.ts` |
| 2.9 | [ ] | Verify existing pages still work with NuqsAdapter | 1 | Navigate to 5+ existing pages, no errors | - | Manual verification |

### Acceptance Criteria
- [ ] AC-16, AC-17, AC-18, AC-19 (Deep Linking) satisfied
- [ ] Existing pages unaffected by NuqsAdapter addition
- [ ] `workspaceHref()` produces correct URLs for all test cases

---

## Phase 3: UI Overhaul — Landing Page & Sidebar

**Objective**: Replace the dashboard home with a workspace card grid. Restructure the sidebar to be workspace-scoped. Implement visual identity (emoji + color on cards and sidebar header).

**Deliverables**:
- Landing page (`/`) with workspace card grid, fleet status bar, "Add workspace" card
- Restructured sidebar: workspace header, worktree picker, Browser/Agents/Workflows items, "Dev" section
- Workspace card component with emoji, color accent, agent dots, star toggle
- Worktree searchable picker component
- Dynamic tab titles with emoji prefix
- Responsive layouts (phone, tablet, desktop)

**Dependencies**: Phase 1 (preferences data), Phase 2 (deep linking helpers)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sidebar refactor breaks existing pages | Medium | High | Test all 21+ routes after change |
| Worktree picker performance with 23+ items | Low | Medium | Virtualized list if needed |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for `WorkspaceCard` component | 2 | Tests: renders emoji+name, shows worktree count vs names (≤3 rule), star toggle, agent dots, color accent border | - | |
| 3.2 | [ ] | Implement `WorkspaceCard` component | 3 | All tests from 3.1 pass. Responsive at 375px/768px/1440px. | - | `features/041-file-browser/` |
| 3.3 | [ ] | Write tests for `FleetStatusBar` component | 2 | Tests: hidden when idle, shows agent count, shows attention count, clickable attention text | - | |
| 3.4 | [ ] | Implement `FleetStatusBar` component | 2 | All tests from 3.3 pass | - | `features/041-file-browser/` |
| 3.5 | [ ] | Write tests for landing page data fetching | 2 | Tests: fetches workspaces with preferences, fetches agent counts, sorts starred first | - | |
| 3.6 | [ ] | Implement landing page (`/`) | 3 | Replaces placeholder. Shows card grid + fleet bar + add card. Sidebar collapsed to icons. | - | `apps/web/app/(dashboard)/page.tsx` |
| 3.7 | [ ] | Write tests for `WorktreePicker` component | 3 | Tests: search filter, starred at top, recently-used, keyboard nav, scrollable, phone sheet mode | - | |
| 3.8 | [ ] | Implement `WorktreePicker` component | 3 | All tests from 3.7 pass. Handles 23+ worktrees. | - | `features/041-file-browser/` |
| 3.9 | [ ] | Restructure `DashboardSidebar` | 3 | Workspace header with emoji+color. Worktree picker. Browser/Agents/Workflows items (visible inside workspace). "Dev" collapsed section. "← All Workspaces" link. On landing page: collapsed to icons. | - | `apps/web/src/components/dashboard-sidebar.tsx` |
| 3.10 | [ ] | Restructure `navigation-utils.ts` NAV_ITEMS | 2 | Existing items moved to DEV_NAV_ITEMS. New WORKSPACE_NAV_ITEMS for Browser/Agents/Workflows. | - | |
| 3.11 | [ ] | Write tests for `useAttentionTitle` hook | 1 | Tests: sets document.title with emoji prefix, adds ❗ when attention needed | - | |
| 3.12 | [ ] | Implement `useAttentionTitle` hook | 1 | Tests from 3.11 pass | - | `features/041-file-browser/` |
| 3.13 | [ ] | Write tests for `useWorkspaceEmoji` hook (reads from workspace data) | 1 | Tests: returns emoji from workspace preferences | - | |
| 3.14 | [ ] | Implement `useWorkspaceEmoji` hook | 1 | Tests from 3.13 pass | - | |
| 3.15 | [ ] | Update `BottomTabBar` for workspace-scoped phone navigation | 2 | When inside workspace: shows Browser/Agents tabs. Otherwise: shows Home/original tabs. | - | |
| 3.16 | [ ] | Verify all existing pages work with restructured sidebar | 2 | Navigate to all workspace pages, agents, demos. No regressions. | - | `just fft` passes |

### Acceptance Criteria
- [ ] AC-1 through AC-6 (Landing Page) satisfied
- [ ] AC-7 through AC-11 (Sidebar & Navigation) satisfied
- [ ] AC-14 (Visual Identity — display) satisfied
- [ ] AC-35 through AC-39 (Responsive) satisfied for landing page + sidebar
- [ ] All existing pages still work

---

## Phase 4: File Browser

**Objective**: Build the complete file browser — backend APIs + frontend UI together so they can be iterated as one unit. Part A covers the server-side infrastructure, Part B covers the UI components. Tasks interleave: build a backend slice, build its frontend, iterate.

**Deliverables**:
- `GET /api/workspaces/[slug]/files?path=<dir>&worktree=<path>` — directory listing
- `readFile()` server action with size limit + binary detection
- `saveFile()` server action with mtime conflict detection + atomic write
- Workspace-scoped `getGitDiff()` extension
- `git ls-files` integration for gitignore-aware listing
- `git diff --name-only` for changed-files filter
- File tree component with expand/collapse, file icons, refresh button, changed-only toggle
- File viewer panel with Edit/Preview/Diff mode buttons
- CodeMirror 6 editor wrapper (lazy-loaded)
- Integration with existing MarkdownViewer and DiffViewer
- Save button with conflict error UI
- Browser page (`/workspaces/[slug]/browser`) with URL-driven state
- Responsive: full-screen sequential panels on phone, side-by-side on desktop

**Dependencies**: Phase 1 (workspace service), Phase 2 (deep linking), Phase 3 (sidebar/navigation)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Symlink escape | Low | Critical | Realpath check after path resolution |
| Save conflict race | Low | Medium | Atomic write pattern, documented as best-effort |
| Large file OOM | Medium | Medium | Size check before read |
| CodeMirror bundle size | Low | Medium | Lazy load via dynamic import |
| Editor theme mismatch with app theme | Low | Low | Use github-light/github-dark themes (match Shiki) |

### Part A: Backend — Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for directory listing (git ls-files + readDir fallback) | 3 | Tests: git repo lists tracked files grouped by dir, non-git lists all files, respects worktree path, `../` traversal rejected with PathSecurityError, empty dir returns `{ entries: [], totalCount: 0 }` | - | |
| 4.2 | [ ] | Implement directory listing service | 3 | All tests from 4.1 pass. Returns `{ entries: FileEntry[], totalCount: number }`. Uses `execFile('git', ['ls-files', '--full-name'])` for git repos, `readDir` for non-git. Groups flat list into tree structure. | - | `features/041-file-browser/` |
| 4.3 | [ ] | Write tests for `GET /api/workspaces/[slug]/files` route | 2 | Tests: valid path → 200 with `{ entries: [...] }`, invalid path → 400, `../` traversal → 403, workspace not found → 404, missing worktree param → 400 | - | |
| 4.4 | [ ] | Implement files API route | 2 | All tests from 4.3 pass. Route returns JSON `{ entries: FileEntry[] }`. Uses DI container for IFileSystem + IPathResolver. | - | `apps/web/app/api/workspaces/[slug]/files/route.ts` |
| 4.5 | [ ] | Write tests for `readFile()` server action | 3 | Tests: returns `{ content, mtime, size, language }`, stat().size > 5MB → `{ error: 'file-too-large' }`, null-byte in first 8KB → `{ error: 'binary-file' }`, `../` traversal → PathSecurityError, realpath() escape → PathSecurityError, file not found → `{ error: 'not-found' }` | - | |
| 4.6 | [ ] | Implement `readFile()` server action | 2 | All tests from 4.5 pass. Returns typed `ReadFileResult`. Checks stat().size before read. Null-byte scan for binary. realpath() check for symlink escape. | - | `apps/web/app/actions/file-actions.ts` |
| 4.7 | [ ] | Write tests for `saveFile()` server action | 3 | Tests: saves content → returns `{ ok: true, newMtime }`, mtime mismatch → `{ error: 'conflict', serverMtime }`, force=true overrides conflict, write uses tmp+rename (atomic), `../` traversal → PathSecurityError | - | |
| 4.8 | [ ] | Implement `saveFile()` server action | 3 | All tests from 4.7 pass. Returns typed `SaveFileResult`. Atomic write: writeFile(tmp) + rename(tmp, target). | - | `apps/web/app/actions/file-actions.ts` |
| 4.9 | [ ] | Write tests for changed-files filter (`git diff --name-only`) | 2 | Tests: returns `string[]` of changed file paths, empty array when no changes, non-git workspace → `{ error: 'not-git' }` | - | |
| 4.10 | [ ] | Implement changed-files filter | 2 | All tests from 4.9 pass. Uses `execFile('git', ['diff', '--name-only'])` with workspace cwd. | - | `features/041-file-browser/` |
| 4.11 | [ ] | Extend `getGitDiff()` to accept workspace-scoped paths | 2 | Tests: workspace path used as cwd instead of `process.cwd()`, existing tests still pass. Function signature adds optional `cwd` param. | - | `apps/web/src/lib/server/git-diff-action.ts` |

### Part B: Frontend — Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.12 | [ ] | Install `@uiw/react-codemirror` + language extensions | 1 | Package installed, build passes | - | |
| 4.13 | [ ] | Write tests for `FileTree` component | 3 | Tests: renders directory structure, expand/collapse folders, file selection updates URL, changed-only filter, refresh button, empty state | - | |
| 4.14 | [ ] | Implement `FileTree` component | 3 | All tests from 4.13 pass. Responsive (full-screen on phone). | - | `features/041-file-browser/` |
| 4.15 | [ ] | Write tests for `CodeEditor` wrapper component | 2 | Tests: renders CodeMirror, language detection, theme sync (light/dark), content change callback, read-only mode | - | |
| 4.16 | [ ] | Implement `CodeEditor` wrapper (lazy-loaded) | 3 | All tests from 4.15 pass. Dynamic import for CodeMirror. | - | `features/041-file-browser/` |
| 4.17 | [ ] | Write tests for `FileViewerPanel` component | 3 | Tests: mode toggle (edit/preview/diff), save button visible in edit mode, conflict error display, refresh button, large file message, binary file message | - | |
| 4.18 | [ ] | Implement `FileViewerPanel` component | 3 | All tests from 4.17 pass. Integrates CodeEditor, MarkdownViewer, DiffViewer. | - | `features/041-file-browser/` |
| 4.19 | [ ] | Write tests for browser page URL state integration | 2 | Tests: URL params drive initial state, mode change updates URL, file selection updates URL, bookmark restore | - | |
| 4.20 | [ ] | Implement browser page (`/workspaces/[slug]/browser`) | 3 | Two-panel layout. URL state via nuqs. Responsive breakpoints. | - | New route |
| 4.21 | [ ] | Verify responsive layouts at 375px, 768px, 1440px | 2 | Phone: full-screen panels. Tablet: drawer tree. Desktop: side-by-side. | - | Use browser MCP |
| 4.22 | [ ] | Run full test suite | 1 | `just fft` passes | - | |

### Acceptance Criteria
- [ ] AC-44, AC-45, AC-46, AC-47 (Backend APIs) satisfied
- [ ] AC-20 through AC-30 (File Browser) satisfied
- [ ] AC-21, AC-22 (File tree listing + changed filter) satisfied
- [ ] AC-24, AC-25, AC-26, AC-27 (Viewer modes) satisfied
- [ ] AC-28, AC-30 (Save + size limits) satisfied
- [ ] AC-35 through AC-39 (Responsive) satisfied for browser page
- [ ] Path traversal and symlink attacks prevented (Finding 01, 02)
- [ ] CodeMirror lazy-loaded (not in initial bundle)

---

## Phase 5: Attention System & Polish

**Objective**: Implement the attention system (agent error indicators bubbling up through the UI), workspace settings page, and final polish.

**Deliverables**:
- Attention indicators on workspace cards (amber border + ◆)
- Fleet status bar "◆ N needs attention" with click-to-navigate
- Browser tab title ❗ prefix
- `/settings/workspaces` page (emoji picker, color picker, manage workspaces)
- Star/unstar toggle wired to server action
- Pop-out `[↗]` buttons on key items

**Dependencies**: Phase 3 (landing page), Phase 4 (file browser)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE connection for live agent status | Low | Medium | Reuse existing useAgentManager hook |
| Emoji picker complexity | Low | Low | Simple popover with curated palette grid |

### Tasks (Full TDD)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for attention state derivation (`workspaceNeedsAttention`, `attentionCount`) | 1 | Tests: no agents = false, all working = false, one error = true, count matches | - | |
| 5.2 | [ ] | Implement attention derivation functions | 1 | Tests from 5.1 pass | - | `features/041-file-browser/` |
| 5.3 | [ ] | Wire attention indicators into `WorkspaceCard` | 2 | Cards show amber border + ◆ when agents in error state. Live via SSE. | - | |
| 5.4 | [ ] | Wire attention into `FleetStatusBar` | 2 | "◆ N needs attention" shown. Clickable → navigates to first affected workspace. | - | |
| 5.5 | [ ] | Wire `useAttentionTitle` into workspace pages | 1 | Tab title shows ❗ prefix when attention needed | - | |
| 5.6 | [ ] | Write tests for `EmojiPicker` component | 2 | Tests: renders palette grid, click selects emoji, current emoji highlighted | - | |
| 5.7 | [ ] | Write tests for `ColorPicker` component | 2 | Tests: renders color swatches, click selects color, current color highlighted, light/dark mode | - | |
| 5.8 | [ ] | Implement `EmojiPicker` and `ColorPicker` | 2 | All tests from 5.6-5.7 pass | - | `features/041-file-browser/` |
| 5.9 | [ ] | Implement `/settings/workspaces` page | 3 | Table: emoji+color (clickable pickers) + name + path + actions. Star toggle. Remove button. | - | |
| 5.10 | [ ] | Add pop-out `[↗]` buttons to agent list and file viewer | 1 | Buttons call `window.open(deepLinkedUrl, '_blank')` | - | |
| 5.11 | [ ] | Final responsive polish pass | 2 | All pages verified at 375px, 768px, 1440px | - | Use browser MCP |
| 5.12 | [ ] | Run full test suite | 1 | `just fft` passes | - | |

### Acceptance Criteria
- [ ] AC-31 through AC-34 (Attention System) satisfied
- [ ] AC-5 (Star toggle) fully wired
- [ ] AC-15 (Settings page for emoji/color) satisfied
- [ ] All pages responsive

---

## Phase 6: Documentation

**Objective**: Write developer documentation for the deep linking system and file browser architecture.

**Deliverables**:
- `docs/how/deep-linking.md` — How to add deep linking to new pages
- `docs/how/file-browser.md` — File browser architecture, security model

**Dependencies**: All implementation phases complete

### Tasks (Lightweight)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Survey existing `docs/how/` structure | 1 | Documented existing directories | - | Discovery step |
| 6.2 | [ ] | Write `docs/how/deep-linking.md` | 2 | Covers: param definitions, nuqs usage, workspaceHref(), adding params to new pages, server-side caching. Code examples from real implementation. | - | |
| 6.3 | [ ] | Write `docs/how/file-browser.md` | 2 | Covers: architecture overview, file operations (read/write/diff), security model (path validation, symlink), size limits, conflict detection. | - | |
| 6.4 | [ ] | Review documentation for accuracy | 1 | Code examples verified, links working | - | |

### Acceptance Criteria
- [ ] Documentation exists at specified paths
- [ ] A developer can follow the deep-linking guide to add URL params to a new page
- [ ] Security model for file operations is clearly documented

---

## Cross-Cutting Concerns

### Security
- **Path validation**: All file paths validated via `IPathResolver` (prevents `..` traversal)
- **Symlink check**: `realpath()` verification for file read/write (prevents escape via symlinks)
- **Command injection**: Git commands use `execFile` with array args (no shell interpretation)
- **Input validation**: Emoji/color validated against palette constants. File paths validated before any I/O.

### Observability
- **Logging**: Follow existing pattern — `console.error` in API routes, structured error returns
- **Error states**: File browser shows user-friendly errors (file too large, binary file, save conflict, not found)

### Documentation
- **Location**: `docs/how/` only (per clarification Q3)
- **Content**: Deep linking guide + file browser architecture
- **Audience**: Future developer extending the system

---

## Complexity Tracking

| Component | CS | Label | Breakdown | Justification | Mitigation |
|-----------|-----|-------|-----------|---------------|------------|
| Sidebar restructure | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=1 | Touches shared layout, affects all pages | Test all routes after change |
| File browser page | 3 | Medium | S=1,I=1,D=1,N=1,F=0,T=1 | Two-panel responsive layout, URL state, 3 viewer modes | Progressive implementation, mode by mode |
| Registry v1→v2 migration | 2 | Small | S=0,I=0,D=2,N=0,F=0,T=1 | Data migration, atomic write | Pure function migration, backup before write |
| Worktree picker | 3 | Medium | S=1,I=0,D=0,N=1,F=1,T=1 | Search, keyboard nav, 23+ items, responsive | Command-palette pattern well understood |
| Save with conflict detection | 2 | Small | S=0,I=0,D=1,N=1,F=0,T=1 | Race window, atomic write | Document as best-effort |
| Overall plan | 4 | Large | S=2,I=1,D=2,N=1,F=1,T=2 | Per spec assessment | Phased delivery, each phase independently deployable |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Data Model & Infrastructure — COMPLETE
- [ ] Phase 2: Deep Linking & URL State — NOT STARTED
- [ ] Phase 3: UI Overhaul — Landing Page & Sidebar — NOT STARTED
- [ ] Phase 4: File Browser (Part A: Backend + Part B: Frontend) — NOT STARTED
- [ ] Phase 5: Attention System & Polish — NOT STARTED
- [ ] Phase 6: Documentation — NOT STARTED

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004: DI Container Architecture | Accepted | Phase 1 (DI registration) | Follow decorator-free TSyringe pattern |
| ADR-0008: Workspace Split Storage | Accepted | Phase 1 (registry vs per-worktree) | Preferences go in global registry (per workshop) |
| ADR-0009: Workspace-Scoped SSE Hooks | Seed | Phase 6 (attention system) | Reuse `useWorkspaceSSE` for live agent status |
| ADR-0010: Central Domain Event Notification | Accepted | Phase 6 (future compatibility) | File browser doesn't wire SSE for file changes yet |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| None identified | — | — | — |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
