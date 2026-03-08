# Exploration Report: 068 — Add File/Folder Features

**Plan**: 068-add-files
**Branch**: `068-add-files`
**Domain**: file-browser (business)
**Date**: 2026-03-07

## Feature Summary

Add file/folder creation, rename, and delete capabilities to the file browser's tree panel:

- **Hover buttons**: When hovering over a folder row, show "New File" and "New Folder" icon buttons (next to existing refresh button)
- **Inline edit mode**: New items appear as editable input fields in the tree; user types a name and presses Enter to confirm, Escape to cancel
- **Rename**: Press Enter on a file (or F2 on Windows) to enter rename mode; also available via right-click context menu
- **Delete**: Right-click context menu option with confirmation
- **Right-click context menu**: Extended with Rename and Delete items for both files and folders

---

## Research Findings

### IA: Implementation Archaeology

| ID | Finding | Detail |
|----|---------|--------|
| IA-01 | **FileTree component** (`file-tree.tsx`, 342 lines) | Pure presentational component. Each tree item wrapped in Radix `<ContextMenu>`. Accepts callback props (`onSelect`, `onExpand`, `onCopy*`). Hover buttons use `group-hover:block` pattern. Already supports `newlyAddedPaths: Set<string>` for green fade-in animation. |
| IA-02 | **Context Menu primitive** (`components/ui/context-menu.tsx`, 251 lines) | Full shadcn/Radix ContextMenu with destructive variant, sub-menus, keyboard nav, disabled state. Already used for clipboard operations on file/folder items. |
| IA-03 | **File Actions service** (`services/file-actions.ts`, 215 lines) | `readFileAction()` and `saveFileAction()` with path security (PathResolver + realpath), atomic write (`.tmp` + rename), mtime conflict detection. Template for CRUD actions. |
| IA-04 | **IFileSystem interface** (`filesystem.interface.ts`, 167 lines) | Complete CRUD: `mkdir`, `writeFile`, `unlink`, `rmdir`, `rename`, `realpath`, `stat`, `exists`. All async, all throw typed `FileSystemError`. |
| IA-05 | **Server actions** (`app/actions/file-actions.ts`, 230+ lines) | 11 existing actions (readFile, saveFile, uploadFile, fetchGitDiff, etc.). Pattern: `requireAuth()` → DI resolve → call service → return Result type. |
| IA-06 | **useClipboard hook** (133 lines) | Callback pattern model: hook returns handler functions, each calls server action + shows toast. Template for `useFileMutations` hook. |
| IA-07 | **useTreeDirectoryChanges hook** (83 lines) | Live file events via FileChangeHub. Tracks `newPaths`, `removedPaths`, `changedDirs`. Already auto-refreshes expanded dirs on changes. CRUD operations will trigger these events automatically. |
| IA-08 | **BrowserClient** (`browser-client.tsx`, 450+ lines) | Orchestrator: composes useFileNavigation, usePanelState, useClipboard, useTreeDirectoryChanges. Passes all callbacks to FileTree. New CRUD handlers wire in here. |
| IA-09 | **Animation system** (`globals.css`) | `tree-entry-new` class with green fade-in (1.5s). `tree-entry-navigated` with slower flash. Extensible for delete (red fade) and rename (yellow flash). |
| IA-10 | **Context menu workshop** (`workshops/file-tree-context-menu.md`) | Design decisions documented: D1 (Radix), D2 (callback pattern), D3 (toast feedback), D4 (recursive API). Proven architecture to extend. |

### DC: Dependency Cartography

| ID | Finding | Detail |
|----|---------|--------|
| DC-01 | **IFileSystem has all CRUD methods** | `writeFile`, `mkdir`, `unlink`, `rmdir`, `rename` — all exist, all implemented in NodeFileSystemAdapter and FakeFileSystem. No interface changes needed. |
| DC-02 | **PathResolver security model** | `resolvePath(base, relative)` prevents traversal. Combined with `realpath()` for symlink escape. Pattern proven in readFile/saveFile. |
| DC-03 | **6 new server actions needed** | createFile, createFolder, deleteFile, deleteFolder, renameFile, renameFolder — follow existing readFile/saveFile pattern exactly. |
| DC-04 | **Atomic write pattern** | `.tmp` file → rename proven in saveFileAction. Reuse for createFile. |
| DC-05 | **Upload service as create template** | `uploadFileService` demonstrates: path validate → mkdir recursive → atomic write. Copy this pattern. |
| DC-06 | **Directory listing service** | Returns `FileEntry{name, type, path}` sorted dirs-first. After CRUD ops, call `handleRefresh(parentDir)` to re-fetch. |

### PS: Patterns & Conventions

