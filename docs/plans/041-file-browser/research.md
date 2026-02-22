# 041 File Browser — Exploration Research Dossier

> Generated: 2026-02-22  
> Branch: `041-file-browser`  
> Scope: File browser + UI overhaul for workspace-centric navigation

---

## 1. Executive Summary

This plan covers two tightly-coupled workstreams:

1. **File Browser** — A tree-view file navigator + editor/preview/diff viewer per workspace, with deep linking.
2. **UI Overhaul** — Restructure the web app to be workspace-centric: workspace selector as the landing page, sectioned sidebar, random emoji per workspace session, deep-linkable everything.

The codebase already has strong foundations for both: viewer components (FileViewer, DiffViewer, MarkdownViewer, MermaidRenderer), workspace data model (IWorkspaceService, WorkspaceContext, worktrees), DI infrastructure, SSE plumbing, and Shiki server-side highlighting. The main new work is:
- A file tree API (directory listing + git diff filtering)
- A code editor component (needs an off-the-shelf library)
- File read/write/save server actions with conflict detection
- Restructured routing and sidebar
- Deep linking throughout

---

## 2. Existing Assets Inventory

### 2.1 Viewer Components (`apps/web/src/components/viewers/`)

| Component | Type | Description |
|-----------|------|-------------|
| `FileViewer` | Client | Displays syntax-highlighted code with line numbers. Receives pre-highlighted HTML from server. |
| `DiffViewer` | Client | Git diff rendering via `@git-diff-view/react` + `@git-diff-view/shiki`. Split/unified modes. |
| `MarkdownViewer` | Client | Source/preview toggle. Uses FileViewer for source, MarkdownServer for preview. |
| `MarkdownServer` | Server | Renders markdown with `react-markdown`, `remark-gfm`, `@shikijs/rehype`. |
| `MermaidRenderer` | Client | Lazy-loads mermaid (~1.5MB), renders diagrams as SVG with theme support. |
| `CodeBlock` | Client | Router component detecting mermaid language and delegating. |

**Key patterns:**
- Shiki runs server-only via `serverExternalPackages` in `next.config.mjs`
- Highlighting via server action `highlightCodeAction()` in `apps/web/src/lib/server/highlight-action.ts`
- Language detection in `apps/web/src/lib/language-detection.ts` (60+ extensions mapped)

### 2.2 Workspace Data Model

| Interface/Service | Package | Description |
|-------------------|---------|-------------|
| `IWorkspaceService` | `@chainglass/workflow` | add/list/remove/getInfo/resolveContext/resolveContextFromParams |
| `WorkspaceContext` | `@chainglass/workflow` | workspaceSlug, workspaceName, workspacePath, worktreePath, worktreeBranch, isMainWorktree, hasGit |
| `WorkspaceInfo` | `@chainglass/workflow` | Extended info with all worktrees |
| `Worktree` | `@chainglass/workflow` | path, head, branch, isDetached, isBare, isPrunable |
| `IFileSystem` | `@chainglass/shared` | exists/readFile/writeFile/readDir/mkdir/stat/glob/rename/etc. |
| `IPathResolver` | `@chainglass/shared` | resolvePath, relative — with security (PathSecurityError) |
| `IGitWorktreeResolver` | `@chainglass/workflow` | Git worktree detection |

### 2.3 DI & Bootstrap

- **DI Container**: TSyringe, decorator-free (RSC-compatible), explicit `container.register()`
- **Bootstrap**: `getContainer()` from `apps/web/src/lib/bootstrap-singleton.ts`
- **Tokens**: `WORKSPACE_DI_TOKENS`, `SHARED_DI_TOKENS`, `DI_TOKENS` (web-specific)
- **Test container**: `createTestContainer()` with all fakes pre-registered

### 2.4 API Routes (Existing)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/workspaces` | GET | List workspaces, optional `?include=worktrees` |
| `/api/workspaces/[slug]` | GET | Workspace detail with worktrees |
| `/api/workspaces/[slug]/samples` | GET | Samples list |

### 2.5 Server Actions (Existing)

- `addWorkspace` / `removeWorkspace` / `addSample` / `deleteSample` in `apps/web/app/actions/workspace-actions.ts`
- `getGitDiff(filePath)` in `apps/web/src/lib/server/git-diff-action.ts` — security: PathResolverAdapter + execFile array args
- `highlightCodeAction(code, lang)` in `apps/web/src/lib/server/highlight-action.ts`

### 2.6 Current App Routes

```
/                               → Dashboard home (placeholder cards)
/workflows                      → Workflow list
/workflow                       → ReactFlow visualization
/kanban                         → Kanban board (dnd-kit)
/agents                         → Agent sessions list
/workspaces                     → Workspace list + add form
/workspaces/[slug]              → Workspace detail (worktree list)
/workspaces/[slug]/worktree     → Worktree landing page (feature cards)
/workspaces/[slug]/agents       → Agent sessions for worktree
/workspaces/[slug]/samples      → Samples for worktree
/workspaces/[slug]/workgraphs   → WorkGraphs for worktree
/demo/*                         → Demo pages (file-viewer, markdown-viewer, diff-viewer, responsive, mcp)
```

