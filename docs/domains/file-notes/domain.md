# Domain: File Notes

**Slug**: file-notes
**Type**: business
**Created**: 2026-03-08
**Created By**: Plan 071 — PR View & File Notes (Phase 1)
**Status**: active

## Purpose

Generic annotation system where humans and agents attach markdown notes to files, workflow nodes, agent runs, or any linkable entity. Notes persist per-worktree in `.chainglass/data/notes.jsonl`, support threading, completion tracking, and addressee targeting. Consumed by file-browser (tree indicators), workflow-ui, agents, and CLI.

## Boundary

### Owns
- Note data model with generic link-type system (file/workflow/agent-run)
- JSONL persistence: note-writer.ts (append + read-modify-rewrite), note-reader.ts (read + filter) — in `@chainglass/shared`
- JsonlNoteService adapter wrapping sync writer/reader into INoteService — in `@chainglass/shared`
- INoteService interface in `@chainglass/shared`
- FakeNoteService in `@chainglass/shared/fakes`
- API routes: `GET/POST/PATCH/DELETE /api/file-notes`
- Server actions: addNote, editNote, completeNote, deleteNotes, fetchNotes, fetchFilesWithNotes, fetchFilesWithNotesDetailed
- CLI commands: `cg notes list`, `cg notes files`, `cg notes add`, `cg notes complete`

