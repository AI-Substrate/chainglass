# CopilotCLI Adapter

📚 This specification incorporates findings from research-dossier.md and workshops/001-intent-and-design.md

## Research Context

Extensive prototyping proved that the Copilot CLI's `~/.copilot/session-state/{id}/events.jsonl` file contains full structured events (30+ types) appended in real-time, and that `tmux send-keys` can reliably inject prompts into a running Copilot TUI. The SDK adapter (`SdkCopilotAdapter`) cannot share sessions with a user's running CLI — events don't fan out to multiple SDK clients, and the CLI has no public `--connect-to` flag. This adapter bridges that gap by using file watching and tmux as side-channels.

## Product Context

Chainglass is a **workflow orchestration system** where agent nodes execute in a graph (lines of serial/parallel nodes with gates and transitions). Today, each node runs via the SDK adapter — fully programmatic, fully background. But real-world usage demands more flexibility:

- **Background-only**: The orchestrator drives `sample-spec-builder` → `sample-spec-reviewer` → `sample-pr-preparer` entirely in the background. No human in the loop. SDK adapter is perfect here.
- **Human-in-the-loop**: A node is running and the user wants to jump into that session in their terminal, see what the agent is doing, and type alongside it. The agent is still executing the workflow prompt, but the user is co-piloting in real-time.
- **Terminal-first**: The user starts working in `copilot` in their terminal. Later, the workflow system attaches to that session to inject follow-up prompts (e.g., "now run the tests" or "submit the PR") as part of the graph progression.
- **Hybrid switching**: A session starts via SDK adapter in the web UI. User switches to the CLI adapter mid-workflow to get the full terminal experience, then switches back.

The CopilotCLI adapter enables all of these by treating the Copilot CLI as the execution surface and the adapter as an **observer and participant** rather than an owner. The workflow system can inject prompts into a session the user is actively working in, or observe a session that's running autonomously — same adapter, same events, same interface.

## Summary

A new `IAgentAdapter` implementation (`CopilotCLIAdapter`) that **attaches to an already-running Copilot CLI instance** rather than owning or spawning one. It reads agent events by tailing `events.jsonl` and sends prompts by injecting keystrokes via `tmux send-keys`. This enables a **dual-view** where users work in their terminal while the Chainglass web UI observes and participates in the same agent session.

The SDK adapter remains the right choice for programmatic orchestration (workflow nodes, automated pipelines). This adapter serves a different purpose: **bridging human-driven terminal sessions into the Chainglass observation and interaction layer**.

## Goals

- Enable the Chainglass web UI to observe a user's live Copilot CLI session in real-time (tool calls, reasoning, messages, token usage)
- Enable the web UI to send prompts into the user's running Copilot CLI session
- Implement the standard `IAgentAdapter` interface so the adapter is interchangeable with existing adapters in the agent manager system
- Translate Copilot CLI events from `events.jsonl` into the unified `AgentEvent` discriminated union
- Pass the existing contract test suite (`agentAdapterContractTests`) to guarantee behavioral parity with other adapters
- Support `compact()` by sending `/compact` as a prompt through the CLI
- Support `terminate()` as a clean disconnect — stop watching, clean up resources, leave the CLI running

## Non-Goals

- Spawning or managing the Copilot CLI process (adapter requires it to already be running)
- Session discovery or session picker UI (out of scope — adapter takes a sessionId)
- Replacing the SDK adapter for workflow orchestration use cases
- Working outside tmux (tmux is a hard dependency for input injection)
- Read-only observation mode without tmux (always requires tmux for v1)
- Sub-100ms event latency (file polling at ~500ms is acceptable)
- Killing or terminating the user's CLI process (we don't own it)
- Tracking which events were caused by our prompts vs user typing (report everything)
- Platform support beyond macOS/Linux (tmux dependency)

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| (infrastructure — shared adapters) | existing | **modify** | Add new adapter implementation to `packages/shared/src/adapters/` alongside ClaudeCodeAdapter and SdkCopilotAdapter |

No new domains are created. Agent adapters are infrastructure leaf nodes in the dependency graph — they sit in `packages/shared` and are consumed by `AgentManagerService` via the adapter factory. No domain contracts are added or modified.

## Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=0, T=1
  - **Surface Area (S=1)**: New adapter file, factory modification, contract test registration — multiple files but all within the adapter pattern
  - **Integration (I=1)**: One external dependency (tmux via `execSync`), one file system dependency (`events.jsonl` format)
  - **Data/State (D=0)**: No schema changes, no migrations — reads existing Copilot session files
  - **Novelty (N=0)**: Well-specified via workshop with all 10 questions resolved; proven prototype exists
  - **Non-Functional (F=0)**: Standard requirements — no special security, performance, or compliance concerns beyond existing session ID validation
  - **Testing/Rollout (T=1)**: Must pass contract tests + add integration tests gated by CLI/tmux availability
