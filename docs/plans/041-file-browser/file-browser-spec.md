# File Browser & Workspace-Centric UI

**Mode**: Full
**File Management**: PlanPak

📚 This specification incorporates findings from `research.md` and three workshops:
- `workshops/deep-linking-system.md` — URL state management with nuqs
- `workshops/ux-vision-workspace-experience.md` — Product vibe, UX patterns, attention system
- `workshops/workspace-preferences-data-model.md` — Emoji, color, starred, registry schema v2

---

## Research Context

- **Components affected**: Dashboard layout, sidebar, navigation, landing page, workspace pages, viewer components, API routes, server actions, workspace entity, workspace registry adapter, DI container
- **Critical dependencies**: Existing viewer components (FileViewer, DiffViewer, MarkdownViewer, MermaidRenderer), workspace data model (IWorkspaceService, WorkspaceContext, worktrees), DI infrastructure, SSE plumbing, Shiki server-side highlighting
- **Modification risks**: Sidebar restructure touches all pages via shared layout. Workspace entity change requires registry schema migration (v1→v2). Landing page replacement removes current dashboard home.
- **Existing assets**: 23 real worktrees in the substrate workspace confirm scale requirements. Language detection covers 60+ extensions. shadcn/ui component library provides responsive primitives.
- **Link**: See `research.md` for full analysis

---

## Summary

Transform the Chainglass web app from a prototype dashboard into a workspace-centric mission control for managing AI agent fleets across multiple codebases. The two core deliverables are:

1. **Workspace-centric UI** — Replace the placeholder dashboard with a workspace selector landing page, restructure navigation to be workspace-scoped, add visual identity (emoji + accent color) per workspace, and make every page state deep-linkable via URL.

2. **File browser** — A tree-view file navigator with code editor, markdown preview, and git diff viewer per workspace. Users can browse files, edit code, preview markdown (with mermaid), view diffs, save with conflict detection, and filter to git-changed files.

The product vibe is "one human, many agents" — a single developer managing a fleet of AI agents across workspaces. The UI must be calm over busy, browser-native (tabs, bookmarks, middle-click), and glanceable (emoji + color identity, attention indicators). Phone and iPad are first-class.

---

## Goals

- **Workspace-first experience**: The landing page shows workspaces, not a generic dashboard. Selecting a workspace binds the browser tab to that context. Different tabs = different workspaces.
- **File browsing**: Navigate any workspace's file tree, open files for viewing/editing/diffing. Filter tree to git-changed files only.
- **Code editing**: Edit files in the browser using an off-the-shelf code editor with syntax highlighting. Save with mtime-based conflict detection.
- **Markdown preview**: Render markdown with mermaid diagram support, syntax-highlighted code blocks, and GFM. Toggle between source/preview.
- **Git diff viewing**: View uncommitted changes per file using the existing DiffViewer component, scoped to workspace paths.
- **Deep linking everything**: Every page state (workspace, worktree, directory, file, viewer mode) encoded in the URL. Bookmarkable, pinnable, shareable across browser tabs.
- **Glanceable workspace identity**: Each workspace gets a persistent emoji + accent color, auto-assigned on creation, user-customizable. Visible on cards, sidebar, tab titles.
- **Fleet status at a glance**: Landing page shows a summary of running agents across all workspaces. Workspace cards show per-workspace agent counts with activity dots.
- **Attention bubbling**: When an agent errors or asks a question, attention indicators bubble from agent → worktree → workspace card → fleet bar → browser tab title (❗ prefix).
- **Responsive design**: All pages work on phone, iPad, and desktop. Bottom tab bar on phone, sidebar-as-sheet on tablet, full sidebar on desktop. Touch targets ≥44px.
- **Sidebar restructure**: Workspace-scoped sidebar with Browser, Agents, Workflows items. Current demo/prototype pages moved to collapsed "Dev" section.
- **Worktree selection at scale**: Searchable worktree picker (command-palette style) that handles 20+ worktrees with filter, starred, recently-used, and activity/attention indicators.
- **Workspace management**: Star/unstar workspaces for pinning to top. Settings page for editing emoji, color, and managing workspaces.

---

## Non-Goals