### 2.7 Navigation

- `NavigationWrapper` → Desktop: `DashboardShell` (sidebar + content) / Phone: `BottomTabBar`
- `DashboardSidebar` → Two groups: "Navigation" (NAV_ITEMS) + "Workspaces" (WorkspaceNav)
- `NAV_ITEMS` in `navigation-utils.ts` — 10 items including demos
- `WorkspaceNav` — expandable sidebar with worktree links, fetches `/api/workspaces?include=worktrees`

### 2.8 Notification System (Central Watcher — Plan 027)

- `CentralWatcherService` → watches workspace files for changes
- `CentralEventNotifierService` → SSE broadcasting
- `useWorkspaceSSE` hook → client-side SSE connection
- **Status**: Infrastructure exists, domain event adapters registered. The file browser should NOT wire up SSE for file changes yet (OOS), but should not preclude it.

### 2.9 Testing Infrastructure

- Vitest for unit/integration tests
- `test/` directory at monorepo root with `unit/`, `integration/`, `contracts/`, `e2e/`, `fakes/`, `fixtures/`
- Web-specific tests in `test/unit/web/` — viewer tests, hook tests, component tests
- Test helpers: `FakeFileSystem`, `FakeWorkspaceContextResolver`, etc.
- No code editor library currently installed (no CodeMirror, Monaco, or Ace)

### 2.10 UI Framework

- Tailwind CSS v4 with `tailwind-merge`, `@tailwindcss/typography`
- shadcn/ui components: Button, Card, Dialog, Input, Sidebar, Tabs, Tooltip, Sheet, etc.
- `lucide-react` for icons
- `next-themes` for dark mode
- `@tanstack/react-query` (available but not heavily used)

---

## 3. What Needs to Be Built

### 3.1 File Browser — Backend

1. **File tree API** — List directory contents recursively (or lazy-load by folder)
   - New API route: `/api/workspaces/[slug]/files` with `?path=` query param
   - Uses `IFileSystem.readDir()` + `IFileSystem.stat()` to build tree
   - Security: Must validate paths stay within workspace using `IPathResolver`
   - Git diff filter: `?changed=true` → run `git diff --name-only` to filter tree

2. **File read API / server action** — Read file content
   - Server action: `readFile(workspaceSlug, worktreePath, filePath)` → content + metadata
   - Uses `IFileSystem.readFile()`, validates path security

3. **File write / save server action** — Write file with conflict detection
   - Server action: `saveFile(workspaceSlug, worktreePath, filePath, content, expectedMtime)`
   - Check `IFileSystem.stat().mtime` before write → error if mtime changed
   - Uses `IFileSystem.writeFile()` after validation

4. **Git diff server action** — Extend existing `getGitDiff` to work with workspace-scoped paths
   - Current impl uses `process.cwd()` as project root → needs to use workspace path instead

### 3.2 File Browser — Frontend

1. **File tree component** — Tree view with expand/collapse, file icons, indent
   - Filter toggle: "All files" / "Changed only" (git diff)
   - Refresh button
   - File selection → routes to file view

2. **File viewer panel** — Three mode buttons: Edit | Preview | Diff
   - **Edit mode**: Code editor component (needs library research below)
   - **Preview mode**: Only for markdown (MarkdownViewer already exists). Non-markdown shows read-only highlighted code.
   - **Diff mode**: DiffViewer (already exists, needs workspace-scoped git diff)
   - Save button with conflict detection feedback
   - Refresh button

3. **Code editor library** — Need off-the-shelf editor
   - See research section below

### 3.3 UI Overhaul

1. **Sidebar restructure**:
   - Move current nav items (Home, Workflows, Workflow Visualization, Kanban, Agents, demos) into a "Dev" section
   - New prominent "Workspaces" section at top
   - When workspace is selected: show workspace-specific menu (Browser, Workflows - placeholder)

2. **Landing page** → Workspace selector (replaces current placeholder dashboard)

3. **Workspace session model**:
   - Selecting a workspace "binds" the browser tab to it
   - Random emoji in header per workspace session for visual identification
   - URL-driven: workspace slug in URL path

4. **Deep linking**:
   - `/workspaces/[slug]/browser?path=src/components&file=Button.tsx&mode=edit`
   - Every page state must be URL-representable
   - All workspace sub-pages already use `?worktree=` param — extend this

5. **Route restructure**:
   - `/` → Workspace selector (home)
   - `/workspaces/[slug]/browser` → File browser (new)
   - `/workspaces/[slug]/workflows` → Workflows (placeholder/OOS)
   - Demo pages → move under `/dev/` prefix

---

## 4. Code Editor Research

