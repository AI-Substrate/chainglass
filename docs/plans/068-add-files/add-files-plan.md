# Add File/Folder Features — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-03-07
**Spec**: [add-files-spec.md](./add-files-spec.md)
**Exploration**: [exploration.md](./exploration.md)
**Status**: COMPLETE

## Summary

Users cannot create, rename, or delete files in the file browser — they must switch to an external tool. This plan adds inline file/folder CRUD to the tree panel: hover buttons for create, Enter/F2 for rename, context menu for rename and delete. The approach is layered — service functions (TDD) first, then FileTree UI extensions, then BrowserClient wiring with edge case handling. All infrastructure exists (IFileSystem CRUD methods, FakeFileSystem, Radix ContextMenu, FileChangeHub auto-refresh). No new domains required.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| file-browser | existing | **modify** | New server actions, service functions, FileTree inline edit, hover buttons, context menu, useFileMutations hook, delete dialog |
| _platform/file-ops | existing | **consume** | IFileSystem (mkdir, writeFile, unlink, rmdir, rename) + IPathResolver — no changes |
| _platform/events | existing | **consume** | FileChangeHub auto-refresh on add/unlink/addDir/unlinkDir — no changes |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `apps/web/src/features/041-file-browser/services/file-mutation-actions.ts` | file-browser | internal | Service layer for create/rename/delete with path security |
| `apps/web/src/features/041-file-browser/lib/validate-filename.ts` | file-browser | internal | Git-portable file name validation utility |
| `apps/web/app/actions/file-actions.ts` | file-browser | internal | Extended with 5 new server actions |
| `test/unit/web/features/041-file-browser/file-mutation-actions.test.ts` | file-browser | internal | TDD tests for service layer |
| `test/unit/web/features/041-file-browser/validate-filename.test.ts` | file-browser | internal | TDD tests for name validation |
| `test/unit/web/features/041-file-browser/inline-edit-input.test.ts` | file-browser | internal | Lightweight smoke tests for InlineEditInput |
| `apps/web/src/features/041-file-browser/components/file-tree.tsx` | file-browser | internal | Extended with inline edit, hover buttons, context menu items |
| `apps/web/src/features/041-file-browser/components/inline-edit-input.tsx` | file-browser | internal | Reusable inline edit input component |
| `apps/web/src/features/041-file-browser/components/delete-confirmation-dialog.tsx` | file-browser | internal | Delete confirmation dialog component |
| `apps/web/src/features/041-file-browser/hooks/use-file-mutations.ts` | file-browser | internal | Hook encapsulating CRUD callbacks with toast feedback |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | file-browser | internal | Extended with useFileMutations wiring + edge case handling |
| `docs/domains/file-browser/domain.md` | file-browser | contract | Updated boundary/composition for CRUD operations |

## Harness Strategy

Harness: Not applicable (user override — service tests + manual browser verification is sufficient for this feature).

## Constitution Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| P1: Clean Architecture | ✅ Compliant | Services depend on IFileSystem/IPathResolver interfaces only |
| P2: Interface-First | ✅ Compliant | Consuming existing IFileSystem interface; no new interfaces needed |
| P3: TDD | ⚠️ Partial deviation | Hybrid TDD: full TDD for services, lightweight for UI components |
| P4: Fakes Over Mocks | ✅ Compliant | FakeFileSystem + FakePathResolver only, no mocking libraries |
| P5: Fast Feedback | ✅ Compliant | Service tests run in <2s |

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| P3: TDD (UI layer) | UI components (inline edit, context menu) are interaction-heavy and better verified manually in browser. TDD for React tree rendering yields brittle tests. | Full TDD for all layers — rejected because focus/blur/keyboard tests are fragile and slow. | Service layer is fully TDD (security-critical). UI is manually verified + lightweight smoke tests. |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | No file name validation utility exists | Build `validate-filename.ts` in Phase 1 before server actions |
| 02 | Critical | Enter key on tree item buttons fires onClick (select), conflicting with rename mode | Phase 2: unmount button and render only `<input>` when in edit mode — clean state machine |
| 03 | Critical | No inline edit pattern exists in codebase | Phase 2: build InlineEditInput component with focus management |
| 04 | High | File watcher SSE event may lag ~200ms behind server action completion | Phase 3: immediate `handleRefreshDir()` after successful action; SSE as fallback for external changes |
| 05 | High | Rename of currently-viewed file must sync URL state, editor content, and mtime | Phase 3: detect selectedFile match, call handleSelect(newPath), clear dirty state |
| 06 | High | rmdir recursive has no file count limit — could delete 10k+ files silently | Phase 1: add stat-based size check in service; Phase 2: show item count in delete confirmation |
| 07 | High | Focus management for inline input needs explicit handling (auto-focus, restore on escape/blur) | Phase 2: InlineEditInput manages own focus lifecycle with refs |

