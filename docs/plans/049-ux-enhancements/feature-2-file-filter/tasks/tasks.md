# Tasks Dossier — Feature 2: File Tree Quick Filter (v2 — ExplorerPanel)

**Plan**: [plan.md](../plan.md) (v2.0.0)
**Spec**: [spec.md](../spec.md)
**Generated**: 2026-02-26
**Status**: Ready for implementation

> **v2**: UX pivoted from LeftPanel filter bar to ExplorerPanel integration per Workshop 003.

---

## Executive Briefing

**Purpose**: Implement file search in the ExplorerPanel's blank-input mode. Replaces the "Search coming soon" stub with live file results in the CommandPaletteDropdown.

**What We're Building**: A file-list service (git ls-files + fs.stat), filter/sort utilities, a cache hook with SSE deltas, and extensions to ExplorerPanel + CommandPaletteDropdown for rendering file search results with git status badges.

**What We're NOT Building**: No new UI components (FilterInput, FilteredFileList), no LeftPanel changes, no Portal overlay, no URL-persisted filter text.

---

## Pre-Implementation Check

| File | Exists? | Domain | Action |
|------|---------|--------|--------|
| `services/file-list.ts` | No | file-browser | Create |
| `services/file-filter.ts` | No | file-browser | Create |
| `hooks/use-file-filter.ts` | No | file-browser | Create |
| `app/actions/file-actions.ts` | Yes | file-browser | Modify (add fetchFileList) |
| `browser-client.tsx` | Yes | file-browser | Modify (wire hook + props) |
| `explorer-panel.tsx` | Yes | _platform/panel-layout | Modify (add file search props + keyboard) |
| `command-palette-dropdown.tsx` | Yes | _platform/panel-layout | Modify (search mode file results) |
| `test/file-list.test.ts` | No | file-browser | Create |
| `test/file-filter.test.ts` | No | file-browser | Create |
| `test/command-palette-dropdown.test.tsx` | Yes | _platform/panel-layout | Modify |
| `test/explorer-panel.test.tsx` | Yes | _platform/panel-layout | Modify |

---

## Tasks

| Status | ID | Task | Domain | Done When | Notes |
|--------|-----|------|--------|-----------|-------|
| [x] | T001 | Install micromatch | — | pnpm add succeeds | Dynamic import in file-filter.ts |
| [x] | T002 | getFileList service + TDD tests | file-browser | git ls-files + fs.stat mtime, toggles, fallback, edge cases | FileListEntry = { path, mtime } |
| [x] | T003 | fetchFileList server action | file-browser | Lazy-import wrapper | After fetchDiffStats |
| [x] | T004 | file-filter.ts utilities + TDD tests | file-browser | substring, glob, sort, dot-filter | Pure functions, dynamic micromatch |
| [x] | T005 | useFileFilter hook | file-browser | Cache + delta + debounce + sort + hidden | CachedFileEntry { path, mtime, modified, lastChanged } |
| [x] | T006 | Extend ExplorerPanel + tests | _platform/panel-layout | File search props + keyboard delegation | Non-regression for > and # modes |
| [x] | T007 | Extend CommandPaletteDropdown + tests | _platform/panel-layout | Search mode renders file results | Badges, sort/hidden toggles, keyboard nav |
| [x] | T008 | Wire in BrowserClient | file-browser | useFileFilter → ExplorerPanel props | Minimal surface |

---

## Context Brief

### CachedFileEntry type

```typescript
export interface CachedFileEntry {
  path: string;
  mtime: number;            // Unix ms from fs.stat()
  modified: boolean;        // SSE event flag
  lastChanged: number | null; // SSE event timestamp
}
```

### FileListEntry type (server response)

```typescript
export interface FileListEntry {
  path: string;
  mtime: number;
}
```

### Key domain contracts consumed

| Domain | Contract | Usage |
|--------|----------|-------|
| `_platform/events` | `useFileChanges('*')` | Cache delta updates |
| `_platform/panel-layout` | `ExplorerPanel`, `CommandPaletteDropdown` | Search mode rendering |
| `file-browser` (self) | `fileNav.handleSelect()` | Navigate on result click |
| `file-browser` (self) | `workingChanges: ChangedFile[]` | Status badge lookup |

### ExplorerPanel mode system

```
">" prefix → paletteMode → dropdown: commands (UNCHANGED)
"#" prefix → symbolMode → dropdown: stub (UNCHANGED)
blank text → search mode → dropdown: file results (NEW)
empty      → no mode → dropdown: Quick Access hints (UNCHANGED)
```

---

## Discoveries & Learnings

_Populated during implementation._
