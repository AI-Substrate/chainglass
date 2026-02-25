# Plan 043: Panel Layout — Research Dossier

**Plan**: 043-panel-layout
**Created**: 2026-02-24
**Domain**: `_platform/panel-layout`

---

## 1. Codebase Exploration Summary

### What Exists Today

The file browser page (`browser-client.tsx`) uses raw `div+flex+Tailwind` to compose a two-panel layout:

```
┌──────────────────────────────────────────────────────────────┐
│  Left (w-64, shrink-0, border-r)  │  Right (flex-1)          │
│  └─ FileTree                      │  └─ FileViewerPanel      │
│     ├─ Sticky header (FILES+↻)    │     ├─ Toolbar (buttons) │
│     └─ Scrollable entries         │     ├─ Path row (📋+path)│
│                                   │     └─ Content area      │
└───────────────────────────────────┴──────────────────────────┘
```

**Root layout**: `flex h-[calc(100vh-4rem)] overflow-hidden` — full viewport minus 64px navbar.

**Other pages with similar patterns**:
- Agent chat (`agents/[id]/page.tsx`) — flex-1 main + w-64 right sidebar
- Workgraph detail — single full-height canvas

No reusable panel components exist. All layouts are ad-hoc `div+flex`.

### Components That Will Move or Change

| Component | Current Location | Change Needed |
|-----------|-----------------|---------------|
| FileTree sticky header | Inside `file-tree.tsx` (lines 108-118) | Extract to `PanelHeader` in panel-layout domain |
| Path row | Inside `file-viewer-panel.tsx` (lines 137-168) | Move to `ExplorerPanel` in panel-layout domain |
| Two-panel flex split | Inside `browser-client.tsx` (lines 305-358) | Replace with `PanelShell` compositor |
| `?changed=true` param | `file-browser.params.ts` | Replace with `?panel=tree\|changes` |

### State Variables in BrowserClient (All Stay)

| State | Purpose | Stays in BrowserClient |
|-------|---------|----------------------|
| `params` (nuqs) | URL state: file, dir, mode, panel | ✅ Yes — page-level concern |
| `childEntries` | Lazy-loaded subdirectories | ✅ Yes — tree-specific data |
| `fileData` | Current file content/metadata | ✅ Yes — viewer-specific data |
| `changedFiles` | Git changed files | ✅ Yes → evolves to `workingChanges: ChangedFile[]` |
| `editContent` | Editor buffer | ✅ Yes — editor-specific |
| `diffCache` | Cached diffs per file | ✅ Yes — diff-specific |

### Callback Handlers in BrowserClient (All Stay)

All 12 handlers (`handleExpand`, `handleSelect`, `handleSave`, `handleModeChange`, `handleRefresh`, `handleRefreshFile`, `copyToClipboard`, `handleCopyFullPath`, `handleCopyRelativePath`, `handleCopyContent`, `handleCopyTree`, `handleDownload`) remain in BrowserClient — they manage file-browser business logic, not layout concerns.

---

## 2. Git Services Gap Analysis

### Currently Implemented

| Service | Git Command | Returns |
|---------|------------|---------|
| `changed-files.ts` | `git diff --name-only` | `string[]` — unstaged modified files only |
| `git-diff-action.ts` | `git diff -- <file>` | Individual file diff content |
| `directory-listing.ts` | `git ls-files --cached --others --exclude-standard` | `FileEntry[]` — tracked + untracked (respects .gitignore) |

### Needed for ChangesView

| Service | Git Command | Returns | Purpose |
|---------|------------|---------|---------|
| **`getWorkingChanges`** | `git status --porcelain=v1` | `ChangedFile[]` with status + area | Staged/unstaged/untracked classification |
| **`getRecentFiles`** | `git log --name-only --pretty=format: -n N` | `string[]` deduplicated | "Recent Activity" section below working changes |

### Porcelain Format Parsing

`git status --porcelain=v1` output format:
```
XY <path>
```
- X = index (staged) status, Y = worktree (unstaged) status
- `M ` = staged modified, ` M` = unstaged modified
- `A ` = staged added, `??` = untracked, ` D` = unstaged deleted
- `R ` = renamed (followed by ` -> newname`)

This single command replaces the existing `git diff --name-only` with richer data.

---

## 3. URL Param Changes

### Current Schema

```typescript
fileBrowserParams = {
  dir: parseAsString.withDefault(''),
  file: parseAsString.withDefault(''),
  mode: parseAsStringLiteral(['edit', 'preview', 'diff']).withDefault('preview'),
  changed: parseAsBoolean.withDefault(false),  // ← REMOVE
};
```

### New Schema