- **SSE-driven file change notifications**: File browser uses manual refresh buttons. No real-time file watching via SSE. The central notification system (Plan 027) will provide this later — the design should not preclude it.
- **Full IDE replacement**: This is a browser + reviewer, not VS Code. The editor is basic — syntax highlighting + save. No LSP, no autocomplete, no terminal.
- **Workflow execution UI**: The "Workflows" sidebar item is a placeholder. Workflow management UI is a future plan.
- **Agent chat re-engineering**: Existing agent chat pages work as-is. This plan does not rebuild them, but ensures they're accessible via the new workspace-scoped navigation.
- **Multi-user collaboration**: This is a single-user tool running on a dev machine. No auth, no sharing, no collaboration features.
- **Drag-to-reorder workspaces**: Star/unstar for pinning is sufficient. Full drag reorder is unnecessary complexity.
- **Dynamic favicon**: Showing the workspace emoji as the browser favicon is a stretch goal, not a requirement.
- **Worktree-level eventing**: Attention indicators on worktrees in the picker are designed for but not wired up — worktree-level event correlation doesn't exist yet. Components accept optional attention props.

---

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=1, T=2
  - Surface Area (S=2): Cross-cutting — touches layout, sidebar, landing page, workspace entity, registry adapter, API routes, server actions, new file browser components, new params system, and all existing workspace pages.
  - Integration (I=1): One new external dependency (nuqs for URL state). CodeMirror 6 is a second, but well-understood.
  - Data/State (D=2): Workspace registry schema migration (v1→v2), new preferences field, new file read/write server actions with conflict detection.
  - Novelty (N=1): Some ambiguity in editor integration and attention system wiring, but workshops have largely resolved design questions.
  - Non-Functional (F=1): Responsive design across 3 breakpoints. Security (path traversal prevention) follows established patterns.
  - Testing/Rollout (T=2): Needs integration tests for file operations, unit tests for params/URL helpers, contract tests for registry migration, component tests for new UI. Staged rollout: backend APIs → components → wiring.
- **Confidence**: 0.80
- **Assumptions**:
  - CodeMirror 6 via `@uiw/react-codemirror` is suitable (research supports this)
  - nuqs library works with Next.js 16 and Turbopack
  - Existing viewer components (FileViewer, DiffViewer, MarkdownViewer) can be reused without major changes
  - The workspace registry v1→v2 migration is non-breaking (additive fields with defaults)
- **Dependencies**:
  - Existing workspace data model (Plan 014) — stable
  - Existing viewer components (Plan 006) — stable
  - Existing agent system (Plan 019) — stable, needed for fleet status
  - Central notification system (Plan 027) — NOT a dependency, but designs should be compatible
- **Risks**:
  - Large file handling — need size caps for editor and viewer
  - Binary file detection — must not attempt to render binary files
  - Bundle size increase from CodeMirror (~150KB gzip) — acceptable but needs lazy loading
  - 23+ worktrees at scale — addressed by searchable picker design
- **Phases**: Suggested high-level phasing:
  1. Data model + deep linking infrastructure
  2. UI overhaul (landing page, sidebar, navigation)
  3. File browser backend (APIs, server actions)
  4. File browser frontend (tree, viewer panel, editor)
  5. Polish (attention system, responsive refinement, settings page)

---

## Acceptance Criteria

### Landing Page & Navigation

1. Visiting `/` shows a workspace card grid with sidebar collapsed to icons. Each card displays workspace emoji, name, worktree count (or branch names if ≤3), agent status dots, and path.
2. Clicking a workspace card navigates to `/workspaces/[slug]`. Middle-clicking opens in a new tab.
3. A fleet status bar appears above the cards when any agents are running, showing total agent count and attention count. Hidden when all idle.
4. An "Add workspace" card with dashed border allows adding workspaces via inline form (name + path).
5. Starred workspaces appear at the top of the grid. A star toggle on each card pins/unpins.
6. Workspace cards with agents in error/question state show an amber left-border and ◆ indicator.

### Sidebar & Workspace Navigation

7. Inside a workspace (`/workspaces/[slug]/*`), the sidebar expands with: workspace emoji + name header, worktree selector, Browser/Agents/Workflows nav items, "← All Workspaces" link, and a collapsed "Dev" section. On the landing page (`/`), the sidebar is collapsed to icons. Sidebar collapse/expand is user-controllable and persists via cookie.
8. Current demo/prototype pages (kanban, workflow viz, viewer demos, responsive demo) are accessible under the collapsed "Dev" sidebar section.
9. The worktree selector is a searchable picker that handles 20+ worktrees with filter input, starred worktrees at top, recently-used section, scrollable list, and keyboard navigation.
10. Selecting a worktree updates the `?worktree=` URL param via deep linking. All sub-pages scope to the selected worktree.
11. The sidebar collapses to icon-only mode with emoji at top, tooltips on hover. Collapse state persists in cookie.

