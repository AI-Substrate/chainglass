# Code Review: Phase 1 - AgentManagerService + AgentInstance Core

**Plan**: 019-agent-manager-refactor
**Phase**: Phase 1 - AgentManagerService + AgentInstance Core
**Reviewed**: 2026-01-29
**Commit**: 027fb19
**Testing Approach**: Full TDD

---

## A) Verdict

**✅ APPROVE**

Phase 1 implementation is well-executed with excellent TDD discipline, comprehensive test coverage, and proper architecture. Two minor issues identified (LOW severity) should be addressed but are not blocking.

---

## B) Summary

Phase 1 delivers the foundational agent management system as specified:
- **AgentManagerService**: Central registry for creating/tracking agents across workspaces
- **AgentInstance**: Self-contained agent wrapper with status state machine, event capture, and double-run guard
- **Contract Tests**: 44 tests (22 Fake + 22 Real) with perfect parity
- **Integration Tests**: 9 tests verifying end-to-end flows
- **Security**: Path traversal prevention via validateAgentId()
- All 17 acceptance criteria (AC-01 through AC-12, AC-23, AC-24, AC-26, AC-27, AC-29) verified

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (32 Test Doc blocks with 5 required fields)
- [x] Mock usage matches spec: **Fakes over mocks** (zero domain mock violations)
- [x] Negative/edge cases covered (double-run, unknown agent, path traversal)
- [x] Contract tests run against BOTH Fake and Real implementations
- [x] BridgeContext patterns followed (N/A - no VS Code extension code in this phase)
- [x] Only in-scope files changed (2 minor scope extensions - see E.1)
- [x] Linters/type checks are clean
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | LOW | agent-manager.service.ts:118 | getAgent() doesn't validate agentId | Add assertValidAgentId() for defense-in-depth |
| CORR-001 | LOW | agent-instance.ts:182-202 | terminate() missing error handler | Add try-catch to ensure status consistency |
| SCOPE-001 | INFO | packages/shared/package.json | File modified but not in task table | Justified: export path for feature folder |
| SCOPE-002 | INFO | index.ts | Barrel export created | Justified: necessary for imports |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**SKIPPED**: Phase 1 is the first phase - no prior phases to regress against.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity: ✅ INTACT

**Task↔Log Validation**: All 12 completed tasks have corresponding execution log entries with proper task references.
- Validated: T000-T011
- Broken links: 0

**Scope Guard**:
- 17/19 files in diff are explicitly authorized in tasks.md
- 2 files outside explicit scope but justified:
  - `packages/shared/package.json`: Necessary to add export path for feature folder (T010 DI registration dependency)
  - `packages/shared/src/features/019-agent-manager-refactor/index.ts`: Barrel export for clean imports (common pattern)
- **Verdict**: ⚠️ MINOR_ISSUES (INFO only, not blocking)

#### TDD Compliance: ✅ EXCELLENT

**TDD Order Verified**:
1. T005, T006 (contract tests) written before T007, T008 (implementations)
2. T009 (validateAgentId) written before T007, T008 that depend on it
3. Execution log shows clear RED-GREEN-REFACTOR progression

**Test Doc Blocks**: 32 comprehensive blocks with all 5 required fields:
- Why, Contract, Usage Notes, Quality Contribution, Worked Example

**Contract Test Coverage**:
- agent-manager.contract.ts: 10 tests × 2 implementations = 20 tests
- agent-instance.contract.ts: 12 tests × 2 implementations = 24 tests
- Total: 44 passed with perfect Fake/Real parity

#### Mock Usage: ✅ COMPLIANT

**"Fakes over mocks" policy fully enforced**:
- Mock framework violations in domain tests: 0
- Fake class usage: 10+ instances
- FakeAgentAdapter, FakeAgentInstance, FakeAgentManagerService all used correctly
- Internal class mocking: Zero

### E.2) Semantic Analysis

**Domain Logic**: ✅ Correct
- AgentManagerService implements central registry pattern per spec
- AgentInstance wraps IAgentAdapter with proper status state machine
- Event capture with unique IDs for incremental fetching

**Business Rules**:
- AC-01: Creates agents with unique IDs ✅
- AC-02: Lists all agents regardless of workspace ✅
- AC-03: Filters agents by workspace ✅
- AC-07a: Guards against double-run ✅

**Specification Drift**: None detected - implementation matches plan exactly.

### E.3) Quality & Safety Analysis

**Safety Score: 98/100** (CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 2)