## Testing Approach

- **Service layer**: Full TDD — red/green/refactor for all service functions and name validation
- **Server actions**: Lightweight wiring tests verifying auth + DI + delegation
- **UI components**: Manual browser verification + lightweight smoke tests for InlineEditInput
- **Fakes**: FakeFileSystem and FakePathResolver (contract-tested, no mocks)

---

## Phases

### Phase 1: Service Layer & Server Actions

**Objective**: Build the backend CRUD operations with TDD, including file name validation and path security.
**Domain**: file-browser
**Delivers**:
- Git-portable file name validation utility with tests
- 5 service functions (createFile, createFolder, deleteItem, renameItem) with path security, duplicate detection, error mapping
- 4 server actions wired to service layer with requireAuth + DI
- Full unit test coverage for services

**Depends on**: None
**Key risks**: None — all IFileSystem methods are contract-tested and proven.

Task ordering follows TDD: types → tests → implementations → wiring.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Define result types for CRUD operations | file-browser | CreateResult, DeleteResult, RenameResult types exported from service file. Discriminated unions with typed error codes. DeleteResult includes `'too-large'` error with `itemCount` for server-side safety rejection. | Types first — tests and implementations depend on these. |
| 1.2 | Create `validate-filename.test.ts` — TDD tests (RED) | file-browser | All invalid chars rejected (/ \ null : * ? " < > \|). Edge cases: `.`, `..`, trailing spaces, leading dots, empty string. Tests fail (RED). All tests include Test Doc (Why/Contract/Usage Notes/Quality Contribution/Worked Example). |  |
| 1.3 | Create `validate-filename.ts` — git-portable validation (GREEN) | file-browser | Rejects all invalid chars. Returns discriminated union `{ok} \| {ok: false, error, char}`. All tests pass (GREEN). | Per finding 01. Shared between client + server. |
| 1.4 | Create `file-mutation-actions.test.ts` — TDD test suite (RED) | file-browser | Happy path + security (traversal, symlink) + error cases (exists, not-found, permission) for createFile, createFolder, deleteItem, renameItem. Uses FakeFileSystem + FakePathResolver. Tests fail (RED). All tests include Test Doc format. | Target: 15-20 test cases |
| 1.5 | Implement createFileService + createFolderService (GREEN) | file-browser | Creates empty file or directory at path. Returns `{ok, path}`. Rejects duplicates with `'exists'` error. Path security validated via realpath on PARENT directory (target doesn't exist yet). Relevant tests pass (GREEN). | Uses IFileSystem.writeFile/mkdir + IPathResolver.resolvePath. DYK-01: realpath parent dir, not target. |
| 1.6 | Implement deleteItemService (GREEN) | file-browser | Deletes file (unlink) or folder (rmdir recursive). Returns `{ok}`. Path security validated. Server-side safety: quick `readDir` count rejects folders with >5000 direct children, returning `{ok: false, error: 'too-large', itemCount}`. Relevant tests pass (GREEN). | Per finding 06. VS Code-style: UI shows "Delete 'name' and all its contents?" — count only surfaces on error. |
| 1.7 | Implement renameItemService (GREEN) | file-browser | Renames file or folder. Returns `{ok, oldPath, newPath}`. Rejects if destination exists. Path security on both old and new paths. Relevant tests pass (GREEN). | Uses IFileSystem.rename. DYK-04: return both oldPath and newPath so consumers can detect if the renamed file was the active selection. |
| 1.8 | Refactor service layer (REFACTOR) | file-browser | All 15-20 tests green. Extract shared path-validation helper if duplicated. Clean up error mapping. | TDD refactor step. |
| 1.9 | Add server actions to `app/actions/file-actions.ts` | file-browser | 4 new exports: createFile, createFolder, deleteItem, renameItem. Each: requireAuth → DI resolve → call service → return result. | DYK-02: dropped getDirectoryItemCount — VS Code-style dialog, server-side safety limit returns count only on rejection. |

### Phase 2: FileTree UI Extensions

**Objective**: Add inline edit mode, hover action buttons, extended context menu items, and delete confirmation dialog to the tree.
**Domain**: file-browser
**Delivers**:
- InlineEditInput component with focus management
- Hover buttons (New File, New Folder) on folder rows including root
- Context menu Rename and Delete items on files and folders
- DeleteConfirmationDialog component
- FileTree extended with inline edit state management

**Depends on**: Phase 1 (server actions must exist for wiring)
**Key risks**: Enter key conflict (finding 02), focus management (finding 03, 07). Mitigated by unmounting button in edit mode and explicit focus lifecycle in InlineEditInput.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Create `inline-edit-input.tsx` — reusable inline edit component | file-browser | Auto-focuses on mount. Enter confirms, Escape cancels. Blur commits (configurable). Validates name via validateFileName. Shows inline error for invalid names. Restores focus to caller on unmount. | Per findings 02, 03, 07. Extracted component for reuse in create + rename. |
| 2.2 | Add hover buttons to folder rows in FileTree | file-browser | "New File" (FilePlus icon) and "New Folder" (FolderPlus icon) appear on hover next to refresh button. Buttons use `group-hover:block` pattern. `e.stopPropagation()` prevents folder toggle. Root directory also gets buttons. | Follows existing refresh button pattern (PS-04). |
| 2.3 | Add inline create mode to FileTree | file-browser | Clicking "New File" or "New Folder" button inserts InlineEditInput at top of folder's children. Enter creates item via callback. Escape removes input. Only one edit input active at a time. | State: `{mode: 'create-file'|'create-folder', parentDir: string}` |
| 2.4 | Add inline rename mode to FileTree | file-browser | Selecting "Rename" from context menu or pressing F2 replaces item text with InlineEditInput pre-filled with current name (text selected). Enter confirms rename via callback. Escape cancels and restores original text. | Per finding 02: unmount button, render only input in edit mode. |
| 2.5 | Add Rename and Delete to file context menu | file-browser | File context menu gains: separator, "Rename" item, "Delete" item (destructive variant). Folder context menu gains: "New File", "New Folder", separator, "Rename", "Delete" (destructive). | Uses existing ContextMenuItem + destructive variant. |
| 2.6 | Create `delete-confirmation-dialog.tsx` | file-browser | VS Code-style dialog: "Delete 'name' and all its contents?" for folders, "Delete 'name'?" for files. Confirm button is destructive (red). Cancel closes dialog. If server returns `'too-large'` error, show "Folder has too many items (N) to delete from the browser." | Follows WorkspaceRemoveButton pattern. No pre-flight count fetch. |
| 2.7 | Add F2 and Enter keyboard shortcuts to FileTree | file-browser | F2 on focused tree item enters rename mode. Enter on focused tree item enters rename mode (when not already in edit mode). Both only fire when FileTree panel has focus (not CodeMirror). | Gate: only when tree has focus, not when editor or search is focused. |
| 2.8 | Extend FileTree props for CRUD callbacks | file-browser | New optional props: `onCreateFile`, `onCreateFolder`, `onRename`, `onDelete`. All accept path-based arguments. Inline edit state managed internally. | Follows callback pattern (PS-02). |
| 2.9 | Lightweight smoke tests for InlineEditInput | file-browser | 3-5 test cases: mount + auto-focus, Enter commits value, Escape cancels, invalid name shows error, blur behavior. Uses React Testing Library. | Per spec Testing Strategy: lightweight for UI. |

### Phase 3: BrowserClient Wiring & Integration

**Objective**: Wire CRUD operations end-to-end through useFileMutations hook, handle edge cases (rename open file, delete selected file), and update domain documentation.
**Domain**: file-browser
**Delivers**:
- useFileMutations hook with toast feedback
- BrowserClient wired with all CRUD callbacks
- Edge case handling: rename open file (URL sync), delete selected file (clear selection)
- Immediate tree refresh after mutations (not waiting for SSE)
- Updated file-browser domain.md

**Depends on**: Phase 1, Phase 2
**Key risks**: Rename of viewed file must sync URL + editor + mtime (finding 05). File watcher timing gap (finding 04). Mitigated by immediate refresh + selected file detection.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create `use-file-mutations.ts` hook | file-browser | Returns handlers: handleCreateFile, handleCreateFolder, handleRename, handleDelete. Each calls server action, shows toast (loading→success/error), calls handleRefreshDir on success. | Follows useClipboard pattern (IA-06). |
| 3.2 | Wire useFileMutations into BrowserClient | file-browser | BrowserClient passes CRUD callbacks to FileTree. Callbacks trigger server actions via hook. Tree refreshes immediately after success (not waiting for SSE). | Per finding 04: immediate refresh. |
| 3.3 | Handle rename of currently-viewed file | file-browser | If renamed file matches selectedFile: update URL params to new path, re-fetch file content, clear dirty state. If file has unsaved changes, show warning toast and block rename. | Per finding 05. Return newPath from renameItem. |
| 3.4 | Handle delete of currently-viewed file | file-browser | If deleted file matches selectedFile: clear file URL param, show empty viewer state. If deleted folder contains selectedFile: same behavior. | Per AC-11. |
| 3.5 | Handle delete of expanded folder | file-browser | If deleted folder is in expandedDirs: remove from expanded set. Clean up childEntries cache for deleted directory and descendants. | Prevents stale state in tree. |
| 3.6 | Add newly created items to newlyAddedPaths | file-browser | After successful create, add new path to a local `newlyAddedPaths` set for green fade-in animation. Clear after animation completes (1.5s timeout). | Reuses existing animation system (IA-09). |
| 3.7 | Auto-select and auto-expand after create | file-browser | After creating a file: auto-select it (opens in viewer). After creating a folder: auto-expand it. After rename: auto-select new path. | UX polish for seamless workflow. |
| 3.8 | Update file-browser domain.md | file-browser | Add CRUD operations to Boundary Owns, Composition table, Source Location table, and History. | Per documentation strategy. |

---

## Acceptance Criteria

- [x] AC-01: Hover over folder → "New File" button → inline input → Enter → file created with green fade-in
- [x] AC-02: Hover over folder → "New Folder" button → inline input → Enter → folder created
- [x] AC-03: Escape during inline create → input removed, nothing created
- [x] AC-04: Enter or F2 on selected file → inline rename input (pre-filled, selected) → Enter confirms
- [x] AC-05: Right-click → Rename → inline rename mode
- [x] AC-06: Right-click → Delete → confirmation dialog → confirm → item deleted
- [x] AC-07: Delete folder recursively, confirmation shows it's recursive
- [x] AC-08: Path traversal and symlink escape rejected with security error
- [x] AC-09: Duplicate name shows "already exists" error toast
- [x] AC-10: Rename currently-viewed file updates viewer and URL
- [x] AC-11: Delete currently-viewed file clears viewer and URL
- [x] AC-12: Toast feedback on all operations (create/rename/delete, success/error)
- [x] AC-13: Invalid names (git-portable chars) rejected client-side

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Enter key conflict between select and rename | High | High | Unmount button in edit mode; gate Enter based on edit state |
| Focus lost after inline edit completes | Medium | Medium | InlineEditInput restores focus to tree item on unmount |
| File watcher SSE lags behind server action | Medium | Low | Immediate handleRefreshDir after success; SSE as fallback |
| Rename of open file with unsaved changes | Medium | High | Block rename if dirty; show "save first" toast |
| Large folder delete blocks server | Low | Medium | Stat-based pre-check; item count in confirmation dialog |
| F2 intercepted by browser or CodeMirror | Low | Low | Gate F2 to tree-focused state only; test across browsers |
