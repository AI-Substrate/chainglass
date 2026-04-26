# Domain: File Browser

**Slug**: file-browser
**Type**: business
**Created**: 2026-02-24
**Created By**: Plan 041 File Browser & Workspace-Centric UI
**Status**: active
**C4 Diagram**: [C4 Component](../../c4/components/file-browser.md)

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
- File server actions — readFile (size limit, binary detection, symlink check), saveFile (mtime conflict, atomic write), createFile, createFolder, deleteItem, renameItem (path security, duplicate detection, filename validation)
- Files API route — `GET /api/workspaces/[slug]/files` for client-side directory fetching
- File browser URL params — `fileBrowserParams` (dir, file, mode, changed)
- Landing page components — WorkspaceCard, FleetStatusBar (Phase 3)
- Worktree picker component (Phase 3)
- useAttentionTitle hook (Phase 3)
- Binary file viewers — ImageViewer, PdfViewer, VideoViewer, AudioViewer, BinaryPlaceholder for inline binary rendering
- Folder preview gallery — FolderPreviewPanel, FolderPreviewGrid, preview cards (ImageCard, VideoCard, AudioCard, FolderCard, GenericCard) for visual folder content browsing
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
| createFileService | Create empty file + security + duplicate check | IFileSystem (writeFile, exists, realpath), IPathResolver, validateFileName |
| createFolderService | Create directory + security + duplicate check | IFileSystem (mkdir, exists, realpath), IPathResolver, validateFileName |
| deleteItemService | Delete file/folder + security + size guard | IFileSystem (unlink, rmdir, stat, readDir, realpath), IPathResolver |
| renameItemService | Rename file/folder + security + destination check | IFileSystem (rename, exists, realpath), IPathResolver, validateFileName |
| validateFileName | Git-portable filename validation | None (pure function) |
| useFileMutations | Hook: CRUD handlers with toast + tree refresh + edge cases | Server actions (createFile, createFolder, deleteItem, renameItem), handleRefreshDir |
| InlineEditInput | Inline text input for create/rename in FileTree | validateFileName |
| DeleteConfirmationDialog | VS Code-style delete confirmation dialog | Dialog (Radix UI) |
| fileExists action | Lightweight stat check for ExplorerPanel | IFileSystem, IPathResolver |
| Files API route | GET handler for client fetch | Directory listing service |
| Raw file API route | Streaming binary file delivery with Range support | IFileSystem, IPathResolver |
| ImageViewer | Renders images via raw file URL | Raw file API route, detectContentType |
| PdfViewer | Embeds PDF via iframe | Raw file API route, detectContentType |
| VideoViewer | HTML5 video player | Raw file API route, detectContentType |
| AudioViewer | HTML5 audio player | Raw file API route, detectContentType |
| BinaryPlaceholder | Fallback for unknown binary types | detectContentType |
| FolderPreviewPanel | Gallery orchestrator for folder contents | Files API, sortGalleryItems, FolderPreviewGrid |
| FolderPreviewGrid | Responsive grid with type-grouped sections | ImageCard, VideoCard, AudioCard, FolderCard, GenericCard |
| ImageCard | Image thumbnail with lazy loading | useLazyLoad, CardActions, raw file API |
| VideoCard | Video hover-to-play / tap-to-play | useLazyLoad, CardActions, raw file API |
| AudioCard | Audio waveform visualization card | CardActions |
| FolderCard | Subfolder navigation card | FolderIcon, CardActions |
| GenericCard | Fallback card for non-media files | FileIcon, CardActions |
| CardActions | Copy-path + download overlay buttons | useClipboard |
| sortGalleryItems | Group + sort entries by type | detectContentType |
| useLazyLoad | IntersectionObserver for lazy loading | None |
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
| `apps/web/src/features/041-file-browser/services/file-mutation-actions.ts` | createFile, createFolder, deleteItem, renameItem service logic | Plan 068 Phase 1 |
| `apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts` | useFileMutations hook (CRUD + toast + refresh) | Plan 068 Phase 3 |
| `apps/web/src/features/041-file-browser/lib/validate-filename.ts` | Git-portable filename validation | Plan 068 Phase 1 |
| `apps/web/src/features/041-file-browser/components/inline-edit-input.tsx` | InlineEditInput (create/rename inline input) | Plan 068 Phase 2 |
| `apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx` | DeleteConfirmationDialog | Plan 068 Phase 2 |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | FileTree | Phase 4 |
| `apps/web/src/features/041-file-browser/components/code-editor.tsx` | CodeEditor wrapper | Phase 4 |
| `apps/web/src/features/041-file-browser/components/file-viewer-panel.tsx` | FileViewerPanel | Phase 4, FX001-7 |
| `apps/web/src/features/041-file-browser/components/markdown-preview.tsx` | MarkdownPreview (mermaid activation) | FX001-7 |
| `apps/web/app/actions/file-actions.ts` | Server actions (readFile, saveFile, fetchGitDiff, fetchChangedFiles, fetchWorkingChanges, fetchRecentFiles, fileExists, uploadFile, createFile, createFolder, deleteItem, renameItem) | Phase 4, FX001, Plan 043, Plan 044, Plan 068 |
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
| `apps/web/src/features/041-file-browser/components/folder-preview-panel.tsx` | FolderPreviewPanel gallery orchestrator | Plan 077 |
| `apps/web/src/features/041-file-browser/components/folder-preview-grid.tsx` | FolderPreviewGrid responsive grid | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/image-card.tsx` | ImageCard thumbnail | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/video-card.tsx` | VideoCard hover-to-play | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/audio-card.tsx` | AudioCard waveform | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/folder-card.tsx` | FolderCard navigation | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/generic-card.tsx` | GenericCard fallback | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/card-actions.tsx` | CardActions overlay buttons | Plan 077 |
| `apps/web/src/features/041-file-browser/components/preview-cards/card-skeleton.tsx` | CardSkeleton shimmer | Plan 077 |
| `apps/web/src/features/041-file-browser/lib/sort-gallery-items.ts` | Gallery sort/group utility | Plan 077 |
| `apps/web/src/features/041-file-browser/hooks/use-lazy-load.ts` | IntersectionObserver hook | Plan 077 |
| `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx` | WorkspaceProvider + useWorkspaceContext | Phase 5 |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | Workspace layout (provides context) | Phase 5 |
| `apps/web/app/(dashboard)/workspaces/[slug]/workspace-attention-wrapper.tsx` | Tab title composition client wrapper | Phase 5 |
| `apps/web/src/features/041-file-browser/components/emoji-picker.tsx` | EmojiPicker (palette grid) | Phase 5 |
| `apps/web/src/features/041-file-browser/components/color-picker.tsx` | ColorPicker (swatch grid) | Phase 5 |
| `apps/web/src/features/041-file-browser/components/worktree-identity-popover.tsx` | Inline gear popover for per-worktree emoji/color | Phase 5 ST-001 |
| `apps/web/app/(dashboard)/settings/workspaces/page.tsx` | Settings page (Server Component) | Phase 5 |
| `apps/web/app/(dashboard)/settings/workspaces/workspace-settings-table.tsx` | Settings table (Client Component) | Phase 5 |
| `apps/web/src/features/041-file-browser/state/register.ts` | registerWorktreeState — multi-instance domain registration | Plan 053 P5 |
| `apps/web/src/features/041-file-browser/state/worktree-publisher.tsx` | WorktreeStatePublisher — FileChangeHub → state bridge | Plan 053 P5 |
| `apps/web/src/features/041-file-browser/components/worktree-state-subtitle.tsx` | WorktreeStateSubtitle — sidebar consumer component | Plan 053 P5 |
| `apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts` | useFlowspaceSearch — semantic-search hook (`$` prefix); polling + spawning UX | Plan 084, FX001-5, FX002-1 |

