# Fix Tasks: Phase 2: FileTree UI Extensions

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Restrict keyboard rename shortcuts to actual tree items
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx
- **Issue**: `handleTreeKeyDown()` resolves rename targets by climbing to any ancestor with `data-tree-path`, so pressing Enter on a focused hover action button can incorrectly open rename mode for the containing item.
- **Fix**: Mark the primary tree-item trigger separately (for example `data-tree-item-trigger="true"`) and ignore action buttons/controls (for example `data-tree-action="true"`). Only start rename when the focused element is the tree item itself.
- **Patch hint**:
  ```diff
  - const treeItem = target.closest('[data-tree-path]');
  - if (!treeItem) return;
  + if (target.closest('[data-tree-action="true"]')) return;
  + const treeItem = target.closest('[data-tree-item-trigger="true"]');
  + if (!treeItem) return;
  ```

### FT-002: Add direct evidence for the Phase 2 CRUD flows
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/execution.log.md
- **Issue**: The current evidence only covers `InlineEditInput`; it does not directly verify hover create, context-menu rename/delete, keyboard rename, delete dialog behavior, or root-row create.
- **Fix**: Add lightweight RTL coverage for `FileTree` and `DeleteConfirmationDialog`, then record manual verification steps with observed outcomes for the critical UI flows that remain browser-driven.
- **Patch hint**:
  ```diff
  + describe('FileTree CRUD UI', () => {
  +   it('starts rename from Enter/F2 on the focused tree item', () => { /* ... */ });
  +   it('opens delete confirmation from the context menu and dispatches onDelete', () => { /* ... */ });
  +   it('starts root-level create from the root row controls', () => { /* ... */ });
  + });
  +
  + ## Manual Verification
  + - Hovered a folder row, clicked New File, entered `notes.md`, observed inline row removal and callback dispatch.
  + - Right-clicked a directory, chose Delete, observed recursive copy in the dialog before confirming.
  ```

## Medium / Low Fixes

### FT-003: Gate mutation affordances per callback
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/file-tree.tsx
- **Issue**: Rename/Delete/New File/New Folder affordances currently appear whenever any mutation callback exists, even when the specific action callback is missing.
- **Fix**: Gate each affordance individually (`onCreateFile`, `onCreateFolder`, `onRename`, `onDelete`) so the UI matches the prop contract documented in Task T008.
- **Patch hint**:
  ```diff
  - {mutations && (
  + {onCreateFile && (
        <ContextMenuItem onSelect={() => mutations.onStartCreate(entry.path, 'create-file')}>
  ```

### FT-004: Restore focus after inline edit teardown
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/components/inline-edit-input.tsx
- **Issue**: The component auto-focuses on mount but never restores focus to the invoking tree item on teardown.
- **Fix**: Store the previously focused element on mount and restore it during cleanup after confirm/cancel when the element is still connected.
- **Patch hint**:
  ```diff
  + const previousFocusRef = useRef<HTMLElement | null>(null);
  + useEffect(() => {
  +   previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  +   return () => previousFocusRef.current?.focus();
  + }, []);
  ```

### FT-005: Bring the new tests into doctrine compliance
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/inline-edit-input.test.tsx
- **Issue**: The tests use `vi.fn()` and omit the required `Test Doc:` blocks.
- **Fix**: Replace mock callbacks with simple recorders/plain closures and add full five-field `Test Doc:` comments to each test.
- **Patch hint**:
  ```diff
  - const onConfirm = vi.fn();
  + const calls: string[] = [];
  + const onConfirm = (value: string) => calls.push(value);
  
  + /*
  + Test Doc:
  + - Why: ...
  + - Contract: ...
  + - Usage Notes: ...
  + - Quality Contribution: ...
  + - Worked Example: ...
  + */
  ```

### FT-006: Sync plan artifacts to the committed smoke-test path
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/add-files-plan.md; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.md; /Users/jordanknight/substrate/068-add-files/docs/plans/068-add-files/tasks/phase-2-filetree-ui-extensions/tasks.fltplan.md
- **Issue**: The artifacts still refer to `inline-edit-input.test.ts`, but the committed file is `inline-edit-input.test.tsx`.
- **Fix**: Update every plan-phase artifact to the committed `.test.tsx` path.
- **Patch hint**:
  ```diff
  - test/unit/web/features/041-file-browser/inline-edit-input.test.ts
  + test/unit/web/features/041-file-browser/inline-edit-input.test.tsx
  ```

### FT-007: Add the missing Concepts section to the touched domain doc
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/068-add-files/docs/domains/file-browser/domain.md
- **Issue**: The domain document still lacks the required `## Concepts` section/table.
- **Fix**: Add a Level 1 Concepts table with `Concept | Entry Point | What It Does`, including FileTree CRUD entry points introduced by Phase 2.
- **Patch hint**:
  ```diff
  + ## Concepts
  +
  + | Concept | Entry Point | What It Does |
  + |---------|-------------|--------------|
  + | Tree CRUD UI | `FileTree`, `InlineEditInput`, `DeleteConfirmationDialog` | Handles inline create, rename, and delete affordances in the browser tree. |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
