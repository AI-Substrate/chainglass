# Research Report: File Tree Quick Filter

> **⚠️ UX SUPERSEDED**: This research recommended a LeftPanel filter bar, Portal overlay, and `filter` URL param. These UX decisions were superseded by [Workshop 003](./003-ux-pivot-explorer-bar.md) which pivots to ExplorerPanel integration + CommandPaletteDropdown rendering. **Cache architecture and service design remain valid.**

**Generated**: 2026-02-26T05:20:00Z
**Research Query**: "Quick filter for file tree — glob support, sort toggle, debounce, cache vs scan, gitignore handling"
**Mode**: Pre-Plan (Feature 2 of Plan 049)
**Location**: docs/plans/049-ux-enhancements/research-feature2-filter.md
**FlowSpace**: Available
**Findings**: 68 across 8 subagents

## Executive Summary

### What It Does
Add a persistent search/filter input below the FILES header that filters the file tree to a flat list of matching files. Typing a pattern (with glob support) debounces then shows matching files in a flat list (not tree). Clicking a result navigates to that file (expanding its tree path). Sort toggle switches between recently-changed and alphabetical ordering.

### Business Purpose
Navigating large worktrees by expanding directories is slow for users who know roughly what file they want. A quick filter provides VS Code-like "find file" behavior directly in the sidebar — always visible, instantly responsive, and integrated with the existing tree navigation.

### Key Insights
1. **No filter/search exists yet** — FileTree is purely presentational with lazy directory expansion. No glob library installed.
2. **Caching is recommended** — `git ls-files` takes ~30-80ms for 10-50K files. Cache the full file list once, invalidate via `useFileChanges('*')`, filter in-memory. Avoids repeated git subprocess calls on every keystroke.
3. **ChangesView provides the flat list pattern** — Already renders flat file lists with click-to-select, status badges, context menus. Filter results can follow the same rendering pattern.
4. **`git ls-files` respects .gitignore by default** — `--cached --others --exclude-standard` gives tracked + untracked-but-not-ignored files. Dot files (`.env`, `.github/`) ARE included unless gitignored. Separate toggle needed for those.
5. **Domain placement is clear** — 100% file-browser business concern. Panel-layout provides only the input surface.

### Quick Stats
- **Components affected**: ~6 files new, ~4 files modified
- **Dependencies**: 1 new (micromatch or minimatch for glob)
- **Test Coverage**: 230+ existing file-browser tests; 0 filter tests
- **Complexity**: CS-3 (medium) — new UI + service + caching + glob
- **Prior Learnings**: 10 relevant from plans 041, 043, 045
- **Domains**: 1 modified (file-browser), 0 new

## How It Currently Works

### Entry Points
| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| FileTree | Component | `041-file-browser/components/file-tree.tsx` | Lazy tree with expand/collapse |
| LeftPanel | Component | `_platform/panel-layout/components/left-panel.tsx` | Mode-switching sidebar wrapper |
| directory-listing.ts | Service | `041-file-browser/services/directory-listing.ts` | Per-directory file listing |
| BrowserClient | Component | `browser-client.tsx` | Orchestrates panel hooks + wiring |

### Core Execution Flow
1. **Page load**: Server fetches root entries via `listDirectory()` → `FileEntry[]`
2. **BrowserClient**: Passes `initialEntries` + hooks to FileTree
3. **User expands dir**: `onExpand(dirPath)` → API call → `childEntries` cache populated
4. **Selection**: `onSelect(filePath)` → `readFile()` → viewer update + URL sync

### Data Available
- `FileEntry { name, type: 'file'|'directory', path }` — per-directory, lazy
- `changedFiles: string[]` — from `git diff --name-only` (unstaged changes)
- `workingChanges: ChangedFile[]` — from `git status --porcelain` (staged+unstaged+untracked)
- `recentFiles: string[]` — from `git log --name-only` (last 20 unique)

### What's Missing for Filter
- **Full file list** — Current architecture only loads one directory at a time
- **Glob library** — No minimatch/micromatch installed
- **Filter input UI** — No search input in the LeftPanel
- **Flat result rendering** — ChangesView pattern exists but isn't reusable as-is
- **Sort toggle** — No sort controls anywhere in the panel

## Architecture & Design

