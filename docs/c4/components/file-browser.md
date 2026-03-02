# Component: File Browser (`file-browser`)

> **Domain Definition**: [file-browser/domain.md](../../../domains/file-browser/domain.md)
> **Source**: `apps/web/src/features/041-file-browser/` + `apps/web/app/(dashboard)/workspaces/[slug]/browser/`
> **Registry**: [registry.md](../../../domains/registry.md) — Row: File Browser

Workspace-scoped file browsing, editing, and diffing. The core feature that makes workspaces useful — users navigate files in a tree, view code with syntax highlighting, edit with CodeMirror, preview markdown, and see uncommitted git changes. Every state is deep-linkable via URL params.

```mermaid
C4Component
    title Component diagram — File Browser (file-browser)

    Container_Boundary(fileBrowser, "File Browser") {
        Component(browserPage, "Browser Page", "Server + Client Component", "Two-panel layout:<br/>FileTree + FileViewerPanel<br/>route: /workspaces/[slug]/browser")
        Component(fileTree, "FileTree", "Client Component", "Lazy per-directory loading,<br/>expand/collapse, changed-only filter,<br/>keyboard navigation")
        Component(viewerPanel, "FileViewerPanel", "Client Component", "Mode toggle: edit/preview/diff<br/>save button, conflict detection,<br/>dispatches to viewer components")
        Component(codeEditor, "CodeEditor Wrapper", "Client Component", "CodeMirror 6 lazy-loaded,<br/>theme-synced, language-aware,<br/>change tracking")
        Component(dirService, "Directory Listing Service", "Server Service", "git ls-files per directory<br/>with readDir fallback,<br/>returns FileEntry[]")
        Component(fileListService, "File List Service", "Server Service", "git ls-files --cached --others<br/>full-tree flat listing with mtimes<br/>for file search cache")
        Component(changedFiles, "Changed Files Service", "Server Service", "git diff --name-only<br/>for changed-only tree filter")
        Component(readFile, "readFile Action", "Server Action", "Size limit, binary detection,<br/>symlink check, returns content +<br/>highlightedHtml + previewHtml")
        Component(saveFile, "saveFile Action", "Server Action", "Mtime conflict detection,<br/>atomic write via temp+rename")
        Component(filesRoute, "Files API Route", "Route Handler", "/api/workspaces/[slug]/files<br/>client-side directory fetching")
        Component(rawRoute, "Raw File Route", "Route Handler", "/api/workspaces/[slug]/files/raw<br/>Range request support for binary")
        Component(binaryViewers, "Binary Viewers", "Client Components", "ImageViewer, PdfViewer,<br/>VideoViewer, AudioViewer,<br/>BinaryPlaceholder")
        Component(undoRedo, "UndoRedoManager", "Client Module", "Snapshot-based undo/redo<br/>via structuredClone,<br/>50-item stack")
        Component(wsContext, "WorkspaceContext", "React Provider", "Workspace-scoped context:<br/>slug, worktreePath,<br/>file operations")
        Component(pickers, "Emoji/Color Pickers", "Client Components", "EmojiPicker, ColorPicker<br/>for workspace customization")
    }

    Rel(browserPage, fileTree, "Left panel renders")
    Rel(browserPage, viewerPanel, "Main panel renders")
    Rel(fileTree, dirService, "Fetches directories from")
    Rel(fileTree, filesRoute, "Client-side fetch via")
    Rel(fileTree, changedFiles, "Filters with")
    Rel(viewerPanel, readFile, "Loads file content via")
    Rel(viewerPanel, saveFile, "Saves edits via")
    Rel(viewerPanel, codeEditor, "Edit mode renders")
    Rel(viewerPanel, binaryViewers, "Binary files render via")
    Rel(viewerPanel, undoRedo, "Tracks changes with")
    Rel(readFile, fileListService, "Resolves paths with")
    Rel(browserPage, wsContext, "Wrapped in")
```

## Components

| Component | Type | Description |
|-----------|------|-------------|
| Browser Page | Server + Client Component | Two-panel layout with FileTree + FileViewerPanel |
| FileTree | Client Component | Lazy per-directory tree with expand/collapse and changed-only filter |
| FileViewerPanel | Client Component | Mode toggle (edit/preview/diff), save, conflict detection |
| CodeEditor Wrapper | Client Component | CodeMirror 6, lazy-loaded, theme-synced |
| Directory Listing Service | Server Service | `git ls-files` per directory with readDir fallback |
| File List Service | Server Service | Full-tree flat listing with mtimes for search cache |
| Changed Files Service | Server Service | `git diff --name-only` for filter |
| readFile Action | Server Action | Size limit, binary detection, returns content + highlighted + preview HTML |
| saveFile Action | Server Action | Mtime conflict detection, atomic write |
| Files API Route | Route Handler | `/api/workspaces/[slug]/files` for client-side fetch |
| Raw File Route | Route Handler | `/api/workspaces/[slug]/files/raw` with Range request support |
| Binary Viewers | Client Components | Image, PDF, Video, Audio, BinaryPlaceholder |
| UndoRedoManager | Client Module | Snapshot undo/redo via structuredClone (50-item stack) |
| WorkspaceContext | React Provider | Workspace-scoped context (slug, worktreePath) |
| Emoji/Color Pickers | Client Components | Workspace customization pickers |

## External Dependencies

Depends on: _platform/file-ops (IFileSystem, IPathResolver), _platform/viewer (FileViewer, MarkdownViewer, DiffViewer), _platform/workspace-url (workspaceHref, params), _platform/panel-layout (PanelShell, ExplorerPanel), _platform/events (toast, useFileChanges), _platform/sdk (IUSDK), _platform/state (useGlobalState).
Consumed by: (leaf consumer — no downstream dependents).

---

## Navigation

- **Zoom Out**: [Web App Container](../containers/web-app.md) | [Container Overview](../containers/overview.md)
- **Domain**: [file-browser/domain.md](../../../domains/file-browser/domain.md)
- **Hub**: [C4 Overview](../README.md)
