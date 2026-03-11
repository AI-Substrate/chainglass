# Phase 4: CLI Commands — Execution Log

**Plan**: [plan.md](../../plan.md)
**Phase**: Phase 4: CLI Commands
**Started**: 2026-03-07

---

## Task Log

### T001: Event Popper HTTP client + fake ✅
- Created `apps/cli/src/commands/event-popper-client.ts`
- `IEventPopperClient` interface with 5 typed methods
- Real implementation using native `fetch()` with error mapping
- `EventPopperClientError` with `isTransient`, `isNotFound`, `isConflict` flags (DYK-02)
- `FakeEventPopperClient` with canned response control + call inspection
- `discoverServerUrl()` using `readServerInfo()` with clear error message

### T002-T006: Question commands ✅
- Created `apps/cli/src/commands/question.command.ts`
- `cg question ask` with blocking poll loop, SIGINT handler (DYK-01), transient error retry (DYK-02)
- `cg question get` with 404 handling
- `cg question answer` with type coercion (DYK-04): boolean for confirm, array for multi
- `cg question list` with human-readable table + `--json` mode
- Default source auto-enriched with `$USER` (DYK-03)
- Comprehensive agent-oriented `--help` text (AC-34)

### T007-T008: Alert commands ✅
- Created `apps/cli/src/commands/alert.command.ts`
- `cg alert send` fire-and-forget with tmux auto-detection
- Agent-oriented `--help` text (AC-35)

### T009: CLI registration ✅
- Added `registerQuestionCommands` + `registerAlertCommands` to `cg.ts`
- Exported from `commands/index.ts`

### T010: Unit tests — 21/21 passing ✅
- `test/unit/question-popper/cli-commands.test.ts`
- Tests: ask (timeout 0, poll+answer, timeout, tmux meta, invalid timeout), get (found, not found), answer (submit, coerce boolean, coerce array, 409 conflict), list (empty, table, json), alert send, error types, fake client inspection

### T011: Integration tests ✅
- `test/integration/question-popper/cli-blocking.test.ts`
- 3 tests in `describe.skip` — requires running server

### Evidence
- `just fft` passing — 5106 tests, 0 failures
- Phase 3 review artifacts (`_computed.diff`, `review.phase-3-server-api-routes.md`) committed alongside Phase 4 as they were generated between commits
