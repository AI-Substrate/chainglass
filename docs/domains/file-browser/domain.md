# Domain: File Browser

**Slug**: file-browser
**Type**: business
**Created**: 2026-02-24
**Created By**: Plan 041 File Browser & Workspace-Centric UI
**Status**: active

## Purpose

Workspace-scoped file browsing, editing, and diffing. The core feature that makes workspaces useful — users navigate files in a tree, view code with syntax highlighting, edit with CodeMirror, preview markdown, and see uncommitted git changes. Every state is deep-linkable via URL params.

## Boundary

### Owns
- Browser page (`/workspaces/[slug]/browser`) — two-panel layout
- File tree component — lazy per-directory loading, expand/collapse, changed-only filter
- Code editor wrapper — CodeMirror 6 lazy-loaded, theme-synced
- File viewer panel — mode toggle (edit/preview/diff), save button, conflict UI
- Directory listing service — `git ls-files -- <dir>` with readDir fallback (per-directory lazy, `FileEntry{name, type, path}`)
- File list service — `git ls-files --cached --others` + `fs.stat` for full-tree flat listing (`FileListEntry{path, mtime}`). Distinct from directory-listing: returns all files in one call with mtimes for sort-by-recent in file search cache. Directory-listing is scoped to a single directory for tree expansion.
- Changed-files service — `git diff --name-only` for filter
- File server actions — readFile (size limit, binary detection, symlink check), saveFile (mtime conflict, atomic write)
- Files API route — `GET /api/workspaces/[slug]/files` for client-side directory fetching
- File browser URL params — `fileBrowserParams` (dir, file, mode, changed)
- Landing page components — WorkspaceCard, FleetStatusBar (Phase 3)
- Worktree picker component (Phase 3)
- useAttentionTitle hook (Phase 3)
- Binary file viewers — ImageViewer, PdfViewer, VideoViewer, AudioViewer, BinaryPlaceholder for inline binary rendering
- Raw file streaming API route — /api/workspaces/[slug]/files/raw with Range request support

### Does NOT Own
- Viewer components (FileViewer, MarkdownViewer, DiffViewer) — consumes from `_platform/viewer`
- File system abstraction (IFileSystem, IPathResolver) — consumes from `_platform/file-ops`
- URL infrastructure (workspaceHref, workspaceParamsCache, NuqsAdapter) — consumes from `_platform/workspace-url`
- Workspace data model (entity, preferences, registry) — consumes from `@chainglass/workflow`
- Git worktree resolution — consumes from `@chainglass/workflow` (IGitWorktreeResolver)
- Sidebar/navigation structure — this domain's pages render INSIDE the sidebar, but don't own it

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `WorkspaceCard` | Component | Landing page | Card with emoji, name, worktrees, star toggle |
| `FleetStatusBar` | Component | Landing page | Agent status summary (placeholder) |
| `WorktreePicker` | Component | Sidebar (workspace-nav) | Searchable worktree selection |
| `useAttentionTitle` | Hook | Workspace pages | Dynamic browser tab title with emoji prefix |
| `WorkspaceProvider` | Component | [slug]/layout.tsx | React context for workspace + worktree identity |
| `useWorkspaceContext` | Hook | Any workspace page | Access workspace identity, worktree identity, attention state |
| `EmojiPicker` | Component | Settings page, worktree popover | Grid of curated workspace emojis |
| `ColorPicker` | Component | Settings page, worktree popover | Swatch grid of curated workspace colors |
| `fileBrowserParams` | Param defs | Browser page, any URL-aware component | nuqs param definitions for dir, file, mode, changed |
| `fileBrowserPageParamsCache` | Server cache | Browser page | Server-side URL param parsing |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| Browser page | Two-panel layout, URL state | fileBrowserPageParamsCache, FileTree, FileViewerPanel |
| FileTree | Directory navigation, lazy expand | Files API route, changed-files service |
| FileViewerPanel | Mode toggle, viewer integration | CodeEditor, FileViewer, MarkdownViewer, DiffViewer, readFile, saveFile |
| CodeEditor | CodeMirror 6 wrapper | @uiw/react-codemirror, detectLanguage() |
| ChangesView | Flat file list with status badges + recent section | Working changes service, recent files service |
| Directory listing service | readDir per-dir (shows all files) | IFileSystem, IPathResolver |
| Changed-files service | git diff --name-only | execFile |
| Working changes service | git status --porcelain parser | execFile |
| Recent files service | git log --name-only parser | execFile |
| readFile action | Read + security checks | IFileSystem (stat, readFile, realpath), IPathResolver |
| saveFile action | Atomic write + conflict detection | IFileSystem (stat, writeFile, rename), IPathResolver |
| fileExists action | Lightweight stat check for ExplorerPanel | IFileSystem, IPathResolver |
| Files API route | GET handler for client fetch | Directory listing service |
| Raw file API route | Streaming binary file delivery with Range support | IFileSystem, IPathResolver |
| ImageViewer | Renders images via raw file URL | Raw file API route, detectContentType |
| PdfViewer | Embeds PDF via iframe | Raw file API route, detectContentType |
| VideoViewer | HTML5 video player | Raw file API route, detectContentType |
| AudioViewer | HTML5 audio player | Raw file API route, detectContentType |
| BinaryPlaceholder | Fallback for unknown binary types | detectContentType |
| WorkspaceProvider | React context for workspace prefs + worktree identity | WorktreeVisualPreferences, useAttentionTitle |
| WorkspaceAttentionWrapper | Client wrapper composing tab title from context | useAttentionTitle, useWorkspaceContext |
| WorktreeIdentityPopover | Inline gear popover for worktree emoji/color | EmojiPicker, ColorPicker, updateWorktreePreferences |
| EmojiPicker | Grid of 30 curated emojis from palette | WORKSPACE_EMOJI_PALETTE |
| ColorPicker | Grid of 10 color swatches from palette | WORKSPACE_COLOR_PALETTE |
| Settings page | Workspace table with inline pickers | EmojiPicker, ColorPicker, updateWorkspacePreferences |
| updateWorktreePreferences | Server action: read-modify-write per-worktree prefs | IWorkspaceService.updatePreferences |