### Does NOT Own
- Tree rendering integration (provides NoteIndicatorDot consumed by file-browser — Phase 7)
- Workflow/agent integration details (future phases)

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `INoteService` | Interface | CLI, web, tests | 8-method service: addNote, editNote, completeNote, deleteNote, listNotes, listFilesWithNotes, deleteAllForTarget, deleteAll |
| `Note` | Type | All consumers | Core note data type with generic link-type system |
| `NoteLinkType` | Const | All consumers | `'file' \| 'workflow' \| 'agent-run'` extensible link types |
| `NoteFilter` | Type | API routes, CLI | Filter by linkType, target, status, to, threadId |
| `CreateNoteInput` | Type | Writers | Input for creating a new note |
| `EditNoteInput` | Type | Writers | Input for editing an existing note |
| `NoteResult<T>` | Type | All consumers | `{ ok: true; data: T } \| { ok: false; error: string }` |
| `FakeNoteService` | Fake | Tests | In-memory test double with inspection methods |
| `NoteIndicatorDot` | Component | file-browser, pr-view | 6px blue dot for tree/list decoration |
| `useNotes` | Hook | Overlay, BrowserClient | Data fetching + cache + filter + thread grouping |
| `useNotesOverlay` | Hook | Wrapper, sidebar | Overlay + modal state with mutual exclusion |
| `NotesOverlayProvider` | Provider | Layout wrapper | Context provider for overlay state |
| `appendNote` | Function | Server actions, API routes | Append a new note to JSONL |
| `readNotes` | Function | Server actions, API routes | Read + filter notes from JSONL |
| `fetchFilesWithNotes` | Server Action | file-browser (BrowserClient), pr-view (PRViewPanelContent) | Returns file targets with open notes |
| `listFilesWithNotes` | Function | Server actions, API routes | List unique targets with open notes |
| `listFilesWithNotesDetailed` | Function | Server actions | List files with notes including existence check against worktree |
| `FileWithExistence` | Type | notes-overlay | `{ filePath: string; exists: boolean }` for deleted file detection |
| `fetchFilesWithNotesDetailed` | Server Action | notes-overlay | Server action wrapping `listFilesWithNotesDetailed` |
| `notes:changed` | CustomEvent | file-browser, pr-view | Dispatched on `window` after note CRUD to trigger re-fetch of note file paths |
| `JsonlNoteService` | Class | CLI, web, contract tests | INoteService adapter wrapping sync writer/reader with NoteResult error handling |
| `registerNotesCommands` | Function | CLI entry (cg.ts) | Commander.js `cg notes` command group with list/files/add/complete |

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|--------------|
| Add note | `appendNote()`, `addNote` server action, `POST /api/file-notes` | Create a new note on any linkable entity with optional line, addressee, and thread parent |
| Edit note | `editNote()`, `editNote` server action, `PATCH /api/file-notes` | Update note content or addressee via read-modify-rewrite with atomic rename |
| Complete note | `completeNote()`, `completeNote` server action | Mark note as complete, recording who completed (human or agent) |
| Delete notes | `deleteNote()`, `deleteAllForTarget()`, `deleteAll()` | Remove individual notes, all notes for a target, or all notes in worktree |
| Query notes | `readNotes()`, `fetchNotes` server action, `GET /api/file-notes` | Filter notes by linkType, target, status, addressee, threadId |
| List files with notes | `listFilesWithNotes()`, `GET /api/file-notes?mode=files` | Returns sorted unique targets that have open notes |
| View notes overlay | Sidebar button, `Ctrl+Shift+L`, `notes:toggle` event | Opens fixed-position overlay showing all notes grouped by file with filtering |
| Add note from overlay | "+" button in overlay header → NoteModal | Opens modal with file path input for creating new notes without tree context |
| Bulk delete notes | Trash icon → BulkDeleteDialog → type "YEES" | Safety-guarded deletion of all notes or per-file notes |
| Navigate to note | "Go to" button on NoteCard | Closes overlay, navigates to file+line via workspaceHref |
| CLI list notes | `cg notes list [--file] [--status] [--to] [--link-type] [--json]` | List notes with filters, console or JSON output, primary agent consumption interface |
| CLI list files with notes | `cg notes files [--json]` | Show files with note counts, quick overview of annotation coverage |
| CLI add note | `cg notes add <file> --content "..." [--line N] [--to human\|agent] [--author human\|agent]` | Create note from terminal, default author human, agents pass --author agent |
| CLI complete note | `cg notes complete <id> [--by human\|agent]` | Mark note done from terminal, default completedBy human |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| types.ts (shared) | Note, LinkType, Filter types, NOTES_DIR/NOTES_FILE | — |
| types.ts (web) | Re-exports from shared | @chainglass/shared/file-notes |
| note-writer.ts (shared) | JSONL append + read-modify-rewrite | Node.js fs |
| note-reader.ts (shared) | JSONL read + parse + filter | Node.js fs |
| jsonl-note-service.ts (shared) | INoteService adapter (sync→async) | note-writer, note-reader |
| route.ts | API endpoints (GET/POST/PATCH/DELETE) | shared writer/reader, auth |
| notes-actions.ts | Server actions with requireAuth() | shared writer/reader, auth |
| notes.command.ts (CLI) | Commander.js notes subcommands | JsonlNoteService, command-helpers |
| FakeNoteService | In-memory test double | INoteService interface |
| useNotes (hook) | Data fetching + cache + filter + thread grouping | Server actions, React |
| useNotesOverlay (hook) | Overlay state + modal state + mutual exclusion | React context |
| NotesOverlayPanel | Fixed-position overlay with header, filter, list | useNotes, useNotesOverlay |
| NoteCard | Individual note rendering with actions | MarkdownInline |
| NoteFileGroup | Collapsible per-file note group | NoteCard |
| NoteModal | Add/edit/reply dialog | Dialog UI, server actions |
| BulkDeleteDialog | Type-to-confirm YEES | Dialog UI, server actions |
| NoteIndicatorDot | 6px blue dot indicator | — |

## Source Location

Primary: `apps/web/src/features/071-file-notes/` + `packages/shared/src/file-notes/` + `apps/cli/src/commands/notes.command.ts`

