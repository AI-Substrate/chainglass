# Add File/Folder Features

**Mode**: Full

📚 This specification incorporates findings from exploration.md

## Research Context

The exploration (8 parallel research agents) confirmed:
- **IFileSystem already has all CRUD methods** (`mkdir`, `writeFile`, `unlink`, `rmdir`, `rename`) — implemented in both production adapter and test fake
- **FileTree is a pure presentational component** using callback props and Radix ContextMenu — proven pattern for extending with CRUD operations
- **Live file events (FileChangeHub)** already track add/unlink/addDir/unlinkDir — tree auto-refreshes affected directories
- **Hover button pattern exists** (`group-hover:block`) on folder rows (refresh button) — ready to extend
- **newlyAddedPaths animation** already provides green fade-in for new tree entries
- **File CRUD was explicitly deferred** from Plan 041 Phase 4 as a non-goal — this plan picks it up

## Summary

Users need to create, rename, and delete files and folders directly from the file browser tree panel without leaving the UI or using a terminal. This is a core file management capability that completes the file browser as a practical workspace tool. Today, users can browse and edit files but cannot perform basic file system operations — they must switch to an external tool for something as simple as creating a new file.

## Goals

- **Create files and folders inline**: Hover over a folder to reveal "New File" and "New Folder" icon buttons. Clicking one inserts an editable text input at the top of that folder's children. Type a name, press Enter to create.
- **Rename files and folders**: Press Enter on a selected file (or F2) to enter inline rename mode. The file name becomes an editable input, pre-filled and selected. Press Enter to confirm, Escape to cancel. Also accessible via right-click context menu "Rename" option.
- **Delete files and folders**: Right-click context menu "Delete" option. Shows a confirmation dialog before proceeding. Deleting a folder deletes its contents recursively.
- **Consistent feedback**: All operations show toast notifications (success/error). New items highlight with green fade-in animation. Operations that fail show clear error messages.
- **Keyboard-driven workflow**: Create, rename, and delete are all achievable without the mouse via context menu keyboard navigation, Enter to confirm, Escape to cancel.

## Non-Goals

- **Multi-file operations**: No batch select, batch delete, or batch rename. Single-item operations only.
- **Drag-and-drop move**: Moving files between folders via drag is out of scope.
- **Undo/redo**: No undo for delete operations. Git-tracked files can be recovered via git; untracked files are permanently deleted.
- **File permissions management**: No chmod or ownership changes.
- **File templates**: No template selection when creating new files (always creates empty files).
- **Copy/paste files**: No clipboard-based file duplication between folders.
- **Rename via file viewer panel**: Rename only happens in the tree, not in the viewer header.

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| file-browser | existing | **modify** | New server actions, service functions, FileTree inline edit mode, hover buttons, extended context menu, useFileMutations hook, delete confirmation dialog |
| _platform/file-ops | existing | **consume** | Use IFileSystem (mkdir, writeFile, unlink, rmdir, rename) and IPathResolver — no changes to domain |
| _platform/events | existing | **consume** | FileChangeHub already emits add/unlink/addDir/unlinkDir events from file watcher — tree auto-refresh happens automatically, no changes to domain |

No new domains required. All new code lives within the existing `file-browser` domain boundary.

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=0, D=1, N=1, F=1, T=1
- **Confidence**: 0.85
- **Assumptions**:
  - IFileSystem methods work correctly for all CRUD operations (contract-tested)
  - File watcher (FileChangeHub) reliably detects changes made by server actions
  - Radix ContextMenu supports adding new items without architectural changes
  - Inline input in tree items is achievable without major FileTree restructuring
- **Dependencies**:
  - No external dependencies or blockers. All infrastructure exists.
- **Risks**:
  - Inline edit UX in a virtualized/lazy tree requires careful focus management
  - Rename of currently-viewed file must update URL state and editor content
  - Delete of untracked files is irreversible — confirmation UX must be clear
  - Keyboard shortcut (F2, Enter) conflicts with CodeMirror editor or browser defaults
- **Phases**:
  - Phase 1: Server actions + service layer (create, rename, delete)
  - Phase 2: FileTree UI (inline edit, hover buttons, context menu items, delete dialog)
  - Phase 3: BrowserClient wiring + integration (hook composition, URL state sync, edge cases)

## Acceptance Criteria

1. **Create file via hover button**: Hovering over any folder row (including the root directory) reveals a "New File" icon button. Clicking it shows an inline text input at the top of that folder's children. Typing a name and pressing Enter creates the file. The new file appears in the tree with a green fade-in animation.

2. **Create folder via hover button**: Hovering over a folder row reveals a "New Folder" icon button (alongside "New File" and the existing refresh button). Clicking it shows an inline text input. Typing a name and pressing Enter creates the folder.

3. **Cancel creation with Escape**: While in inline create mode, pressing Escape removes the input field without creating anything.

4. **Rename via Enter key**: Selecting a file in the tree and pressing Enter (or F2) converts the file name into an editable input, pre-filled with the current name and fully selected. Pressing Enter confirms the rename. Pressing Escape cancels.

