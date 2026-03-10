# Phase 7 Execution Log

**Phase**: Phase 7: Cross-Domain Integration
**Executed**: 2026-03-10

## Commands

- `pnpm --filter @chainglass/web exec tsc --noEmit` — 0 type errors in Phase 7 files
- `pnpm biome check` — 0 lint errors after fixes
- `just fft` — 370 test files passed, 5167 tests passed, 0 failures
- `pnpm vitest run test/unit/shared/file-notes/note-reader-detailed.test.ts` — 5 tests passed (FT-004)
- Playwright browser verification: navigate to browser page, right-click file, Add Note, verify JSONL created in correct worktree
- `node apps/cli/dist/cli.cjs notes list` — confirmed note visible via CLI after web UI creation

## Task Evidence

| Task | Evidence |
|------|----------|
| T001 FileTree note indicator | `file-tree.tsx` renders `<NoteIndicatorDot hasNotes={filesWithNotes?.has(entry.path)}/>` per file entry. Prop threaded through recursive TreeItem. |
| T002 Add Note context menu | `file-tree.tsx` adds `<ContextMenuItem>` with StickyNote icon, calls `onAddNote(entry.path)`. Only for file entries (not directories). |
| T003 BrowserClient wiring | `browser-client.tsx` fetches noteFilePaths via `fetchFilesWithNotes`, passes as `filesWithNotes` to FileTree, calls `useNotesOverlay().openModal()` for onAddNote, listens for `notes:changed` event. |
| T004 Has-notes filter | `browser-client.tsx` adds `showOnlyWithNotes` toggle with ancestor directory preservation (`noteAncestorPaths` Set). Filters both rootEntries and childEntries. Auto-resets when notes cleared (FT-002). |
| T005 PR View note dots | `pr-view-file-list.tsx` accepts `noteFilePaths?: Set<string>` as separate prop (DYK-04), renders NoteIndicatorDot after status badge. Panel fetches via `fetchFilesWithNotes`, listens for `notes:changed`. |
| T006 Deleted file detection | `notes-overlay-panel.tsx` calls `fetchFilesWithNotesDetailed`, derives `deletedFiles` from visible file paths (FT-001 fix). `note-file-group.tsx` shows red "Deleted" badge when `isDeleted` prop is true. |

## Acceptance Criteria Evidence

| AC | Status | Evidence |
|----|--------|----------|
| AC-21: File tree shows indicator dot | PASS | NoteIndicatorDot renders 6px blue dot for files in `filesWithNotes` Set. Verified via Playwright screenshot — blue dot visible after adding note. |
| AC-22: PR View file list shows indicator dot | PASS | PRViewFileList renders NoteIndicatorDot per file using separate `noteFilePaths` prop. No PRViewFile mutation (DYK-04). |
| AC-27: Tree filtered to files with notes | PASS | StickyNote toggle button filters rootEntries + childEntries via `noteAncestorPaths` ancestor preservation. Auto-resets on empty (FT-002). |
| AC-15 (partial): Add Note from context menu | PASS | Right-click file → "Add Note" → modal opens with file pre-filled → Save → note persists to correct worktree JSONL. Verified end-to-end via Playwright. |
| OQ-2 (partial): Deleted file indicator | PASS | NoteFileGroup shows red "Deleted" badge when `isDeleted=true`. Derived from `fetchFilesWithNotesDetailed` cross-referenced with visible file paths (FT-001). |

## Bug Fixes Applied During Phase 7

| Fix | Description |
|-----|-------------|
| Render loop | `fetchNoteFiles` in useEffect deps caused cascading re-renders. Fixed with ref pattern. |
| Effect array size | HMR caused `useEffect` dep array size change. Fixed by using `[]` deps with ref callbacks. |
| Nested button hydration | Delete button was inside collapse button in NoteFileGroup. Split into sibling buttons. |
| Wrong worktree path | NotesOverlayPanel used context worktreePath (workspace default) instead of URL `?worktree=` param. Fixed with URL resolution. |
| NoteModal not rendering | `hasOpened` guard blocked modal when overlay never opened. Fixed by also triggering on `isModalOpen`. |

## Review Fix Tasks Applied

| Fix | Description |
|-----|-------------|
| FT-001 | Deleted-file badging now derived from visible file paths (groupedByFile keys), not default open-note fetch |
| FT-002 | Has-notes filter stays visible while active + auto-resets when notes empty |
| FT-004 | 5 tests for `listFilesWithNotesDetailed` (existing, deleted, mixed, empty, open-only) |
| FT-006 | Cross-domain imports use public barrel `@/features/071-file-notes` |
| FT-007 | Reverted accidental next-env.d.ts drift |