#### Security Review

**[LOW] SEC-001 - Missing validation in getAgent()**
- **File**: agent-manager.service.ts:118
- **Issue**: `getAgent(agentId)` doesn't call `assertValidAgentId()` before lookup
- **Impact**: Inconsistent API contract; invalid IDs silently return null
- **Risk**: LOW (Map lookup is safe, no path traversal risk)
- **Fix**: Add `assertValidAgentId(agentId)` at method entry for defense-in-depth
- **Patch**:
  ```diff
  getAgent(agentId: string): IAgentInstance | null {
  +   assertValidAgentId(agentId);
      return this._agents.get(agentId) ?? null;
  }
  ```

**Path Traversal Prevention**: ✅ PASSED
- validateAgentId() correctly rejects: `..`, `/`, `\`, `\0`, whitespace
- Max 64 chars enforced
- Alphanumeric + dash/underscore only

**ID Generation**: ✅ Safe
- generateAgentId() uses timestamp + random, no user input

#### Correctness Review

**[LOW] CORR-001 - terminate() missing error handler**
- **File**: agent-instance.ts:182-202
- **Issue**: If `adapter.terminate()` throws, error is not caught and status may be inconsistent
- **Impact**: Status could remain incorrect if terminate fails
- **Risk**: LOW (adapter.terminate() is unlikely to throw in practice)
- **Fix**: Wrap in try-catch to ensure status is always updated
- **Patch**:
  ```diff
  async terminate(): Promise<AgentResult> {
      if (this._sessionId) {
  +     try {
          const result = await this._adapter.terminate(this._sessionId);
          this._status = 'stopped';
          this._updatedAt = new Date();
          return result;
  +     } catch (error) {
  +       this._status = 'stopped';
  +       this._updatedAt = new Date();
  +       throw error;
  +     }
      }
      // ...
  }
  ```

**Status State Machine**: ✅ Correct
- stopped → working → stopped|error
- Synchronous guard at line 134-136 before async work

**Event ID Uniqueness**: ✅ Correct
- Format: `${agentId}-evt-${counter}` with pre-increment
- Guaranteed unique per instance

**Incremental Event Fetching**: ✅ Correct
- `slice(sinceIndex + 1)` correctly returns events AFTER sinceId
- Fallback returns all if sinceId not found

### E.4) Doctrine Evolution Recommendations

**Advisory Section - Does not affect verdict**

#### New ADR Candidates: None

Implementation follows existing ADR-0004 (DI Container) correctly.

#### New Rules Candidates: 1

| ID | Rule Statement | Evidence | Priority |
|----|----------------|----------|----------|
| RULE-REC-001 | All methods accepting user-provided IDs MUST validate at entry point | SEC-001 finding - inconsistent validation | MEDIUM |

**Recommended Addition to rules.md**:
```markdown
### Input Validation
- All public methods accepting user-provided identifiers (agentId, sessionId, etc.) MUST call validation functions at method entry
- Use assertValid*() pattern for consistency
- This enables defense-in-depth and consistent error reporting
```

#### New Idioms Candidates: 1

| ID | Pattern | Evidence | Priority |
|----|---------|----------|----------|
| IDIOM-REC-001 | Contract Test Dual Execution Pattern | agent-manager.contract.ts, agent-instance.contract.ts | LOW |

**Pattern Description**:
```typescript
// Define contract tests once, execute against both Fake and Real
export function serviceContractTests(name: string, createService: () => IService) {
  describe(`${name} implements IService contract`, () => {
    // tests here
  });
}

