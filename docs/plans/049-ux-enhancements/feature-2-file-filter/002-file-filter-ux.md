# Workshop: File Filter UX & Interaction Design

**Type**: UX Design
**Plan**: 049-ux-enhancements
**Spec**: [ux-enhancements-spec.md](../ux-enhancements-spec.md) (Feature 2: File Tree Quick Filter)
**Created**: 2026-02-26
**Status**: Draft

**Related Documents**:
- [001-file-scanner-cache-events.md](001-file-scanner-cache-events.md) — Cache architecture & event integration
- [research-feature2-filter.md](../research-feature2-filter.md) — Exploration research

**Domain Context**:
- **Primary Domain**: `file-browser` — owns filter UI, filter logic, sort state
- **Related Domains**: `_platform/panel-layout` (LeftPanel shell), `_platform/events` (cache invalidation)

---

## Purpose

Define the look, feel, and interaction behavior of the quick file filter in the LeftPanel. This workshop nails down the **vibe**: fast partial matching, compact results with git status, session-persistent sort preference, and seamless integration with the existing tree navigation.

## Key Questions Addressed

- What does the filter input look like and where does it sit?
- How do filter results render (flat list, not tree)?
- How does git status (M/A/D/?/R, staged/unstaged) display on results?
- How does the sort toggle work (3-state, session-persistent)?
- What happens when you click a result?
- How does keyboard navigation work?
- What's the empty state? The loading state? The no-results state?

---

## The Vibe

**Quick, partial, filename-first.** This isn't a search engine — it's a file finder. Think VS Code's `Ctrl+P`: you type a few characters, you see matching files, you click one. The difference: it's **always visible** in the sidebar, not a modal. And it shows **git status** so you know what's dirty.

**Calm over busy.** Results appear after a brief debounce. No flickering. No aggressive re-rendering. Changed files float to top by default. The sort toggle remembers your preference.

---

## Layout

```
┌─────────────────────────────────────────────┐
│ FILES · 3 changed +42 −18  🌳 📝   ↻       │ ← PanelHeader (existing)
├─────────────────────────────────────────────┤
│ 🔍 Filter files...            ↕  👁         │ ← Filter Input (NEW)
├─────────────────────────────────────────────┤
│                                             │
│  When filter is empty:                      │
│    → Normal FileTree (existing behavior)    │
│                                             │
│  When filter has text:                      │
│    → Flat filtered results list             │
│                                             │
└─────────────────────────────────────────────┘
```

### Filter Input Bar

Always visible between PanelHeader and content. Compact single row.

```
┌─────────────────────────────────────────────┐
│ 🔍 ░░░░░░░░░░░░░░░░░░░░░░░░░░  ↕  👁      │
│ │   │                            │   │      │
│ │   └─ Input (placeholder:       │   └─ Toggle: include
│ │      "Filter files...")        │      hidden files
│ │                                │
│ └─ Search icon (muted)           └─ Sort toggle
│                                     (3-state cycle)
└─────────────────────────────────────────────┘
```

**Styling** (matches worktree-picker search input):
```
Container: border-b px-3 py-1.5 flex items-center gap-1.5
Search icon: Search h-3.5 w-3.5 text-muted-foreground shrink-0
Input: flex-1 bg-transparent text-sm placeholder:text-muted-foreground
       focus:outline-none (no ring — embedded feel, not a form field)
Sort button: rounded p-1 text-muted-foreground hover:text-foreground
Hidden toggle: rounded p-1 text-muted-foreground hover:text-foreground
```

### Sort Toggle — 3-State Cycle Button

A single icon button that cycles through modes on click. All buttons use `title` attribute for native tooltip + `aria-label` for accessibility (matching PanelHeader convention from Plan 043 DYK-05).

| State | Icon | `title` / `aria-label` | Behavior |
|-------|------|------------------------|----------|
| **Recently changed** (default) | `Clock` | "Sort by recently changed" | Modified files first (by lastChanged desc), then rest alpha |
| **Alpha A→Z** | `ArrowDownAZ` | "Sort A to Z" | Alphabetical ascending by path |
| **Alpha Z→A** | `ArrowUpZA` | "Sort Z to A" | Alphabetical descending by path |

**Cycle**: Click rotates: recent → alpha-asc → alpha-desc → recent → ...