## Source Location

Primary: `apps/web/src/features/041-file-browser/` + `apps/web/app/`

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/features/041-file-browser/components/workspace-card.tsx` | WorkspaceCard | Phase 3 |
| `apps/web/src/features/041-file-browser/components/fleet-status-bar.tsx` | FleetStatusBar | Phase 3 |
| `apps/web/src/features/041-file-browser/components/worktree-picker.tsx` | WorktreePicker | Phase 3 |
| `apps/web/src/features/041-file-browser/hooks/use-attention-title.ts` | useAttentionTitle | Phase 3 |
| `apps/web/src/features/041-file-browser/params/file-browser.params.ts` | fileBrowserParams | Phase 2 |
| `apps/web/src/features/041-file-browser/services/directory-listing.ts` | Directory listing | Phase 4 |
| `apps/web/src/features/041-file-browser/services/changed-files.ts` | Changed files filter | Phase 4 |
| `apps/web/src/features/041-file-browser/services/file-actions.ts` | readFile + saveFile service logic | Phase 4 |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | FileTree | Phase 4 |
| `apps/web/src/features/041-file-browser/components/code-editor.tsx` | CodeEditor wrapper | Phase 4 |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | FileViewerPanel | Phase 4, FX001-7 |
| `apps/web/src/features/041-file-browser/components/markdown-preview.tsx` | MarkdownPreview (mermaid activation) | FX001-7 |
| `apps/web/app/actions/file-actions.ts` | Server actions (readFile, saveFile, fetchGitDiff, fetchChangedFiles, fetchWorkingChanges, fetchRecentFiles, fileExists, uploadFile) | Phase 4, FX001, Plan 043, Plan 044 |
| `apps/web/app/api/workspaces/[slug]/files/route.ts` | Files API route | Phase 4 |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx` | Browser page (Server Component) | Phase 4 |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | BrowserClient (Client Component shell) | Phase 4, FX001 |
| `apps/web/src/lib/server/markdown-renderer.ts` | renderMarkdownToHtml (server-side markdown pipeline) | FX001-6 |
| `apps/web/src/features/041-file-browser/services/working-changes.ts` | git status --porcelain parser | Plan 043 Phase 2 |
| `apps/web/src/features/041-file-browser/services/recent-files.ts` | git log --name-only parser | Plan 043 Phase 2 |
| `apps/web/src/features/041-file-browser/components/changes-view.tsx` | ChangesView (flat file list with badges) | Plan 043 Phase 2 |
| `apps/web/src/features/041-file-browser/services/upload-file.ts` | uploadFileService (mkdir, timestamp naming, atomic write) | Plan 044 |
| `apps/web/src/features/041-file-browser/components/paste-upload-button.tsx` | PasteUploadButton (sidebar upload trigger) | Plan 044 |
| `apps/web/src/features/041-file-browser/components/paste-upload-modal.tsx` | PasteUploadModal (paste/drag/select dialog) | Plan 044 |
| `apps/web/src/features/041-file-browser/sdk/contribution.ts` | SDK contribution manifest | 047-usdk Phase 6 |
| `apps/web/src/features/041-file-browser/sdk/register.ts` | SDK registration entry point | 047-usdk Phase 6 |
| `apps/web/src/features/041-file-browser/index.ts` | Feature barrel | Phase 1 |
| `apps/web/app/api/workspaces/[slug]/files/raw/route.ts` | Raw file streaming API route | Plan 046 |
| `apps/web/src/features/041-file-browser/components/image-viewer.tsx` | ImageViewer component | Plan 046 |
| `apps/web/src/features/041-file-browser/components/pdf-viewer.tsx` | PdfViewer component | Plan 046 |
| `apps/web/src/features/041-file-browser/components/video-viewer.tsx` | VideoViewer component | Plan 046 |
| `apps/web/src/features/041-file-browser/components/audio-viewer.tsx` | AudioViewer component | Plan 046 |
| `apps/web/src/features/041-file-browser/components/binary-placeholder.tsx` | BinaryPlaceholder component | Plan 046 |
| `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx` | WorkspaceProvider + useWorkspaceContext | Phase 5 |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | Workspace layout (provides context) | Phase 5 |
| `apps/web/app/(dashboard)/workspaces/[slug]/workspace-attention-wrapper.tsx` | Tab title composition client wrapper | Phase 5 |
| `apps/web/src/features/041-file-browser/components/emoji-picker.tsx` | EmojiPicker (palette grid) | Phase 5 |
| `apps/web/src/features/041-file-browser/components/color-picker.tsx` | ColorPicker (swatch grid) | Phase 5 |
| `apps/web/src/features/041-file-browser/components/worktree-identity-popover.tsx` | Inline gear popover for per-worktree emoji/color | Phase 5 ST-001 |
| `apps/web/app/(dashboard)/settings/workspaces/page.tsx` | Settings page (Server Component) | Phase 5 |
| `apps/web/app/(dashboard)/settings/workspaces/workspace-settings-table.tsx` | Settings table (Client Component) | Phase 5 |