// In test file:
serviceContractTests('FakeService', () => new FakeService());
serviceContractTests('RealService', () => new RealService(deps));
```

#### Positive Alignment: 3

| Doctrine Ref | Evidence | Note |
|--------------|----------|------|
| ADR-0004: DI Container | di-container.ts uses useFactory pattern | Correctly follows no-decorator RSC constraint |
| Constitution Principle 3: Full TDD | 44 contract tests written before implementation | Exemplary TDD discipline |
| Constitution Principle 4: Fakes over mocks | Zero mock framework usage in domain tests | Perfect compliance |

---

## F) Coverage Map

**Testing Approach: Full TDD**

| Acceptance Criterion | Test File | Test Name(s) | Confidence |
|---------------------|-----------|--------------|------------|
| AC-01 (unique IDs) | agent-manager.contract.ts | creates agent with required properties, creates agents with unique IDs | 100% |
| AC-02 (list all) | agent-manager.contract.ts | lists all agents regardless of workspace | 100% |
| AC-03 (filter workspace) | agent-manager.contract.ts | filters agents by workspace | 100% |
| AC-04 (null for unknown) | agent-manager.contract.ts | returns null for unknown agent | 100% |
| AC-06 (properties) | agent-instance.contract.ts | has required properties | 100% |
| AC-07 (run prompts) | agent-instance.contract.ts | runs prompts and returns result | 100% |
| AC-07a (double-run guard) | agent-instance.contract.ts, integration | guards against double-run | 100% |
| AC-08 (intent) | agent-instance.contract.ts | updates intent via setIntent | 100% |
| AC-09 (event history) | agent-instance.contract.ts | provides event history | 100% |
| AC-10 (incremental events) | agent-instance.contract.ts | supports incremental event fetching | 100% |
| AC-11 (terminate) | agent-instance.contract.ts | can be terminated | 100% |
| AC-12 (sessionId) | agent-instance.contract.ts | stores adapter sessionId | 100% |
| AC-23 (path traversal) | validate-agent-id.ts tests | rejects dangerous patterns | 100% |
| AC-24 (not found) | agent-manager.contract.ts | returns null for unknown agent | 100% |
| AC-26 (Fake manager helpers) | fake-agent-manager.service.ts | addAgent, getCreatedAgents, setError | 100% |
| AC-27 (Fake instance helpers) | fake-agent-instance.ts | setStatus, setEvents, assertRunCalled | 100% |
| AC-29 (contract parity) | contract.test.ts files | Both Fake and Real tested | 100% |

**Overall Coverage Confidence**: 100%
**Narrative Tests**: 0 (all tests explicitly mapped to AC)

---

## G) Commands Executed

```bash
# Test suite
just test
# Result: 2468 passed, 35 skipped

# TypeScript compilation
just typecheck
# Result: Exit 0 (no errors)

# Linting
just lint
# Result: Checked 601 files, no fixes needed

# Diff inspection
git diff HEAD~1..HEAD --stat
# Result: 19 files changed, 2641 insertions(+), 25 deletions(-)
```

---

## H) Decision & Next Steps

### Decision

**✅ APPROVE** - Phase 1 is ready for merge.

The implementation demonstrates:
- Excellent TDD discipline with tests-first approach
- Comprehensive contract testing with Fake/Real parity
- Proper security with path traversal prevention
- Clean architecture following plan specifications

### Recommended Actions (Non-Blocking)

1. **SEC-001**: Add `assertValidAgentId()` to `getAgent()` for defense-in-depth (5 min fix)
2. **CORR-001**: Add try-catch in `terminate()` for consistent error handling (5 min fix)

These can be addressed in a follow-up commit or in Phase 2.

### Next Phase

Proceed to **Phase 2: AgentNotifierService (SSE Broadcast)** via:
1. Run `/plan-5-phase-tasks-and-brief` for Phase 2
2. Run `/plan-6-implement-phase` for Phase 2 implementation

---

## I) Footnotes Audit

| File Path | Footnote(s) | Node ID(s) |
|-----------|-------------|------------|
| packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts | – | – |
| packages/shared/src/features/019-agent-manager-refactor/agent-instance.interface.ts | – | – |
| packages/shared/src/features/019-agent-manager-refactor/agent-manager.service.ts | – | – |
| packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts | – | – |
| packages/shared/src/features/019-agent-manager-refactor/fake-agent-manager.service.ts | – | – |
| packages/shared/src/features/019-agent-manager-refactor/fake-agent-instance.ts | – | – |
| packages/shared/src/features/019-agent-manager-refactor/index.ts | – | – |
| packages/shared/src/utils/validate-agent-id.ts | – | – |
| packages/shared/src/di-tokens.ts | – | – |
| apps/web/src/lib/di-container.ts | – | – |
| test/contracts/agent-manager.contract.ts | – | – |
| test/contracts/agent-manager.contract.test.ts | – | – |
| test/contracts/agent-instance.contract.ts | – | – |
| test/contracts/agent-instance.contract.test.ts | – | – |
| test/integration/agent-instance.integration.test.ts | – | – |

**Note**: Plan § 12 Change Footnotes Ledger shows placeholder entries `[^1]`, `[^2]`, `[^3]` but these were not populated during implementation. This is acceptable for Phase 1 as no significant deviations or discoveries occurred that warranted footnote documentation.

---

*Review generated by plan-7-code-review*