**Persistence**: Sort mode saved in `sessionStorage` (survives page navigation within session, cleared on tab close). Key: `file-filter-sort-mode`.

**Visibility**: Always visible in the filter bar (not hidden when filter is empty — user might want to pre-set sort before typing).

### Hidden Files Toggle — Eye Icon

| State | Icon | `title` / `aria-label` |
|-------|------|------------------------|
| **OFF** (default) | `EyeOff` | "Show hidden and ignored files" |
| **ON** | `Eye` | "Hide hidden and ignored files" |

When toggled ON: re-fetches file list without `--exclude-standard`, removes dot-path client filter. Cache invalidated and re-populated.

---

### Filter Results — Overlay Behavior

When filter results are showing, the results list **overflows the left panel boundary** — expanding up to **50% of the viewport width** as an overlay on top of the main content area. This ensures full file paths (e.g., `src/features/041-file-browser/components/file-viewer-panel.tsx`) are readable without truncation.

- Results panel uses `position: absolute` or similar, anchored to the left panel's left edge
- Width: `min(max-content, 50vw)` — grows to fit content, caps at half screen
- Background: `bg-background` with border/shadow to visually separate from main content underneath
- Dismisses when: filter is cleared, Escape pressed, or click outside
- The main content (viewer) remains visible behind the overlay on the right half

```
┌──────────────────────────────────────────────────────┬──────────────┐
│ FILES · 3 changed +42 −18  🌳 📝   ↻                │              │
├──────────────────────────────────────────────────────┤   Main       │
│ 🔍 app.tsx                              ↕  👁       │   Content    │
├──────────────────────────────────────────────────────┤   (viewer)   │
│ M  src/features/041-file-browser/  app.tsx           │   partially  │
│ ▶ A  src/components/dashboard/  AppHeader.tsx        │   visible    │
│    src/lib/utils/  appUtils.ts                       │              │
│ ?  src/features/045-live-events/  app.test.tsx       │              │
│    config/environments/  app.config.ts               │              │
│                                                      │              │
│   5 files                                            │              │
└──────────────────────────────────────────────────────┴──────────────┘
     ◄──── up to 50% of viewport ────►
```

### Filter Results — Flat File List

When `filterText.length > 0`, the tree is replaced by a flat list of matching files:

```
┌─────────────────────────────────────────────┐
│ 🔍 app.tsx                       ↕  👁      │
├─────────────────────────────────────────────┤
│ M  src/  app.tsx                            │ ← modified (amber M)
│ ▶ A  src/components/  AppHeader.tsx         │ ← selected + added (green A)
│    src/lib/  appUtils.ts                    │ ← unmodified (no badge, just file icon)
│ ?  src/  app.test.tsx                       │ ← untracked (muted ?)
│    config/  app.config.ts                   │ ← unmodified
└─────────────────────────────────────────────┘
```

### Result Item Anatomy

```
┌─────────────────────────────────────────────┐
│ [▶] [M]  [dir/path/]  [filename.ext]       │
│  │    │       │              │               │
│  │    │       │              └─ text-foreground (emphasized)
│  │    │       └─ text-muted-foreground (de-emphasized)
│  │    └─ Status badge: M/A/D/?/R or File icon
│  └─ Selection indicator (amber ▶, only on selected)
└─────────────────────────────────────────────┘
```

**Reuses ChangesView rendering pattern exactly:**
```
Button: relative flex w-full items-center gap-1.5 px-3 py-1 text-left hover:bg-accent
Selected: bg-accent font-medium
Badge: shrink-0 w-4 text-center font-mono text-xs font-bold
  M = text-amber-500
  A = text-green-500
  D = text-red-500
  ? = text-muted-foreground
  R = text-blue-500
  (none) = File icon h-4 w-4 text-muted-foreground
Path dir: text-muted-foreground (truncated)
Filename: text-foreground (bold when selected)
Selection ▶: absolute left-0.5 text-amber-500 font-black text-sm
```

### Git Status on Filter Results

Each result shows its git status if known. Status comes from the `CachedFileEntry.modified` flag (from SSE events) plus initial `changedFiles` merge.

**For full M/A/D/?/R status**: Cross-reference with `workingChanges` from `usePanelState`:

