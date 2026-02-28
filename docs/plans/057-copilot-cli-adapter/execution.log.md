# Plan 057: CopilotCLI Adapter — Execution Log

## T005: Extend AgentType union
Added `'copilot-cli'` to `AgentType` in `packages/shared/src/features/034-agentic-cli/types.ts`.
One-line change. No tests affected.

## T002t → T002: EventsJsonlParser (TDD)
- **RED**: Wrote 15 tests covering all 10+ event types, malformed line handling, empty lines, missing type field, and eventId preservation.
- **GREEN**: Implemented `parseEventsJsonlLine()` as a pure function with switch statement mapping. All 15 tests pass.
- **Discovery**: The `assistant.reasoning_delta` type also exists alongside `assistant.reasoning` — both mapped to `thinking`.

## T001t → T001: CopilotCLIAdapter (TDD)
- **RED**: Wrote 14 tests covering constructor, run() happy path, sessionId validation, path traversal protection, events.jsonl missing, tmux failure, timeout, malformed line skip, compact, terminate, and terminate-during-run.
- **GREEN**: First implementation used AbortController for both timeout and terminate — caused unhandled rejection when promise settled before abort fired. Rewrote to use `terminated` flag + `activeResolve` callback pattern. Cleaner and no leaking promises.
- **Discovery**: AbortController's `signal.addEventListener('abort', ...)` fires even after promise resolution, causing unhandled rejections in Vitest. The `settled` guard pattern alone wasn't sufficient; needed to completely separate timeout (via `Date.now()` comparison in poll loop) from terminate (via instance flag + stored resolve callback).
- Added `defaultSessionId` option to support contract tests that call `run()` without sessionId.

## T003: compact() and terminate()
Implemented inline with T001 — same file. compact() sends "/compact" via sendKeys, terminate() sets `terminated=true`, calls `stopPolling()`, and resolves any active tail promise immediately.

## T004: Contract tests
Registered `CopilotCLIAdapter` in `test/contracts/agent-adapter.contract.test.ts`. Used injectable sendKeys that appends events.jsonl responses when "Enter" is received (simulating CLI response). All 9 contract tests pass (36 total across 4 adapters).

## T006: Factory registration
Added `copilot-cli` case in `apps/cli/src/lib/container.ts` adapter factory. Uses `execSync` for real tmux send-keys.

## T008: Barrel export
Added `CopilotCLIAdapter`, `CopilotCLIAdapterOptions`, `parseEventsJsonlLine` to both `packages/shared/src/adapters/index.ts` and `packages/shared/src/index.ts`.

## T007: E2E test script
Created `scripts/test-copilot-cli-adapter.ts` with 5 tests: run+events, tool events, compact, terminate, reconnect after terminate. Usage: `npx tsx scripts/test-copilot-cli-adapter.ts <sessionId> <tmuxSession> <pane>`.

## Validation
- `just fft` passes: lint ✅, format ✅, typecheck ✅, 4679 tests pass ✅
- 65 new tests (15 parser + 14 adapter + 36 contract)
- No existing tests broken

## Discoveries & Learnings

| # | Type | Discovery |
|---|------|-----------|
| 1 | Gotcha | AbortController event listeners fire even after promise resolution — use flag guards + stored resolve instead |
| 2 | Decision | Used custom polling tailing instead of `tail-file` npm package — CJS/ESM friction wasn't worth it for a ~30 LOC implementation |
| 3 | Decision | Added `defaultSessionId` option to support contract tests that don't pass sessionId |
| 4 | Insight | Contract test factory pattern for file-based adapters: use sendKeys as trigger to append fixture events to temp file |
