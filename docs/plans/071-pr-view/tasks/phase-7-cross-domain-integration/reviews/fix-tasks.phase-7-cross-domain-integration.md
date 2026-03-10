# Fix Tasks: Phase 7: Cross-Domain Integration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Make deleted-file badging match the displayed note groups
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx, /Users/jordanknight/substrate/071-pr-view/apps/web/app/actions/notes-actions.ts, /Users/jordanknight/substrate/071-pr-view/packages/shared/src/file-notes/note-reader.ts
- **Issue**: `deletedFiles` is derived from `fetchFilesWithNotesDetailed(worktreePath)` with default open-note semantics and only refreshed on `groupedByFile.size`, so filtered / completed-only deleted-note groups can render without the required `Deleted` badge.
- **Fix**: Derive deleted-file status from the actual displayed file keys, or extend the detailed query contract so it accepts the active filter / visible targets and reruns whenever that set changes.
- **Patch hint**:
  ```diff
  - useEffect(() => {
  -   if (!worktreePath || groupedByFile.size === 0) {
  -     setDeletedFiles(new Set());
  -     return;
  -   }
  -   fetchFilesWithNotesDetailed(worktreePath).then((result) => {
  -     if (result.ok) {
  -       const deleted = new Set<string>();
  -       for (const f of result.data) {
  -         if (!f.exists) deleted.add(f.path);
  -       }
  -       setDeletedFiles(deleted);
  -     }
  -   });
  - }, [worktreePath, groupedByFile.size]);
  + const visibleFilePaths = useMemo(
  +   () => Array.from(groupedByFile.keys()).sort(),
  +   [groupedByFile]
  + );
  +
  + useEffect(() => {
  +   if (!worktreePath || visibleFilePaths.length === 0) {
  +     setDeletedFiles(new Set());
  +     return;
  +   }
  +   // Either: make the server action accept visible targets / active filter,
  +   // or compute existence directly from the visible paths.
  +   fetchFilesWithNotesDetailed(worktreePath, { targets: visibleFilePaths, filter })
  +     .then(...)
  +     .catch(...);
  + }, [worktreePath, visibleFilePaths, filter]);
  ```

## Medium / Low Fixes

### FT-002: Preserve a way out of the active has-notes filter
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
- **Issue**: The has-notes toggle disappears when `noteFilePaths.size` reaches zero, even if `showOnlyWithNotes` is still active.
- **Fix**: Keep the toggle visible while the filter is active, or auto-reset `showOnlyWithNotes` when the note set becomes empty.
- **Patch hint**:
  ```diff
  - {noteFilePaths.size > 0 && (
  + {(showOnlyWithNotes || noteFilePaths.size > 0) && (
      <div className="flex items-center justify-end px-2 py-0.5 border-b">
  ...
  + useEffect(() => {
  +   if (showOnlyWithNotes && noteFilePaths.size === 0) {
  +     setShowOnlyWithNotes(false);
  +   }
  + }, [showOnlyWithNotes, noteFilePaths.size]);
  ```

### FT-003: Write the missing Phase 7 execution log
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/execution.log.md
- **Issue**: The review has no persisted execution evidence for AC-21, AC-22, AC-27, AC-15, or OQ-2.
- **Fix**: Add the commands you actually ran, the observed outcomes, and an explicit acceptance-criteria mapping.
- **Patch hint**:
  ```diff
  + # Phase 7 Execution Log
  +
  + ## Commands
  + - just test-feature 071
  + - pnpm tsc --noEmit
  + - [manual verification command(s)]
  +
  + ## Acceptance Criteria Evidence
  + - AC-21: ...
  + - AC-22: ...
  + - AC-27: ...
  + - AC-15: ...
  + - OQ-2: ...
  ```

### FT-004: Add targeted tests for the new helper and integration paths
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/note-reader.test.ts, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/041-file-browser/file-tree.test.tsx, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-pr-view/pr-view-overlay.test.ts, /Users/jordanknight/substrate/071-pr-view/test/unit/web/features/071-file-notes/
- **Issue**: `listFilesWithNotesDetailed()` and the Phase 7 note-indicator / `notes:changed` / deleted-badge / has-notes-filter flows have no dedicated coverage.
- **Fix**: Add data-layer tests for deleted-file existence handling and lightweight UI/integration tests for the new cross-domain behaviors.
- **Patch hint**:
  ```diff
  + it('returns file existence metadata for files with notes', () => {
  +   expect(listFilesWithNotesDetailed(worktree)).toEqual([
  +     { path: 'src/live.ts', exists: true },
  +     { path: 'src/deleted.ts', exists: false },
  +   ]);
  + });
  +
  + it('keeps the notes filter escape hatch visible when active and the note set empties', () => {
  +   // render BrowserClient / FileTree integration and assert the toggle remains available
  + });
  +
  + it('refreshes note indicators after notes:changed', () => {
  +   // dispatch the event and assert the indicator state updates
  + });
  ```

### FT-005: Sync domain docs and the domain map with Phase 7 contracts
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/docs/domains/file-browser/domain.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/file-notes/domain.md, /Users/jordanknight/substrate/071-pr-view/docs/domains/domain-map.md
- **Issue**: The docs do not fully describe the new file-notes dependency surface, `fetchFilesWithNotes`, `notes:changed`, or the `FileWithExistence.path` contract.
- **Fix**: Update the domain docs and map in the same change that fixes the code/tests.
- **Patch hint**:
  ```diff
  - | `FileWithExistence` | Type | notes-overlay | `{ filePath: string; exists: boolean }` for deleted file detection |
  + | `fetchFilesWithNotes` | Server Action | file-browser, pr-view | Returns file targets with open notes for cross-domain indicators |
  + | `FileWithExistence` | Type | notes-overlay | `{ path: string; exists: boolean }` for deleted file detection |
  + | Deleted-file detection | `fetchFilesWithNotesDetailed()`, `NoteFileGroup` | Marks note groups whose backing file no longer exists |
  + | notes:changed | `window.dispatchEvent(new CustomEvent('notes:changed'))` | Invalidates note-path consumers after note CRUD |
  ```

### FT-006: Use the file-notes public barrel for cross-domain imports
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/041-file-browser/components/file-tree.tsx, /Users/jordanknight/substrate/071-pr-view/apps/web/src/features/071-pr-view/components/pr-view-file-list.tsx
- **Issue**: Business-domain consumers import file-notes internals instead of the public feature barrel.
- **Fix**: Route the imports through `@/features/071-file-notes`.
- **Patch hint**:
  ```diff
  - import { useNotesOverlay } from '@/features/071-file-notes/hooks/use-notes-overlay';
  + import { useNotesOverlay } from '@/features/071-file-notes';

  - import { NoteIndicatorDot } from '@/features/071-file-notes/components/note-indicator-dot';
  + import { NoteIndicatorDot } from '@/features/071-file-notes';
  ```

### FT-007: Remove or explain the generated next-env drift
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/071-pr-view/apps/web/next-env.d.ts
- **Issue**: `next-env.d.ts` changed in the pinned phase diff but is outside the Phase 7 domain manifest/dossier.
- **Fix**: Drop it from the phase commit if accidental, or document why this generated drift belongs to the phase.
- **Patch hint**:
  ```diff
  - import "./.next/dev/types/routes.d.ts";
  + // Keep only the intended generated route-types import for this phase,
  + // or remove the file change from the phase commit entirely.
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Evidence recorded in /Users/jordanknight/substrate/071-pr-view/docs/plans/071-pr-view/tasks/phase-7-cross-domain-integration/execution.log.md
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
