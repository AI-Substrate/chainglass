# Agent Control Service Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-22
**Spec**: [./agent-control-spec.md](./agent-control-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Interfaces & Fakes](#phase-1-interfaces--fakes)
   - [Phase 2: Claude Code Adapter](#phase-2-claude-code-adapter)
   - [Phase 3: Process Management](#phase-3-process-management)
   - [Phase 4: Copilot Adapter](#phase-4-copilot-adapter)
   - [Phase 5: Commands & Integration](#phase-5-commands--integration)
   - [Phase 6: Documentation](#phase-6-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [ADR Ledger](#adr-ledger)
10. [Deviation Ledger](#deviation-ledger)
11. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Chainglass needs to programmatically spawn, control, and monitor AI coding agents (Claude Code, Copilot CLI) with session continuity, token tracking, and graceful termination.

**Solution Approach**:
- Interface-first design following ILogger/FakeLogger exemplar pattern
- Adapter pattern per agent type (different I/O: stdout vs log files)
- DI integration with TSyringe useFactory pattern
- Stateless service; caller provides session IDs
- Signal escalation for clean process termination

**Expected Outcomes**:
- Unified `IAgentAdapter` interface for all coding agents
- Run prompts and get structured results with session IDs and token metrics
- Resume sessions across service restarts (agent handles persistence)
- `/compact` command to reduce context when approaching token limits
- Clean termination within 10 seconds via signal escalation

**Success Metrics**:
- 20 acceptance criteria from spec verified
- Full TDD with fakes; no vi.mock() usage
- Contract tests ensure fake-real parity
- Real CLI integration tests pass

---

## Technical Context

### Current System State

Chainglass has:
- `@chainglass/shared` with ILogger, FakeLogger, PinoLoggerAdapter, IConfigService, ChainglassConfigService
- DI container pattern using TSyringe with useFactory
- Clean architecture: Services → Interfaces ← Adapters
- Configuration system with Zod schemas and multi-source loading

### Integration Requirements

- **Configuration**: Use existing ChainglassConfigService for timeout settings (ADR-0003)
- **Logging**: Inject ILogger into adapters for observability
- **DI Pattern**: Follow createProductionContainer/createTestContainer pattern
- **Fakes**: Create FakeAgentAdapter following FakeLogger exemplar

### Constraints and Limitations

- **Stateless Service**: No internal session persistence; caller tracks session IDs
- **No Streaming**: Output returned on completion, not streamed
- **Permission Bypass**: Always runs with `--dangerously-skip-permissions`
- **Platform**: Signal handling differs on Windows; documented limitation

### Assumptions

- Claude Code CLI (`@anthropic-ai/claude-code@latest`)
- Copilot CLI (`@github/copilot@latest`)
- Signal escalation works on Linux/macOS; Windows uses taskkill

---

## Critical Research Findings

### 🚨 Critical Discovery 01: Dual I/O Pattern Divergence

**Impact**: Critical
**Sources**: [Research Dossier, I-01, R-01]
**Problem**: Claude Code uses stdout/stream-json (synchronous, structured), while Copilot uses log files (asynchronous, unstructured). Session ID extraction timing differs significantly.
**Root Cause**: Different CLI architectures create incompatible I/O patterns.
**Solution**: Define `IAgentAdapter` interface with explicit session ID extraction contract. Copilot adapter uses polling with exponential backoff.
**Example**:
```typescript
// Claude Code: Parse from stdout
const sessionId = parseStreamJson(stdout).session_id;

// Copilot: Poll log files
const sessionId = await pollLogFile(logDir, {
  baseInterval: 50,
  maxWait: 5000
});
```
**Action Required**: Implement per-adapter session ID extraction strategy
**Affects Phases**: Phase 2, Phase 4

---

### 🚨 Critical Discovery 02: Process Group Management Cross-Platform

**Impact**: Critical
**Sources**: [Research Dossier, I-05, R-04, R-05]
**Problem**: Incorrect process group spawning leaves zombie processes. Windows has different process model. SIGINT/SIGTERM may not propagate to agent child processes.
**Root Cause**: Node.js lacks Rust's `group_spawn()` equivalent; process lifecycle is OS-specific.
**Solution**: Implement `IProcessManager` with platform-specific implementations. Use signal escalation: SIGINT (2s) → SIGTERM (2s) → SIGKILL.
**Example**:
```typescript
// Signal escalation
await this.signal(pid, 'SIGINT');
await this.wait(2000);
if (!exited) await this.signal(pid, 'SIGTERM');
await this.wait(2000);
if (!exited) await this.signal(pid, 'SIGKILL');
```
**Action Required**: Platform-specific process management with integration tests
**Affects Phases**: Phase 3

---

### 🚨 Critical Discovery 03: Token Usage Extraction from stream-json

**Impact**: High
**Sources**: [Research Dossier, I-08, Vibe Kanban codebase]
**Problem**: Token usage must be extracted from Claude Code `usage` field in stream-json Result messages.
**Root Cause**: Tokens are embedded in agent output, not available via separate API.
**Solution**: Parse `usage` field: `total_tokens = input_tokens + output_tokens + cache_tokens`. Return `{ total_tokens, model_context_window }`.
**Example**:
```typescript
// Claude Code stream-json Result message
{ "type": "result", "usage": {
  "input_tokens": 1234,
  "output_tokens": 567,
  "cache_creation_input_tokens": 100,
  "cache_read_input_tokens": 50
}, "context_window": 200000 }
```
**Action Required**: Implement token extraction in output parser
**Affects Phases**: Phase 2, Phase 5

---

### 🔶 High Discovery 04: Copilot Token Reporting Unknown

**Impact**: High
**Sources**: [Spec Open Questions, R-03]
**Problem**: Copilot CLI token reporting mechanism is undocumented. May not exist.
**Root Cause**: Third-party tool with incomplete documentation.
**Solution**: Return `null` for token metrics if unavailable. Document as limitation.
**Example**:
```typescript
// Copilot adapter token extraction
extractTokens(output: string): TokenMetrics | null {
  // Attempt to parse from logs
  const tokens = this.tryParseTokensFromLogs(output);
  if (!tokens) {
    this.logger.warn('Token metrics unavailable for Copilot');
    return null;
  }
  return tokens;
}
```
**Action Required**: Graceful degradation for missing token data
**Affects Phases**: Phase 4

---

### 🔶 High Discovery 05: Session ID Extraction Timing Window

**Impact**: High
**Sources**: [R-02]
**Problem**: Copilot log file may not be written immediately after spawn. Greedy polling exhausts CPU.
**Root Cause**: Copilot writes logs asynchronously; timing is non-deterministic.
**Solution**: Exponential backoff polling with 5-second timeout. Return partial session ID based on PID+timestamp if extraction fails.
**Example**:
```typescript
async extractSessionId(logDir: string): Promise<string> {
  const backoff = [0, 50, 100, 200, 400, 800, 1600, 3200];
  for (const delay of backoff) {
    await sleep(delay);
    const sessionId = this.tryParseLogFile(logDir);
    if (sessionId) return sessionId;
  }
  // Fallback: generate based on PID
  return `copilot-${process.pid}-${Date.now()}`;
}
```
**Action Required**: Implement robust polling with fallback
**Affects Phases**: Phase 4

---

### 🔶 High Discovery 06: Result Object State Machine

**Impact**: High
**Sources**: [R-07]
**Problem**: Result must handle four exit paths: normal (exit 0), error (exit N>0), killed, timeout. Race conditions possible.
**Root Cause**: Multiple async paths converge on result construction.
**Solution**: Explicit state machine with `resultSource` metadata for debugging.
**Example**:
```typescript
type ResultSource = 'processExit' | 'timeout' | 'userTermination';

interface AgentResult {
  output: string;
  sessionId: string;
  status: 'completed' | 'failed' | 'killed';
  exitCode: number;
  stderr?: string;
  tokens: TokenMetrics | null;
  metadata: { resultSource: ResultSource };
}
```
**Action Required**: Implement state machine for result construction
**Affects Phases**: Phase 2, Phase 3

---

### 🔶 High Discovery 07: CLI Version Stability Risk

**Impact**: Medium
**Sources**: [R-06]
**Problem**: CLI version updates could change flags or output format.
**Root Cause**: External dependency on evolving npm packages.
**Solution**: Validate CLI version at startup. Pin versions in package.json. Log warnings for version mismatches.
**Example**:
```typescript
async validateCliVersion(): Promise<void> {
  const version = await this.getCliVersion();
  this.logger.info(`Using Claude Code version ${version}`);
  // Log version for debugging; no version constraints - always use latest
}
```
**Action Required**: Add version logging for debugging (no version pinning)
**Affects Phases**: Phase 2, Phase 4

---

### 🔷 Medium Discovery 08: Contract Tests for Fake-Real Parity

**Impact**: High
**Sources**: [Constitution Principle 3, I-09]
**Problem**: Fake adapter could drift from real implementation behavior.
**Root Cause**: Fakes are manually maintained; no automatic parity check.
**Solution**: Create `agentAdapterContractTests()` factory that runs against both FakeAgentAdapter and real adapters.
**Example**:
```typescript
export function agentAdapterContractTests(
  name: string,
  createAdapter: () => IAgentAdapter
) {
  describe(`${name} implements IAgentAdapter`, () => {
    it('should return sessionId in result', async () => {
      const adapter = createAdapter();
      const result = await adapter.run({ prompt: 'test' });
      expect(result.sessionId).toBeDefined();
    });
  });
}
```
**Action Required**: Write contract tests before implementations
**Affects Phases**: Phase 1, Phase 2, Phase 4

---

### 🔷 Medium Discovery 09: Configuration Integration for Timeout

**Impact**: Medium
**Sources**: [Spec Q6, ADR-0003]
**Problem**: Timeout (default 10 min) must be configurable via existing config system.
**Root Cause**: Spec requires config integration; must follow existing patterns.
**Solution**: Add `AgentConfigSchema` to config registry. Timeout loaded via `IConfigService`.
**Example**:
```typescript
const AgentConfigSchema = z.object({
  timeout: z.coerce.number().min(1000).max(3600000).default(600000),
  claudeCode: z.object({
    flags: z.record(z.string()).default({
      'output-format': 'stream-json',
      'dangerously-skip-permissions': 'true',
    }),
  }),
});
```
**Action Required**: Integrate with ChainglassConfigService
**Affects Phases**: Phase 1, Phase 2

---

### 🔷 Medium Discovery 10: Session Memory Management

**Impact**: Medium
**Sources**: [R-08]
**Problem**: Long-running service could accumulate session state and exhaust memory.
**Root Cause**: Per spec, service is stateless externally but may track internal state (process handles).
**Solution**: Track only active processes; clean up handles after termination. No session history retention.
**Example**:
```typescript
class AgentService {
  private activeProcesses = new Map<string, ChildProcess>();

  async terminate(sessionId: string): Promise<void> {
    const process = this.activeProcesses.get(sessionId);
    if (process) {
      await this.terminator.terminate(process);
      this.activeProcesses.delete(sessionId);
    }
  }
}
```
**Action Required**: Implement process handle cleanup
**Affects Phases**: Phase 3, Phase 5

---

### 🔷 Medium Discovery 11: Compact Command Requires Prior Context

**Impact**: Medium
**Sources**: [AC-12, AC-13, practical testing]
**Problem**: `/compact` command fails or has no effect on fresh sessions. Agents require accumulated context before compaction is meaningful or permitted.
**Root Cause**: Compaction is a context reduction operation; empty/minimal context cannot be compacted.
**Solution**: Integration tests for compact must follow multi-step sequence: build context first, then compact.
**Example**:
```typescript
// Integration test sequence for compact
const result1 = await adapter.run({ prompt: 'List 5 languages' });
const sessionId = result1.sessionId;

// Build more context (needed for compaction threshold)
await adapter.run({ prompt: 'Now list 5 more', sessionId });

// NOW compact is meaningful
const compactResult = await adapter.compact(sessionId);
expect(compactResult.tokens?.total).toBeLessThan(result1.tokens?.total);
```
**Action Required**: Integration tests must build session context before testing compact
**Affects Phases**: Phase 5

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: External CLI integration, process lifecycle management, and session state tracking require comprehensive test coverage.

### Test-Driven Development

All implementation follows RED-GREEN-REFACTOR cycle:
- **RED**: Write test first, verify it fails
- **GREEN**: Implement minimal code to pass test
- **REFACTOR**: Improve code quality while keeping tests green

### Test Layers

| Layer | Uses Fakes? | Uses Real CLI? | Runs in CI? | Purpose |
|-------|-------------|----------------|-------------|---------|
| Unit | Yes (FakeProcessManager) | No | ✅ Always | Test logic, parsing, command construction |
| Contract | Yes (FakeAgentAdapter) | No | ✅ Always | Verify fake-real parity |
| Integration | No | Yes | ⚠️ Skippable | Validate actual CLI behavior |

**Integration Test Skipping**:
```typescript
describe.skipIf(!hasClaudeCli())('ClaudeCodeAdapter integration', () => {
  // Only runs when CLI is available
});

function hasClaudeCli(): boolean {
  try {
    execSync('npx claude --version', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}
```

### Mock Policy

**Policy**: Fakes over mocks (no mocking libraries)
- Use `FakeAgentAdapter`, `FakeProcessManager` for unit/contract tests
- Use real CLI interactions for integration tests
- NO `vi.mock()`, `jest.mock()`, or `vi.spyOn()`

**Reconciliation with Constitution**:
- Constitution Principle 4 says "Fakes Over Mocks" (use FakeLogger, not vi.mock)
- Spec says "avoid mocks" meaning no mocking libraries
- Fakes ARE required for fast, deterministic unit tests

### Test Documentation

Every test includes Test Doc comment:
```typescript
it('should extract session ID from stream-json', () => {
  /*
  Test Doc:
  - Why: Verify session resumption capability
  - Contract: parseStreamJson returns first message with session_id
  - Usage Notes: Use NDJSON format, handle malformed lines
  - Quality Contribution: Prevents session loss on parsing errors
  - Worked Example: {"session_id":"abc"} → returns "abc"
  */
});
```

---

## Implementation Phases

### Phase 1: Interfaces & Fakes

**Objective**: Define contracts and test doubles for all agent control components.

**Deliverables**:
- IAgentAdapter interface
- IProcessManager interface
- ISessionIdExtractor interface
- ITokenExtractor interface
- FakeAgentAdapter with assertion helpers
- FakeProcessManager with signal tracking
- AgentConfigSchema (Zod)
- Contract test factories

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface too narrow/wide | Medium | High | Review against research; iterate early |
| Fake complexity | Low | Medium | Keep fakes simple; add helpers as needed |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write contract tests for IAgentAdapter | 2 | Tests cover: run(), compact(), terminate() | - | test/contracts/agent-adapter.contract.ts |
| 1.2 | [ ] | Create IAgentAdapter interface | 1 | Interface compiles, exports properly | - | packages/shared/src/interfaces/agent-adapter.interface.ts |
| 1.3 | [ ] | Create AgentResult type definitions | 1 | Types include all spec fields | - | packages/shared/src/interfaces/agent-types.ts |
| 1.4 | [ ] | Write tests for FakeAgentAdapter | 2 | Tests verify assertion helpers | - | test/unit/shared/fake-agent-adapter.test.ts |
| 1.5 | [ ] | Implement FakeAgentAdapter | 2 | All contract tests pass | - | packages/shared/src/fakes/fake-agent-adapter.ts |
| 1.6 | [ ] | Write contract tests for IProcessManager | 2 | Tests cover: spawn(), terminate(), signal escalation | - | test/contracts/process-manager.contract.ts |
| 1.7 | [ ] | Create IProcessManager interface | 1 | Interface exports properly | - | packages/shared/src/interfaces/process-manager.interface.ts |
| 1.8 | [ ] | Implement FakeProcessManager | 2 | Signal sequence recorded for assertions | - | packages/shared/src/fakes/fake-process-manager.ts |
| 1.9 | [ ] | Create AgentConfigSchema (Zod) | 2 | Schema validates timeout, flags | - | packages/shared/src/config/schemas/agent.schema.ts |
| 1.10 | [ ] | Register AgentConfigType in config system | 1 | Config accessible via IConfigService | - | packages/shared/src/config/chainglass-config.service.ts |
| 1.11 | [ ] | Export all interfaces from shared | 1 | Can import from @chainglass/shared | - | packages/shared/src/index.ts |

### Test Examples (Write First!)

```typescript
// test/contracts/agent-adapter.contract.ts
export function agentAdapterContractTests(
  name: string,
  createAdapter: () => IAgentAdapter
) {
  describe(`${name} implements IAgentAdapter contract`, () => {
    let adapter: IAgentAdapter;

    beforeEach(() => {
      adapter = createAdapter();
    });

    it('should return structured result with sessionId', async () => {
      /*
      Test Doc:
      - Why: AC-1 requires session ID in result
      - Contract: run() returns AgentResult with non-empty sessionId
      - Usage Notes: First call creates new session; subsequent calls can resume
      - Quality Contribution: Prevents session loss
      - Worked Example: run({prompt:"hi"}) → {sessionId:"abc-123", ...}
      */
      const result = await adapter.run({
        prompt: 'test prompt',
        agentType: 'claude-code'
      });

      expect(result.sessionId).toBeDefined();
      expect(result.sessionId.length).toBeGreaterThan(0);
    });

    it('should return status completed on success', async () => {
      /*
      Test Doc:
      - Why: AC-5 requires status='completed' on exit 0
      - Contract: Successful execution returns completed status
      - Usage Notes: Check exitCode for actual process result
      - Quality Contribution: Ensures status semantic correctness
      - Worked Example: exit 0 → status='completed'
      */
      const result = await adapter.run({ prompt: 'test' });

      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });
  });
}
```

### Non-Happy-Path Coverage
- [ ] Null/undefined prompt handled
- [ ] Invalid agentType rejected
- [ ] Timeout scenario tested
- [ ] Termination during execution tested

### Acceptance Criteria
- [ ] All contract tests passing
- [ ] FakeAgentAdapter passes contract tests
- [ ] AgentConfigSchema validates correctly
- [ ] No mocking library usage
- [ ] TypeScript strict mode passes
- [ ] Exports clean from @chainglass/shared

---

### Phase 2: Claude Code Adapter

**Objective**: Implement Claude Code adapter with real CLI integration.

**Deliverables**:
- ClaudeCodeAdapter implementing IAgentAdapter
- Session ID extraction from stream-json
- Token extraction from usage field
- Integration tests with real CLI

**Dependencies**: Phase 1 must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI not installed in test env | Medium | High | Skip integration tests if CLI missing |
| Output format changes | Low | High | Pin CLI version; add version check |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write integration test expectations for real CLI | 3 | Test file created with skip-if-no-CLI guard; defines expected behaviors | - | test/integration/claude-code-adapter.test.ts |
| 2.2 | [ ] | Write unit tests for stream-json parser | 2 | Tests cover: session ID, tokens, messages | - | test/unit/shared/stream-json-parser.test.ts |
| 2.3 | [ ] | Implement stream-json parser | 2 | Extracts session ID and tokens | - | packages/shared/src/adapters/stream-json-parser.ts |
| 2.4 | [ ] | Write unit tests for ClaudeCodeAdapter | 3 | Tests verify: run(), resume, flags | - | test/unit/shared/claude-code-adapter.test.ts |
| 2.5 | [ ] | Implement ClaudeCodeAdapter | 3 | Passes unit tests with FakeProcessManager | - | packages/shared/src/adapters/claude-code.adapter.ts |
| 2.6 | [ ] | Run contract tests against ClaudeCodeAdapter | 2 | Contract tests pass | - | test/contracts/agent-adapter.contract.test.ts |
| 2.7 | [ ] | Add CLI version validation | 1 | Logs warning for incompatible version | - | packages/shared/src/adapters/claude-code.adapter.ts |
| 2.8 | [ ] | Verify integration tests pass with real CLI | 2 | Real spawn, output, session ID validated | - | test/integration/claude-code-adapter.test.ts |
| 2.9 | [ ] | Register ClaudeCodeAdapter in DI container | 1 | Resolvable from container | - | Extend DI_TOKENS and container |

### Test Examples (Write First!)

```typescript
// test/unit/shared/stream-json-parser.test.ts
describe('StreamJsonParser', () => {
  it('should extract session ID from first message', () => {
    /*
    Test Doc:
    - Why: Session resumption requires extracted session ID
    - Contract: First message with session_id field is used
    - Usage Notes: NDJSON format, one JSON object per line
    - Quality Contribution: Catches parsing regressions
    - Worked Example: {"session_id":"abc"}\n → "abc"
    */
    const output = '{"type":"message","session_id":"abc-123"}\n{"type":"text"}';
    const parser = new StreamJsonParser();

    const sessionId = parser.extractSessionId(output);

    expect(sessionId).toBe('abc-123');
  });

  it('should extract token usage from result message', () => {
    /*
    Test Doc:
    - Why: AC-9 requires tokens.used in result
    - Contract: Parse usage field, sum input+output+cache tokens
    - Usage Notes: Result message has type="result"
    - Quality Contribution: Ensures accurate token tracking
    - Worked Example: usage.input_tokens=100, output_tokens=50 → total=150
    */
    const output = JSON.stringify({
      type: 'result',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5
      },
      context_window: 200000
    });

    const tokens = parser.extractTokens(output);

    expect(tokens.used).toBe(165); // 100+50+10+5
    expect(tokens.limit).toBe(200000);
  });
});
```

### Non-Happy-Path Coverage
- [ ] Malformed JSON handled gracefully
- [ ] Missing session ID returns undefined
- [ ] Missing usage field returns null tokens
- [ ] CLI not found returns failed status

### Acceptance Criteria
- [ ] ClaudeCodeAdapter passes all contract tests
- [ ] Session ID extracted correctly (AC-1)
- [ ] Token metrics extracted (AC-9, AC-10, AC-11)
- [ ] `--dangerously-skip-permissions` flag used (AC-16)
- [ ] `--output-format=stream-json` flag used (AC-16)
- [ ] Integration tests pass with real CLI

---

### Phase 3: Process Management

**Objective**: Implement robust process lifecycle with signal escalation.

**Deliverables**:
- ProcessManager implementing IProcessManager
- Signal escalation: SIGINT → SIGTERM → SIGKILL
- Platform-specific handling (Unix/Windows)
- Exit monitoring and cleanup

**Dependencies**: Phase 1 must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Zombie processes | Medium | Critical | Integration tests verify cleanup |
| Windows signal differences | High | Medium | Use taskkill on Windows; document |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write integration test for zombie prevention | 3 | Test file created; defines 100 spawn/exit cycle expectation | - | test/integration/process-manager.test.ts |
| 3.2 | [ ] | Write tests for signal escalation timing | 2 | Tests verify: SIGINT→SIGTERM→SIGKILL sequence | - | test/unit/shared/process-manager.test.ts |
| 3.3 | [ ] | Write tests for process exit handling | 2 | Tests cover: exit 0, exit N, killed | - | test/unit/shared/process-manager.test.ts |
| 3.4 | [ ] | Implement UnixProcessManager | 3 | Signal escalation works on Linux/macOS | - | packages/shared/src/adapters/unix-process-manager.ts |
| 3.5 | [ ] | Implement exit monitoring with polling | 2 | 250ms polling detects exit | - | packages/shared/src/adapters/process-manager.ts |
| 3.6 | [ ] | Run contract tests against ProcessManager | 2 | Contract tests pass | - | test/contracts/process-manager.contract.test.ts |
| 3.7 | [ ] | Verify integration test passes (no zombies) | 2 | No zombie after 100 spawn/exit cycles | - | test/integration/process-manager.test.ts |
| 3.8 | [ ] | Add Windows taskkill fallback | 2 | Termination works on Windows | - | packages/shared/src/adapters/windows-process-manager.ts |
| 3.9 | [ ] | Register ProcessManager in DI container | 1 | Platform-appropriate manager resolved | - | Extend DI container |

### Test Examples (Write First!)

```typescript
// test/unit/shared/process-manager.test.ts
describe('ProcessManager', () => {
  it('should escalate signals with 2-second intervals', async () => {
    /*
    Test Doc:
    - Why: AC-14 requires termination within 10 seconds
    - Contract: SIGINT → 2s → SIGTERM → 2s → SIGKILL
    - Usage Notes: Process may exit at any stage; stop escalation on exit
    - Quality Contribution: Prevents zombie processes
    - Worked Example: stubborn process → SIGINT, SIGTERM, SIGKILL sent
    */
    const fakeProcess = new FakeProcessManager();
    const childProcess = fakeProcess.createStubbornProcess();

    await fakeProcess.terminate(childProcess);

    const signals = fakeProcess.getSignalsSent();
    expect(signals).toEqual(['SIGINT', 'SIGTERM', 'SIGKILL']);

    const timings = fakeProcess.getSignalTimings();
    expect(timings[1] - timings[0]).toBeGreaterThanOrEqual(2000);
    expect(timings[2] - timings[1]).toBeGreaterThanOrEqual(2000);
  });

  it('should stop escalation when process exits', async () => {
    /*
    Test Doc:
    - Why: Don't send signals to already-exited process
    - Contract: Exit during escalation stops signal sequence
    - Usage Notes: Check process.exitCode before each signal
    - Quality Contribution: Correct exit code reporting
    - Worked Example: exit after SIGTERM → only SIGINT, SIGTERM sent
    */
    const fakeProcess = new FakeProcessManager();
    const childProcess = fakeProcess.createExitOnSigtermProcess();

    const result = await fakeProcess.terminate(childProcess);

    expect(fakeProcess.getSignalsSent()).toEqual(['SIGINT', 'SIGTERM']);
    expect(result.exitCode).toBe(143); // SIGTERM exit code
  });
});
```

### Non-Happy-Path Coverage
- [ ] Process already exited before terminate()
- [ ] Process ignores all signals (uses SIGKILL)
- [ ] Concurrent terminate() calls handled
- [ ] Timeout during signal wait

### Acceptance Criteria
- [ ] ProcessManager passes contract tests
- [ ] Signal escalation completes in <10 seconds (AC-14)
- [ ] No zombie processes after termination
- [ ] Correct exit codes reported (AC-5, AC-6, AC-7)
- [ ] Windows fallback documented

---

### Phase 4: Copilot Adapter

**Objective**: Implement Copilot CLI adapter with log file parsing.

**Deliverables**:
- CopilotAdapter implementing IAgentAdapter
- Log file polling for session ID extraction
- Graceful degradation for missing token data
- Integration tests with real CLI

**Dependencies**: Phase 1, Phase 3 must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Token reporting unavailable | High | Medium | Return null; document limitation |
| Log file timing issues | Medium | High | Exponential backoff polling |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write integration test expectations for real CLI | 3 | Test file created with skip-if-no-CLI guard; defines expected behaviors | - | test/integration/copilot-adapter.test.ts |
| 4.2 | [ ] | Write tests for log file session ID extraction | 2 | Tests cover: found, not found, timeout | - | test/unit/shared/copilot-log-parser.test.ts |
| 4.3 | [ ] | Implement CopilotLogParser | 2 | Extracts session ID from logs | - | packages/shared/src/adapters/copilot-log-parser.ts |
| 4.4 | [ ] | Write tests for polling with backoff | 2 | Tests verify exponential backoff | - | test/unit/shared/copilot-adapter.test.ts |
| 4.5 | [ ] | Implement CopilotAdapter | 3 | Passes unit tests with fakes | - | packages/shared/src/adapters/copilot.adapter.ts |
| 4.6 | [ ] | Run contract tests against CopilotAdapter | 2 | Contract tests pass | - | test/contracts/agent-adapter.contract.test.ts |
| 4.7 | [ ] | Implement graceful token degradation | 1 | Returns null when tokens unavailable | - | packages/shared/src/adapters/copilot.adapter.ts |
| 4.8 | [ ] | Verify integration tests pass with real CLI | 2 | Real spawn, log parsing, session ID validated | - | test/integration/copilot-adapter.test.ts |
| 4.9 | [ ] | Register CopilotAdapter in DI container | 1 | Resolvable from container | - | Extend DI container |

### Test Examples (Write First!)

```typescript
// test/unit/shared/copilot-adapter.test.ts
describe('CopilotAdapter', () => {
  it('should poll log file with exponential backoff', async () => {
    /*
    Test Doc:
    - Why: Log file may not exist immediately after spawn
    - Contract: Poll with 50ms base, 2x backoff, 5s max
    - Usage Notes: Returns fallback session ID on timeout
    - Quality Contribution: Prevents infinite polling
    - Worked Example: file appears at 300ms → found on 4th poll
    */
    const fakeFs = new FakeFileSystem();
    fakeFs.scheduleFileCreation('session.log', 300); // appears at 300ms

    const adapter = new CopilotAdapter({ fs: fakeFs });
    const sessionId = await adapter.extractSessionId('/logs');

    expect(sessionId).toBeDefined();
    expect(fakeFs.getPollCount()).toBe(4); // 0, 50, 150, 350ms
  });

  it('should return null tokens when unavailable', async () => {
    /*
    Test Doc:
    - Why: Copilot token reporting is undocumented
    - Contract: Return null, not fake/estimated values
    - Usage Notes: Caller must handle null tokens
    - Quality Contribution: Honest reporting vs fabrication
    - Worked Example: no token data → tokens: null
    */
    const result = await adapter.run({ prompt: 'test' });

    expect(result.tokens).toBeNull();
    expect(result.status).toBe('completed'); // Still succeeds
  });
});
```

### Non-Happy-Path Coverage
- [ ] Log directory doesn't exist
- [ ] Log file empty or malformed
- [ ] Timeout during polling
- [ ] CLI not installed

### Acceptance Criteria
- [ ] CopilotAdapter passes contract tests
- [ ] Session ID extracted from logs (AC-17)
- [ ] Graceful degradation for missing tokens
- [ ] Exponential backoff prevents CPU exhaustion
- [ ] Integration tests pass with real CLI

---

### Phase 5: Commands & Integration

**Objective**: Implement `/compact` command and integrate service layer.

**Deliverables**:
- AgentService orchestrating adapters
- `/compact` command implementation
- Timeout integration via config system
- Full acceptance criteria verification

**Dependencies**: Phases 1-4 must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Compact command differs per agent | Medium | Medium | Per-adapter compact implementation |
| Timeout race with completion | Low | Medium | Careful state machine handling |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write acceptance tests for all 20 AC | 3 | Test file with all AC mapped; initially failing | - | test/integration/acceptance.test.ts |
| 5.2 | [ ] | Write tests for AgentService.run() | 2 | Tests cover: new session, resume | - | test/unit/services/agent-service.test.ts |
| 5.3 | [ ] | Implement AgentService | 3 | Orchestrates adapter selection | - | packages/shared/src/services/agent.service.ts |
| 5.4 | [ ] | Write tests for compact() | 2 | Tests verify: command sent, tokens reduced; integration tests must build context first (see Discovery 11) | - | test/unit/services/agent-service.test.ts |
| 5.5 | [ ] | Implement compact() for Claude Code | 2 | Sends /compact, returns new token count | - | packages/shared/src/adapters/claude-code.adapter.ts |
| 5.6 | [ ] | Implement compact() for Copilot | 2 | Best-effort compact or no-op | - | packages/shared/src/adapters/copilot.adapter.ts |
| 5.7 | [ ] | Write tests for timeout handling | 2 | Tests verify: timeout triggers termination | - | test/unit/services/agent-service.test.ts |
| 5.8 | [ ] | Integrate timeout from config | 1 | Reads from AgentConfigType | - | packages/shared/src/services/agent.service.ts |
| 5.9 | [ ] | Verify all acceptance tests pass | 2 | All 20 acceptance criteria green | - | test/integration/acceptance.test.ts |
| 5.10 | [ ] | Register AgentService in DI container | 1 | Resolvable from container | - | Extend DI container |

### Test Examples (Write First!)

```typescript
// test/unit/services/agent-service.test.ts
describe('AgentService', () => {
  it('should run prompt and return result with session ID', async () => {
    /*
    Test Doc:
    - Why: AC-1 requires session ID in result
    - Contract: run() returns AgentResult with sessionId
    - Usage Notes: First call creates session; subsequent resume
    - Quality Contribution: Core functionality verification
    - Worked Example: run({prompt:"hi"}) → {sessionId, status, tokens}
    */
    const fakeAdapter = new FakeAgentAdapter();
    const service = new AgentService(fakeAdapter, fakeConfig, fakeLogger);

    const result = await service.run({
      prompt: 'hello',
      agentType: 'claude-code'
    });

    expect(result.sessionId).toBeDefined();
    expect(result.status).toBe('completed');
  });

  it('should terminate on timeout', async () => {
    /*
    Test Doc:
    - Why: AC-20 requires timeout termination
    - Contract: Timeout triggers terminate(), returns failed
    - Usage Notes: Timeout configurable via config system
    - Quality Contribution: Prevents runaway agents
    - Worked Example: 10min timeout → terminates, status='failed'
    */
    const fakeAdapter = new FakeAgentAdapter({ runDuration: 700000 }); // 11+ min
    const fakeConfig = new FakeConfigService({
      agent: { timeout: 600000 } // 10 min
    });
    const service = new AgentService(fakeAdapter, fakeConfig, fakeLogger);

    const result = await service.run({ prompt: 'long task' });

    expect(result.status).toBe('failed');
    expect(fakeAdapter.wasTerminated()).toBe(true);
  });
});
```

### Non-Happy-Path Coverage
- [ ] Unknown agent type rejected
- [ ] Adapter throws error → failed status
- [ ] Compact on non-existent session
- [ ] Terminate already-completed session

### Acceptance Criteria
- [ ] All 20 acceptance criteria verified
- [ ] AgentService passes integration tests
- [ ] `/compact` reduces token count (AC-12, AC-13)
- [ ] Timeout from config works (AC-20)
- [ ] Service is stateless (per spec)

---

### Phase 6: Documentation

**Objective**: Create developer documentation for agent control service.

**Deliverables**:
- API reference in docs/how/dev/
- Adapter implementation guide
- Token tracking patterns
- Process lifecycle documentation

**Dependencies**: Phases 1-5 must be complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Documentation drift | Medium | Medium | Update docs in same PR as code |

### Discovery & Placement Decision

**Existing docs/how/ structure**:
- docs/how/configuration/ (3 files)

**Decision**: Create new `docs/how/dev/agent-control/` directory for this feature.

**File strategy**: Create numbered files following existing pattern.

### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Survey existing docs/how/ directories | 1 | Documented existing structure | - | Discovery step |
| 6.2 | [ ] | Create docs/how/dev/agent-control/1-overview.md | 2 | Architecture, motivation, interfaces | - | /home/jak/substrate/002-agents/docs/how/dev/agent-control/1-overview.md |
| 6.3 | [ ] | Create docs/how/dev/agent-control/2-usage.md | 2 | Usage examples, common patterns | - | /home/jak/substrate/002-agents/docs/how/dev/agent-control/2-usage.md |
| 6.4 | [ ] | Create docs/how/dev/agent-control/3-adapters.md | 2 | How to add new agent adapters | - | /home/jak/substrate/002-agents/docs/how/dev/agent-control/3-adapters.md |
| 6.5 | [ ] | Create docs/how/dev/agent-control/4-testing.md | 2 | Testing patterns with fakes | - | /home/jak/substrate/002-agents/docs/how/dev/agent-control/4-testing.md |
| 6.6 | [ ] | Review documentation for completeness | 1 | All sections complete, links valid | - | Peer review |

### Acceptance Criteria
- [ ] All documentation files created
- [ ] Code examples tested and working
- [ ] No broken links
- [ ] Target audience (developers) can follow guides

---

## Cross-Cutting Concerns

### Security Considerations

- **Permission bypass**: Always use `--dangerously-skip-permissions`; document security implications
- **Process isolation**: Agent runs in caller's security context; no additional isolation
- **Credential handling**: CLI tools may access credentials; document in usage guide

### Observability

- **Logging**: ILogger injection throughout; INFO for lifecycle events, DEBUG for details
- **Metrics**: Token usage tracked per execution; timing via log timestamps
- **Error tracking**: Failed status includes stderr for debugging

### Documentation

- **Location**: docs/how/dev/agent-control/
- **Audience**: Developers integrating or extending agent control
- **Maintenance**: Update when API changes or new adapters added

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| IAgentAdapter interface | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=0 | New interface, low complexity | Interface-first design |
| ClaudeCodeAdapter | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=0 | External CLI integration | Contract tests for parity |
| ProcessManager | 3 | Medium | S=1,I=0,D=0,N=1,F=1,T=0 | Signal handling, platform-specific | Platform-specific implementations |
| CopilotAdapter | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=0 | Log file parsing, polling | Graceful degradation |
| AgentService | 3 | Medium | S=1,I=1,D=0,N=0,F=1,T=0 | Orchestration, timeout | State machine for result |

---

## Progress Tracking

### Phase Completion Checklist
- [ ] Phase 1: Interfaces & Fakes - [Status]
- [ ] Phase 2: Claude Code Adapter - [Status]
- [ ] Phase 3: Process Management - [Status]
- [ ] Phase 4: Copilot Adapter - [Status]
- [ ] Phase 5: Commands & Integration - [Status]
- [ ] Phase 6: Documentation - [Status]

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0001 | Accepted | Phase 1, 2, 4 | MCP Tool Design Patterns: verb_object naming if exposed via MCP, semantic response fields, three-level testing |
| ADR-0002 | Accepted | Phase 1, 2, 4 | Exemplar-Driven Development: exemplar-first sequence, contract tests for fake-real parity (see Discovery 08) |
| ADR-0003 | Accepted | Phase 1, 5 | Configuration system for timeout; follow AgentConfigType pattern per IMP-006 |

No new ADRs required at this time. ADR seeds from spec (Adapter Interface Design, Process Lifecycle Management) can be formalized if needed during implementation.

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| Constitution P4: "Fakes Over Mocks" + Spec: "Avoid mocks entirely" | Reconciliation needed | N/A - these are compatible | Use fakes for internal interfaces (FakeAgentAdapter); use real CLIs for integration tests. No vi.mock() usage. |

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

**Initial State** (before implementation begins):
```markdown
[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
...
```

---

*Plan generated: 2026-01-22*
*Plan directory: docs/plans/002-agent-control/*
*Next step: Run `/plan-4-complete-the-plan` to validate readiness*
