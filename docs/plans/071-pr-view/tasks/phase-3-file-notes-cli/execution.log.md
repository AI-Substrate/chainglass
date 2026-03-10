# Execution Log: Phase 3 — File Notes CLI

**Plan**: [pr-view-plan.md](../../pr-view-plan.md)
**Phase**: Phase 3: File Notes CLI
**Started**: 2026-03-09

---

## Baseline

- 38/38 note-specific tests pass
- 24 pre-existing failures in unrelated test files (338 pass, 22 fail files)
- Shared package builds cleanly

---

## Task Log

### T001: Move writer/reader to shared — DONE

- Moved `NOTES_DIR`/`NOTES_FILE` constants to `packages/shared/src/file-notes/types.ts`
- Created `packages/shared/src/file-notes/note-writer.ts` and `note-reader.ts` (identical logic, updated imports to `./types.js`)
- Updated shared barrel to export writer/reader functions
- Deleted old `apps/web/.../lib/note-writer.ts` and `note-reader.ts`
- Updated all web imports (API route, server actions, jsonl-note-service, types.ts) to use `@chainglass/shared/file-notes`
- Updated test imports (note-writer.test.ts, note-reader.test.ts)
- Rebuilt shared: clean
- **Evidence**: 38/38 tests pass (3 test files, 1.25s)

### T002: Move JsonlNoteService to shared + DI token — DONE

- Created `packages/shared/src/file-notes/jsonl-note-service.ts` (moved from `apps/web`)
- Added `JsonlNoteService` export to shared barrel
- Added `NOTE_SERVICE` token to `SHARED_DI_TOKENS` in `di-tokens.ts`
- Deleted old `apps/web/.../lib/jsonl-note-service.ts`
- Updated contract test import to `@chainglass/shared/file-notes`
- Added comment to CLI container explaining JsonlNoteService is constructed per-command (needs runtime worktreePath)
- **Discovery**: JsonlNoteService cannot be registered statically in DI because it requires `worktreePath` at construction time (resolved at command runtime). Commands construct it directly.
- **Evidence**: 38/38 tests pass (3 test files, 1.19s)

### T003: Improve noContextError + create notes.command.ts with list — DONE

- Improved `noContextError()` in `command-helpers.ts` to detect `.chainglass/` folder when workspace isn't registered — benefits ALL CLI commands
- Created `apps/cli/src/commands/notes.command.ts` with `registerNotesCommands()` function
- Implemented `cg notes list` with --file, --status, --to, --link-type, --json, --workspace-path
- Console output: truncated to 80 chars, status icons (✓/○), chalk colors
- JSON output: `{ errors: [], notes: [...], count: N }` wrapper
- Input validation: isNoteAddressee, isNoteLinkType guards with E075 error codes
- **Evidence**: Compiles clean (no new type errors)

### T004: notes files subcommand — DONE

- Implemented `cg notes files` in same command file
- Shows file paths sorted alphabetically with note counts
- JSON: `{ errors: [], files: [{ path, count }], count: N }`
- Empty state: "No files with notes."

### T005: notes add subcommand — DONE

- Implemented `cg notes add <file>` with --content (required), --line, --to, --author
- Author defaults to 'human' (per DYK-P3-02)
- Line validation: positive integer only
- JSON: `{ errors: [], note: Note }`

### T006: notes complete subcommand — DONE

- Implemented `cg notes complete <id>` with --by (default: human)
- Exit code 1 if note not found
- JSON: `{ errors: [], note: Note }`

### T007: Wire into cg.ts — DONE

- Added `import { registerNotesCommands }` to `apps/cli/src/bin/cg.ts`
- Added `registerNotesCommands(program)` call
- Added export to `apps/cli/src/commands/index.ts`

### T008: Tests — DONE

- Created `test/unit/cli/notes-command.test.ts` with 16 tests
- Tests cover: list (empty, with notes, filters, JSON), files (with notes, empty, JSON), add (basic, line+to, author, JSON), complete (success, not found, JSON), workspace error
- Uses FakeNoteService with vi.mock for workspace resolution
- All tests include Test Doc comments
- **Evidence**: 54/54 total tests pass (38 Phase 1 + 16 Phase 3)
- **Verification command**: `npx vitest run test/unit/cli/notes-command.test.ts test/unit/cli/command-helpers.test.ts test/contracts/note-service.contract.test.ts test/unit/web/features/071-file-notes/note-reader.test.ts test/unit/web/features/071-file-notes/note-writer.test.ts`