### Proposed Data Flow
```
User types "*.tsx" in filter input
  → 300ms debounce
  → Check cache (full file list)
    → Cache miss: git ls-files → populate cache
    → Cache hit: filter in-memory with micromatch
  → Render flat list of matching files
  → Click result → fileNav.handleSelect(path) + expand tree to path

useFileChanges('*') detects change
  → Invalidate cache
  → Re-filter if filter is active
```

### Caching Strategy (Recommended)
| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Cache scope** | Full worktree file list | Filter needs all files, not per-directory |
| **Cache source** | `git ls-files --cached --others --exclude-standard` | Respects .gitignore, fast (~50ms) |
| **Cache format** | `string[]` of relative paths | Lightweight, glob-matchable |
| **Invalidation** | `useFileChanges('*')` with 500ms debounce | Same pattern as stats refresh |
| **Fallback** | Scan on every filter if cache miss | Non-git workspaces use readDir recursion |
| **Eager vs lazy** | Lazy — populate on first filter keystroke | Don't waste memory if user never filters |

### Git Commands for File Listing
```bash
# Default: tracked + untracked, respecting .gitignore
git ls-files --cached --others --exclude-standard

# With dot files explicitly: same command (dot files are included unless gitignored)
# "Include dot files" toggle would need: remove --exclude-standard, add --others
git ls-files --cached --others

# Alternative for non-git: recursive readDir (with depth limit)
```

### Sort Modes
| Mode | Source | Implementation |
|------|--------|----------------|
| **Recently changed** (default when filtering) | `git diff --name-only` + `git log --name-only` combined | Changed files first, then recently committed, then rest alphabetically |
| **Alphabetical A→Z** | Sort by path | `files.sort()` — natural string comparison |
| **Alphabetical Z→A** | Reverse sort | `files.sort().reverse()` |

### Component Structure
```
LeftPanel
  └─ PanelHeader (title="FILES", subtitle=stats, modes, actions)
  └─ FilterInput (always visible below header)
       ├─ Search icon + input + clear button
       ├─ Sort toggle (3-state: recent ↕ alpha-asc ↑ alpha-desc ↓)
       └─ "Include hidden" toggle (dot-only button)
  └─ [Active content based on filter state]
       ├─ When no filter: FileTree (current behavior)
       └─ When filtering: FilteredFileList (flat list of matches)
```

## Dependencies & Integration

### New Dependencies Needed
| Library | Purpose | Size | Alternative |
|---------|---------|------|-------------|
| `micromatch` | Glob pattern matching | ~10KB | `minimatch` (~5KB), hand-rolled |

### Existing Infrastructure Reused
- `useFileChanges('*')` — cache invalidation trigger
- `fileNav.handleSelect()` — navigate to file on click
- `fileNav.handleExpand()` + `expandPaths` — expand tree to file path
- `ChangesView` rendering pattern — flat file list with click-to-select
- `fileBrowserParams` — URL persistence for filter text
- `PanelHeader.actions` — sort toggle button placement

## Quality & Testing

### Testing Strategy
- **Service tests**: Glob matching, cache invalidation, git ls-files parsing
- **Component tests**: Filter input rendering, debounce behavior, result list, sort toggle
- **No existing filter tests** — all new

### Known Risks
| Risk | Mitigation |
|------|-----------|
| Large repos (50K+ files) with slow git ls-files | Lazy cache population, show spinner during scan |
| Glob syntax confusion (users typing regex instead) | Default to substring match, glob only with `*` or `?` chars |
| Cache stale after branch switch | `useFileChanges('*')` detects mass changes, invalidates |
| Non-git workspaces need recursive readDir | Depth-limited readDir fallback (max 10 levels) |

## Prior Learnings

### 📚 PL-01: Git ls-files for Lazy Directory Listing
**Source**: Plan 041 Phase 4
**Action**: Use `git ls-files --cached --others --exclude-standard` for the full file list cache.

### 📚 PL-03: Show All Files in Tree View
**Source**: Plan 043 Phase 2, DYK-P2-02
**Action**: Tree view uses readDir (shows all files). Filter should default to git ls-files (hides gitignored). This difference is intentional — tree is browse-everything, filter is find-what-matters.

