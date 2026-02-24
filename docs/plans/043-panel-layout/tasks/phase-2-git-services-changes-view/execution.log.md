# Phase 2: Git Services + Changes View — Execution Log

**Started**: 2026-02-24
**Status**: COMPLETE

---

## T001-T002: getWorkingChanges
- Parser function `parsePorcelainOutput` exported separately for testability
- 10 tests: M staged, M unstaged, A staged, D unstaged, ?? untracked, R rename, MM both, multiple lines, empty, unparseable
- `--ignore-submodules` flag in git command (DYK-P2-01)
- MM emits two entries (staged + unstaged for same file)
- All 10 pass

## T003-T004: getRecentFiles
- Parser function `parseGitLogOutput` exported separately for testability
- 4 tests: unique paths, limit, empty, order preservation
- Scans 3x limit commits to get enough unique files (DYK-P2-03)
- `--no-merges` and `--diff-filter=AMCR` flags
- All 4 pass

## T005: Server actions
- `fetchWorkingChanges`: dynamic import wrapper
- `fetchRecentFiles`: dynamic import wrapper with limit param
- `fileExists`: uses IPathResolver security check + IFileSystem.stat() + realpath symlink validation

## T006-T007: ChangesView
- 7 tests: badges, file paths, dedup, clean state, click, selection indicator, empty recent hidden
- Two sections: Working Changes (with badges) + Recent (muted, deduplicated)
- Status badges: M=amber, A=green, D=red, ?=muted, R=blue
- File path split: muted dir + bold filename
- Selection: ▶ amber indicator + bg-accent (same as FileTree)
- All 7 pass

## DYK-P2-02: Directory listing switch
- Changed `listDirectory` to always use `readDir` instead of `git ls-files`
- Shows all files including gitignored ones
- Git-based listing only used for changes view

## Evidence
- 21 new tests across 3 files, all passing
- Command: `pnpm vitest run test/unit/web/features/041-file-browser/working-changes.test.ts test/unit/web/features/041-file-browser/recent-files.test.ts test/unit/web/features/041-file-browser/changes-view.test.tsx`
- Result: Test Files 3 passed (3), Tests 21 passed (21)
- Feature-wide: `pnpm vitest run test/unit/web/features/041-file-browser/ test/unit/web/features/_platform/` → 20 files, 142 tests, 0 failures
- AC-22 (context menu parity): Deferred to Phase 3 — ChangesView uses callback props, context menu wrapping added during BrowserClient wiring