The user wants "something off the shelf... super basic / simple / well regarded and elegant."

### Top candidates:

1. **CodeMirror 6** (`@codemirror/view`, `@codemirror/state`)
   - Most popular for web-based editors
   - Modular, lightweight, extensible
   - Excellent TypeScript/language support
   - React wrapper: `@uiw/react-codemirror` (most popular React integration, 2.5k+ GitHub stars)
   - Bundle: ~150KB gzipped for basic setup
   - Used by: Replit, Observable, Chrome DevTools

2. **Monaco Editor** (`monaco-editor`, `@monaco-editor/react`)
   - VS Code's editor engine
   - Very feature-rich but heavy (~2MB+ gzipped)
   - Overkill for "super basic / simple"

3. **Ace Editor** (`ace-builds`, `react-ace`)
   - Older, stable, well-known
   - Less modern than CodeMirror 6
   - Bundle: ~200KB

**Recommendation: CodeMirror 6 via `@uiw/react-codemirror`** — It's the most popular, most modern, lightest option that matches "simple, well-regarded, elegant." React integration is mature.

---

## 5. Key Architectural Decisions

### 5.1 File tree loading strategy
- **Lazy loading by folder** (not full recursive scan) — workspace could be huge
- Root-level listing on mount, expand folders on click
- Changed-files filter: fetch `git diff --name-only` and overlay on tree

### 5.2 Security model for file operations
- All paths validated through `IPathResolver` (prevents directory traversal)
- Workspace path acts as jail — can't read/write outside it
- `execFile` with array args for git commands (no shell injection)

### 5.3 Save conflict detection
- Use `stat().mtime` comparison (optimistic concurrency)
- On save: if mtime != expectedMtime → error with option to force-save or refresh
- Pattern: read → display mtime → edit → save(content, originalMtime) → compare mtime → write or error

### 5.4 Central notification system compatibility
- File browser refresh is manual (button-driven) for now
- Data model should accommodate SSE-driven updates later
- Use the existing `useWorkspaceSSE` hook pattern when ready

### 5.5 State management for file browser
- URL as source of truth (deep linking requirement)
- `?path=` for current directory, `?file=` for selected file, `?mode=edit|preview|diff`
- File content fetched client-side (too large for server component serialization)

---

## 6. Dependencies & Impact

### New npm dependencies needed:
- `@uiw/react-codemirror` (or similar CM6 React wrapper)
- `@codemirror/lang-javascript`, `@codemirror/lang-python`, etc. (language packs)

### Files that will be modified:
- `apps/web/src/lib/navigation-utils.ts` — Restructure NAV_ITEMS
- `apps/web/src/components/dashboard-sidebar.tsx` — Restructured sections
- `apps/web/app/(dashboard)/page.tsx` — Workspace selector landing
- `apps/web/app/(dashboard)/layout.tsx` — May need workspace-aware layout
- `apps/web/src/lib/di-container.ts` — No new services needed (uses IFileSystem directly)
- `apps/web/src/lib/server/git-diff-action.ts` — Extend for workspace-scoped paths

### New files:
- `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` — File browser page
- `apps/web/app/api/workspaces/[slug]/files/route.ts` — File tree API
- `apps/web/app/actions/file-actions.ts` — readFile, saveFile server actions
- `apps/web/src/components/file-browser/` — File tree, file panel, editor wrapper
- `test/unit/web/components/file-browser/` — Tests
- `test/unit/web/app/actions/file-actions.test.ts` — Server action tests

### Existing test suites to verify don't break:
- `test/unit/web/components/viewers/` — All viewer tests
- `test/unit/web/components/dashboard-sidebar.test.tsx` — Sidebar tests
- `test/integration/web/dashboard-navigation.test.tsx` — Navigation tests

---

## 7. Risk Areas

1. **Large file handling** — Need to cap file sizes for editor (100KB? 1MB?)
2. **Binary files** — Detect and show "binary file" placeholder instead of loading
3. **Workspace path security** — Critical to validate all paths. Existing `IPathResolver` handles this.
4. **Shiki + CodeMirror coexistence** — Shiki for read-only highlighting (server-side), CodeMirror for editing (client-side). No conflict, different use cases.
5. **Bundle size** — CodeMirror adds ~150KB gzipped. Acceptable for an editor feature.
6. **Git operations** — `git diff --name-only` and `git diff` must use `execFile` with array args (existing pattern).

---

## 8. Suggested Phase Breakdown (for spec/plan)

1. **Backend APIs** — File tree listing, file read, file save with conflict detection, workspace-scoped git diff
2. **File tree component** — Tree view UI, lazy loading, git-changed filter, refresh
3. **File viewer panel** — Edit/Preview/Diff mode switcher, CodeMirror integration, save with conflict UX
4. **UI overhaul — Routing & sidebar** — Workspace-centric navigation, sidebar sections, landing page
5. **Deep linking & polish** — URL state management, emoji sessions, deep link everything
