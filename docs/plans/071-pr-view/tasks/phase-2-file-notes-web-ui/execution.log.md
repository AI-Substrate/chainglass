# Phase 2: File Notes Web UI — Execution Log

**Started**: 2026-03-09T06:41:00Z
**Phase**: Phase 2
**Plan**: 071-pr-view

---

## Pre-Implementation

**Harness**: No harness configured. Using Lightweight testing (UI phase per deviation ledger).
**Exemplars loaded**: use-activity-log-overlay.tsx, activity-log-overlay-panel.tsx, terminal-overlay-wrapper.tsx, dashboard-sidebar.tsx, sdk-bootstrap.ts, MarkdownInline component.
**Testing approach**: Lightweight — tests after implementation per plan deviation ledger P3.

---

## Task Log

### T001: useNotes Data Hook ✅
Created `hooks/use-notes.ts` with server action calls, 10s cache, filter state, thread-aware `buildGroupedByFile` algorithm (roots newest-first, replies chronologically, orphan handling), and `noteFilePaths` Set for tree indicators. Used relative imports (not `@/`) due to tsc path alias not resolving in standalone check. Compiles clean.

### T002: useNotesOverlay Provider ✅
Created `hooks/use-notes-overlay.tsx` mirroring `use-activity-log-overlay.tsx` exactly — `isOpeningRef` guard, `overlay:close-all` dispatch, `notes:toggle` listener. Added modal state management (`openModal`, `closeModal`, `NoteModalTarget` type with edit/reply support).

### T003: NoteCard ✅
Created `components/note-card.tsx` with author emoji, relative time, optional line number, addressee tag (blue=human, purple=agent), markdown rendering via `MarkdownInline`, and action buttons (Go to, Edit, Reply, Complete). Completed notes get `opacity-50`.

### T004: NoteFileGroup ✅
Created `components/note-file-group.tsx` — collapsible file section with ChevronDown/Right toggle, file path header (mono), note count badge, per-file trash button. Consumes pre-grouped `NoteThread[]` from useNotes hook. Renders replies indented with `ml-4 border-l-2`.

### T005: NotesOverlayPanel ✅
Created `components/notes-overlay-panel.tsx` — largest component wiring everything together. Anchor-positioned via ResizeObserver on `[data-terminal-overlay-anchor]`, z-index 44, Escape key close, `hasOpened` lazy guard. Header with "+" Add Note button, filter dropdown, clear-all trash, close button. Body renders NoteFileGroup[] or loading/error/empty state. Integrates NoteModal and BulkDeleteDialog. "Go to" closes overlay before navigating.

### T006: NoteModal ✅
Created `components/note-modal.tsx` — Dialog for add/edit/reply. When target not pre-filled, shows file path text input. Optional line number input for new notes. Markdown textarea. "To" selector with three pill buttons (Anyone/Human/Agent). Save calls `addNote` or `editNote` server action. Toast on success/error.

### T007: BulkDeleteDialog ✅
Created `components/bulk-delete-dialog.tsx` — type-to-confirm with CONFIRMATION_WORD = "YEES". Supports scope='file' and scope='all'. Delete button disabled until exact match. Resets input on close.

### T008: NoteIndicatorDot ✅
Created `components/note-indicator-dot.tsx` — simple 6px blue dot (`w-1.5 h-1.5 rounded-full bg-blue-500`). Takes `{ hasNotes: boolean }`, returns null when false. Cross-domain contract for Phase 7.

### T009: Overlay Wrapper + Layout Mount ✅
Created `notes-overlay-wrapper.tsx` with dynamic import (ssr: false), error boundary around panel (returns null on error), provider wrapping children. Mounted in layout.tsx between ActivityLogOverlayWrapper and WorkspaceAgentChrome.

### T010: Sidebar Button ✅
Added Notes toggle button to dashboard-sidebar.tsx below Activity Log button. Uses StickyNote icon, dispatches `notes:toggle` CustomEvent, guarded by `currentWorktree`.

### T011: SDK Command ✅
Added `notes.toggleOverlay` command to sdk-bootstrap.ts with domain "file-notes", dispatches `notes:toggle` event. Registered `$mod+Shift+KeyL` keybinding.

### T012: Barrel Exports ✅
Updated index.ts with all new exports: useNotes, useNotesOverlay, NotesOverlayProvider, NoteModalTarget, all 6 components, and NoteThread/NoteFilterOption/UseNotesResult types. Fixed NoteTargetMeta → TargetMetaFor export name mismatch.

**Discovery**: `NoteTargetMeta` doesn't exist as an exported type — the correct name is `TargetMetaFor<T>`. Fixed in barrel exports.
**Discovery**: `useRef<() => void>()` without initial value causes TS2554 in strict mode — must use `useRef<(() => void) | undefined>(undefined)`.

## Summary

**All 12 tasks complete. 38 Phase 1 tests still pass. Zero type errors in our files. Phase 2 landed.**

---

## Post-Review Fix Log

### FT-001: Correct unfiltered note totals ✅
Added separate `allNotes` state + parallel `fetchNotes(worktreePath, undefined)` call for unfiltered totals. `openCount`/`completeCount` now derive from `allNotes`, not the filtered `notes` array.

### FT-002: Restore SDK boundary ownership ✅
Moved `notes.toggleOverlay` command + `$mod+Shift+KeyL` keybinding from `sdk-bootstrap.ts` (infrastructure) to domain-owned `sdk/contribution.ts` + `sdk/register.ts`. Wired via `registerFileNotesSDK()` in `sdk-domain-registrations.ts`.

### FT-003: Verification evidence ✅
- **Typecheck**: `npx tsc --noEmit -p apps/web/tsconfig.json` — zero errors in 071 files
- **Biome**: `npx biome check` — zero errors across 16 Phase 2 files
- **Tests**: `pnpm vitest run` — 38/38 pass (22 unit + 16 contract) in 1.30s
- **No UI/RTL tests added** — Phase 2 is UI-only (Lightweight per deviation ledger P3). Overlay follows 3 proven exemplars. Manual smoke testing deferred to integration.

### FT-004: Add link-type filtering ✅
Added `type-file`, `type-workflow`, `type-agent-run` to `NoteFilterOption` union. Updated `filterOptionToNoteFilter()` switch and overlay panel `<select>` dropdown.

### FT-005: Sync domain artifacts ✅
Updated `domain-map.md` file-notes node with Phase 2 contracts (NotesOverlayPanel, NoteModal, NoteIndicatorDot, useNotes). Added edges to panel-layout, workspace-url, events, sdk. Updated health summary row.

### FT-006: Server-only exports + Biome ✅
Removed `note-writer.ts`/`note-reader.ts` from barrel (server-only — import directly from `lib/`). Removed `autoFocus` from BulkDeleteDialog (replaced with `useRef` + `useEffect` focus). Removed all non-null assertions (`!`) from `use-notes.ts` with guarded alternatives. Ran `npx biome check --fix --unsafe` for format/import fixes. Zero Biome errors remaining.