```typescript
// In filter result rendering:
const getFileStatus = (path: string): ChangedFile['status'] | null => {
  const wc = workingChanges.find(f => f.path === path);
  return wc?.status ?? null;
};
```

This gives us the precise git status letter. Files not in workingChanges get a plain `File` icon.

**Staged indicator**: If `area === 'staged'`, show a subtle `S` suffix or underline on the badge (future enhancement — not v1).

---

## Interaction Behaviors

### Typing → Debounce → Filter

```
User types "app"
  → [0ms] Input updates, no filtering yet
  → [300ms] Debounce fires
  → If cache null: fetch git ls-files (show spinner)
  → If cache exists: filter immediately (~1ms for 10K files)
  → Results render as flat list
  → Tree view hidden

User clears input (or presses Escape)
  → Filter results hidden
  → Tree view restored (same expand/collapse state as before)
```

### Clicking a Result

```
User clicks "src/components/AppHeader.tsx"
  → fileNav.handleSelect('src/components/AppHeader.tsx')
    → URL updates: ?file=src/components/AppHeader.tsx
    → File content loaded in viewer
  → Filter stays active (user can click another result)
  → Selected result gets bg-accent + amber ▶

User presses Enter on selected result
  → Same as click
  → Filter text cleared
  → Tree view restores, expanded to the selected file
  → fileNav.handleExpand() called on ancestors
```

**Why two behaviors?**
- **Click**: Keep filter open — user is browsing matches
- **Enter**: Commit navigation — user found what they want, go there

### Keyboard Navigation

```
↓ ArrowDown   → Move selection down in results
↑ ArrowUp     → Move selection up in results
Enter         → Open selected file, clear filter, expand tree to file
Escape        → Clear filter, restore tree view
Tab           → Move focus to sort toggle, then hidden toggle
```

