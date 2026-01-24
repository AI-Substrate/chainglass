# Agent Control Service

**Mode**: Full

ℹ️ **Research Status**
- **Claude Code SDK**: ✅ Resolved via Vibe Kanban codebase (flag: `--dangerously-skip-permissions`, tokens from `usage` field)
- **Copilot CLI**: 🔬 Token reporting and compact command to be researched during implementation
- **OpenCode API**: Deferred (not in v1 scope)

---

## Research Context

📚 This specification incorporates findings from research-dossier.md

- **Components affected**: Agent adapters (Claude Code, Copilot CLI), session management, process lifecycle control
- **Critical dependencies**: Claude Code CLI (`@anthropic-ai/claude-code`), GitHub Copilot CLI (`@github/copilot`), child process management
- **Modification risks**:
  - Session ID extraction differs per agent (stdout vs log files)
  - Token reporting mechanism undocumented for Copilot CLI
  - Agent CLI versions may change flag semantics
- **Link**: See `research-dossier.md` for full analysis

---

## Summary

**WHAT**: A service that executes prompts through AI coding agents (Claude Code, GitHub Copilot CLI) with session continuity, providing a unified interface for running prompts, tracking token usage, managing sessions, and controlling agent processes.

**WHY**: Enable programmatic orchestration of coding agents for automated development workflows. Users need to:
- Run prompts and receive structured results without manual CLI interaction
- Resume sessions to maintain context across multiple interactions
- Track token consumption to know when context compaction is needed
- Terminate runaway or stuck agent processes gracefully
- Support multiple agent backends through a consistent interface

---

## Goals

1. **Unified agent execution**: Run prompts through Claude Code or Copilot CLI via injected adapters, abstracting CLI differences
2. **Session continuity**: First execution returns a session ID; subsequent executions resume that session with full context
3. **Token visibility**: Track tokens used per turn and cumulatively across the session to inform compaction decisions
4. **Context compaction**: Support `/compact` command to reduce token usage when approaching limits
5. **Graceful termination**: Stop running agents cleanly via signal escalation (SIGINT → SIGTERM → SIGKILL)
6. **Structured results**: Return result objects containing output, status, exit code, stderr, and token metrics
7. **Full autonomy mode**: Always run in permission-bypass mode (no approval workflows)

---

## Non-Goals

1. **Real-time streaming**: Output is returned on completion, not streamed incrementally
2. **Approval workflows**: No interactive permission handling; always runs in bypass/yolo mode
3. **Message queuing**: No queuing prompts while agent is running
4. **MCP interface**: REST/programmatic access is out of scope; this is a library/service component
5. **Web UI**: No user interface; this is a backend service consumed programmatically
6. **OpenCode support**: Deferred to future version (v2+)
7. **Multi-agent orchestration**: Running multiple agents simultaneously is out of scope
8. **Workspace isolation**: Git worktree management is caller's responsibility

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | Multiple modules: service, adapters (2), process manager (stateless) |
| Integration (I) | 2 | Two external CLIs with different behaviors (Claude Code, Copilot) |
| Data/State (D) | 1 | Session state tracking (in-memory or simple persistence) |
| Novelty (N) | 1 | Research available but some gaps (Copilot token reporting unknown) |
| Non-Functional (F) | 1 | Process management requires careful signal handling |
| Testing/Rollout (T) | 1 | Integration tests needed for actual CLI interaction |

**Total**: P = 7 → **CS-3**

**Confidence**: 0.75

**Assumptions**:
- Claude Code CLI flag semantics remain stable
- Copilot CLI supports session resumption via `--resume` flag
- Token usage is extractable from Claude Code stream-json output
- Signal escalation pattern works reliably across platforms

**Dependencies**:
- `@anthropic-ai/claude-code` CLI (npm package)
- `@github/copilot` CLI (npm package)
- Node.js child process APIs (or equivalent in target runtime)

**Risks**:
- Copilot CLI token reporting mechanism undocumented; may require experimentation
- CLI version updates could break flag parsing
- Session ID extraction from Copilot log files adds complexity and latency

**Phases**:
1. **Core service skeleton**: Interface definitions, DI setup, result types
2. **Claude Code adapter**: Spawn, output parsing, session extraction, token tracking
3. **Process management**: Termination with signal escalation, exit monitoring
4. **Copilot adapter**: Spawn, log file parsing, session extraction (best-effort token tracking)
5. **Commands**: `/compact` implementation for both adapters

---

## Acceptance Criteria

### Session Management

1. **AC-1**: When a prompt is executed without a session ID, the service spawns a new agent session and returns a result containing a valid session ID extracted from the agent output
2. **AC-2**: When a prompt is executed with an existing session ID, the service resumes that session and the agent has access to prior conversation context
3. **AC-3**: When a session ID is provided that does not exist or is invalid, the service returns a result with `status: 'failed'` and appropriate error information

### Execution Results