### 📚 PL-07: Debounce in useFileChanges (100-200ms)
**Source**: Plan 045 Phase 2
**Action**: Use 300ms debounce for filter input (slower than file events — user typing is less urgent). Use `useFileChanges('*', { debounce: 500 })` for cache invalidation.

### 📚 PL-08: FileChangeHub Pattern Matching
**Source**: Plan 045 Phase 2
**Action**: The hub already does glob-like pattern matching. If micromatch is too heavy, consider reusing the hub's matching logic for simple patterns.

| ID | Type | Source Plan | Key Insight | Action |
|----|------|-------------|-------------|--------|
| PL-01 | pattern | 041 | git ls-files for file listing | Use for cache population |
| PL-03 | decision | 043 | Tree=readDir, Changes=git | Filter uses git ls-files (gitignore-aware) |
| PL-07 | pattern | 045 | Debounce 100-200ms | Use 300ms for filter input |
| PL-08 | pattern | 045 | Hub has glob matching | Consider reusing instead of micromatch |

## Domain Context

### Existing Domains

| Domain | Relationship | Relevant Contracts |
|--------|-------------|-------------------|
| `file-browser` | **directly relevant** — owns all filter logic, UI, service, URL params | FileEntry, FileTree, directory-listing, fileBrowserParams |
| `_platform/panel-layout` | **tangential** — provides LeftPanel shell, no changes needed | PanelHeader, LeftPanel (subtitle prop already added) |
| `_platform/events` | **consumed** — `useFileChanges('*')` for cache invalidation | FileChangeProvider, useFileChanges |

### Domain Actions
- **Extend file-browser**: Add filter service, filter component, URL param
- **No new domains** — filter is squarely within file-browser boundary
- **No panel-layout changes** — filter input lives inside LeftPanel's children slot, not in the header

## Critical Discoveries

### 🚨 Critical Finding 01: No Glob Library Installed
**Impact**: High
**What**: micromatch/minimatch not in dependencies. Need to add one for `*.tsx`, `src/**/*.test.ts` patterns.
**Decision Needed**: micromatch (more features, ~10KB) vs minimatch (simpler, ~5KB) vs hand-rolled (star+question mark only).

### 🚨 Critical Finding 02: git ls-files Output Already Excludes Gitignored
**Impact**: High
**What**: `git ls-files --cached --others --exclude-standard` gives exactly what we want — tracked files + untracked non-ignored files. Dot files (`.env`, `.github/`) ARE included unless they're in `.gitignore`.
**Action**: The "ignore .paths" toggle should filter out paths starting with `.` client-side. The "obey gitignore" is the default — toggling it OFF means using `git ls-files --cached --others` (without `--exclude-standard`).

### 🚨 Critical Finding 03: Cache Recommended Over Re-Scan
**Impact**: Medium-High
**What**: Even at 50ms per `git ls-files` call, 3 calls/sec during typing is noticeable. Caching the full file list and filtering in-memory is near-instant (<1ms for 10K files with micromatch).
**Action**: Lazy-populate cache on first filter keystroke. Invalidate via `useFileChanges('*')`. Re-populate on next filter interaction after invalidation.

## Recommendations

### Implementation Approach
1. **New service**: `file-browser/services/file-filter.ts` — git ls-files wrapper + cache + glob matching
2. **New component**: `file-browser/components/filter-input.tsx` — search input + sort toggle + hidden toggle
3. **New component**: `file-browser/components/filtered-file-list.tsx` — flat result list (reuse ChangesView rendering pattern)
4. **Hook extension**: Extend `usePanelState` or create `useFileFilter` hook for filter state
5. **URL param**: Add `filter` to `fileBrowserParams` for deep-linkability
6. **Sort state**: 3-state toggle (recent, alpha-asc, alpha-desc) — stored in local state (not URL)

### User Questions Answered
- **Cache or scan?** → **Cache** — populate on first filter, invalidate on file changes
- **Ignore .paths?** → Client-side filter on cached results (path.startsWith('.'))
- **Obey gitignore?** → Default yes (`--exclude-standard`), toggle removes the flag

## Next Steps

Run `/plan-1b-v2-specify` to create the Feature 2 specification in the existing `ux-enhancements-spec.md`.

---

**Research Complete**: 2026-02-26T05:20:00Z
**Report Location**: docs/plans/049-ux-enhancements/research-feature2-filter.md