### Visual Identity

12. Each workspace has a persistent emoji and accent color, auto-assigned randomly on creation from curated palettes (~30 emojis, ~10 colors).
13. Emoji and color are stored in the workspace registry alongside other workspace fields. Reading a registry without preferences uses spread-with-defaults (empty emoji/color). Auto-assignment of random emoji/color happens when the landing page "Add workspace" flow is built (Phase 3).
14. Emoji + color appear on: landing page cards, sidebar header, browser tab title (emoji prefix), breadcrumbs.
15. Users can change emoji and color on a workspace settings/manage page (`/settings/workspaces`).

### Deep Linking

16. Every page state is URL-encoded using type-safe URL params (nuqs). Params include: worktree, directory, file, viewer mode, changed-only filter.
17. Bookmarking a URL and reopening it restores the exact page state (workspace, worktree, file, mode).
18. A `workspaceHref()` helper function builds workspace-scoped URLs with proper encoding. Used consistently across all link construction.
19. The `NuqsAdapter` is wired in the root layout for app-wide URL state management.

### File Browser

20. `/workspaces/[slug]/browser` shows a two-panel layout: file tree (left) + file viewer (right). On phone, these are full-screen sequential panels.
21. The file tree uses `git ls-files` for directory listing in git repositories (respects `.gitignore` — gitignored files are always hidden). For non-git workspaces, falls back to `IFileSystem.readDir()`. Results are grouped into a tree structure by directory.
22. A "Changed only" toggle filters the file tree to show only git-modified files (via `git diff --name-only`).
23. The file tree has a refresh button to reload directory contents.
24. The file viewer has three mode buttons: Edit, Preview, Diff. The active mode is reflected in the URL (`?mode=edit|preview|diff`).
25. **Edit mode**: Code editor with syntax highlighting via CodeMirror 6. Supports the same languages as the existing Shiki setup.
26. **Preview mode**: Markdown files render with the existing MarkdownViewer (mermaid + syntax highlighting). Non-markdown files show read-only syntax-highlighted code via existing FileViewer.
27. **Diff mode**: Shows uncommitted git changes for the selected file via existing DiffViewer. Uses workspace-scoped paths (not `process.cwd()`).
28. A save button writes file content. Before writing, the server checks the file's mtime against the expected mtime (sent from client). If mtime changed (another process wrote the file), save fails with a conflict error. User can force-save or refresh.
29. The file viewer has a refresh button to reload file contents from disk.
30. Files larger than a configurable size limit show a "file too large" message instead of loading. Binary files are detected and show a "binary file" placeholder.

### Attention System

31. When any agent has status `error` or asks a question, the workspace card on the landing page shows an amber ◆ indicator and amber left-border.
32. The fleet status bar shows "◆ N needs attention" when agents need intervention. The text is clickable, navigating to the first affected workspace.
33. The browser tab title is prefixed with ❗ when the current workspace has agents needing attention.
34. Attention indicators are state-driven (derived from agent status), not notification-driven. They clear automatically when the underlying condition resolves.

### Responsive Design

35. All pages render correctly at phone (375px), tablet (768px), and desktop (1440px) widths.
36. On phone (<640px): bottom tab bar navigation, full-screen panels (no split views), stacked workspace cards, bottom-anchored action buttons.
37. On tablet (640-1023px): sidebar available as slide-over sheet, 2-column card grid, file tree as collapsible drawer.
38. On desktop (≥1024px): persistent sidebar, side-by-side file tree + viewer, full card grid.
39. All interactive elements have touch targets ≥44px on phone. No hover-only interactions.

### Data Model

40. The Workspace entity gains a `preferences` field with: emoji (string), color (string), starred (boolean), sortOrder (number).
41. The workspace registry file (`workspaces.json`) handles missing preferences gracefully via spread-with-defaults when reading. No formal schema migration is needed — the v2 schema is a superset of v1. Existing fields are preserved; missing preferences default to empty emoji/color, unstarred, sortOrder 0.
42. A new `updatePreferences()` method on IWorkspaceService allows partial preference updates. A corresponding `update()` method is added to IWorkspaceRegistryAdapter.
43. A new `updateWorkspacePreferences` server action handles preference mutations from the UI.

