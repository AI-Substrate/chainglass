# Fix Tasks: Phase 3 — UI Wiring

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Fix diff-mode banner suppression
- **Severity**: HIGH
- **Finding**: F001
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- **Issue**: `externallyChanged={externallyChanged && isDirty}` gates the banner on dirty edits. In diff mode with clean edits, `isDirty` is false so the banner never shows — the user sees a stale diff with no indication.
- **Fix**: Include diff mode in the banner condition.
- **Patch hint**:
  ```diff
  -                externallyChanged={externallyChanged && isDirty}
  +                externallyChanged={externallyChanged && (isDirty || mode === 'diff')}
  ```

### FT-002: Create useTreeDirectoryChanges unit test
- **Severity**: HIGH
- **Finding**: F002
- **File(s)**: `/home/jak/substrate/041-file-browser/test/unit/web/features/045-live-file-events/use-tree-directory-changes.test.tsx`
- **Issue**: T001 specified a unit test with FakeFileChangeHub. No test file was created.
- **Fix**: Create test covering:
  1. File added in expanded dir → changedDirs includes that dir
  2. File added in non-expanded dir → changedDirs does NOT include it
  3. Direct children only — nested path not matching
  4. newPaths set contains 'add'/'addDir' events
  5. removedPaths set contains 'unlink'/'unlinkDir' events
  6. clearAll resets changes

### FT-003: Add FileTree newlyAddedPaths test
- **Severity**: HIGH
- **Finding**: F003
- **File(s)**: `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-tree.test.tsx`
- **Issue**: T002/T007 specified a test verifying `tree-entry-new` CSS class. No test was added.
- **Fix**: Add test case:
  - Render FileTree with `newlyAddedPaths={new Set(['README.md'])}`
  - Assert `tree-entry-new` class is present on that entry
  - Assert `tree-entry-new` class is NOT present on other entries

### FT-004: Add FileViewerPanel externallyChanged tests
- **Severity**: HIGH
- **Finding**: F004
- **File(s)**: `/home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/file-viewer-panel.test.tsx`
- **Issue**: T003/T007 specified banner tests. No tests were added.
- **Fix**: Add test cases:
  1. `externallyChanged=true` + `mode='edit'` + `editContent='x'` → blue banner with "modified outside" text + Refresh button
  2. `externallyChanged=true` + `mode='diff'` → blue banner with "outdated" text + Refresh button
  3. `externallyChanged=true` + `mode='preview'` → NO banner (auto-refreshed)
  4. Refresh button click → calls `onRefresh`

### FT-005: Update file-browser domain.md for Plan 045
- **Severity**: HIGH
- **Finding**: F005, F009, F010, F013
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/file-browser/domain.md`
- **Issue**: domain.md not updated for Plan 045 Phase 3 changes.
- **Fix**: Update four sections:
  1. **§ History**: Append `| Plan 045 Phase 3 | useTreeDirectoryChanges hook, FileChangeProvider wiring in BrowserClient, FileTree forwardRef for expanded-dir exposure, externallyChanged banner in FileViewerPanel | 2026-02-24 |`
  2. **§ Dependencies**: Add `_platform/events` — FileChangeProvider, useFileChanges, FileChange type
  3. **§ Composition**: Add `useTreeDirectoryChanges` — filters file changes to expanded dirs
  4. **§ Source Location**: Add `apps/web/src/features/041-file-browser/hooks/use-tree-directory-changes.ts`

## Medium Fixes

### FT-006: Fix expandedDirs stale ref during render
- **Severity**: MEDIUM
- **Finding**: F006
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- **Issue**: `treeRef.current?.getExpandedDirs() ?? []` during render creates a new array every render, defeating useMemo in useTreeDirectoryChanges. Also returns `[]` on first render before ref is attached.
- **Fix**: Either:
  - (A) Add `onExpandedDirsChange` callback prop to FileTree that pushes stable state via setState, OR
  - (B) Wrap expandedDirs in useMemo with JSON.stringify comparison key

### FT-007: Fix suppression timer overlap
- **Severity**: MEDIUM
- **Finding**: F007
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- **Issue**: Concurrent saves create independent timers. The first timer firing removes the path while the second window should still be active.
- **Fix**: Use `Map<string, ReturnType<typeof setTimeout>>` instead of `Set<string>`. Clear previous timer before setting new one. Clean up all timers on unmount.
- **Patch hint**:
  ```diff
  - const suppressedPathsRef = useRef<Set<string>>(new Set());
  + const suppressedTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  ```

### FT-008: Document biome-ignore suppression stability
- **Severity**: MEDIUM
- **Finding**: F008
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx`
- **Issue**: Three biome-ignore suppressions don't document which deps are omitted or why they're stable.
- **Fix**: Add inline comments after each biome-ignore listing the omitted deps and confirming they're stable useCallback references.

## Low Fixes (Optional)

### FT-009: Use CSS custom property for animation color
- **Severity**: LOW
- **Finding**: F015
- **File(s)**: `/home/jak/substrate/041-file-browser/apps/web/app/globals.css`
- **Issue**: Hardcoded `rgba(34, 197, 94, 0.2)` bypasses dark mode tuning.
- **Fix**: Define `--tree-entry-highlight` in `:root` and `.dark` blocks.

### FT-010: Update domain-map.md events node label
- **Severity**: LOW
- **Finding**: F014
- **File(s)**: `/home/jak/substrate/041-file-browser/docs/domains/domain-map.md`
- **Issue**: Events node label omits FileChangeProvider.
- **Fix**: Add FileChangeProvider to the events node label.

## Re-Review Checklist

- [ ] FT-001 applied (diff-mode banner fix)
- [ ] FT-002 applied (useTreeDirectoryChanges test created)
- [ ] FT-003 applied (FileTree newlyAddedPaths test added)
- [ ] FT-004 applied (FileViewerPanel externallyChanged tests added)
- [ ] FT-005 applied (domain.md updated)
- [ ] All tests pass (`just fft`)
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
