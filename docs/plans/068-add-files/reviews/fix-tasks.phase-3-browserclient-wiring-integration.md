# Fix Tasks: Phase 3: BrowserClient Wiring & Integration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Preserve dirty editor state across rename of the open file
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx, /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/hooks/use-file-navigation.ts
- **Issue**: The selected-file rename branch uses `setParams()` and assumes that avoids a reload, but the URL-change effect in `use-file-navigation.ts` still re-reads the file and overwrites `editContent`.
- **Fix**: Add a rename-aware path update flow that preserves the current editor buffer when the file is dirty. Only re-read from disk when the file is clean or when an explicit refresh is desired.
- **Patch hint**:
  ```diff
  - if (selectedFile === oldPath) {
  -   setParams({ file: result.newPath, line: null }, { history: 'replace' });
  - } else {
  -   fileNav.handleSelect(result.newPath);
  - }
  + if (selectedFile === oldPath) {
  +   await fileNav.handleRenamedSelection({
  +     oldPath,
  +     newPath: result.newPath,
  +     preserveDirtyBuffer: true,
  +   });
  + } else if (entryType === 'file') {
  +   await fileNav.handleSelect(result.newPath);
  + }
  ```

### FT-002: Do not auto-open renamed folders as though they were files
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
- **Issue**: `handleTreeRename()` treats every successful rename like a file rename. When the renamed item is a folder, it calls `handleSelect()` and pushes a directory path into the file viewer state.
- **Fix**: Pass item type into the rename callback (or derive it from the current tree data) and only call `handleSelect()` for files. For folders, keep the viewer state alone and just refresh/retain expansion state.
- **Patch hint**:
  ```diff
  - const handleTreeRename = useCallback(async (oldPath: string, newName: string) => {
  + const handleTreeRename = useCallback(async (oldPath: string, newName: string, type: 'file' | 'directory') => {
      const result = await mutations.handleRename(oldPath, newName);
      if (result?.ok) {
  -     if (selectedFile === oldPath) {
  +     if (type === 'file' && selectedFile === oldPath) {
            ...
  -     } else {
  +     } else if (type === 'file') {
            await fileNav.handleSelect(result.newPath);
  +     } else {
  +       setExpandPaths((prev) => prev.map((p) => p === oldPath ? result.newPath : p));
        }
      }
    }, [...]);
  ```

### FT-003: Reset root tree state when the active worktree changes
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/068-add-files/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
- **Issue**: `rootEntries` is initialized from `initialEntries` once and never synchronized again. Switching `?worktree=` on the same browser route can therefore leave the old root listing visible.
- **Fix**: Re-sync `rootEntries` whenever `initialEntries` or `worktreePath` changes, and clear any per-worktree transient state (`localNewPaths`, expand requests) at the same time. An alternative is to key `BrowserClientInner` by `worktreePath` so the component remounts cleanly per worktree.
- **Patch hint**:
  ```diff
    const [rootEntries, setRootEntries] = useState(initialEntries);
    const [localNewPaths, setLocalNewPaths] = useState<Set<string>>(new Set());
  + useEffect(() => {
  +   setRootEntries(initialEntries);
  +   setLocalNewPaths(new Set());
  +   setExpandPaths([]);
  + }, [initialEntries, worktreePath]);
  ```

## Medium / Low Fixes

### FT-004: Add explicit verification for Phase 3 browser wiring
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-3-browserclient-wiring-integration/execution.log.md, `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/`
- **Issue**: The execution log shows `just fft`, but there is no direct evidence for the new Phase 3 flows (root create refresh, rename-open-file behavior, delete-selected-file behavior, folder rename/delete behavior, immediate green animation).
- **Fix**: Add a short manual verification checklist/results to the execution log and/or lightweight tests that directly exercise the BrowserClient / `useFileMutations` integration paths.
- **Patch hint**:
  ```diff
   ## Final Evidence
   
   - **`just fft`**: PASS
  +
  +## Manual Verification
  +
  +- Created a file at workspace root -> tree refreshed immediately and file opened in viewer
  +- Renamed the active file with dirty edits -> buffer remained intact and URL changed to new path
  +- Renamed a folder -> tree updated without pushing a folder path into the file viewer
  +- Deleted the active file -> viewer cleared and URL file param was removed
  ```

### FT-005: Bring domain docs back in sync with Phase 3 internals
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md, /Users/jordanknight/substrate/068-add-files/docs/c4/components/file-browser.md
- **Issue**: The Composition table dropped `validateFileName`, and the L3 component diagram still shows the pre-Phase-3 structure.
- **Fix**: Restore the missing composition row and add the mutation orchestration component(s) and relationships to the C4 file.
- **Patch hint**:
  ```diff
   | renameItemService | Rename file/folder + security + destination check | IFileSystem (rename, exists, realpath), IPathResolver, validateFileName |
  +| validateFileName | Git-portable filename validation | None (pure function) |
   | useFileMutations | Hook: CRUD handlers with toast + tree refresh + edge cases | Server actions (createFile, createFolder, deleteItem, renameItem), handleRefreshDir |
  ```
  ```diff
   Container_Boundary(fileBrowser, "File Browser") {
       Component(browserPage, "Browser Page", ...)
       Component(fileTree, "FileTree", ...)
  +    Component(fileMutations, "useFileMutations", "Client Hook", "Calls CRUD server actions,<br/>shows toast feedback,<br/>refreshes tree state")
       ...
   }
  +Rel(browserPage, fileMutations, "Wires CRUD callbacks through")
  +Rel(fileMutations, filesRoute, "Refreshes tree state around")
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Review artifacts and domain docs updated
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