### Backend APIs

44. A new API route `GET /api/workspaces/[slug]/files?path=<dir>` returns directory contents for the given path within the workspace. Paths are validated to prevent directory traversal.
45. A new server action `readFile(slug, worktreePath, filePath)` returns file content + metadata (mtime, size). Paths are validated via IPathResolver.
46. A new server action `saveFile(slug, worktreePath, filePath, content, expectedMtime)` writes file content with conflict detection. Returns error if mtime has changed.
47. The existing `getGitDiff()` server action is extended to accept workspace-scoped paths (not hardcoded to `process.cwd()`).

---

## Risks & Assumptions

- **Risk**: Large files could crash the editor or cause slow rendering. **Mitigation**: Size cap (~1MB for editor, ~5MB for viewer). Binary detection via null-byte scan.
- **Risk**: CodeMirror 6 bundle size (~150KB gzip). **Mitigation**: Lazy load the editor — only import when edit mode is selected. Language extensions loaded on demand.
- **Risk**: 23+ worktrees makes the worktree picker complex. **Mitigation**: Searchable command-palette design (workshopped). Filter + starred + recent keeps common cases fast.
- **Risk**: Registry schema migration (v1→v2) could corrupt data. **Mitigation**: Migration is additive (new fields with defaults), not destructive. Pure function, unit testable. Original fields untouched.
- **Risk**: Path traversal attacks via file browser APIs. **Mitigation**: All paths validated through existing IPathResolver with PathSecurityError. Same defense-in-depth pattern as existing getGitDiff.
- **Assumption**: nuqs works with Next.js 16 + Turbopack. Need to verify during implementation.
- **Assumption**: The existing `IFileSystem.readDir()` + `stat()` are sufficient for building the file tree. No new filesystem operations needed.
- **Assumption**: Existing viewer components (FileViewer, DiffViewer, MarkdownViewer) work as-is when integrated into the file browser panel.

---

## Open Questions

All questions resolved — see Clarifications section below.

---

## ADR Seeds (Optional)

### ADR-1: Code Editor Library Selection

- **Decision Drivers**: Must be lightweight, well-maintained, React-compatible, support 20+ languages, customizable themes (dark/light).
- **Candidate Alternatives**:
  - A: CodeMirror 6 via `@uiw/react-codemirror` — modular, ~150KB gzip, most popular
  - B: Monaco Editor — VS Code engine, ~2MB gzip, feature-rich but heavy
  - C: Ace Editor — older, stable, ~200KB gzip, less modern API
- **Stakeholders**: Developer (sole user)
- **Research recommendation**: CodeMirror 6 (see research.md Section 4)

### ADR-2: URL State Management Approach

- **Decision Drivers**: Type-safe, instant updates, SSR-compatible, minimal boilerplate for new pages.
- **Candidate Alternatives**:
  - A: nuqs library — ~3KB, useState-like API, built-in parsers
  - B: Custom hooks with useSearchParams — zero deps, more boilerplate
  - C: Zod-based custom useQueryParams — type-safe but manual
- **Stakeholders**: Developer (sole user)
- **Workshop recommendation**: nuqs (see workshops/deep-linking-system.md)

### ADR-3: Workspace Preferences Storage Location

- **Decision Drivers**: Must survive project deletion, be consistent across worktrees, support extensibility.
- **Candidate Alternatives**:
  - A: Extend global registry (workspaces.json v2) — simple, co-located
  - B: Separate preferences file — isolated but another file to manage
  - C: Per-worktree storage — wrong scope (preferences are workspace-level)
- **Stakeholders**: Developer (sole user)
- **Workshop recommendation**: Option A (see workshops/workspace-preferences-data-model.md)

---

## Workshop Opportunities

All identified workshops have been completed:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Deep Linking System | Integration Pattern | ✅ Complete | `workshops/deep-linking-system.md` |
| UX Vision & Workspace Experience | UX Design | ✅ Complete | `workshops/ux-vision-workspace-experience.md` |
| Workspace Preferences Data Model | Data Model | ✅ Complete | `workshops/workspace-preferences-data-model.md` |