| ID | Finding | Detail |
|----|---------|--------|
| PS-01 | **Client state + server action** | Client components use `'use client'`, delegate mutations to `'use server'` actions. Return discriminated unions. |
| PS-02 | **Callback-based props** | FileTree is presentational. Parent (BrowserClient) owns state. Extend with `onCreateFile`, `onCreateFolder`, `onRename`, `onDelete`. |
| PS-03 | **ContextMenu as primary interaction** | Radix ContextMenu wraps each tree item. Add: New File, New Folder (folders only), separator, Rename, Delete (destructive). |
| PS-04 | **Hover buttons via group-hover** | `hidden group-hover:block` + `e.stopPropagation()`. Existing: refresh button. Add: new-file, new-folder buttons on folder rows. |
| PS-05 | **Dialog modal pattern** | PasteUploadModal shows: Dialog + state + async submit. Use for delete confirmation. Inline input preferred for create/rename. |
| PS-06 | **Discriminated union results** | `{ok: true, ...} | {ok: false, error: 'exists'|'security'|'invalid-name'}`. All CRUD actions must follow. |
| PS-07 | **Toast notifications** | sonner library. `toast.loading()` → `toast.success()` / `toast.error()` with ID tracking. |
| PS-08 | **newlyAddedPaths animation** | `Set<string>` prop → `tree-entry-new` CSS class → green fade-in. After create/rename, add path to set. |
| PS-09 | **No existing inline edit** | Must implement: replace tree item text with `<input>`, auto-focus, auto-select, Enter to confirm, Escape to cancel. |
| PS-10 | **Lazy tree expansion** | `childEntries` cache per-directory. After CRUD, refresh only affected directory via `handleRefresh(parentDir)`. |

### DB: Domain & Boundary Analysis

| ID | Finding | Detail |
|----|---------|--------|
| DB-01 | **IFileSystem ready** | All 5 CRUD methods exist. No interface changes needed. |
| DB-02 | **file-browser boundary needs extension** | Currently owns read/write. Must add create/delete/rename to boundary. |
| DB-03 | **New actions in file-browser domain** | `apps/web/app/actions/file-actions.ts` + service layer in `services/`. Follow existing pattern. |
| DB-04 | **Path security mandatory** | Every CRUD action: `resolvePath()` + `realpath()` + `PathSecurityError` catch. |
| DB-05 | **FileChangeHub integration optional** | Events domain already models add/unlink/addDir/unlinkDir. CRUD ops trigger file watcher automatically — no manual event emission needed. |
| DB-06 | **domain.md update required** | Add createFile, createFolder, deleteFile, deleteFolder, renameFile to boundary Owns section and Composition table. |
| DB-07 | **workflow-events NOT affected** | File CRUD is user-facing browser concern, not workflow/agent concern. |
| DB-08 | **No new infra domains** | All DI tokens, adapters, fakes already exist. |

### QT: Quality & Testing

| ID | Finding | Detail |
|----|---------|--------|
| QT-01 | **Discriminated union pattern** | Established in ReadFileResult/SaveFileResult. Copy for CRUD results. |
| QT-02 | **Security test coverage mature** | Path traversal + symlink escape tested. Need 3 security tests per CRUD op. |
| QT-03 | **FakeFileSystem has all CRUD** | `unlink`, `rmdir`, `rename`, `mkdir`, `writeFile` all implemented with proper error codes. Test infra ready. |
| QT-04 | **Contract tests ensure parity** | `filesystem.contract.test.ts` (384 lines) runs identical suites on NodeAdapter + Fake. |
| QT-05 | **Conflict detection extensible** | mtime-based pattern from saveFile. Adapt for rename (destination exists) and delete (file changed since list). |
| QT-08 | **Server action tests are a gap** | Service functions tested; server action wrappers not directly tested. Follow service-test pattern. |

### PL: Prior Learnings

| ID | Finding | Detail |
|----|---------|--------|
| PL-01 | **toast() is client-only** | Server actions return Result; client shows toast. Never call toast in server action. |
| PL-02 | **Biome rejects `as any`** | Use `as unknown as TargetType`. |
| PL-03 | **Semantic HTML required** | Use `<button>` not `<div role="button">`. Biome enforces. |
| PL-04 | **URLSearchParams + spaces** | Spaces encoded as `+` not `%20`. Handle carefully for file paths. |
| PL-11 | **realpath() for symlink safety** | Cross-plan edit already done. Use in all CRUD actions. |
| PL-13 | **Callback pattern proven** | FileTree fires callbacks, BrowserClient implements. Keeps tree presentational. |
| PL-15 | **Context menu is Radix-based** | `components/ui/context-menu.tsx` — accessible, keyboard-navigable, reusable. |

### DE: Documentation & Evolution

| ID | Finding | Detail |
|----|---------|--------|
| DE-01 | **File CRUD was explicitly deferred** | Phase 4 tasks.md lists "❌ File creation/deletion" as non-goal. This plan (068) picks it up. |
| DE-03 | **Security patterns fully proven** | IPathResolver + realpath + workspace jail model. Battle-tested. |
| DE-09 | **IFileSystem already complete** | Correction to DE report: `mkdir`, `rmdir`, `unlink`, `rename` all exist (confirmed by IC-01 and DC-01). No interface changes needed. |