```typescript
fileBrowserParams = {
  dir: parseAsString.withDefault(''),
  file: parseAsString.withDefault(''),
  mode: parseAsStringLiteral(['edit', 'preview', 'diff']).withDefault('preview'),
  panel: parseAsStringLiteral(['tree', 'changes']).withDefault('tree'),  // ← NEW
};
```

The `changed` boolean is subsumed by `panel=changes` mode. The `panel` param is extensible (future: `search`, `bookmarks`, `recent`).

---

## 4. Component Architecture

### New Domain Components (panel-layout)

```
apps/web/src/features/_platform/panel-layout/
  ├── types.ts                    # PanelMode, BarHandler, BarContext
  ├── components/
  │   ├── panel-shell.tsx         # Root compositor (Explorer + Left + Main)
  │   ├── explorer-panel.tsx      # Top utility bar with handler chain
  │   ├── left-panel.tsx          # Mode-switching sidebar wrapper
  │   ├── main-panel.tsx          # Content area wrapper
  │   └── panel-header.tsx        # Shared header (title + buttons)
  └── index.ts                    # Barrel export
```

### New File-Browser Components (file-browser domain)

```
apps/web/src/features/041-file-browser/
  ├── components/
  │   └── changes-view.tsx        # ChangesView component (new)
  └── services/
      ├── working-changes.ts      # git status --porcelain parser (new)
      └── recent-files.ts         # git log --name-only parser (new)
```

### Composed Layout (After)

```
BrowserClient
  ├── PanelShell
  │   ├── ExplorerPanel (path bar + handler chain)
  │   ├── LeftPanel
  │   │   ├── PanelHeader (mode buttons: Tree | Changes)
  │   │   ├── FileTree (when panel=tree, header removed)
  │   │   └── ChangesView (when panel=changes)
  │   └── MainPanel
  │       └── FileViewerPanel (path row removed)
```

---

## 5. Cross-Mode Selection Sync

**This is already free.** Both modes share `selectedFile` from URL state (`?file=...`). When switching from Changes to Tree:

1. FileTree re-renders with `selectedFile` set
2. FileTree's `useState` initializer auto-expands ancestor directories (lines 67-78 in file-tree.tsx)
3. `scrollRef` callback scrolls to the selected file (lines 275-282)

No new code needed for this sync.

---

## 6. Handler Chain Architecture (ExplorerPanel)

Per the file-path-utility-bar workshop, the path input uses a composable handler chain:

```typescript
const handlers: BarHandler[] = [
  handleFilePath,     // v1: check file exists → navigate
  // Future:
  // handleSearch,    // ?query or #query → search
  // handleGoToLine,  // :123 → go to line
  // handleCommand,   // >command → command palette
];
```

**v1 ships only `handleFilePath`** — normalize input, strip worktree prefix, verify exists via server call, navigate.

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FileTree header extraction breaks existing tests | Medium | Low | 6 tests exist — update selector from "refresh file tree" to match new PanelHeader |
| `?changed` param removal breaks bookmarks | Low | Low | Old param silently ignored; `?panel=changes` is new canonical |
| git status --porcelain parsing edge cases (renames, conflicts) | Medium | Medium | Parse X+Y codes carefully; test with real repos |
| ExplorerPanel path input captures keyboard shortcuts from CodeMirror | Medium | Medium | Only bind Ctrl+P when focus not inside `.cm-editor` |
| PanelShell flex layout height calculation breaks on mobile | Low | Medium | Keep current `h-[calc(100vh-4rem)]` pattern; ExplorerPanel is shrink-0 |

---

## 8. Existing Test Coverage

| Test File | Tests | Relevance |
|-----------|-------|-----------|
| `file-tree.test.tsx` | 6 | Renders entries, expand/collapse, refresh, filter, selection. **Will need update** — header moves out. |
| `file-viewer-panel.test.tsx` | 8 | Mode toggles, save, content rendering. **Will need update** — path row removed. |
| `directory-listing.test.ts` | 5 | Git listing, readDir fallback. Unaffected. |
| `changed-files.test.ts` | 3 | Git diff --name-only. **Will be replaced** by working-changes tests. |
| `format-tree.test.ts` | 4 | Tree text formatting. Unaffected. |

---

## 9. Workshops & Domain

| Document | Status | Key Decisions |
|----------|--------|---------------|
| [file-path-utility-bar.md](workshops/file-path-utility-bar.md) | Draft | ExplorerPanel design, BarHandler chain, Ctrl+P shortcut, paste-to-navigate |
| [left-panel-view-modes.md](workshops/left-panel-view-modes.md) | Draft | LeftPanel modes, ChangesView, git status porcelain, dedup logic, cross-mode sync |
| [_platform/panel-layout domain.md](../../domains/_platform/panel-layout/domain.md) | Active | Domain boundary, contracts, source locations |