### Server-only infrastructure (under `apps/web/src/lib/server/`)

These modules live outside `features/041-file-browser/` per repo convention but are owned by this domain's search surface. Catalogued here so the domain inventory is complete.

| File | Role | Notes |
|------|------|-------|
| `apps/web/src/lib/server/flowspace-search-action.ts` | Next.js Server Action — entry point for `$` semantic search; discriminated union return | Plan 084, FX001-4, FX002-2, FX002-4 |
| `apps/web/src/lib/server/flowspace-mcp-client.ts` | Long-lived `fs2 mcp` child process pool per worktree; HMR-safe via `globalThis` | Plan 084, FX001-1, FX001-3, FX002-4 |
| `apps/web/src/lib/server/flowspace-result-mapper.ts` | Pure helpers: `extractFilePath`, `extractName`, `sanitizeSmartContent`, `mapEnvelope` | Plan 084 (extracted from legacy CLI action) |
| `apps/web/src/lib/server/flowspace-log.ts` | Shared `[flowspace-mcp]` logger (`LOG_PREFIX`, `log()`) | FX002-5 |

## Dependencies

### This Domain Depends On

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|--------------|
| Browse files | `FileTree`, `FileViewerPanel`, `CodeEditor` | Navigate workspace files in a tree, view with syntax highlighting, edit with CodeMirror, preview markdown |
| Read/write files | `readFile`, `saveFile` server actions | Read file content with size/binary/symlink checks; save with mtime conflict detection and atomic write |
| Tree CRUD UI | `FileTree`, `InlineEditInput`, `DeleteConfirmationDialog` | Inline create, rename, and delete affordances in the browser tree via hover buttons, context menu, keyboard shortcuts |
| File CRUD services | `createFileService`, `createFolderService`, `deleteItemService`, `renameItemService` | Server-side file mutation with path security, duplicate detection, filename validation, and safety limits |
| Search files | `useFileFilter`, `useFlowspaceSearch` | Client-side file search (substring/glob) and FlowSpace semantic code search |
| Track changes | `ChangesView`, working changes service | Git status display with file badges and recent files |
| Workspace identity | `WorkspaceProvider`, `useWorkspaceContext` | React context for workspace preferences, worktree identity, emoji/color, tab title |