---

## Key Infrastructure Assessment

### Ready to Use (No Changes)

| Component | Location | Status |
|-----------|----------|--------|
| IFileSystem (mkdir, unlink, rmdir, rename, writeFile) | `packages/shared/src/interfaces/filesystem.interface.ts` | ✅ Complete |
| NodeFileSystemAdapter | `packages/shared/src/adapters/node-filesystem.adapter.ts` | ✅ Complete |
| FakeFileSystem (all CRUD methods) | `packages/shared/src/fakes/fake-filesystem.ts` | ✅ Complete |
| IPathResolver + PathResolverAdapter | `packages/shared/src/interfaces/path-resolver.interface.ts` | ✅ Complete |
| Radix ContextMenu primitive | `apps/web/src/components/ui/context-menu.tsx` | ✅ Complete |
| Animation system (tree-entry-new) | `apps/web/app/globals.css` | ✅ Complete |
| useTreeDirectoryChanges (live events) | `apps/web/src/features/041-file-browser/hooks/` | ✅ Complete |
| DI container + tokens | `apps/web/src/lib/bootstrap-singleton.ts` | ✅ Complete |
| Contract tests | `test/contracts/filesystem.contract.ts` | ✅ Complete |

### Needs New Code

| Component | Location | What's Needed |
|-----------|----------|---------------|
| CRUD server actions | `apps/web/app/actions/file-actions.ts` | createFile, createFolder, deleteFile, deleteFolder, renameFile |
| CRUD service functions | `apps/web/src/features/041-file-browser/services/` | Service layer with path validation + error mapping |
| FileTree inline edit mode | `file-tree.tsx` | Input field replacing item text, Enter/Escape/blur handling |
| FileTree hover buttons | `file-tree.tsx` | New File + New Folder icon buttons on folder rows |
| FileTree context menu items | `file-tree.tsx` | Rename, Delete, New File, New Folder menu items |
| useFileMutations hook | `hooks/use-file-mutations.ts` | Hook encapsulating CRUD callbacks with toast + error handling |
| Delete confirmation dialog | `components/` | Simple confirm dialog before delete |
| BrowserClient wiring | `browser-client.tsx` | Thread new callbacks through to FileTree |
| Unit tests | `test/unit/web/features/041-file-browser/` | Service + action tests |
| domain.md update | `docs/domains/file-browser/domain.md` | Boundary + composition table |

---

## Risks & Considerations

1. **Race conditions**: User creates file while another process writes to same path. Mitigate with exists-check + atomic write, but not perfectly safe.
2. **Delete is destructive**: No undo mechanism (git can recover tracked files, but untracked files are gone). Confirmation dialog is essential.
3. **Rename breaks open file**: If the currently-viewed file is renamed, URL state and editor content must update. Handle in BrowserClient.
4. **Long paths / special characters**: File names with spaces, dots, Unicode need testing. Path validation should reject invalid filesystem characters.
5. **Large directory refresh**: After creating many files rapidly, directory listing refresh could be expensive. Debounce or optimistic UI update.
6. **Keyboard shortcut conflicts**: F2 for rename must not conflict with browser or CodeMirror shortcuts. Enter on file selection vs. Enter to confirm rename need clear state gating.

---

## Suggested Architecture

```
User Action (hover button / context menu / F2)
    ↓
FileTree (presentational) → fires callback (onCreateFile, onRename, onDelete)
    ↓
BrowserClient / useFileMutations hook
    ↓
Server Action (createFile, renameFile, deleteFile)
    ↓
Service Layer (path security + IFileSystem call)
    ↓
IFileSystem (mkdir / writeFile / rename / unlink / rmdir)
    ↓
File watcher detects change → FileChangeHub → useTreeDirectoryChanges → auto-refresh
```

**Inline Edit Flow:**
1. User clicks "New File" button on folder → `editingState = {parentDir, type: 'new-file'}`
2. FileTree renders `<input>` at top of folder's children, auto-focused
3. User types name → Enter → `onCreateFile(parentDir, name)` callback
4. Server action creates file → tree auto-refreshes via file watcher events
5. New file highlighted via `newlyAddedPaths` animation

**Rename Flow:**
1. User presses F2 or selects "Rename" from context menu → `editingState = {path, type: 'rename', originalName}`
2. FileTree replaces item text with `<input>` pre-filled with current name, text selected
3. User edits → Enter → `onRename(oldPath, newName)` callback
4. Server action renames → tree auto-refreshes; if renamed file was selected, update URL state

**Delete Flow:**
1. User selects "Delete" from context menu → confirmation dialog
2. User confirms → `onDelete(path, type)` callback
3. Server action deletes → tree auto-refreshes; if deleted file was selected, clear selection
