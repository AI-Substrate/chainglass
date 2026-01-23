# Copilot SDK Migration Implementation Plan

**Plan Version**: 1.0.1
**Created**: 2026-01-23
**Updated**: 2026-01-23 (v1.0.1 - Added interface-first gate per Constitution Principle 2)
**Spec**: [./copilot-sdk-spec.md](./copilot-sdk-spec.md)
**Research**: [./research-dossier.md](./research-dossier.md)
**Status**: READY

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Phase 1: SDK Foundation & Fakes](#phase-1-sdk-foundation--fakes)
6. [Phase 2: Core Adapter Implementation](#phase-2-core-adapter-implementation)
7. [Phase 3: Terminal Operations & Error Handling](#phase-3-terminal-operations--error-handling)
8. [Phase 4: Migration, Cleanup & Documentation](#phase-4-migration-cleanup--documentation)
9. [Cross-Cutting Concerns](#cross-cutting-concerns)
10. [Complexity Tracking](#complexity-tracking)
11. [Progress Tracking](#progress-tracking)
12. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current CopilotAdapter uses a "hacky" log-file-polling approach that is unreliable (10 documented pain points), produces non-resumable synthetic session IDs, and requires ~500 LOC of polling/parsing code.

**Solution**: Replace with official GitHub Copilot SDK (`@github/copilot-sdk`) which provides:
- Immediate session ID availability (no polling)
- Event-driven architecture (30+ typed events)
- Native session resumption via `resumeSession()`
- Simplified implementation (~50 LOC)

**Expected Outcomes**:
- All 9 contract tests pass without modification
- Reliable session resumption (eliminates CA-03, CA-07 pain points)
- Maintainable codebase (~200 LOC deleted)
- Foundation for future streaming capabilities

**Success Metrics**:
- 9/9 contract tests passing
- Zero synthetic session ID generation
- < 150 LOC in new adapter
- < 5s startup latency on first use

---

## Technical Context

### Current System State

```
┌──────────────────┐    spawn     ┌─────────────────┐
│  CopilotAdapter  │────────────►│ npx @github/    │
│  (~500 LOC)      │             │ copilot -p ...  │
└────────┬─────────┘             └────────┬────────┘
         │                                │
         │ poll log files                 │ writes async
         │ (50ms-5s backoff)              │
         ▼                                ▼
┌──────────────────┐             ┌─────────────────┐
│ CopilotLogParser │◄────────────│  Log Files in   │
│ (regex-based)    │   read      │  tmpdir         │
└──────────────────┘             └─────────────────┘
```

**Pain Points** (from research CA-01 to CA-10):
- Log file polling with exponential backoff (50ms-5s)
- Regex extraction tied to undocumented log format
- Fallback synthetic session IDs violate resumption contract
- No real-time event streaming
- Compact command workaround may not function

### Target System State

```
┌──────────────────┐   JSON-RPC    ┌─────────────────┐
│SdkCopilotAdapter │◄─────────────►│  Copilot CLI    │
│  (~50 LOC)       │    stdio      │  (server mode)  │
└────────┬─────────┘               └─────────────────┘
         │
         │ createSession() / resumeSession()
         ▼
┌──────────────────┐
│  CopilotSession  │◄─── Events: assistant.message,
│  (SDK-managed)   │              session.idle,
└──────────────────┘              session.error...
```

### Integration Requirements

| Component | Requirement | Validation |
|-----------|-------------|------------|
| IAgentAdapter | Implement run(), compact(), terminate() | 9 contract tests |
| AgentResult | Return {output, sessionId, status, exitCode, tokens} | Type checking |
| ADR-0002 | Fakes only, no mocks | Code review |
| ILogger | Use existing logger interface | Constructor injection |

### Constraints

1. **External Dependency**: `@github/copilot-sdk` must be pinned to exact version
2. **Node.js Version**: SDK requires Node 18+ (verify project compatibility)
3. **CLI Requirement**: Copilot CLI must be installed on target systems
4. **Token Limitation**: SDK doesn't expose token metrics; continue returning null

### Assumptions

1. SDK's `session.sessionId` is available immediately after `createSession()`
2. SDK's `resumeSession()` works reliably with SDK-generated session IDs
3. Existing contract tests comprehensively validate IAgentAdapter behavior
4. FakeAgentAdapter pattern remains valid (SDK adapter uses same contract)

---

## Critical Research Findings

### Critical Findings (Must Address)

| # | Finding | Impact | Action | Affects Phases |
|---|---------|--------|--------|----------------|
| 01 | Session ID Synthetic Fallback | Critical | Eliminate entirely; SDK returns real ID immediately | 2 |
| 02 | Contract Test Session Resumption | Critical | Validate `resumeSession()` returns same sessionId | 2, 3 |
| 03 | Error Event Mapping | High | Map `session.error` → `status: 'failed'`, `exitCode: 1` | 2, 3 |
| 04 | SDK Dependency Version | High | Pin exact version in package.json | 1 |
| 05 | CI Test Isolation | High | Separate unit (always run) from integration (skip in CI) | 3, 4 |

### High-Impact Findings

| # | Finding | Impact | Action | Affects Phases |
|---|---------|--------|--------|----------------|
| 06 | ClaudeCodeAdapter Pattern | High | Follow same constructor DI pattern for testability | 1, 2 |
| 07 | FakeCopilotClient Design | High | Create test double with event simulation | 1 |
| 08 | Session Lifecycle | Medium | No cache; use `resumeSession()` for each run with sessionId | 2 |
| 09 | Startup Latency | Medium | Cache CopilotClient per adapter; set 60s test timeout | 1, 3 |
| 10 | Rollback Strategy | Medium | Keep legacy adapter until Phase 4 validation | 4 |

### Implementation Patterns from ClaudeCodeAdapter

```typescript
// Pattern to follow: Constructor DI for testability
class SdkCopilotAdapter implements IAgentAdapter {
  constructor(
    client: CopilotClient,  // Injected (real or fake)
    options?: SdkCopilotAdapterOptions
  ) {
    this._client = client;
    this._logger = options?.logger;
    this._workspaceRoot = options?.workspaceRoot ?? process.cwd();
  }
}

// Pattern to follow: Error mapping
// SDK: session.error event
// ClaudeCode: exit code != 0
// Both map to: status: 'failed', exitCode: 1
```

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per spec)

**Rationale**: CS-3 refactoring with external dependency requires comprehensive testing to catch regressions and validate SDK integration.

**Mock Policy**: Fakes only (per ADR-0002)
- Create `FakeCopilotClient` implementing SDK interface for unit tests
- Inject via constructor following existing adapter patterns
- Real integration tests with actual SDK (skipped in CI)

### Test-Driven Development Cycle

For each component:
1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve code quality while keeping tests green

### Test Documentation

Every test must include:
```typescript
/**
 * Purpose: [what truth this test proves]
 * Quality Contribution: [how this prevents bugs]
 * Acceptance Criteria: [measurable assertions]
 */
```

### Test File Organization

| File | Type | Runs in CI | Purpose |
|------|------|------------|---------|
| `test/unit/shared/sdk-copilot-adapter.test.ts` | Unit | Yes | Test with FakeCopilotClient |
| `test/contracts/agent-adapter.contract.test.ts` | Contract | Yes | Validate IAgentAdapter compliance |
| `test/integration/sdk-copilot-adapter.test.ts` | Integration | No (skip) | Real SDK validation |

### Contract Test Validation

All 9 contract tests must pass against SdkCopilotAdapter:
- AC-1: Session ID returned immediately (non-empty)
- AC-2: Session resumption works
- AC-3: Token handling (null acceptable)
- AC-4-7: Status/exit code mapping
- AC-8-9: Error handling & validation

---

## Phase 1: SDK Foundation & Fakes

**Objective**: Establish SDK dependency and test infrastructure before implementing adapter logic.

**Deliverables**:
- `@github/copilot-sdk` added to package.json (exact version)
- Local `ICopilotClient` and `ICopilotSession` interfaces (for layer isolation)
- `FakeCopilotClient` test double with event simulation
- `FakeCopilotSession` test double with sendAndWait/destroy
- Basic adapter skeleton with constructor

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SDK package unavailable | Low | High | Verify npm package exists before starting |
| Node.js version incompatible | Low | Medium | Check package.json engines field |

### Prerequisites (Interface-First Gate)

**Constitution Principle 2 Compliance**: Interface → Fake → Tests → Real Implementation

Before any implementation:
1. **Verify IAgentAdapter exists**: `packages/shared/src/interfaces/agent-adapter.interface.ts` ✓
2. **Define local SDK interfaces**: Create `ICopilotClient` and `ICopilotSession` in `packages/shared/src/interfaces/` (fakes implement these, not SDK types directly)
3. **Rationale**: Fakes must not import from `@github/copilot-sdk` (layer isolation per R-ARCH-001). Local interfaces define the contract; real adapter imports SDK types, fakes import local interfaces.

```typescript
// packages/shared/src/interfaces/copilot-sdk.interface.ts
// Local interfaces for layer isolation - fakes implement these

export interface ICopilotSession {
  readonly sessionId: string;
  sendAndWait(options: { prompt: string }): Promise<void>;
  destroy(): Promise<void>;
  abort(): void;
  on(handler: (event: SessionEvent) => void): void;
}

export interface ICopilotClient {
  createSession(config: SessionConfig): Promise<ICopilotSession>;
  resumeSession(sessionId: string, config?: ResumeConfig): Promise<ICopilotSession>;
  stop(): Promise<void>;
  getStatus(): Promise<{ version: string }>;
}
```

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.0a | [ ] | Verify IAgentAdapter interface exists | 0 | Interface at packages/shared/src/interfaces/agent-adapter.interface.ts compiles | - | Gate: Cannot proceed if missing |
| 1.0b | [ ] | Create ICopilotClient/ICopilotSession local interfaces | 1 | Interfaces exported from packages/shared/src/interfaces/copilot-sdk.interface.ts | - | Layer isolation: fakes import these, not SDK |
| 1.1 | [ ] | Write tests for FakeCopilotClient interface | 2 | Tests cover: createSession, resumeSession, stop, getStatus | - | Tests verify ICopilotClient contract |
| 1.2 | [ ] | Write tests for FakeCopilotSession interface | 2 | Tests cover: sessionId, sendAndWait, destroy, abort, on() | - | Tests verify ICopilotSession contract |
| 1.3 | [ ] | Add @github/copilot-sdk to package.json | 1 | Exact version pinned, npm install succeeds | - | Use latest stable version |
| 1.4 | [ ] | Create FakeCopilotClient implementation | 2 | All tests from 1.1 pass | - | /packages/shared/src/fakes/ |
| 1.5 | [ ] | Create FakeCopilotSession implementation | 2 | All tests from 1.2 pass, events can be simulated | - | Support pre-configured events |
| 1.6 | [ ] | Write tests for SdkCopilotAdapter constructor | 1 | Tests cover: DI injection, options handling | - | Follow ClaudeCodeAdapter pattern |
| 1.7 | [ ] | Create SdkCopilotAdapter skeleton | 1 | Constructor accepts client + options, compiles | - | /packages/shared/src/adapters/ |
| 1.8 | [ ] | Export new types from index | 1 | Can import FakeCopilotClient, SdkCopilotAdapter | - | Update adapters/index.ts |

### Test Examples (Write First!)

```typescript
describe('FakeCopilotClient', () => {
  test('should create session with immediate sessionId', async () => {
    /**
     * Purpose: Proves createSession returns valid sessionId synchronously
     * Quality Contribution: Validates SDK contract for session creation
     * Acceptance Criteria: sessionId is non-empty string, available immediately
     */
    const client = new FakeCopilotClient();
    const session = await client.createSession({});

    expect(session.sessionId).toBeDefined();
    expect(typeof session.sessionId).toBe('string');
    expect(session.sessionId.length).toBeGreaterThan(0);
  });

  test('should resume session with matching sessionId', async () => {
    /**
     * Purpose: Validates session resumption contract
     * Quality Contribution: Prevents resumption bugs (CA-07)
     * Acceptance Criteria: Resumed session has same sessionId
     */
    const client = new FakeCopilotClient();
    const session1 = await client.createSession({});
    const session2 = await client.resumeSession(session1.sessionId, {});

    expect(session2.sessionId).toBe(session1.sessionId);
  });
});

describe('FakeCopilotSession', () => {
  test('should emit configured events on sendAndWait', async () => {
    /**
     * Purpose: Validates event emission for testing error paths
     * Quality Contribution: Enables error handling test coverage
     * Acceptance Criteria: Pre-configured events are emitted to handlers
     */
    const events: SessionEvent[] = [
      { type: 'assistant.message', data: { content: 'Hello' } },
      { type: 'session.idle', data: {} }
    ];
    const session = new FakeCopilotSession({ events });

    const received: SessionEvent[] = [];
    session.on((event) => received.push(event));
    await session.sendAndWait({ prompt: 'test' });

    expect(received).toEqual(events);
  });
});
```

### Non-Happy-Path Coverage
- [ ] FakeCopilotClient with error events pre-configured
- [ ] FakeCopilotSession timeout simulation
- [ ] Missing sessionId in resumeSession (throws)
- [ ] Multiple concurrent sessions

### Acceptance Criteria
- [ ] **Interface-first verified** (Constitution Principle 2): IAgentAdapter exists, local ICopilotClient/ICopilotSession defined
- [ ] All unit tests passing (14+ tests, including interface contract tests)
- [ ] SDK package installed with exact version (e.g., `"@github/copilot-sdk": "1.2.3"`, no ^/~)
- [ ] FakeCopilotClient implements ICopilotClient (local interface, not SDK import)
- [ ] FakeCopilotSession implements ICopilotSession (local interface, not SDK import)
- [ ] FakeCopilotClient supports event simulation
- [ ] TypeScript compiles without errors
- [ ] No mocks used (ADR-0002 compliance)
- [ ] Layer isolation verified: `grep -r "@github/copilot-sdk" packages/shared/src/fakes/` returns no results

---

## Phase 2: Core Adapter Implementation

**Objective**: Implement `run()` method with SDK session management and event handling.

**Deliverables**:
- SdkCopilotAdapter.run() with createSession/resumeSession
- Event collection (assistant.message → output)
- Error mapping (session.error → failed status)
- Input validation (prompt, cwd) preserved

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Event ordering assumptions | Medium | Medium | Test with multiple event sequences |
| Session state leaks | Low | Medium | Ensure sessions destroyed after use |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for run() with new session | 3 | Tests cover: sessionId returned, output collected, status=completed | - | Use FakeCopilotClient |
| 2.2 | [ ] | Write tests for run() with existing sessionId | 2 | Tests cover: resumeSession called, sessionId preserved | - | Validate resumption |
| 2.3 | [ ] | Write tests for error event handling | 2 | Tests cover: session.error → status=failed, exitCode=1 | - | |
| 2.4 | [ ] | Write tests for input validation | 2 | Tests cover: empty prompt, long prompt, invalid cwd | - | Reuse existing validation |
| 2.5 | [ ] | Implement run() basic flow | 3 | Tests from 2.1 pass | - | createSession → sendAndWait → collect output |
| 2.6 | [ ] | Implement run() with resumeSession | 2 | Tests from 2.2 pass | - | Check sessionId option |
| 2.7 | [ ] | Implement error event handling | 2 | Tests from 2.3 pass | - | Subscribe to session.error |
| 2.8 | [ ] | Implement input validation | 2 | Tests from 2.4 pass | - | Port from CopilotAdapter |
| 2.9 | [ ] | Run contract tests against SDK adapter | 2 | 6/9 contract tests pass (run-related) | - | Partial contract validation |

### Test Examples (Write First!)

```typescript
describe('SdkCopilotAdapter.run()', () => {
  let adapter: SdkCopilotAdapter;
  let fakeClient: FakeCopilotClient;

  beforeEach(() => {
    fakeClient = new FakeCopilotClient({
      events: [
        { type: 'assistant.message', data: { content: 'Response text' } },
        { type: 'session.idle', data: {} }
      ]
    });
    adapter = new SdkCopilotAdapter(fakeClient);
  });

  test('should return AgentResult with valid sessionId', async () => {
    /**
     * Purpose: Validates AC-1 - session ID returned immediately
     * Quality Contribution: Prevents synthetic session ID regression
     * Acceptance Criteria: sessionId is non-empty, not synthetic pattern
     */
    const result = await adapter.run({ prompt: 'Hello' });

    expect(result.sessionId).toBeDefined();
    expect(result.sessionId).not.toMatch(/^copilot-\d+-\d+$/); // No synthetic IDs
    expect(result.status).toBe('completed');
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe('Response text');
    expect(result.tokens).toBeNull();
  });

  test('should resume session when sessionId provided', async () => {
    /**
     * Purpose: Validates AC-2 - session resumption works
     * Quality Contribution: Ensures conversation continuity
     * Acceptance Criteria: Same sessionId returned, resumeSession called
     */
    const existingId = 'existing-session-123';
    const result = await adapter.run({ prompt: 'Continue', sessionId: existingId });

    expect(result.sessionId).toBe(existingId);
    expect(fakeClient.resumeSessionCalled).toBe(true);
    expect(fakeClient.lastResumedId).toBe(existingId);
  });

  test('should return failed status on error event', async () => {
    /**
     * Purpose: Validates AC-8 - error events map to failed status
     * Quality Contribution: Prevents silent error handling failures
     * Acceptance Criteria: status=failed, exitCode=1, error in output
     */
    fakeClient = new FakeCopilotClient({
      events: [
        { type: 'session.error', data: { message: 'SDK Error', stack: '...' } }
      ]
    });
    adapter = new SdkCopilotAdapter(fakeClient);

    const result = await adapter.run({ prompt: 'Fail' });

    expect(result.status).toBe('failed');
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('SDK Error');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Empty prompt validation
- [ ] Prompt exceeding max length (100k chars)
- [ ] Invalid control characters in prompt
- [ ] cwd outside workspace root
- [ ] SDK throws exception (not just error event)
- [ ] sendAndWait timeout

### Acceptance Criteria
- [ ] All unit tests passing (20+ tests)
- [ ] run() returns valid AgentResult
- [ ] Session ID is SDK-generated (no synthetic)
- [ ] Error events properly mapped
- [ ] Input validation matches existing behavior
- [ ] 6/9 contract tests passing

---

## Phase 3: Terminal Operations & Error Handling

**Objective**: Implement `compact()` and `terminate()` methods with complete error handling.

**Deliverables**:
- SdkCopilotAdapter.compact() via run delegation
- SdkCopilotAdapter.terminate() via abort/destroy
- Complete error handling coverage
- All 9 contract tests passing

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Session not found for terminate | Medium | Low | Handle gracefully, return killed status |
| Compact behavior differs | Low | Medium | Document SDK-specific semantics |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for compact() | 2 | Tests cover: /compact sent as prompt, result returned | - | |
| 3.2 | [ ] | Write tests for terminate() | 2 | Tests cover: abort called, status=killed, exitCode=137 | - | |
| 3.3 | [ ] | Write tests for terminate with unknown session | 1 | Tests cover: graceful handling, still returns killed | - | |
| 3.4 | [ ] | Implement compact() | 1 | Tests from 3.1 pass | - | Delegate to run() |
| 3.5 | [ ] | Implement terminate() | 2 | Tests from 3.2, 3.3 pass | - | abort → destroy |
| 3.6 | [ ] | Add verbose event logging | 2 | Events logged at appropriate levels | - | Use ILogger |
| 3.7 | [ ] | Run full contract test suite | 2 | All 9 contract tests pass | - | Critical gate |
| 3.8 | [ ] | Create integration test file (skip in CI) | 2 | Real SDK tests exist, marked skipIf(isCI) | - | /test/integration/ |

### Test Examples (Write First!)

```typescript
describe('SdkCopilotAdapter.compact()', () => {
  test('should send /compact as prompt', async () => {
    /**
     * Purpose: Validates AC-3 - compact sends command
     * Quality Contribution: Ensures context reduction works
     * Acceptance Criteria: /compact sent, result returned
     */
    const fakeClient = new FakeCopilotClient();
    const adapter = new SdkCopilotAdapter(fakeClient);

    const result = await adapter.compact('session-123');

    expect(fakeClient.lastPrompt).toBe('/compact');
    expect(result.sessionId).toBe('session-123');
    expect(result.status).toBe('completed');
    expect(result.tokens).toBeNull();
  });
});

describe('SdkCopilotAdapter.terminate()', () => {
  test('should abort and destroy session', async () => {
    /**
     * Purpose: Validates AC-4 - terminate stops session
     * Quality Contribution: Prevents resource leaks
     * Acceptance Criteria: status=killed, exitCode=137
     */
    const fakeClient = new FakeCopilotClient();
    const adapter = new SdkCopilotAdapter(fakeClient);

    // First create a session
    await adapter.run({ prompt: 'Hello' });

    const result = await adapter.terminate('session-123');

    expect(result.status).toBe('killed');
    expect(result.exitCode).toBe(137);
    expect(fakeClient.abortCalled).toBe(true);
    expect(fakeClient.destroyCalled).toBe(true);
  });

  test('should handle unknown session gracefully', async () => {
    /**
     * Purpose: Validates graceful handling of missing sessions
     * Quality Contribution: Prevents crashes on invalid terminate
     * Acceptance Criteria: Returns killed status, no exception
     */
    const fakeClient = new FakeCopilotClient();
    const adapter = new SdkCopilotAdapter(fakeClient);

    const result = await adapter.terminate('nonexistent-session');

    expect(result.status).toBe('killed');
    expect(result.exitCode).toBe(137);
    // No exception thrown
  });
});
```

### Non-Happy-Path Coverage
- [ ] compact() with session.error event
- [ ] terminate() during active sendAndWait
- [ ] Double terminate on same session
- [ ] terminate() before any session created

### Acceptance Criteria
- [ ] All unit tests passing (28+ tests)
- [ ] compact() works via run delegation
- [ ] terminate() properly cleans up
- [ ] All 9 contract tests pass (**CRITICAL GATE**)
- [ ] Integration tests created (skipped in CI)
- [ ] Event logging implemented

---

## Phase 4: Migration, Cleanup & Documentation

**Objective**: Replace old adapter, remove deprecated code, update documentation.

**Deliverables**:
- CopilotAdapter replaced with SdkCopilotAdapter in exports
- CopilotLogParser deleted
- Polling code removed (~200 LOC)
- Developer documentation updated

**Dependencies**: Phase 3 complete with all contract tests passing

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking change for consumers | Low | High | Keep export name same, update types |
| Missed code references | Low | Medium | Search codebase for imports |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Verify all contract tests pass | 1 | 9/9 tests green | - | Pre-migration validation |
| 4.2 | [ ] | Update adapters/index.ts exports | 1 | SdkCopilotAdapter exported as CopilotAdapter | - | Preserve API |
| 4.3 | [ ] | Delete CopilotLogParser | 1 | File removed, no compilation errors | - | copilot-log-parser.ts |
| 4.4 | [ ] | Delete old CopilotAdapter | 1 | File removed or renamed _deprecated | - | copilot.adapter.ts |
| 4.5 | [ ] | Delete old unit tests | 1 | copilot-adapter.test.ts removed | - | Replace with SDK tests |
| 4.6 | [ ] | Run full test suite | 2 | All tests pass, no regressions | - | npm test |
| 4.7 | [ ] | Update 3-adapters.md documentation | 2 | SDK approach documented, polling removed | - | /docs/how/dev/ |
| 4.8 | [ ] | Verify < 150 LOC in new adapter | 1 | wc -l shows < 150 | - | AC-12 |

### Documentation Updates

**File**: `/home/jak/substrate/002-agents/docs/how/dev/agent-control/3-adapters.md`

**Section: Copilot Adapter** (rewrite):
- Remove: Log file polling explanation
- Remove: Exponential backoff description
- Remove: Session ID extraction regex
- Add: SDK-based implementation overview
- Add: Event handling pattern
- Add: SDK dependency requirements
- Add: Session lifecycle (createSession/resumeSession/destroy)
- Preserve: IAgentAdapter contract explanation

### Non-Happy-Path Coverage
- [ ] Import statements in other files updated
- [ ] Type exports preserved
- [ ] No dead code left behind

### Acceptance Criteria
- [ ] All tests passing after deletion
- [ ] No TypeScript compilation errors
- [ ] Documentation updated and reviewed
- [ ] New adapter < 150 LOC (AC-12)
- [ ] CopilotLogParser fully removed (AC-11)
- [ ] No references to polling code remain

---

## Cross-Cutting Concerns

### Security Considerations

| Concern | Implementation | Validation |
|---------|----------------|------------|
| Workspace root validation | Port existing `_validateCwd()` from old adapter | Unit tests |
| Prompt sanitization | Port existing `_validatePrompt()` from old adapter | Unit tests |
| SDK version pinning | Exact version in package.json | Code review |

### Observability

| Concern | Implementation | Validation |
|---------|----------------|------------|
| Event logging | Log all SDK events via ILogger | Manual verification |
| Error logging | Log session.error events at ERROR level | Unit tests |
| Startup latency | Log client initialization time | Integration tests |

**Logging Levels**:
- `logger.error`: SDK errors, validation failures
- `logger.debug`: Session lifecycle events (create, resume, destroy)
- `logger.trace`: All SDK events (assistant.message, tool.*, etc.)

### Documentation

**Location**: docs/how/ only (update existing)

**Updates Required**:
- `docs/how/dev/agent-control/3-adapters.md`: Copilot section rewrite
- `docs/how/dev/agent-control/1-overview.md`: Verify accuracy
- No README changes needed

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| SDK Integration | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=1 | External dependency, new patterns | Contract tests, phased rollout |
| FakeCopilotClient | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=0 | New fake, follows patterns | Use existing fake patterns |
| Error Mapping | 2 | Small | S=0,I=1,D=0,N=1,F=0,T=0 | SDK events → AgentResult | Comprehensive tests |
| Migration | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | File deletions, export changes | Validation before deletion |

**Overall Complexity**: CS-3 (Medium) - Sum of phases with mitigation through incremental validation.

---

## Progress Tracking

### Phase Completion Checklist

- [ ] Phase 1: SDK Foundation & Fakes - NOT STARTED
- [ ] Phase 2: Core Adapter Implementation - NOT STARTED
- [ ] Phase 3: Terminal Operations & Error Handling - NOT STARTED
- [ ] Phase 4: Migration, Cleanup & Documentation - NOT STARTED

### STOP Rule

**IMPORTANT**: This plan must be validated before creating detailed task dossiers.

After reviewing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

### ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0002 | Accepted | 1, 2, 3 | Fakes-only policy; no mocks |

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-add-streaming-events | 2026-01-23 | Phase 2: Core Adapter Implementation | T010 | Add event streaming to IAgentAdapter for Copilot and Claude with fakes for tests and real integration tests | [ ] Pending | [Link](tasks/phase-2-core-adapter-implementation/001-subtask-add-streaming-events.md) |

---

**Plan Status**: READY for validation via `/plan-4-complete-the-plan`