- **Confidence**: 0.90
- **Assumptions**:
  - `events.jsonl` format is stable across Copilot CLI versions
  - tmux is always available in the development environment
  - `session.idle` event reliably indicates prompt completion
- **Dependencies**:
  - `copilot` binary installed
  - `tmux` available
  - Existing `IAgentAdapter` interface and contract tests
- **Risks**:
  - Copilot CLI may change `events.jsonl` format without notice (no public API guarantee)
  - tmux `send-keys` timing may be fragile across different terminal emulators
- **Phases**: 2 suggested — (1) Core adapter + event parser + contract tests, (2) Integration tests + DI registration

## Acceptance Criteria

1. **AC-01**: `CopilotCLIAdapter` implements `IAgentAdapter` with `run()`, `compact()`, and `terminate()` methods
2. **AC-02**: `run()` accepts `AgentRunOptions` with required `sessionId`, sends the prompt via `tmux send-keys`, and returns `AgentResult` after `session.idle` is detected
3. **AC-03**: `run()` emits `AgentEvent` objects via the `onEvent` callback as new lines appear in `events.jsonl`
4. **AC-04**: Event translation correctly maps at least these events.jsonl types to AgentEvent types: `assistant.message` → `message`, `assistant.message_delta` → `text_delta`, `tool.execution_start` → `tool_call`, `tool.execution_complete` → `tool_result`, `assistant.reasoning` → `thinking`, `assistant.usage` → `usage`, `session.idle` → `session_idle`
5. **AC-05**: `run()` returns `status: 'failed'` if the tmux pane is unreachable or `events.jsonl` doesn't exist
6. **AC-06**: `run()` returns `status: 'failed'` with appropriate error if execution times out (configurable, default 5 minutes)
7. **AC-07**: `compact()` sends `/compact` as a prompt through tmux and waits for `session.idle`
8. **AC-08**: `terminate()` stops the file watcher, cleans up internal state, and returns — it does NOT kill the user's CLI process
9. **AC-09**: `terminate()` returns `AgentResult` with `status: 'killed'` and `exitCode: 0`
10. **AC-10**: The adapter passes the existing `agentAdapterContractTests` suite
11. **AC-11**: The file watcher starts BEFORE the prompt is sent (to avoid missing early events, per PL-12)
12. **AC-12**: Malformed lines in `events.jsonl` are silently skipped without failing the session (per PL-07)
13. **AC-13**: Session IDs are validated against path traversal before constructing file paths (per PL-09)
14. **AC-14**: The adapter is registered in the adapter factory under the type `'copilot-cli'`
15. **AC-15**: tmux command execution is injectable (not hardcoded `execSync`) to enable unit testing with a fake executor

## Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `events.jsonl` format changes in a Copilot CLI update | Medium | High | Pin Copilot CLI version; add format version detection in `session.start` event |
| tmux `send-keys` timing issues (text + Enter race) | Low | Medium | Proven in prototype with 100ms sleep between calls |
| File watcher misses events on high-throughput sessions | Low | Low | Polling fallback at 500ms catches anything `fs.watch` misses |
| Concurrent prompts from terminal + web interleave | Low | Low | TUI input is atomic; prompts queue naturally |

**Assumptions**:
- The development environment always has tmux available
- Users will start the Copilot CLI before attempting to attach the adapter
- The `events.jsonl` file is append-only (never truncated or rotated during a session)
- `session.idle` is a reliable completion signal

## Clarifications

**CL-01 (Workflow Mode)**: Simple — CS-2 small feature, well-specified.

**CL-02 (Testing)**: Full TDD. Write tests first, implement to pass them.

**CL-03 (Test Doubles)**: Fakes only — no vi.mock(). Injectable tmux executor with FakeTmuxExecutor for unit tests. Fixture events.jsonl files for parser tests.

**CL-04 (Documentation)**: No new documentation beyond what already exists in this plan folder.

**CL-05 (E2E Test Script)**: Create `scripts/test-copilot-cli-adapter.ts` that takes 3 CLI args: `<sessionId> <tmuxSession> <paneIndex>`. User starts copilot in the tmux pane first, then runs the script. Script creates the adapter, sends a real prompt, verifies events stream back, checks AgentResult, reports pass/fail. Usage: `npx tsx scripts/test-copilot-cli-adapter.ts cee9a7ba-... studio 1.0`

**CL-06 (Domain)**: No domain changes. Infrastructure adapter in `packages/shared/src/adapters/`.

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| _(none identified)_ | — | Workshop already completed (001-intent-and-design.md) | All resolved |

The intent workshop has been completed with all design questions resolved. No further workshops needed before architecture.