4. **AC-4**: Every execution returns a result object containing: `output` (string), `sessionId` (string), `status` ('completed' | 'failed' | 'killed'), `exitCode` (number), and `tokens` (object with `used` and `total`)
5. **AC-5**: When the agent process exits normally with exit code 0, the result status is `'completed'`
6. **AC-6**: When the agent process exits with non-zero exit code, the result status is `'failed'` and `exitCode` reflects the actual exit code
7. **AC-7**: When the agent process is terminated via the terminate method, the result status is `'killed'`
8. **AC-8**: Stderr output from the agent process is captured and included in the result when present

### Token Tracking

9. **AC-9**: Each result includes `tokens.used` reflecting tokens consumed in that execution turn (extracted from agent output)
10. **AC-10**: Each result includes `tokens.total` reflecting cumulative session tokens (extracted from agent output; agent tracks this)
11. **AC-11**: Token usage includes a `limit` field indicating the agent's context limit for compaction decisions

### Commands

12. **AC-12**: Calling `compact(sessionId)` sends the `/compact` command (or equivalent) to the agent and returns a result reflecting the compacted session state
13. **AC-13**: After compaction, `tokens.total` reflects the reduced token count

### Process Control

14. **AC-14**: Calling `terminate(sessionId)` stops the running agent process within 10 seconds using signal escalation (SIGINT → SIGTERM → SIGKILL)
15. **AC-15**: After termination, the session can still be resumed with a new prompt (the session ID remains valid)

### Agent Adapters

16. **AC-16**: Claude Code adapter executes prompts using `--output-format=stream-json` and `--dangerously-skip-permissions`
17. **AC-17**: Copilot adapter executes prompts with appropriate flags and extracts session IDs from log files
18. **AC-18**: Adapters are injected into the service at construction time, enabling testing with mock adapters

### Error Handling

19. **AC-19**: If the agent CLI is not installed or not found, the service returns a result with `status: 'failed'` and descriptive error in output
20. **AC-20**: If the agent process exceeds the configured timeout (default 10 minutes via config system), it is terminated and result status is `'failed'`

---

## Testing Strategy

**Approach**: Full TDD

**Rationale**: External CLI integration, process lifecycle management, and session state tracking require comprehensive test coverage to ensure reliability across adapters.

**Focus Areas**:
- Service interface contract (run, compact, terminate, getTokenUsage)
- Adapter implementations (Claude Code, Copilot) with mocked CLI interactions
- Session state management and token accumulation
- Process lifecycle (spawn, signal escalation, exit monitoring)
- Result object construction for all status paths (completed, failed, killed)
- Error handling (CLI not found, invalid session, timeout)

**Excluded**:
- Platform-specific signal handling edge cases (documented as known limitations)

**Mock Usage**: Avoid mocks entirely
- Tests use real CLI interactions with actual Claude Code and Copilot CLIs
- Requires CLI tools installed in test environment
- Test fixtures use real prompts that execute quickly (simple queries)
- Implications: Tests are slower but validate actual behavior; CI requires CLI access and credentials

---

## Documentation Strategy

**Location**: docs/how/dev/

**Rationale**: Internal library/service component targeting developers who consume or extend the service.

**Target Audience**: Developers integrating the agent control service into workflows or adding new agent adapters.

**Content**:
- API interface reference and usage examples
- Adapter implementation guide (for adding new agents)
- Session management and token tracking patterns
- Process lifecycle and termination behavior

**Maintenance**: Update when API changes or new adapters are added.

---

## Risks & Assumptions

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Copilot CLI token reporting unavailable | Cannot track tokens for compaction decisions | Medium | Log warning, return null/estimate, document limitation |
| CLI version changes break parsing | Session extraction or output parsing fails | Low | Pin CLI versions, add version detection, graceful degradation |
| Session ID extraction timing | Copilot log file may not be written immediately | Medium | Polling with timeout, retry logic |
| Signal handling platform differences | Termination may behave differently on Windows | Low | Abstract signal handling, platform-specific implementations |
| Long-running agents exhaust resources | Memory/CPU consumption for stuck agents | Medium | Configurable timeout, terminate method, process monitoring |

### Assumptions

1. Claude Code `stream-json` output format includes session ID in parseable messages
2. Claude Code `stream-json` output includes token usage in Result messages
3. Copilot CLI `--resume` flag correctly restores session context
4. Both CLIs can be invoked via `npx` or direct binary path
5. Process group management allows clean termination of agent and child processes
6. `/compact` command (or equivalent) is supported by both agents
7. Session IDs are stable across process restarts (file-backed by the agents)

---

## Open Questions

1. **[RESEARCH NEEDED: Copilot token reporting]** How does Copilot CLI report token usage? Is it in log files, stdout, or not available? This affects whether we can implement AC-9/AC-10 for Copilot.

