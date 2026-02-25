# Phase 3: Wire Into BrowserClient + Migration — Execution Log

**Started**: 2026-02-24
**Status**: COMPLETE

---

## T001: URL params migration
- Removed `changed: parseAsBoolean` from fileBrowserParams
- Added `panel: parseAsStringLiteral(['tree', 'changes']).withDefault('tree')`
- Removed `parseAsBoolean` import

## T002: Remove FileTree header + showChangedOnly
- Deleted sticky header div (title + refresh button) from FileTree
- Removed `onRefresh` prop from FileTreeProps
- Removed `showChangedOnly` prop + all filtering logic (DYK-P3-03)
- Kept `changedFiles` prop for amber text on changed files
- FileTree is now pure scrollable list — header lives in LeftPanel PanelHeader

## T003: Remove FileViewerPanel path row
- Deleted `bg-muted/30` path row div (lines 137-168)
- Removed `ClipboardCopy` import
- Toolbar is now single row: Save, Edit, Preview, Diff, Refresh

## T004: File path BarHandler
- Created `createFilePathHandler()` in `services/file-path-handler.ts`
- 7 tests: simple path, strip `./`, strip `/`, strip worktree prefix, not-found, empty, whitespace
- Pure function — easy to test with fake BarContext

## T005: Extract hooks + wire PanelShell (CS-3)
- **DYK-P3-05**: Extracted 3 custom hooks from BrowserClient:
  - `useFileNavigation` — childEntries, fileData, editContent, diffCache, all navigation handlers
  - `usePanelState` — panel mode, workingChanges, recentFiles, lazy fetch, mode switching
  - `useClipboard` — copyToClipboard fallback, all copy/download handlers
- **DYK-P3-01**: `childEntriesRef` pattern for cache-aware handleExpand
- BrowserClient is now ~165 lines (thin render layer)
- PanelShell with ResizablePanelGroup, ExplorerPanel with handler chain, LeftPanel with tree/changes

## T006: Ctrl+P / Cmd+P shortcut
- Wired in BrowserClient via `document.addEventListener('keydown')`
- **DYK-P3-04**: Platform detection `navigator.platform.includes('Mac')` for metaKey vs ctrlKey
- Checks `activeElement.closest('.cm-editor')` to avoid capturing in CodeMirror
- `e.preventDefault()` suppresses print dialog

## T007: Wire ChangesView context menus
- Added ContextMenu wrapping to ChangeFileItem (same pattern as FileTree)
- Copy Full Path, Copy Relative Path, Copy Content, Download
- Passed clipboard callback props from BrowserClient to ChangesView
- Lazy fetch on first switch to changes mode, cached in state

## T008: Cross-mode sync (verification)
- Shared `selectedFile` URL state ensures both modes always agree
- Tree auto-expand on remount + DYK-01 cache prevents re-fetch

## T009: Test updates
- FileTree: removed refresh/filter tests, added changed-files highlighting test (5 tests)
- Params: replaced `changed` assertions with `panel` assertions (5 tests)
- FileViewerPanel: 13 tests pass (no path row assertions existed)
- All 148 feature tests pass, 21 files

## T010: Domain docs
- Uncommented domain map edge (file-browser → panel-layout)
- Updated both domain.md history tables
- Panel-layout domain: "First active consumer"

## Evidence
- 148 feature tests across 21 files, all passing
- New: 7 file-path-handler tests, updated params + file-tree tests
- Full suite pending at commit time
