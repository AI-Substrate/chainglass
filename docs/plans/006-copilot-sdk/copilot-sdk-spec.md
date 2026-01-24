# Copilot SDK Migration

**Mode**: Full (architectural refactoring with phased rollout)

> This specification incorporates findings from `research-dossier.md`

---

## Research Context

Based on comprehensive analysis of both the GitHub Copilot SDK (`@github/copilot-sdk`) and our current CopilotAdapter implementation:

- **Components affected**: CopilotAdapter, CopilotLogParser (to be removed), adapter tests, developer documentation
- **Critical dependencies**: `@github/copilot-sdk` npm package, IAgentAdapter contract, existing contract test suite
- **Modification risks**:
  - Contract test regression (9 tests must pass)
  - Session resumption behavior change (reliable → more reliable)
  - Removal of polling/parsing code (simplification, but breaking change internally)
- **Key findings**:
  - SDK eliminates 10 identified pain points (CA-01 through CA-10)
  - Session IDs returned immediately (no polling)
  - 30+ typed events enable future streaming capabilities
  - Token metrics remain unavailable (acceptable per PL-04)
- **Link**: See `research-dossier.md` for full analysis

---

## Summary

**WHAT**: Replace the current CopilotAdapter's "hacky" log-file-polling implementation with the official GitHub Copilot SDK (`@github/copilot-sdk`), which provides proper JSON-RPC communication, immediate session IDs, and event-driven architecture.

**WHY**: The current implementation has fundamental reliability issues:
1. Session ID extraction depends on undocumented log file formats and regex patterns
2. Exponential backoff polling (50ms-5s) adds latency and can fail silently
3. Fallback session IDs (`copilot-{pid}-{timestamp}`) cannot actually resume sessions
4. No real-time event streaming or progress indication
5. The compact command implementation is a workaround that may not function correctly

The SDK provides a supported, documented API that eliminates these issues while maintaining full compatibility with our IAgentAdapter contract.

---

## Goals

1. **Reliable session management** - Session IDs are returned immediately from the SDK, eliminating polling failures and synthetic fallbacks
2. **Maintainable codebase** - Remove ~200 lines of polling/parsing workaround code; replace with ~50 lines of SDK integration
3. **Contract compliance** - All 9 existing contract tests continue to pass without modification
4. **Preserved behavior** - External API (IAgentAdapter) remains unchanged; consumers see no breaking changes
5. **Foundation for streaming** - SDK's event system enables future streaming output capabilities (not in scope for this migration)
6. **Cleaner error handling** - SDK provides structured error events with stack traces instead of exit-code-only errors

---

## Non-Goals

1. **Streaming output support** - The SDK enables this, but implementing streaming is a separate feature
2. **Token metrics** - SDK doesn't expose token counts; we continue returning `tokens: null` (acceptable)
3. **Tool invocation support** - SDK has built-in tool handling, but our IAgentAdapter doesn't expose this
4. **MCP server integration** - SDK supports MCP, but this is out of scope for this migration
5. **Permission handler customization** - SDK allows fine-grained permissions; not needed for our use case
6. **Multi-model support** - SDK can query available models; not relevant to adapter interface

---

## Complexity

**Score**: CS-3 (medium)

**Breakdown**:
| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 1 | Multiple files: adapter, parser (delete), tests, docs |
| Integration (I) | 1 | One external dep: `@github/copilot-sdk` (stable, official) |
| Data/State (D) | 0 | No schema changes; session state is in-memory only |
| Novelty (N) | 1 | SDK is well-documented but new to our codebase |
| Non-Functional (F) | 0 | Standard reliability requirements |
| Testing/Rollout (T) | 1 | Integration testing needed; parallel implementation strategy |

**Total**: P = 1+1+0+1+0+1 = 4 → **CS-3 (medium)**

**Confidence**: 0.85 (high - comprehensive research completed, SDK is well-documented)

**Assumptions**:
- SDK's `@github/copilot-sdk` package is stable and follows semver
- SDK's session resumption works as documented
- Our existing contract tests are comprehensive enough to catch regressions
- FakeAgentAdapter pattern continues to work for testing

**Dependencies**:
- `@github/copilot-sdk` npm package availability
- Copilot CLI installed on target systems (SDK spawns it)
- Node.js version compatibility (SDK requires Node 18+)

**Risks**:
- SDK version updates could introduce breaking changes (mitigate: pin version)
- SDK startup latency could affect performance (mitigate: cache client instance)
- Contract tests might not cover edge cases (mitigate: add SDK-specific tests)

**Phases** (suggested):
1. SDK Integration Foundation - Add dependency, create parallel adapter
2. Session Management - Implement run/resume/terminate with SDK
3. Validation & Cleanup - Run contract tests, remove old code, update docs

---

## Acceptance Criteria

### Core Functionality

**AC-1**: Given a prompt, when `run()` is called without a sessionId, then a new session is created and a valid SDK-managed session ID is returned immediately (no polling).

**AC-2**: Given an existing session ID, when `run()` is called with that sessionId, then the session is resumed via SDK's `resumeSession()` and the conversation continues.

**AC-3**: Given a session ID, when `compact()` is called, then `/compact` is sent as a prompt to the session and the result is returned.

**AC-4**: Given an active session, when `terminate()` is called, then the session is aborted and destroyed via SDK APIs, returning status `'killed'`.

### Contract Compliance

**AC-5**: All 9 existing contract tests in `test/contracts/agent-adapter.contract.ts` pass without modification when run against the new SDK-based adapter.

**AC-6**: The `AgentResult` structure returned matches the existing interface: `{ output, sessionId, status, exitCode, tokens }`.