- `_platform/sdk` — IUSDK for publishing commands and settings to SDK surface
- `_platform/file-ops` — IFileSystem, IPathResolver for all file operations
- `_platform/viewer` — FileViewer, MarkdownViewer, DiffViewer for rendering
- `_platform/state` — IStateService, useGlobalState, GlobalStateConnector for worktree state publishing/consumption
- `_platform/events` — `useChannelCallback`, `WorkspaceDomain.FileChanges` for multiplexed SSE file-change subscription (Plan 072)
- `_platform/themes` — `FileIcon`, `FolderIcon` for themed file-type icons in FileTree, ChangesView, BinaryPlaceholder, AudioViewer (Plan 073)
- `_platform/workspace-url` — workspaceHref, param caches, NuqsAdapter
- `_platform/panel-layout` — PanelShell, ExplorerPanel, LeftPanel, MainPanel for page layout
- `@chainglass/workflow` — IWorkspaceService, workspace entity, preferences
- `@uiw/react-codemirror` — CodeMirror 6 editor (npm)
- `nuqs` — URL state management (npm)
- `file-notes` — NoteIndicatorDot, useNotesOverlay, fetchFilesWithNotes, `notes:changed` event listener for tree note indicators and filter toggle

### Domains That Depend On This
- None currently (this is a leaf business domain)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 083-md-editor / Phase 5 | `FileViewerPanel` Rich-mode integration: `ViewerMode` union renamed `edit → source`, added `rich` member; `parseAsStringLiteral` extended with `'edit'` legacy alias + `useEffect` coercion in `browser-client.tsx`; 8 `'edit'` call sites migrated (4 literal renames, 4 conditional/type widenings); scrollToLine auto-switch guard widened to `!== 'source' && !== 'rich'`. Rich branch composes `MarkdownWysiwygEditorLazy` + `WysiwygToolbar` + `LinkPopover` inside a single `.md-wysiwyg-editor-mount` wrapper (Phase 6.6 error-boundary target + Phase 6.2 `data-emitted-markdown` test affordance). `ModeButton` extended with optional `disabled?` + `title?` props. Rich button gated on `language === 'markdown'` + `!exceedsRichSizeCap(content)` (200 KB decimal soft cap) with tooltip. Dismissible table warn banner (sessionStorage-per-file; quota/security/parse try/catch). `handleEditModeKeyDownCapture` extended to cover both `source` + `rich`; Save button + Cmd+S dispatch through unified `performSave` helper with optional `saveFileImpl?` DI prop (backward-compat for existing callers; used by `FakeSaveFile` integration tests per Constitution §4/§7). 22 unit tests green + 5 new integration tests (zero `vi.mock` on business logic). | 2026-04-19 |
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
| Plan 051 | FlowSpace code search: useFlowspaceSearch hook (debounce, availability, graph age), BrowserClient wiring for `#` text and `$` semantic search modes, context menu on FlowSpace results | 2026-02-26 |
| Plan 053 P5 | GlobalStateSystem worktree exemplar: registerWorktreeState (multi-instance domain), WorktreeStatePublisher (useFileChanges → state), WorktreeStateSubtitle (sidebar consumer), GlobalStateConnector wiring in browser-client.tsx | 2026-02-27 |
| Plan 068 Phase 1 | File CRUD service layer: createFileService, createFolderService, deleteItemService, renameItemService with path security + validateFileName utility + 4 server actions | 2026-03-07 |
| Plan 068 Phase 2 | FileTree UI extensions: InlineEditInput component, hover buttons (New File/Folder), inline create/rename modes, context menu Rename/Delete, DeleteConfirmationDialog, F2/Enter keyboard shortcuts, CRUD callback props | 2026-03-07 |
| Plan 068 Phase 3 | BrowserClient wiring: useFileMutations hook with toast feedback, CRUD callbacks wired to FileTree, rename-open-file URL sync, delete-open-file selection clear, local newlyAddedPaths animation, auto-select/expand after create, root entries state for root-level refresh | 2026-03-07 |
| 071-phase-7 | Added note indicators in FileTree, Add Note context menu, has-notes filter toggle | 2026-03-10 |
| Plan 072 Phase 3 | Migrated FileChangeProvider from direct EventSource to `useChannelCallback('file-changes')` via multiplexed SSE. Removed ~100 lines SSE lifecycle + reconnect code, removed `eventSourceFactory` prop. | 2026-03-08 |
| Plan 073 Phase 4 | Replaced Lucide File/Folder/FolderOpen icons with themed FileIcon/FolderIcon from _platform/themes in FileTree, ChangesView, BinaryPlaceholder, AudioViewer. Badge+icon now coexist in ChangesView. | 2026-03-10 |
| Plan 077 | Folder content preview gallery: FolderPreviewPanel with responsive grid, ImageCard (lazy-load thumbnails), VideoCard (hover-to-play), AudioCard (waveform), FolderCard (navigation), GenericCard (fallback). Breadcrumb nav, skeleton loading, empty/large-folder states. Extended FileEntry with size. Wired dir URL param into BrowserClient. | 2026-04-08 |
| Plan 079 | Fix window titles reverting to "Chainglass": metadata template in root layout, generateMetadata in workspace layout, WorkspaceProvider default identity + setPageTitle API, usePageTitle hook, BrowserClient cleanup removal, 2-char prefix fallback | 2026-04-08 |
| Plan 084 (flowspace-mcp-search) | `useFlowspaceSearch` hook: added `spawning: boolean` state with 1 s polling against the rewritten server action's `{ kind: 'spawning' \| 'ok' \| 'error' }` union (30 s ceiling). browser-client wires `flowspace.spawning` only for semantic mode. New SDK command `file-browser.restartFlowspace` ("Restart FlowSpace") added to contribution + register. Two new server-only modules under `apps/web/src/lib/server/`: `flowspace-mcp-client.ts` (long-lived per-worktree fs2 mcp child via `@modelcontextprotocol/sdk`; pool pinned to `globalThis` for HMR; idle reaper; mtime recycle) and `flowspace-result-mapper.ts` (extracted pure helpers). `flowspace-search-action.ts` rewritten to delegate to the MCP client. | 2026-04-26 |
