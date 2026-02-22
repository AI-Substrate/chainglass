# Phase 4: Real Agent Integration Tests — Execution Log

**Plan**: 034-agentic-cli
**Phase**: Phase 4: Real Agent Integration Tests
**Started**: 2026-02-16T10:44

---

## Task T001: Write Claude Code integration tests
**Started**: 2026-02-16T10:44
**Dossier Task**: T001 | **Plan Task**: 4.1
**Status**: ✅ Complete

### What I Did
Created `test/integration/agent-instance-real.test.ts` with Claude Code integration tests:
- 5 tests in `describe.skip('AgentInstance with ClaudeCodeAdapter', { timeout: 120_000 })`:
  1. Creates new session and gets completed status (AC-35)
  2. Resumes session and agent retains context (AC-36)
  3. Multiple handlers receive identical events (AC-37)
  4. Two agents run concurrently with independent sessions (AC-38)
  5. Compact reduces session context without losing continuity (AC-38a)
- Uses `describe.skip` (hardcoded) per DYK-P4#2
- Dynamic imports in `beforeAll` to avoid loading adapters in unit test context
- Uses `AgentManagerService` with inline `AdapterFactory` closure
- All Test Doc blocks included per plan requirements
- Structural assertions only (status, sessionId, event count)

### Evidence
```
npx vitest run test/integration/agent-instance-real.test.ts
 ✓ test/integration/agent-instance-real.test.ts (14 tests | 13 skipped) 1ms
 Test Files  1 passed (1)
      Tests  1 passed | 13 skipped (14)
```

### Files Changed
- `test/integration/agent-instance-real.test.ts` — Created (Claude section: lines 1-185)

**Completed**: 2026-02-16T10:46
---

## Task T002: Write Copilot SDK integration tests
**Started**: 2026-02-16T10:44
**Dossier Task**: T002 | **Plan Task**: 4.2
**Status**: ✅ Complete

### What I Did
Added Copilot SDK integration tests to the same file:
- 5 tests in `describe.skip('AgentInstance with SdkCopilotAdapter', { timeout: 120_000 })`:
  1. Creates new session (AC-40)
  2. Resumes session (AC-41)
  3. Multiple handlers (AC-42)
  4. Parallel agents (AC-43)
  5. Compact+resume (AC-43a)
- Dynamic imports: `SdkCopilotAdapter` from `@chainglass/shared/adapters`, `CopilotClient` from `@github/copilot-sdk`
- `afterAll` calls `copilotClient.stop()` for cleanup
- Uses `describe.skip` per DYK-P4#2

### Evidence
Same test run — 5 Copilot tests skipped (included in 13 skipped total)

### Files Changed
- `test/integration/agent-instance-real.test.ts` — Added (Copilot section: lines 187-318)

**Completed**: 2026-02-16T10:46
---

## Task T003: Write cross-adapter parity tests
**Started**: 2026-02-16T10:44
**Dossier Task**: T003 | **Plan Task**: 4.3
**Status**: ✅ Complete

### What I Did
Added cross-adapter parity tests to the same file:
- 3 tests in `describe.skip('Cross-Adapter Parity', { timeout: 120_000 })`:
  1. Both adapters produce text events for simple prompt (AC-45)
  2. Both adapters support session resume (AC-46)
  3. Both adapters support compact (AC-46a)
- Both managers initialized in `beforeAll`
- `afterAll` calls `copilotClient.stop()`
- Parity test uses `Promise.all` for concurrent execution
- Also added diagnostic test block that always runs to confirm skip behavior

### Evidence
Same test run — 3 parity tests skipped (included in 13 skipped total). 1 diagnostic test passes.

### Files Changed
- `test/integration/agent-instance-real.test.ts` — Added (Parity section: lines 320-end)

**Completed**: 2026-02-16T10:46
---

## Task T004: Write CLI E2E tests
**Started**: 2026-02-16T10:47
**Dossier Task**: T004 | **Plan Task**: 4.4
**Status**: ✅ Complete

### What I Did
Created `test/e2e/agent-cli-e2e.test.ts` with 4 CLI E2E tests:
1. New session returns JSON result and exits 0
2. Session chaining across CLI invocations (parse JSON default output for sessionId per DYK-P4#3)
3. Compact session and continue (3 CLI invocations: run → compact → run)
4. `--stream` outputs NDJSON events (mixed JSON shapes per DYK-P4#4)

Also:
- Created `vitest.e2e.config.ts` — separate config for E2E tests (since `test/e2e/**` excluded from main config)
- Added `just test-e2e` command to justfile
- All tests use `describe.skip` per DYK-P4#2
- CLI binary path: `apps/cli/dist/cli.cjs`

### Evidence
```
npx vitest run test/e2e/agent-cli-e2e.test.ts --config vitest.e2e.config.ts
 ✓ test/e2e/agent-cli-e2e.test.ts (5 tests | 4 skipped) 1ms
 Test Files  1 passed (1)
      Tests  1 passed | 4 skipped (5)
```

### Files Changed
- `test/e2e/agent-cli-e2e.test.ts` — Created
- `vitest.e2e.config.ts` — Created
- `justfile` — Added `test-e2e` command

**Completed**: 2026-02-16T10:49
---

## Task T005: Manual verification
**Started**: 2026-02-16T10:50
**Dossier Task**: T005 | **Plan Task**: 4.5
**Status**: ✅ Complete

### What I Did
Verified both test files are properly discovered and all real tests are skipped:
- `agent-instance-real.test.ts`: 14 tests (1 pass, 13 skipped)
- `agent-cli-e2e.test.ts`: 5 tests (1 pass, 4 skipped) via E2E config

Tests are `describe.skip` — user manually removes `.skip` to validate with real agents.

### Evidence
```
agent-instance-real.test.ts: 14 tests | 13 skipped | 1ms
agent-cli-e2e.test.ts: 5 tests | 4 skipped | 1ms
```

**Completed**: 2026-02-16T10:51
---

## Task T006: Verify CI skip behavior and regression
**Started**: 2026-02-16T10:51
**Dossier Task**: T006 | **Plan Task**: 4.6
**Status**: ✅ Complete

### What I Did
Ran `just fft` (lint, format, build, test) for full regression check.
- First run: 1 flaky failure in `event-id.test.ts` (pre-existing, generates duplicate IDs under timestamp collision). Not related to Phase 4.
- Second run: 3858 passed, 0 failed, 54 skipped across 262 test files.
- Phase 4 adds 1 passing diagnostic test + 13 skipped real agent tests to the suite.
- E2E tests excluded from main suite (vitest.config.ts:38) — separate `just test-e2e`.

### Evidence
```
pnpm vitest run
 Test Files  262 passed | 5 skipped (267)
      Tests  3858 passed | 54 skipped (3912)
   Duration  97.00s
```

### Discoveries
- Pre-existing flaky test: `event-id.test.ts` generates 100 IDs, sometimes gets collisions (98-99 unique). Timestamp-based ID generation under fast iteration. Not our concern.

**Completed**: 2026-02-16T10:54
---
