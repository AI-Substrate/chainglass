# Workshop: UX Pivot — Explorer Bar File Search Integration

**Type**: UX Design / Remediation
**Plan**: 049-ux-enhancements
**Spec**: [spec.md](../spec.md) (Feature 2: File Tree Quick Filter)
**Created**: 2026-02-26
**Status**: Draft

**Related Documents**:
- [001-file-scanner-cache-events.md](./001-file-scanner-cache-events.md) — Cache architecture (still valid)
- [002-file-filter-ux.md](./002-file-filter-ux.md) — **SUPERSEDED** by this workshop for UI portions

**Domain Context**:
- **Primary Domain**: `file-browser` — owns file search handler, cache hook, result rendering
- **Modified Domain**: `_platform/panel-layout` — ExplorerPanel dropdown gets file search mode (replaces "Search coming soon" stub)
- **No longer modified**: LeftPanel (no `filterSlot` prop needed)

---

## Purpose

The user has pivoted the filter UX from a **dedicated input bar in the LeftPanel** to **integration with the existing ExplorerPanel** at the top of the page. File search replaces the "Search coming soon" stub in the blank-input dropdown mode. Results show in the CommandPaletteDropdown. This workshop designs the new UX and documents what needs to change in the existing plan, spec, tasks, and workshops.

## Key Questions Addressed

- How does file search integrate with the ExplorerPanel's existing mode system (`>`, `#`, blank)?
- What replaces the "Search coming soon" stub?
- How do results render in the CommandPaletteDropdown?
- What changes are needed vs. what stays the same from previous workshops?

---

## How the ExplorerPanel Modes Work Today

```
┌──────────────────────────────────────────────────────────┐
│ ExplorerPanel input — 4 modes detected by prefix          │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  "> filter"  → paletteMode  → dropdown: command list       │
│  "# query"   → symbolMode   → dropdown: stub ("coming")   │
│  "path/file" → handler chain → filePathHandler navigates   │
│  ""          → blank         → dropdown: Quick Access hints │
│                                                            │
│  Handler chain: [symbolStub, filePathHandler]               │
│  If all handlers return false → toast "Search coming soon"  │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### The Blank/Search Mode Today

When the user focuses the ExplorerPanel and types text that isn't `>` or `#` prefixed:
- **Dropdown shows**: "Quick Access" hints listing `>` Commands, `#` Symbols, and "File search coming soon"
- **On Enter**: Handler chain runs → filePathHandler tries exact path match → if not found, toast "Search coming soon"

### What We're Replacing

The **blank/search** dropdown mode becomes **live file search results**. Instead of static hints, typing shows matching files from the cache in real time.

---

## New Behavior

```
┌──────────────────────────────────────────────────────────┐
│ ExplorerPanel input — updated modes                        │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  "> filter"  → paletteMode  → dropdown: command list       │  (unchanged)
│  "# query"   → symbolMode   → dropdown: stub ("coming")   │  (unchanged)
│  "any text"  → FILE SEARCH  → dropdown: matching files     │  (NEW!)
│  ""          → blank         → dropdown: Quick Access hints │  (unchanged)
│                                                            │
│  Typing without prefix:                                    │
│    1. Dropdown shows live file search results               │
│    2. 300ms debounce before filtering                       │
│    3. Results: flat list with git status badges             │
│    4. ↑↓ to navigate, Enter to open file                    │
│    5. Clicking a result opens the file                      │
│    6. Escape dismisses                                      │
│                                                            │
│  On Enter (with selected result):                          │
│    → Navigate to file (handleSelect)                       │
│    → Exit edit mode (like command palette)                  │
│                                                            │
│  On Enter (no results / no selection):                     │
│    → Handler chain runs (existing filePathHandler)          │
│    → Exact path match still works                           │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

### Mode Detection Update

```typescript
// Current:
const dropdownMode = paramGathering ? 'param'
  : paletteMode ? 'commands'
  : symbolMode ? 'symbols'
  : 'search';  // ← This was static hints, now becomes live file search