**Focus management**:
- Filter input is always focused when typing
- Arrow keys don't move cursor in input (preventDefault)
- Enter on empty filter = no-op (don't navigate to nothing)

### Glob Pattern Support

```
*.tsx          → All .tsx files
src/**/*.test  → All test files under src/
comp*          → Files starting with "comp"
*hook*         → Files containing "hook" anywhere
```

**Default**: If no glob chars (`*`, `?`, `{`), treat as **substring match** (case-insensitive). This is the most intuitive behavior — type "app" and see all files containing "app".

```typescript
function isGlobPattern(text: string): boolean {
  return /[*?{]/.test(text);
}

function filterFiles(files: CachedFileEntry[], text: string): CachedFileEntry[] {
  if (isGlobPattern(text)) {
    return micromatch.match(files.map(f => f.path), text)
      .map(path => files.find(f => f.path === path)!);
  }
  // Substring match (case-insensitive)
  const lower = text.toLowerCase();
  return files.filter(f => f.path.toLowerCase().includes(lower));
}
```

---

## Sort Behavior in Detail

### Recently Changed (Default)

```typescript
function sortByRecent(entries: CachedFileEntry[]): CachedFileEntry[] {
  return entries.sort((a, b) => {
    // Files with SSE-observed changes first (real-time edits during session)
    if (a.lastChanged && !b.lastChanged) return -1;
    if (!a.lastChanged && b.lastChanged) return 1;
    if (a.lastChanged && b.lastChanged) return b.lastChanged - a.lastChanged;
    // Then sort by filesystem mtime (covers pre-page-load changes)
    return b.mtime - a.mtime;
  });
}
```

Result ordering:
1. Files changed during this session (SSE events), most recent first
2. All other files by filesystem mtime descending (most recently modified on disk first)

**Key**: mtime comes from `stat()` during cache population — no extra git calls needed. Works from first keystroke (DYK-01).

### Alpha A→Z / Z→A

Simple `path.localeCompare()` ascending or descending. No special treatment of modified files.

### Session Persistence

```typescript
const SORT_KEY = 'cg-file-filter-sort';

// Read on mount
const initial = (sessionStorage.getItem(SORT_KEY) as SortMode) ?? 'recent';

// Write on change
useEffect(() => {
  sessionStorage.setItem(SORT_KEY, sortMode);
}, [sortMode]);
```

---

## States

### Empty Filter (Default)

```
┌─────────────────────────────────────────────┐
│ 🔍 Filter files...              ↕  👁       │
├─────────────────────────────────────────────┤
│ ▸ src/                                      │
│ ▸ test/                                     │
│   README.md                                 │
│   package.json                              │
│   ...normal tree view...                    │
└─────────────────────────────────────────────┘
```

Normal tree. Filter input visible but inactive.

### Loading (First Keystroke, Cache Empty)

```
┌─────────────────────────────────────────────┐
│ 🔍 app█                         ↕  👁       │
├─────────────────────────────────────────────┤
│                                             │
│         Scanning files...                   │
│                                             │
└─────────────────────────────────────────────┘
```

Centered muted text with AsciiSpinner (reuse from ExplorerPanel).

### Results

```
┌─────────────────────────────────────────────┐
│ 🔍 app█                     12  ↕  👁       │
├──────────────────────────result count───────┤
│ M  src/  app.tsx                            │
│    src/components/  AppHeader.tsx            │
│ ?  src/  app.test.tsx                       │
│    ...                                      │
│                                             │
│   12 files                                  │
└─────────────────────────────────────────────┘
```

Match count shown in the filter bar (muted, right of input). Total count at bottom of results.

### No Results

```
┌─────────────────────────────────────────────┐
│ 🔍 xyznonexistent█             ↕  👁       │
├─────────────────────────────────────────────┤
│                                             │
│         No matching files                   │
│                                             │
└─────────────────────────────────────────────┘
```

Centered muted text.

### Error (Git Failed)

```
┌─────────────────────────────────────────────┐
│ 🔍 app█                        ↕  👁       │
├─────────────────────────────────────────────┤
│                                             │
│         Could not scan files                │
│                                             │
└─────────────────────────────────────────────┘
```

Muted error text. Next keystroke retries.

---

## Context Menu on Filter Results

Same context menu as FileTree and ChangesView:
- Copy Full Path
- Copy Relative Path
- Copy Content
- Download

Reuse the same context menu component/pattern from ChangesView.

---

## Open Questions

### Q1: Should filter work in both tree and changes modes?

**RESOLVED**: Yes. The filter is **mode-agnostic**. It works identically whether the panel is in tree mode or changes mode. Same search, same results, same rendering. Clicking a result always navigates to the file (loads in viewer, updates URL). The panel mode does NOT switch back to tree automatically — the user stays in whatever mode they were in. The filter results overlay replaces the panel content regardless of mode.

### Q2: Should the filter be URL-persisted?

**RESOLVED**: Yes — add `filter` param to `fileBrowserParams`. Bookmarking a filtered view and reopening restores the filter. Clearing the filter removes the param.

### Q3: Max results displayed?

**RESOLVED**: Show all results (scrollable). No pagination. For 10K+ file repos, glob patterns typically match <100 files. Substring matches could match thousands — but the list is virtualized via overflow-y-auto (browser handles the DOM efficiently for simple list items).

### Q4: Should arrow keys work before typing (pre-select in tree)?

**RESOLVED**: No. Arrow keys only activate for filter result navigation when `filterText.length > 0`. When filter is empty, arrow keys do nothing special in the input (normal cursor movement).

---

## Implementation Components

| Component | File | Purpose |
|-----------|------|---------|
| `FilterInput` | `041-file-browser/components/filter-input.tsx` | Search input + sort toggle + hidden toggle |
| `FilteredFileList` | `041-file-browser/components/filtered-file-list.tsx` | Flat result list with status badges + click/keyboard |
| `useFileFilter` | `041-file-browser/hooks/use-file-filter.ts` | Cache, glob matching, sort, debounce |
| `getFileList` | `041-file-browser/services/file-list.ts` | Server-side git ls-files wrapper |
| `fetchFileList` | `app/actions/file-actions.ts` | Server action wrapper |

---

## Summary: The Vibe Checklist

- [x] **Quick** — 300ms debounce, then instant in-memory filtering
- [x] **Partial** — substring match by default, glob with `*` chars
- [x] **Filename-first** — dir path muted, filename emphasized
- [x] **Git-aware** — M/A/D/?/R badges with established color scheme
- [x] **Sort preference persists** — sessionStorage across navigations
- [x] **Recently changed first** — default sort puts modified files on top
- [x] **Always visible** — filter input never hidden, tree restores on clear
- [x] **Seamless navigation** — click browses, Enter commits + expands tree
- [x] **Calm** — no flickering, spinner during load, muted empty states