## Dependencies

### This Domain Depends On
- `_platform/sdk` — IUSDK for publishing commands and settings to SDK surface
- `_platform/file-ops` — IFileSystem, IPathResolver for all file operations
- `_platform/viewer` — FileViewer, MarkdownViewer, DiffViewer for rendering
- `_platform/workspace-url` — workspaceHref, param caches, NuqsAdapter
- `_platform/panel-layout` — PanelShell, ExplorerPanel, LeftPanel, MainPanel for page layout
- `@chainglass/workflow` — IWorkspaceService, workspace entity, preferences
- `@uiw/react-codemirror` — CodeMirror 6 editor (npm)
- `nuqs` — URL state management (npm)

### Domains That Depend On This
- None currently (this is a leaf business domain)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 041 Phase 1 | Feature folder scaffold, params infrastructure | 2026-02-22 |
| Plan 041 Phase 2 | fileBrowserParams + cache, workspaceHref | 2026-02-22 |
| Plan 041 Phase 3 | WorkspaceCard, FleetStatusBar, WorktreePicker, useAttentionTitle, landing page | 2026-02-23 |
| *(extracted)* | Domain formalized from Plan 041 deliverables | 2026-02-24 |
| Plan 041 Phase 4 | File tree, code editor, viewer panel, browser page, file actions, API route | 2026-02-24 |
| Plan 041 FX001 | Wired browser E2E: Shiki preview, markdown rendering, CodeEditor, DiffViewer, lazy diff, changed-files filter, tree auto-expand | 2026-02-24 |
| Plan 044 | Paste/upload to scratch/paste/ — upload button in sidebar, modal with paste/drag/select, uploadFile server action, uploadFileService | 2026-02-24 |
| Plan 043 Phase 2 | Working changes service (git status --porcelain), recent files service (git log), ChangesView component, fileExists server action, directory listing switched to readDir | 2026-02-24 |
| Plan 043 Phase 3 | Wired PanelShell into BrowserClient — resizable panels, ExplorerPanel path bar, LeftPanel tree/changes toggle, extracted 3 custom hooks (useFileNavigation, usePanelState, useClipboard), removed FileTree header + FileViewerPanel path row, replaced ?changed with ?panel, Ctrl+P shortcut | 2026-02-24 |
| Plan 046 | Binary file viewers: raw file streaming route, detectContentType-based routing, 5 viewer components (ImageViewer, PdfViewer, VideoViewer, AudioViewer, BinaryPlaceholder), ReadFileResult isBinary variant | 2026-02-24 |
| Plan 041 Phase 5 | WorkspaceContext, useAttentionTitle wired, EmojiPicker, ColorPicker, settings page (/settings/workspaces), pop-out button, sidebar emoji | 2026-02-24 |
| Plan 041 P5 ST-001 | Per-worktree emoji/color (WorktreeVisualPreferences), worktreeIdentity in context, tab title composition, inline gear popover, updateWorktreePreferences action, browser history push on file nav, scroll-to-top on file change | 2026-02-24 |
| 047-usdk Phase 6 | SDK contribution (3 commands, 5 settings), go-to-line URL param + path parsing, CodeMirror scroll-to-line | 2026-02-25 |
| Plan 049 Feature 1 | Diff stats service (git diff HEAD --shortstat), usePanelState extension, live-updating file change stats in FILES header | 2026-02-26 |
| Plan 049 Feature 2 | File search via ExplorerPanel: getFileList service (git ls-files + fs.stat), file-filter utilities (substring/glob/sort), useFileFilter hook (Map cache + SSE deltas + debounce), fetchFileList server action, BrowserClient wiring | 2026-02-26 |
