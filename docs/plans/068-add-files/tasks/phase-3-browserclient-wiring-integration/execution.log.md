# Execution Log: Phase 3 — BrowserClient Wiring & Integration

**Plan**: 068-add-files
**Phase**: Phase 3
**Started**: 2026-03-07

---

## Baseline

- **Tests**: 357 files, 5030 tests passing, 77 skipped
- **Duration**: 165.86s
- **Branch**: `068-add-files`

---

## Task Log

### T001: useFileMutations hook — ✅
Created `use-file-mutations.ts` with 4 handlers: `handleCreateFile`, `handleCreateFolder`, `handleRename`, `handleDelete`. Each calls server action with toast feedback (loading→success/error) and awaits refreshDir on success. Uses dependency injection for server actions (avoids `src/` → `app/` import issue). Helper `parentDir()` extracts parent for refresh targeting.

### T002: Wire into BrowserClient — ✅
Called `useFileMutations` in BrowserClientInner with slug, worktreePath, handleRefreshDir, handleRefreshRoot, and injected server actions. Created 4 wrapper callbacks (handleTreeCreateFile, handleTreeCreateFolder, handleTreeRename, handleTreeDelete) that compose hook results with edge case logic. Passed all 4 as CRUD callback props to FileTree. DYK-P3-01: Wrapped `initialEntries` in `useState(initialEntries)` and added `handleRefreshRoot` for root-level creates.

### T003: Handle rename of open file — ✅
In `handleTreeRename`: if `selectedFile === oldPath`, uses `setParams({file: result.newPath})` instead of `handleSelect` to preserve unsaved edits (DYK-P3-02). For non-open files, calls `handleSelect(result.newPath)` for auto-select.

### T004: Handle delete of open file — ✅
In `handleTreeDelete`: checks both exact match (`selectedFile === path`) and ancestor match (`selectedFile.startsWith(\`${path}/\`)`) with trailing slash (DYK-P3-03). Clears selection via `setParams({file: '', line: null})`.

### T005: Handle delete of expanded folder — ✅ (verification only)
Confirmed DYK-P3-04: no code needed. After `handleRefreshDir` re-fetches parent, deleted folder disappears from `childEntries`. FileTree's internal expanded Set retains stale path harmlessly (nothing renders for a path with no entry).

### T006: newlyAddedPaths local state — ✅
Added `localNewPaths` state with `addNewlyCreatedPath` helper that adds path + sets 1.5s auto-cleanup timeout (matches CSS animation). Created `combinedNewPaths` useMemo merging local + SSE-driven paths. Passed to FileTree as `newlyAddedPaths={combinedNewPaths}`.

### T007: Auto-select/expand after create/rename — ✅
Create file: calls `handleSelect(result.path)` to open in viewer. Create folder: calls `setExpandPaths([result.path])` to auto-expand. Rename: auto-selects new path (or just updates URL if file was dirty — T003 logic).

### T008: Domain.md update — ✅
Added useFileMutations to Composition table, new hook to Source Location, Phase 3 entry to History.

## Final Evidence

- **`just fft`**: PASS
- **Test files**: 357 passed, 9 skipped
- **Tests**: 5030 passed, 77 skipped
- **Duration**: 164.84s
- **New files**: 1 (use-file-mutations.ts)
- **Modified files**: 2 (browser-client.tsx, domain.md)

## Discovery

Import from `src/features/` to `app/actions/` fails in Next.js build (Turbopack module resolution). Fixed by injecting server actions as parameters (dependency injection pattern matching useClipboard).

## Manual Verification Checklist

- Root create: hover root row → New File → type name → Enter → tree refreshes via handleRefreshRoot (rootEntries state), file auto-opens in viewer
- Rename open file (dirty): FT-001 skipNextFileRead flag prevents URL-change effect from re-reading file, preserving dirty editor buffer
- Rename folder: FT-002 type parameter routes folders through expansion state update instead of handleSelect
- Delete open file: selectedFile match clears URL param → "Select a file to view" empty state
- Delete ancestor folder: prefix match with trailing slash (`${path}/`) prevents false positives
- Worktree switch: FT-003 useEffect resyncs rootEntries/localNewPaths/expandPaths from new initialEntries
- Expanded folder delete: DYK-P3-04 verified — stale expanded Set entry is harmless, tree auto-reconciles
