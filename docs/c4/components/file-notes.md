# Component: File Notes (`file-notes`)

> **Domain Definition**: [file-notes/domain.md](../../domains/file-notes/domain.md)
> **Source**: `apps/web/src/features/071-file-notes/` + `packages/shared/src/file-notes/` + `apps/cli/src/commands/notes.command.ts`
> **Registry**: [registry.md](../../domains/registry.md) — Row: File Notes

Generic annotation system where humans and agents attach markdown notes to files, workflow nodes, agent runs, or any linkable entity. Notes persist per-worktree in `.chainglass/data/notes.jsonl`, support threading, completion tracking, and addressee targeting.

```mermaid
C4Component
    title Component diagram — File Notes (file-notes)

    Container_Boundary(fileNotes, "File Notes") {
        Component(sharedTypes, "Shared Types", "TypeScript Types", "Note, NoteLinkType, NoteFilter,<br/>CreateNoteInput, EditNoteInput,<br/>NoteResult — discriminated union<br/>by linkType")
        Component(noteService, "INoteService", "Interface", "8 methods: addNote, editNote,<br/>completeNote, deleteNote,<br/>listNotes, listFilesWithNotes,<br/>deleteAllForTarget, deleteAll")
        Component(writer, "Note Writer", "Shared Service", "appendNote (JSONL append),<br/>editNote/deleteNote<br/>(read-modify-rewrite + atomic rename)")
        Component(reader, "Note Reader", "Shared Service", "readNotes with filter<br/>(linkType, target, status, to),<br/>listFilesWithNotes (file-only)")
        Component(jsonlService, "JsonlNoteService", "Shared Adapter", "Wraps sync writer/reader<br/>into async INoteService<br/>with NoteResult error handling")
        Component(apiRoute, "File Notes API Route", "Route Handler", "GET/POST/PATCH/DELETE<br/>/api/file-notes with auth,<br/>worktree scoping, enum validation")
        Component(serverActions, "Server Actions", "Server Actions", "addNote, editNote, completeNote,<br/>deleteNotes, fetchNotes,<br/>fetchFilesWithNotes")
        Component(notesCli, "Notes CLI Commands", "Commander Adapter", "cg notes list/files/add/complete<br/>with --json output,<br/>DI factory seam")
        Component(fakeService, "FakeNoteService", "Test Double", "In-memory Map store,<br/>inspection methods:<br/>getAdded, getEdited, getCompleted")

        writer --> sharedTypes
        reader --> sharedTypes
        jsonlService --> writer
        jsonlService --> reader
        jsonlService --> noteService
        apiRoute --> writer
        apiRoute --> reader
        serverActions --> writer
        serverActions --> reader
        notesCli --> jsonlService
        fakeService --> noteService
    }

    Container_Ext(auth, "Auth", "requireAuth()")

    Rel(apiRoute, auth, "Auth guard")
    Rel(serverActions, auth, "Auth guard")
```

> Internal relationships only — cross-domain dependencies (file-browser consuming NoteIndicatorDot)
> belong at L2 in `web-app.md` per C4 authoring principle 4.

---

## Navigation

- **Zoom Out**: [Web App Container](../containers/web-app.md)
- **Domain**: [file-notes/domain.md](../../domains/file-notes/domain.md)
- **Hub**: [C4 Overview](../README.md)