// No change to mode detection logic! 'search' mode just renders differently.
```

### Dropdown Rendering Update

The `mode === 'search'` branch in CommandPaletteDropdown changes from static hints to:

```
┌────────────────────────────────────────────────────────────┐
│  When inputValue has text (not > or #):                    │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ 🔍 app█                                              │  │ ← ExplorerPanel input
│   ├─────────────────────────────────────────────────────┤  │
│   │  M  src/  app.tsx                              ↕ 👁 │  │ ← sort + hidden toggles
│   │ ▶ A  src/components/  AppHeader.tsx                  │  │ ← selected (bg-primary/15)
│   │     src/lib/  appUtils.ts                            │  │
│   │  ?  src/  app.test.tsx                               │  │
│   │     config/  app.config.ts                           │  │
│   │                                                      │  │
│   │  5 files                                             │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│  When inputValue is empty:                                  │
│   → Quick Access hints (unchanged: >, #, file search)      │
│                                                             │
└────────────────────────────────────────────────────────────┘
```

### Key Interaction Details

**Sort + Hidden toggles**: Rendered as small icon buttons in the first row of the dropdown (not in the ExplorerPanel input itself). This keeps the input clean and matches how command palette renders action buttons.

**Keyboard navigation**: Same as command palette — ↑↓ moves selection, Enter opens file, Escape closes. Arrow keys are delegated from ExplorerPanel to dropdown via `dropdownRef.current?.handleKeyDown(e)`.

**Click on result**: `handleSelect(path)` → navigates to file, exits edit mode (same as command execute).

**Enter with selected result**: Opens the file, exits edit mode. If no results match, falls through to the existing handler chain (filePathHandler tries exact path match).

**Result width**: Dropdown already uses `absolute left-0 right-0 top-full` — **stretches the full width of the ExplorerPanel** (which is the full page width). No Portal needed! Full file paths are visible without truncation.

---

## What Stays the Same from Previous Workshops

### ✅ Cache Architecture (Workshop 001) — FULLY VALID

| Component | Status | Notes |
|-----------|--------|-------|
| `CachedFileEntry { path, mtime, modified, lastChanged }` | ✅ Keep | Same type |
| `getFileList()` service (git ls-files + fs.stat) | ✅ Keep | Same service |
| `fetchFileList()` server action | ✅ Keep | Same wrapper |
| Client-side `Map<string, CachedFileEntry>` cache | ✅ Keep | Same cache |
| SSE delta updates (add/change/unlink) | ✅ Keep | Same event integration |
| >50 events threshold → full re-fetch | ✅ Keep | Same strategy |
| `useFileFilter()` hook | ✅ Keep | Same hook (different consumer) |
| `file-filter.ts` matching + sort utilities | ✅ Keep | Same pure functions |
| micromatch for glob patterns | ✅ Keep | Same dependency |

### ✅ File Result Rendering (Workshop 002) — MOSTLY VALID

| Component | Status | Notes |
|-----------|--------|-------|
| Status badges (M/A/D/?/R) | ✅ Keep | Same colors and pattern |
| Muted dir + emphasized filename | ✅ Keep | Same rendering |
| Selected state (bg-primary/15) | ✅ Keep | Use palette's selection style, not tree's bg-accent |
| Keyboard nav (↑↓ Enter Esc) | ✅ Keep | Delegate through existing dropdown mechanism |
| Sort toggle (3-state cycle) | ✅ Keep | Moves from filter bar to dropdown header row |
| Hidden toggle (Eye) | ✅ Keep | Moves from filter bar to dropdown header row |
| Context menu (copy/download) | ✅ Keep | Same pattern |
| Substring default, glob on `*?{` | ✅ Keep | Same matching logic |
| Session-persistent sort mode | ✅ Keep | Same sessionStorage |

---

## What Changes from Previous Workshops

### ❌ Removed

| Component | Was | Now |
|-----------|-----|-----|
| `FilterInput` component | Dedicated search bar in LeftPanel | **Removed** — ExplorerPanel IS the input |
| `FilteredFileList` component | Standalone overlay via Portal | **Removed** — results render inside CommandPaletteDropdown |
| LeftPanel `filterSlot` prop | New prop on LeftPanel | **Removed** — no LeftPanel changes |
| `filter` URL param | Deep-linkable filter state | **Removed** — filter is transient (like command palette) |
| Portal overlay (50% viewport) | React.createPortal to body | **Removed** — dropdown already positions absolutely under ExplorerPanel |
| Click-outside dismissal | Custom handler for Portal | **Removed** — dropdown's existing `onMouseDown={e => e.preventDefault()}` handles this |

### 📝 Modified

| Component | Was | Now |
|-----------|-----|-----|
| `useFileFilter()` hook | Called in BrowserClient, wired to FilterInput | Called in BrowserClient, wired to ExplorerPanel via new prop or search mode callback |
| Sort/Hidden toggles | In FilterInput bar | In dropdown header row (above results) |
| Result selection style | `bg-accent` (tree style) | `bg-primary/15` (palette style) — matches command result selection |
| Debounce | 300ms in FilterInput onChange | 300ms in useFileFilter, triggered by ExplorerPanel's inputValue changes |

---

## Implementation Changes to Plan/Tasks

### Tasks to REMOVE

| Task | Reason |
|------|--------|
| ~~T005: Add `filter` URL param~~ | Filter is transient, not URL-persisted |
| ~~T006: Extend LeftPanel with `filterSlot`~~ | No LeftPanel changes |
| ~~T008: Create `FilterInput` component~~ | ExplorerPanel IS the input |
| ~~T009: Create `FilteredFileList` component~~ | Results render in CommandPaletteDropdown |

### Tasks to MODIFY

| Task | Was | Now |
|------|-----|-----|
| T004 (file-filter.ts) | Unchanged | Same — pure functions |
| T007 (useFileFilter hook) | Wired to FilterInput | Wired to ExplorerPanel via search mode callback |
| T010 (BrowserClient wiring) | Wire FilterInput to LeftPanel filterSlot + FilteredFileList overlay | Wire useFileFilter to ExplorerPanel. Pass results as new prop. Pass sort/hidden callbacks. |

### Tasks to ADD

| Task | Description |
|------|-------------|
| T-NEW-1 | Extend CommandPaletteDropdown `search` mode to render file results (with badges, sort toggle, hidden toggle, match count) |
| T-NEW-2 | Extend ExplorerPanel to pass search text to parent for file filtering (new callback prop or lift filter state) |
| T-NEW-3 | Update ExplorerPanel keyboard delegation — in search mode with results, delegate ↑↓ Enter to dropdown (same as commands mode) |

### Acceptance Criteria to UPDATE

| AC | Was | Now |
|----|-----|-----|
| AC-1 | Persistent filter input between PanelHeader and content | File search activated by typing in ExplorerPanel (no prefix) |
| AC-6 | Results overlay up to 50% viewport via Portal | Results render in CommandPaletteDropdown (full ExplorerPanel width) |
| AC-13 | `filter` URL param for deep linking | **Removed** — filter is transient |
| AC-2 | Tooltips on filter bar buttons | Tooltips on sort/hidden buttons in dropdown |

---

## Updated Dropdown Rendering (Pseudo-Code)

```typescript
// In CommandPaletteDropdown — search mode branch

{mode === 'search' && (
  inputValue.length === 0 ? (
    // Empty input: show Quick Access hints (UNCHANGED)
    <QuickAccessHints />
  ) : fileSearchResults === null ? (
    // Loading cache
    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
      <AsciiSpinner active /> Scanning files...
    </div>
  ) : fileSearchResults.length === 0 ? (
    // No matches
    <div className="px-3 py-4 text-center text-sm text-muted-foreground">
      No matching files
    </div>
  ) : (
    <>
      {/* Sort + Hidden toggles in header */}
      <div className="flex items-center justify-between border-b px-3 py-1">
        <span className="text-xs text-muted-foreground">{fileSearchResults.length} files</span>
        <div className="flex items-center gap-1">
          <SortToggleButton mode={sortMode} onClick={cycleSortMode} />
          <HiddenToggleButton active={includeHidden} onClick={toggleHidden} />
        </div>
      </div>
      {/* File results — same keyboard nav pattern as commands */}
      <div role="listbox" className="py-1 max-h-64 overflow-y-auto">
        {fileSearchResults.map((entry, index) => (
          <div
            key={entry.path}
            role="option"
            aria-selected={index === selectedIndex}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer ${
              index === selectedIndex
                ? 'bg-primary/15 text-foreground'
                : 'text-foreground hover:bg-accent/50'
            }`}
            onClick={() => onFileSelect(entry.path)}
          >
            {/* Status badge or file icon */}
            {badge ? (
              <span className={`shrink-0 w-4 text-center font-mono text-xs font-bold ${badge.className}`}>
                {badge.letter}
              </span>
            ) : (
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            {/* Path: dir muted, filename emphasized */}
            <span className="flex-1 truncate">
              <span className="text-muted-foreground">{dir}/</span>
              <span>{filename}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
)}
```

---

## Open Questions

### Q1: How does useFileFilter connect to ExplorerPanel?

**RESOLVED**: ExplorerPanel already exposes `inputValue` to the dropdown via props. The CommandPaletteDropdown receives `filter` (the text after prefix stripping). For search mode, the full `inputValue` IS the search text (no prefix to strip). BrowserClient passes file search results + callbacks as new props to ExplorerPanel, which forwards them to the dropdown.

New ExplorerPanel props:
```typescript
interface ExplorerPanelProps {
  // ... existing props ...
  fileSearchResults?: CachedFileEntry[];  // Results from useFileFilter
  fileSearchLoading?: boolean;
  sortMode?: SortMode;
  onSortModeChange?: (mode: SortMode) => void;
  includeHidden?: boolean;
  onIncludeHiddenChange?: (value: boolean) => void;
  onFileSelect?: (path: string) => void;
  workingChanges?: ChangedFile[];  // For status badge lookup
}
```

### Q2: Does the handler chain conflict with search mode?

**RESOLVED**: No conflict. The handler chain only runs on **Enter press** (handleSubmit). The search dropdown renders while typing. When user presses Enter:
- If a result is selected in dropdown → open that file (dropdown handles Enter)
- If no dropdown result selected → handler chain runs (existing filePathHandler tries exact path match)

This is exactly how command palette already works — `>` typing shows dropdown, Enter with selection executes command, Enter without selection falls through.

### Q3: Should we update ExplorerPanel keyboard delegation for search mode?

**RESOLVED**: Yes. Currently only `paletteMode` delegates ↑↓ Enter to dropdown. Need to also delegate when `mode === 'search' && fileSearchResults?.length > 0`. Small change to the `handleKeyDown` function.

---

## Summary: What the Implementor Needs to Know

1. **No new components** for filter input or result list — we're extending ExplorerPanel + CommandPaletteDropdown
2. **Cache + service + hook** from Workshop 001 are unchanged — same `getFileList`, `useFileFilter`, `CachedFileEntry`
3. **Dropdown's `search` mode** goes from static hints to live file results with badges + sort + hidden toggles
4. **ExplorerPanel gets new props** for file search results and callbacks
5. **Keyboard delegation** extended to search mode (same pattern as commands mode)
6. **No Portal, no LeftPanel changes, no URL param** — much simpler wiring than the original design
7. **4 tasks removed, 3 tasks added** — net reduction in scope