2. **[RESEARCH NEEDED: Copilot compact command]** Does Copilot CLI support a `/compact` equivalent? What is the exact command syntax?

### Resolved via Vibe Kanban Codebase

3. **Claude Code permission flag**: `--dangerously-skip-permissions` (verified in `crates/executors/src/executors/claude.rs:105`)

4. **Claude Code token reporting**: Extracted from stream-json `usage` field in messages:
   - `total_tokens = input_tokens + output_tokens` (includes cache tokens)
   - `model_context_window` from result message
   - Structure: `{ total_tokens: number, model_context_window: number }`

---

## ADR Seeds (Optional)

### ADR-001: Agent Adapter Interface Design

**Decision Drivers**:
- Two agents with fundamentally different I/O patterns (stdout stream vs log files)
- Need for testability via mock adapters
- Future extensibility for additional agents (Codex, Gemini, etc.)

**Candidate Alternatives**:
- A) Trait/interface with spawn, extractSessionId, extractResult, extractTokens, terminate methods
- B) Abstract base class with template method pattern for shared process management
- C) Functional adapter pattern with configuration objects

**Stakeholders**: Service consumers, future agent integrators

### ADR-002: Process Lifecycle Management

**Decision Drivers**:
- Clean termination prevents zombie processes
- Cross-platform signal handling complexity
- Process group management for child processes

**Candidate Alternatives**:
- A) Direct signal sending with timeouts
- B) Process group spawn with group signal
- C) Wrapper process that handles lifecycle

**Stakeholders**: System administrators, reliability

---

## Unresolved Research

**Topics**:
- Copilot CLI: Token reporting mechanism, compact command syntax, log file format for session ID

**Resolved** (via Vibe Kanban codebase):
- Claude Code SDK: `--dangerously-skip-permissions` flag, token extraction from `usage` field

**Impact**:
- Token tracking for Copilot may be partially implemented or unavailable
- Compact command for Copilot may need experimentation to discover

**Recommendation**: Claude Code adapter can proceed with full confidence. Copilot adapter may require experimentation during implementation for token reporting and compact command.

---

## Clarifications

### Session 2026-01-22

**Q1: Workflow Mode**
- **Question**: What workflow mode fits this task?
- **Answer**: B (Full)
- **Rationale**: CS-3 complexity with 5 proposed phases, two different adapter implementations with different I/O patterns, and process lifecycle management warrants full multi-phase planning with all gates.

**Q2: Testing Strategy**
- **Question**: What testing approach best fits this feature's complexity and risk profile?
- **Answer**: A (Full TDD)
- **Rationale**: External CLI integration, process lifecycle management, and session state tracking require comprehensive test coverage to ensure reliability.

**Q3: Mock Usage**
- **Question**: How should mocks/stubs/fakes be used during implementation?
- **Answer**: A (Avoid mocks entirely)
- **Rationale**: Tests will use real CLI interactions with fixtures/real data. This ensures tests validate actual behavior rather than assumed behavior.

**Q4: Documentation Strategy**
- **Question**: Where should this feature's documentation live?
- **Answer**: docs/how/dev/ (developer documentation)
- **Rationale**: Internal library/service component; documentation targets developers consuming or extending the service.

**Q5: Session Persistence**
- **Question**: Should session state (token counts) persist across service restarts?
- **Answer**: No persistence; memory/state is an external concept
- **Rationale**: Session IDs are passed in by caller; agents handle their own session persistence. Service is stateless - no session store needed.

**Q6: Execution Timeout**
- **Question**: Should there be a default execution timeout?
- **Answer**: D (Configurable) with 10 minute default via config system
- **Rationale**: Sensible default prevents runaway agents; use existing config system for timeout configuration.

### Coverage Summary

| Category | Status | Details |
|----------|--------|---------|
| Workflow Mode | ✅ Resolved | Full (multi-phase with all gates) |
| Testing Strategy | ✅ Resolved | Full TDD, no mocks, real CLI integration |
| Documentation | ✅ Resolved | docs/how/dev/ for developer documentation |
| Session Persistence | ✅ Resolved | Stateless service; hosting layer manages state |
| Timeout | ✅ Resolved | Configurable via config system, 10 min default |
| Copilot Token Reporting | 🔬 Deferred | Research during implementation |
| Copilot Compact Command | 🔬 Deferred | Research during implementation |
| Claude Code Flag | ✅ Resolved | `--dangerously-skip-permissions` (verified in vibe-kanban) |
| Claude Code Token Reporting | ✅ Resolved | `usage` field in stream-json messages |

**Resolved**: 7 clarifications (including 2 from vibe-kanban codebase)
**Deferred to Implementation**: 2 research items (Copilot-specific, not blocking)
**Outstanding**: 0

---

*Specification generated: 2026-01-22*
*Clarifications completed: 2026-01-22*
*Plan directory: docs/plans/002-agent-control/*
*Next step: Run `/plan-2-clarify` for high-impact questions*