| File | Role | Notes |
|------|------|-------|
| `packages/shared/src/file-notes/types.ts` | Shared types + constants | Phase 1, constants moved Phase 3 |
| `packages/shared/src/file-notes/index.ts` | Shared barrel exports | Phase 1, extended Phase 3 |
| `packages/shared/src/file-notes/note-writer.ts` | JSONL writer | Phase 1 (web), moved Phase 3 |
| `packages/shared/src/file-notes/note-reader.ts` | JSONL reader | Phase 1 (web), moved Phase 3 |
| `packages/shared/src/file-notes/jsonl-note-service.ts` | INoteService adapter | Phase 1 (web), moved Phase 3 |
| `packages/shared/src/interfaces/note-service.interface.ts` | INoteService interface | Phase 1 |
| `packages/shared/src/fakes/fake-note-service.ts` | FakeNoteService | Phase 1 |
| `apps/web/src/features/071-file-notes/types.ts` | Web types (re-export from shared) | Phase 1, simplified Phase 3 |
| `apps/web/src/features/071-file-notes/index.ts` | Feature barrel | Phase 1 |
| `apps/web/app/api/file-notes/route.ts` | API route | Phase 1, imports from shared Phase 3 |
| `apps/web/app/actions/notes-actions.ts` | Server actions | Phase 1, imports from shared Phase 3 |
| `apps/web/src/features/071-file-notes/hooks/use-notes.ts` | Data-fetching hook | Phase 2 |
| `apps/web/src/features/071-file-notes/hooks/use-notes-overlay.tsx` | Overlay + modal provider | Phase 2 |
| `apps/web/src/features/071-file-notes/components/notes-overlay-panel.tsx` | Overlay panel | Phase 2 |
| `apps/web/src/features/071-file-notes/components/note-card.tsx` | Note rendering | Phase 2 |
| `apps/web/src/features/071-file-notes/components/note-file-group.tsx` | Per-file group | Phase 2 |
| `apps/web/src/features/071-file-notes/components/note-modal.tsx` | Add/edit dialog | Phase 2 |
| `apps/web/src/features/071-file-notes/components/bulk-delete-dialog.tsx` | YEES confirmation | Phase 2 |
| `apps/web/src/features/071-file-notes/components/note-indicator-dot.tsx` | Tree indicator dot | Phase 2 |
| `apps/web/src/features/071-file-notes/sdk/` | SDK commands | Phase 2 |
| `apps/web/app/(dashboard)/workspaces/[slug]/notes-overlay-wrapper.tsx` | Layout wrapper | Phase 2 |
| `apps/cli/src/commands/notes.command.ts` | CLI notes commands | Phase 3 |
| `test/unit/cli/notes-command.test.ts` | CLI command tests | Phase 3 |

## Dependencies

### This Domain Depends On
- `_platform/auth` — requireAuth() for server actions and API routes
- `_platform/panel-layout` — `[data-terminal-overlay-anchor]` for overlay positioning
- `_platform/workspace-url` — `workspaceHref()` for "Go to" navigation
- `_platform/sdk` — SDK command/keybinding registration
- `_platform/events` — `toast()` from sonner for user feedback
- Node.js `fs` — direct filesystem access for JSONL persistence

### Domains That Depend On This
- file-browser — NoteIndicatorDot for tree decoration, `fetchFilesWithNotes` + `notes:changed` listener, filter toggle
- pr-view — NoteIndicatorDot in file list, `fetchFilesWithNotes` + `notes:changed` listener
- CLI — `cg notes` commands via INoteService + JsonlNoteService
- (Future) workflow-ui — Notes on workflow nodes
- (Future) agents — Notes on agent runs

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 071 Phase 1 | Domain created. Types, INoteService interface, JSONL writer/reader, FakeNoteService, API routes, server actions, 22 unit tests. | 2026-03-08 |
| 071 Phase 2 | Notes overlay (provider, panel, grouped-by-file display), NoteCard, NoteFileGroup, NoteModal (add/edit/reply), BulkDeleteDialog (YEES), NoteIndicatorDot, sidebar button, SDK command (Ctrl+Shift+L), useNotes data hook with caching + thread grouping. | 2026-03-09 |
| 071 Phase 3 | Moved writer/reader/JsonlNoteService to `@chainglass/shared`. Added NOTES_DIR/NOTES_FILE/NOTE_SERVICE token to shared. CLI commands: `cg notes list/files/add/complete` with JSON output. Improved `noContextError()` with .chainglass/ detection. 16 CLI tests. | 2026-03-09 |
| 071 Phase 7 | Cross-domain integration: NoteIndicatorDot wired into FileTree + PR View file list, deleted file detection via `listFilesWithNotesDetailed`, `notes:changed` CustomEvent dispatch after CRUD, filter toggle in file-browser with ancestor directory preservation. | 2026-03-10 |
