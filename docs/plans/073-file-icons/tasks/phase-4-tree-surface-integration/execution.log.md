# Phase 4: Tree & Surface Integration — Execution Log

**Started**: 2026-03-10
**Phase**: Phase 4 of 5
**Plan**: [file-icons-plan.md](../../file-icons-plan.md)
**Tasks**: [tasks.md](./tasks.md)

---

## Pre-Phase Validation

### Harness Check
- **Container**: Not running (cold). Will start before T009 visual verification.
- **Decision**: Proceed without harness for T001-T008 (code changes + tests). Start harness for T009.

### Asset Check
- Generated icons exist in `apps/web/public/icons/material-icon-theme/` ✅
- manifest.json present ✅

---

## Task Log

### T001: Fix file-tree.test.tsx SVG count assertions ✅
- **Changed**: Updated 6 `querySelectorAll('svg')` assertions → `querySelectorAll('svg, img')` to accept both Lucide SVGs and FileIcon img tags
- **Added**: Preemptive `vi.mock('@/features/_platform/themes', ...)` so FileIcon/FolderIcon render simple `<img>` in test environment
- **Discovery**: `useIconManifest()` throws without `<IconThemeProvider>` — mock is mandatory, not optional
- **Evidence**: 10/10 file-tree tests pass

### T002: FileTree file icons ✅
- **Replaced**: 4 `<File>` instances with `<FileIcon>` — 2 create-input sites (filename=""), 1 rename mode (`entry.name`), 1 normal display (`entry.name`)
- **Stripped**: `text-muted-foreground` color class from all sites (img tags ignore CSS text colors)
- **Removed**: `File` from lucide-react import, added `FileIcon` from `@/features/_platform/themes`
- **Evidence**: 10/10 file-tree tests pass

### T003: FileTree folder icons ✅
- **Replaced**: 7 `<Folder>`/`<FolderOpen>` instances with `<FolderIcon>` — root display, 2 create-input sites (name=""), 2 rename mode, 2 normal display
- **Stripped**: `text-blue-500`, `text-blue-500/60` color classes from all sites
- **Kept**: `FolderPlus` (3x), `FolderTree` (1x) — these are UI action icons, not file identification
- **Removed**: `Folder`, `FolderOpen` from lucide-react import, added `FolderIcon` from `@/features/_platform/themes`
- **Evidence**: 10/10 file-tree tests pass

### T004: ChangesView ✅
- **Replaced**: 1 `<File>` at line 174 with `<FileIcon filename={name}>`. `name` already computed via `filePath.split('/').pop()`.
- **Stripped**: `text-muted-foreground`. Removed `File` from lucide import.

### T005: CommandPaletteDropdown ✅
- **Replaced**: 1 `<File>` at line 667 (file item in working changes) with `<FileIcon filename={name}>`. `name` already computed.
- **Kept**: `<File>` at line 303 — context menu "Copy Relative Path" UI icon (not file identification).
- **Added**: `FileIcon` import from themes.

### T006: BinaryPlaceholder ✅
- **Replaced**: `<FileQuestion className="h-16 w-16" />` with `<FileIcon filename={filename} className="h-16 w-16" />`. Large icon — visual verification in T009.
- **Removed**: `FileQuestion` from lucide import.

### T007: AudioViewer ✅
- **Replaced**: `<Music className="h-12 w-12 text-muted-foreground" />` with `<FileIcon filename={filename} className="h-12 w-12" />`. Large icon — visual verification in T009.
- **Removed**: Entire lucide-react import (Music was the only import).

### T008: Run `just fft` ✅
- **Discovery**: 4 additional test files needed `vi.mock('@/features/_platform/themes')` — any test rendering FileTree, ChangesView, BinaryPlaceholder, or CommandPaletteDropdown now needs the mock since those components import from themes which requires IconThemeProvider context.
- **Fixed test files**: `changes-view.test.tsx`, `file-viewer-panel.test.tsx`, `command-palette-dropdown.test.tsx`, `inline-edit-input.test.tsx`
- **Evidence**: 5,326 tests passed, 370 files, zero failures. `just fft` green.

### Code Review Fixes ✅
- **F001 (HIGH)**: ChangesView and CommandPaletteDropdown badge ternary replaced — now show badge AND FileIcon together (like VSCode). Previously badge replaced icon entirely for working changes.
- **F002 (MEDIUM)**: Added `renders file-type icons alongside badges for working changes` test assertion to changes-view.test.tsx. Mocks kept (pragmatic for consumer tests — icon resolution tested in icon-components.test.tsx).
- **F003 (MEDIUM)**: Updated file-browser/domain.md (added _platform/themes dependency + history), panel-layout/domain.md (added _platform/themes dependency + history), domain-map.md (added panels → themes edge).
- **Evidence**: 5,327 tests passed (1 new assertion), `just fft` green.