No additional workshops are needed before architecture.

---

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Complex feature with backend APIs, data model migration, path security, conflict detection — all benefit from tests-first. Project has established TDD patterns across all packages.
- **Mock Usage**: No mocks. Use fakes as required — the project has comprehensive fake implementations (FakeFileSystem, FakeWorkspaceRegistryAdapter, FakeWorkspaceContextResolver, etc.). Follow established idioms and exemplars from existing contract/unit tests.
- **Focus Areas**:
  - File operations (read, write, conflict detection) — security and correctness critical
  - Registry v1→v2 migration — must be non-destructive
  - URL param parsing (nuqs param definitions) — type-safe defaults and edge cases
  - workspaceHref() URL building — encoding, omitting defaults
  - Workspace preferences CRUD — update, defaults, palette validation
  - File tree directory listing — path validation, gitignore filtering
- **Excluded**:
  - Visual/layout testing (use browser MCP for design iteration)
  - Third-party library internals (nuqs, CodeMirror)
- **Established Patterns**:
  - Contract tests in `test/contracts/` for adapter interfaces
  - Unit tests in `test/unit/web/` for web components, hooks, server actions
  - Fakes in `packages/*/src/fakes/` co-located with real implementations
  - `FakeFileSystem` for all filesystem operations
  - `FakeWorkspaceRegistryAdapter` for registry operations
  - `createTestContainer()` for DI-based test isolation

---

## Documentation Strategy

- **Location**: `docs/how/` only
- **Rationale**: Complex new patterns (deep linking param system, workspace URL kit, file browser architecture) need reference documentation for future development. README doesn't need updating — this is an internal feature.
- **Target Audience**: Future developer (you) extending the file browser or adding deep linking to new pages
- **Content**:
  - `docs/how/deep-linking.md` — How to add deep linking to a new page (param definitions, nuqs usage, workspaceHref)
  - `docs/how/file-browser.md` — Architecture overview, file operations, security model
- **Maintenance**: Update docs when new param patterns or file operations are added

---

## Clarifications

### Session 2026-02-22

**Pre-declared by user**: Full mode, Full TDD, fakes (no mocks), established architecture.

| # | Question | Answer | Spec Impact |
|---|----------|--------|-------------|
| Q1 | Editor auto-save or explicit button? | **Explicit save button only.** No auto-save. | AC-28 confirmed: explicit save with conflict detection. |
| Q2 | File tree gitignore awareness? | **Yes, respect .gitignore by default.** Use `git ls-files` for listing. Always hide gitignored files (no toggle to show them). Solves node_modules and depth concerns. | AC-21 updated: tree uses `git ls-files` in git repos. AC removed: no depth limit needed. |
| Q3 | Documentation location? | **docs/how/ only.** | Documentation Strategy section added. |
| Q4 | Build order priority? | **Landing page + sidebar first, then file browser.** Sidebar is always available — collapsed to icons on all pages including landing page. | Updated: sidebar visible everywhere. UX workshop's "no sidebar on landing" revised to "sidebar collapsed to icons on landing." |
| Q5 | PlanPak file placement? | **`apps/web/src/features/041-file-browser/`** — standard feature folder within web app. | File Management set to PlanPak in spec header. |

**Updates applied to spec:**

1. **AC-21 revised**: File tree uses `git ls-files` for git repos (respects .gitignore). Falls back to `readDir` for non-git workspaces. Gitignored files are always hidden.
2. **AC removed**: File tree depth limit question is moot — `git ls-files` returns a flat list grouped into directories, avoiding deep recursive scans of ignored directories.
3. **Sidebar behavior revised**: Sidebar is always visible on every page. On landing page, collapsed to icons. On workspace pages, expanded with workspace-scoped items. Collapse/expand is user-controllable and persists.
4. **Build order**: Phase 1 = data model + deep linking infra. Phase 2 = landing page + sidebar. Phase 3+ = file browser.

### Coverage Summary

| Status | Count | Items |
|--------|-------|-------|
| Resolved | 8 | Mode (Full), Testing (Full TDD), Mocks (Fakes only), Auto-save (explicit), Gitignore (yes, always hide), Docs (docs/how/), Build order (UI first), File placement (PlanPak) |
| Deferred | 0 | — |
| Outstanding | 0 | — |