**AC-7**: Token metrics continue to return `null` (SDK doesn't expose this data).

### Error Handling

**AC-8**: Given an SDK error event, when `session.error` is emitted, then `run()` returns `status: 'failed'` with the error message in output.

**AC-9**: Given an invalid prompt (empty, too long, invalid characters), when `run()` is called, then validation fails before SDK interaction (existing behavior preserved).

**AC-10**: Given a workspace root violation in `cwd`, when `run()` is called, then the operation fails with a security error (existing behavior preserved).

### Code Quality

**AC-11**: The `CopilotLogParser` class and all log-file-polling code is removed from the codebase.

**AC-12**: The new adapter implementation is less than 150 lines of code (vs ~500 current).

**AC-13**: Developer documentation in `docs/how/dev/agent-control/3-adapters.md` is updated to reflect SDK-based implementation.

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SDK breaking changes in future versions | Low | Medium | Pin exact SDK version; monitor releases |
| Contract test gaps reveal edge cases | Low | High | Add SDK-specific integration tests |
| SDK startup latency affects UX | Medium | Low | Cache CopilotClient instance; use `autoStart: true` |
| SDK unavailable in some environments | Low | Medium | Document Copilot CLI requirement in setup |
| Session resumption behaves differently than current | Low | Medium | Comprehensive contract tests validate behavior |

### Assumptions

1. The `@github/copilot-sdk` package is production-ready and follows semantic versioning
2. Our 9 contract tests comprehensively validate IAgentAdapter behavior
3. The SDK's `sendAndWait()` method blocks until completion (matches our `run()` semantics)
4. Session IDs from `createSession()` are stable and can be stored/resumed
5. The FakeAgentAdapter pattern remains valid for testing (SDK adapter doesn't require special fake)

---

## Open Questions

~~All resolved - see Clarifications section below.~~

---

## Testing Strategy

**Approach**: Full TDD

**Rationale**: CS-3 refactoring with external dependency requires comprehensive testing to catch regressions and validate SDK integration.

**Mock Policy**: Fakes only (per ADR-0002)
- Create `FakeCopilotClient` implementing SDK interface for unit tests
- Inject via constructor following existing adapter patterns
- Real integration tests with actual SDK (skipped in CI)

**Focus Areas**:
- Contract test compliance (all 9 tests must pass)
- Session lifecycle (create, resume, terminate)
- Error mapping (SDK events → AgentResult status)
- Input validation (prompt, cwd) preserved

**Excluded**:
- SDK internals (trust the official package)
- Token metrics (known limitation, return null)

**Integration Tests**:
- Real SDK integration tests in separate file
- Mark with `describe.skip` or test tag for CI exclusion
- Run manually or in dedicated integration pipeline

---

## Documentation Strategy

**Location**: docs/how/ only (update existing)

**Rationale**: Feature modifies existing adapter; update `3-adapters.md` rather than create new docs.

**Content Updates**:
- Update Copilot adapter section with SDK-based implementation
- Remove references to log file polling
- Add SDK dependency/setup requirements
- Preserve overall document structure

**Target Audience**: Developers implementing or extending adapters

**Maintenance**: Update when SDK version changes significantly

---

## Design Decisions

**Client Lifecycle**: One CopilotClient per adapter instance
- Single client reused across all `run()` calls
- Created lazily on first use, cached thereafter
- Destroyed when adapter is disposed (if dispose pattern added)

**Session Caching**: No cache; rely on `resumeSession()`
- Adapter is stateless except for client reference
- SDK handles session state server-side
- Simpler implementation, avoids stale session risks

**Event Logging**: Verbose, controlled by logger debug levels
- Log all SDK events (session.*, assistant.*, tool.*)
- Use existing ILogger interface with appropriate levels
- Errors → logger.error, info → logger.debug, events → logger.trace

---

## ADR Seeds (Optional)

### Decision: SDK vs Continue with CLI Wrapper

**Decision Drivers**:
- Reliability requirement for session resumption
- Maintainability of polling/parsing code
- Alignment with official GitHub tooling
- Code complexity reduction

**Candidate Alternatives**:
- A: Adopt `@github/copilot-sdk` (recommended) - Official API, event-driven, immediate session IDs
- B: Keep current implementation - Known issues but working; no new dependency
- C: Build custom JSON-RPC client - More control but reinventing SDK

**Stakeholders**: Agent Control Service consumers, maintainers

---

## Specification Metadata

- **Created**: 2026-01-23
- **Author**: Claude (assisted specification)
- **Status**: Ready for Architecture
- **Plan Directory**: `docs/plans/006-copilot-sdk/`
- **Research**: `research-dossier.md` (38 findings incorporated)

---

## Clarifications

### Session 2026-01-23

| # | Question | Answer | Spec Impact |
|---|----------|--------|-------------|
| Q1 | Workflow mode? | **Full** | Confirmed Mode: Full for CS-3 refactoring |
| Q2 | Testing approach? | **Full TDD** | Added Testing Strategy section |
| Q3 | SDK dependency in tests? | **Fake SDK wrapper + real integration tests (skip in CI)** | Added mock policy, integration test strategy |
| Q4 | Documentation location? | **Update existing docs/how/ only** | Added Documentation Strategy section |
| Q5 | Client lifecycle? | **One per adapter** | Added Design Decisions section |
| Q6 | Session caching? | **No cache, use resumeSession()** | Stateless adapter design |
| Q7 | Event logging scope? | **Verbose, controlled by logger debug levels** | Log all events with appropriate levels |

**Coverage Summary**:
- **Resolved**: 7/7 questions (Mode, Testing, Mock Policy, Docs, Client, Sessions, Logging)
- **Deferred**: 0
- **Outstanding**: 0
