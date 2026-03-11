# Flight Plan: Phase 3 — File Notes CLI

**Plan**: [pr-view-plan.md](../../pr-view-plan.md)
**Phase**: Phase 3: File Notes CLI
**Generated**: 2026-03-09
**Status**: Landed

---

## Departure -> Destination

**Where we are**: Phase 1 delivered the complete data layer (types, INoteService interface, JSONL persistence, FakeNoteService, API routes, 38 tests). Phase 2 delivered the web UI (overlay, modal, card components, sidebar button, SDK command). Notes can be created and viewed through the web app. But there is no CLI access — agents and power users have no terminal-based way to interact with notes.

**Where we're going**: A developer or agent can run `cg notes list` to see all worktree notes, `cg notes add src/app.ts --content "Fix auth" --to human` to create a note, `cg notes complete <id>` to mark it done, and `cg notes list --json` to get machine-readable output. The CLI becomes the primary interface for agent-to-human communication via notes.

---

## Domain Context

### Domains We're Changing

| Domain | What Changes | Key Files |
|--------|-------------|-----------|
| file-notes | New CLI commands, CLI-local CliNoteService | `notes.command.ts`, `cli-note-service.ts` |
| — (CLI infra) | Register notes in DI container + entry point | `container.ts`, `cg.ts`, `commands/index.ts` |

### Domains We Depend On (no changes)

| Domain | What We Consume | Contract |
|--------|----------------|----------|
| file-notes (shared) | INoteService, Note types, FakeNoteService | `@chainglass/shared/interfaces`, `@chainglass/shared/file-notes`, `@chainglass/shared/fakes` |
| _platform/file-ops | Concept: JSONL at `.chainglass/data/notes.jsonl` | Direct `fs` usage |

---

## Flight Status

```mermaid
stateDiagram-v2
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef active fill:#FFC107,stroke:#FFA000,color:#000
    classDef done fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    state "1: CliNoteService" as S1
    state "2: DI registration" as S2
    state "3: notes list" as S3
    state "4: notes files" as S4
    state "5: notes add" as S5
    state "6: notes complete" as S6
    state "7: Wire into cg.ts" as S7
    state "8: Tests" as S8

    [*] --> S1
    S1 --> S2
    S2 --> S3
    S3 --> S4
    S3 --> S5
    S3 --> S6
    S4 --> S7
    S5 --> S7
    S6 --> S7
    S7 --> S8
    S8 --> [*]

    class S1,S2,S3,S4,S5,S6,S7,S8 done
```

**Legend**: grey = pending | yellow = active | red = blocked/needs input | green = done

---

## Stages

- [x] **Stage 1: CliNoteService** -- Moved writer/reader to `packages/shared/src/file-notes/`. Updated all web imports. 38/38 tests pass.
- [x] **Stage 2: DI registration** -- JsonlNoteService moved to shared. NOTE_SERVICE token added to SHARED_DI_TOKENS. 38/38 tests pass.
- [x] **Stage 3: notes list** -- All 4 subcommands in notes.command.ts (list, files, add, complete)
- [x] **Stage 4: notes files** -- Included in stage 3
- [x] **Stage 5: notes add** -- Included in stage 3
- [x] **Stage 6: notes complete** -- Included in stage 3
- [x] **Stage 7: Wire into cg.ts** -- Import + register in cg.ts, export from index.ts
- [x] **Stage 8: Tests** -- 16 unit tests for all subcommands using FakeNoteService

---

## Architecture: Before & After

```mermaid
flowchart LR
    classDef existing fill:#E8F5E9,stroke:#4CAF50,color:#000
    classDef changed fill:#FFF3E0,stroke:#FF9800,color:#000
    classDef new fill:#E3F2FD,stroke:#2196F3,color:#000

    subgraph Before["Before Phase 3"]
        B_shared["@chainglass/shared<br/>INoteService + types"]:::existing
        B_web["apps/web<br/>writer/reader/API/overlay"]:::existing
        B_cli["apps/cli<br/>workspace, workflow, etc."]:::existing
        B_shared --> B_web
    end

    subgraph After["After Phase 3"]
        A_shared["@chainglass/shared<br/>INoteService + types"]:::existing
        A_web["apps/web<br/>writer/reader/API/overlay"]:::existing
        A_cli["apps/cli"]:::changed
        A_svc["CliNoteService"]:::new
        A_cmd["notes.command.ts"]:::new
        A_test["notes-command.test.ts"]:::new

        A_shared --> A_web
        A_shared --> A_svc
        A_svc --> A_cmd
        A_cmd --> A_cli
    end
```

**Legend**: existing (green, unchanged) | changed (orange, modified) | new (blue, created)

---

## Acceptance Criteria

- [ ] AC-28: `cg notes list` shows all notes with file paths, line numbers, content preview, and status
- [ ] AC-29: `cg notes list --file <path>` filters to a specific file
- [ ] AC-30: `cg notes files` lists all files that have notes
- [ ] AC-31: `cg notes add <file> --content "..." [--line N] [--to human|agent]` creates a note
- [ ] AC-32: `cg notes complete <id>` marks a note as complete
- [ ] AC-33: `cg notes list --json` outputs machine-readable JSON for agent consumption

## Goals & Non-Goals

**Goals**:
- All `cg notes` subcommands functional (list, files, add, complete)
- JSON output mode for agent consumption
- Filter support (--file, --status, --to, --link-type)
- CLI-local CliNoteService with JSONL persistence
- DI container integration
- Tests with FakeNoteService

**Non-Goals**:
- No edit/delete CLI commands (web-only with YEES confirmation)
- No interactive prompts
- No threading/reply via CLI (future)
- No web UI changes

---

## Checklist

- [x] T001: CliNoteService implementing INoteService
- [x] T002: DI container registration
- [x] T003: notes.command.ts with list subcommand + filters
- [x] T004: notes files subcommand
- [x] T005: notes add subcommand
- [x] T006: notes complete subcommand
- [x] T007: Wire into cg.ts + commands/index.ts
- [x] T008: Unit tests for all subcommands
