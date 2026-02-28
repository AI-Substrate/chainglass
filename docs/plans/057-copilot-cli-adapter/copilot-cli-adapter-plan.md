# CopilotCLI Adapter Implementation Plan

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-02-28
**Spec**: [copilot-cli-adapter-spec.md](copilot-cli-adapter-spec.md)
**Status**: DRAFT

## Summary

Add a new `IAgentAdapter` implementation (`CopilotCLIAdapter`) that attaches to a running Copilot CLI via tmux for input and events.jsonl file-tailing for output. This enables the workflow system to observe and participate in user-driven terminal sessions — the adapter is an observer and participant, not an owner. Pure additive: one new adapter class, one interface, one fake, contract tests, factory registration, and an E2E test script.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| (infrastructure — shared adapters) | existing | **modify** | Add adapter, interface, fake to `packages/shared/src/` |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `packages/shared/src/interfaces/tmux-executor.interface.ts` | shared | contract | Injectable tmux execution interface |
| `packages/shared/src/adapters/copilot-cli.adapter.ts` | shared | internal | Core adapter implementation |
| `packages/shared/src/adapters/events-jsonl-parser.ts` | shared | internal | Event translation from events.jsonl → AgentEvent |
| `packages/shared/src/fakes/fake-tmux-executor.ts` | shared | internal | Test double for tmux |
| `packages/shared/src/features/034-agentic-cli/types.ts` | shared | contract | Extend AgentType union |
| `apps/cli/src/lib/container.ts` | cli | internal | Add factory case for 'copilot-cli' |
| `test/contracts/agent-adapter.contract.test.ts` | test | internal | Register CopilotCLIAdapter in contract tests |
| `test/unit/shared/adapters/copilot-cli-adapter.test.ts` | test | internal | Unit tests for adapter |
| `test/unit/shared/adapters/events-jsonl-parser.test.ts` | test | internal | Unit tests for event parser |
| `scripts/test-copilot-cli-adapter.ts` | scripts | internal | E2E test script with real CLI |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Adapter factory is at `apps/cli/src/lib/container.ts:345-353`. Add `if (agentType === 'copilot-cli')` case. | Task T009 |
| 02 | Critical | `AgentType` union at `packages/shared/src/features/034-agentic-cli/types.ts:17` must be extended with `'copilot-cli'`. Also mirrored in `agent-instance.interface.ts`. | Task T008 |
| 03 | Critical | Contract tests at `test/contracts/agent-adapter.contract.test.ts` — add `agentAdapterContractTests('CopilotCLIAdapter', ...)` call. | Task T007 |
| 04 | High | No `ITmuxExecutor` exists — create fresh. Follows `IProcessManager` pattern (injectable, fakeable). | Task T001 |
| 05 | High | `events.jsonl` format: `{"type":"...","data":{...},"timestamp":"...","id":"..."}` per line. Parser must handle all 13+ event types. | Task T003 |
| 06 | High | Per PL-12: file watcher must start BEFORE prompt is sent. Per PL-07: skip malformed lines. Per PL-09: validate sessionId paths. | Tasks T005, T006 |

## Implementation

**Objective**: Implement CopilotCLIAdapter with full TDD, fakes, contract tests, and E2E validation script.
**Testing Approach**: TDD (RED-GREEN-REFACTOR). Fakes only, no mocks. Contract tests for parity.

### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Create `ITmuxExecutor` interface | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/interfaces/tmux-executor.interface.ts` | Interface defined with `sendKeys()`, `sendEnter()` methods | Per finding 04. Follows IProcessManager pattern |
| [ ] | T002 | Create `FakeTmuxExecutor` | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/fakes/fake-tmux-executor.ts` | Fake has assertion helpers: `getSendHistory()`, `assertSendCalled()`. Configurable responses | Interface-first: fake before real |
| [ ] | T003 | Create `EventsJsonlParser` | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/adapters/events-jsonl-parser.ts` | Translates all 10+ events.jsonl types to AgentEvent union. Unit tests pass with fixture data | Per finding 05. Extract as pure function — no I/O |
| [ ] | T003t | Write parser unit tests | test | `/Users/jordanknight/substrate/chainglass-048/test/unit/shared/adapters/events-jsonl-parser.test.ts` | Tests cover: each event type mapping, malformed line skipping (PL-07), unknown type passthrough | TDD: write tests FIRST |
| [ ] | T004 | Create `RealTmuxExecutor` | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/adapters/real-tmux-executor.ts` | Wraps `execSync('tmux send-keys ...')`. Text and Enter sent separately (proven in prototype) | Implements ITmuxExecutor |
| [ ] | T005 | Create `CopilotCLIAdapter` core | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/adapters/copilot-cli.adapter.ts` | Implements `IAgentAdapter.run()`: validates inputs, starts `tail-file` watcher BEFORE send (PL-12), sends via tmux, waits for `session.idle`, returns `AgentResult` | Core deliverable. Use `tail-file` npm package for byte-offset file tailing (no custom fs.watch logic) |
| [ ] | T005t | Write adapter unit tests | test | `/Users/jordanknight/substrate/chainglass-048/test/unit/shared/adapters/copilot-cli-adapter.test.ts` | Tests: run() happy path, sessionId required, tmux unreachable → failed, timeout → failed, events emitted via onEvent, terminate() disconnects cleanly | TDD: write tests FIRST using FakeTmuxExecutor |
| [ ] | T006 | Implement `compact()` and `terminate()` | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/adapters/copilot-cli.adapter.ts` | `compact()` sends "/compact" via tmux. `terminate()` stops watcher, returns `{status:'killed', exitCode:0}`. Neither kills CLI process | Per workshop Q7: disconnect only |
| [ ] | T007 | Register in contract tests | test | `/Users/jordanknight/substrate/chainglass-048/test/contracts/agent-adapter.contract.test.ts` | `agentAdapterContractTests('CopilotCLIAdapter', ...)` passes all 9 contract tests | Per finding 03 |
| [ ] | T008 | Extend `AgentType` union | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/features/034-agentic-cli/types.ts` | Add `'copilot-cli'` to AgentType. Update any mirror definitions | Per finding 02 |
| [ ] | T009 | Register in adapter factory | cli | `/Users/jordanknight/substrate/chainglass-048/apps/cli/src/lib/container.ts` | Add `if (agentType === 'copilot-cli') return new CopilotCLIAdapter(...)` in factory | Per finding 01 |
| [ ] | T010 | Create E2E test script | scripts | `/Users/jordanknight/substrate/chainglass-048/scripts/test-copilot-cli-adapter.ts` | Script takes `<sessionId> <tmuxSession> <pane>`, runs 5 tests against real CLI, reports pass/fail. See workshop 002 | Part-human, part-automatic per CL-05 |
| [ ] | T011 | Export from barrel | shared | `/Users/jordanknight/substrate/chainglass-048/packages/shared/src/index.ts` | `CopilotCLIAdapter`, `ITmuxExecutor`, `FakeTmuxExecutor` exported | Standard barrel pattern |

### Acceptance Criteria

- [ ] AC-01: `CopilotCLIAdapter` implements `IAgentAdapter` with `run()`, `compact()`, and `terminate()`
- [ ] AC-02: `run()` sends prompt via tmux, returns `AgentResult` after `session.idle`
- [ ] AC-03: `run()` emits `AgentEvent` objects via `onEvent` callback
- [ ] AC-04: Event translation maps all specified events.jsonl types correctly
- [ ] AC-05: `run()` returns `status: 'failed'` if tmux unreachable or events.jsonl missing
- [ ] AC-06: `run()` returns `status: 'failed'` on timeout
- [ ] AC-07: `compact()` sends "/compact" via tmux
- [ ] AC-08: `terminate()` disconnects without killing CLI
- [ ] AC-09: `terminate()` returns `{status: 'killed', exitCode: 0}`
- [ ] AC-10: Passes `agentAdapterContractTests` suite
- [ ] AC-11: File watcher starts before prompt sent
- [ ] AC-12: Malformed NDJSON lines silently skipped
- [ ] AC-13: Session IDs validated against path traversal
- [ ] AC-14: Registered in factory as `'copilot-cli'`
- [ ] AC-15: tmux execution is injectable (FakeTmuxExecutor used in tests)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| events.jsonl format changes in CLI update | Medium | High | Pin version; format detection in session.start |
| tmux send-keys timing fragility | Low | Medium | Proven in prototype with 100ms delay |
| File watcher misses events | Low | Low | 500ms polling fallback alongside fs.watch |
| Contract tests need adapter-specific setup | Low | Medium | FakeTmuxExecutor + fixture events.jsonl |

## Fixes

| ID | Title | Status |
|----|-------|--------|
| — | — | — |