5. **Rename via context menu**: Right-clicking a file or folder shows a "Rename" option in the context menu. Selecting it enters inline rename mode for that item.

6. **Delete via context menu**: Right-clicking a file or folder shows a "Delete" option (styled as destructive/red). Selecting it shows a confirmation dialog stating the file/folder name. Confirming deletes the item.

7. **Delete folder recursively**: Deleting a folder that contains files/subfolders deletes everything inside it. The confirmation dialog indicates this is a recursive operation.

8. **Path security enforced**: All operations validate paths via IPathResolver and realpath — directory traversal attacks and symlink escapes are rejected with a security error.

9. **Duplicate name handling**: Creating a file/folder with a name that already exists in that directory shows an error toast ("already exists") without overwriting.

10. **Rename updates open file**: If the currently-viewed file is renamed, the viewer panel updates to show the new path. URL state reflects the new file path.

11. **Delete clears selection**: If the currently-viewed file is deleted, the viewer panel clears (shows empty state). URL state is updated to remove the file parameter.

12. **Toast feedback on all operations**: Create shows "Created: filename". Rename shows "Renamed: old → new". Delete shows "Deleted: filename". Errors show specific messages ("File already exists", "Permission denied", etc.).

13. **Invalid name rejection**: Names containing path separators (`/`, `\`), null bytes, or git-portable reserved characters (`:`, `*`, `?`, `"`, `<`, `>`, `|`) are rejected client-side before hitting the server. Empty names are rejected.

## Risks & Assumptions

- **Assumption**: File watcher events arrive within ~200ms of server action completion (debounce window in useTreeDirectoryChanges). If slower, there may be a brief inconsistency before auto-refresh.
- **Assumption**: The existing `group-hover:block` CSS pattern accommodates 3 buttons (refresh + new file + new folder) without layout overflow on narrow sidebar widths.
- **Risk**: Inline `<input>` focus management in a tree with keyboard navigation may have edge cases (focus trapping, Tab behavior, screen reader announcements).
- **Risk**: Renaming a file that's open in another browser tab could cause stale state. This is single-tab scope — no cross-tab sync.
- **Risk**: Deleting a large folder tree could be slow. No progress indicator is planned — just a loading toast.
- **Assumption**: The confirmation dialog for delete is sufficient UX — no "move to trash" semantics. Files are permanently deleted from disk.

## Open Questions

All resolved — see Clarifications below.

## Testing Strategy

- **Approach**: Hybrid — TDD for service layer, lightweight for UI
- **Rationale**: Service functions (create, rename, delete) have security-critical path validation and error handling that benefit from TDD. UI components (inline edit, context menu) are better verified manually in the browser with lightweight smoke tests.
- **Focus Areas**:
  - Service layer: path security (traversal, symlink escape), duplicate name detection, error code mapping, atomic operations
  - Server actions: auth check, DI wiring, result type correctness
  - UI: inline edit focus/blur/Enter/Escape behavior (lightweight)
- **Excluded**: E2E browser automation, cross-tab scenarios, performance benchmarks
- **Mock Policy**: Avoid mocks entirely — use FakeFileSystem and FakePathResolver (contract-tested fakes with production parity)

## Documentation Strategy

- **Location**: domain.md update only
- **Rationale**: No user-facing documentation needed. Update file-browser domain.md boundary/composition to include CRUD operations. No new guides or README sections.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Inline Edit State Machine | State Machine | The inline edit input has multiple states (idle → creating → editing name → confirming → error → idle, plus rename variant). Clear state transitions prevent bugs like double-submit, stale focus, or orphaned inputs. | What triggers each transition? How does focus flow? What happens on blur (commit or cancel)? How does this interact with tree keyboard navigation? |

## Clarifications

### Session 2026-03-07

**Q1: Workflow Mode** → **Full**. CS-3 feature with 3 phases — all gates required.

**Q2: Testing Strategy** → **Hybrid**. TDD for service layer (security, error handling), lightweight for UI components.

**Q3: Mock Policy** → **Avoid mocks**. Use FakeFileSystem and FakePathResolver (contract-tested fakes), not mock objects.

**Q4: Documentation Strategy** → **No new docs**. Update file-browser domain.md boundary only.

**Q5: Domain Review** → **Confirmed**. file-browser (modify), _platform/file-ops (consume), _platform/events (consume). No new domains. No contract-breaking changes.

**Q6: Harness Readiness** → **Continue without harness**. Service tests + manual browser verification is sufficient. No Phase 0 needed.

**Q7: Root-level creation** → **Yes**. Root directory (workspace root) also shows "New File" and "New Folder" hover buttons. Creating files at the workspace root is a common operation (README.md, .gitignore, etc.).

**Q8: Name validation rules** → **Git-portable**. Reject: `/`, `\`, null bytes, `:`, `*`, `?`, `"`, `<`, `>`, `|`. Prevents issues when files are cloned to Windows via git. Validation runs client-side before server action call.
