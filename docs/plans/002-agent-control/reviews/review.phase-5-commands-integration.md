# Phase 5: Commands & Integration - Code Review Report

**Plan**: `/home/jak/substrate/002-agents/docs/plans/002-agent-control/agent-control-plan.md`
**Phase**: Phase 5: Commands & Integration
**Dossier**: `/home/jak/substrate/002-agents/docs/plans/002-agent-control/tasks/phase-5-commands-integration/tasks.md`
**Reviewed**: 2026-01-23
**Testing Approach**: Full TDD

---

## A) Verdict

### ⚠️ **REQUEST_CHANGES**

**Reason**: Multiple HIGH severity findings in correctness and performance require fixes before merge.

**Blocking Issues**:
- COR-001: Potential timer resource leak (timeout timer not cleared on success)
- COR-002: Timeout termination only fires if sessionId provided
- PERF-001: _activeSessions Map grows unbounded without cleanup
- SEC-001: Input validation for agentType should be explicit in AgentService

---

## B) Summary

Phase 5 successfully implements the AgentService orchestration layer with:
- ✅ Factory function pattern for adapter selection (per DYK-02)
- ✅ Timeout handling via Promise.race() (per DYK-01)
- ✅ Config loading via require(AgentConfigType) (per DYK-05)
- ✅ Full TDD compliance with RED-GREEN-REFACTOR evidence
- ✅ All 457 tests pass including 19 acceptance tests and 21 unit tests
- ✅ Zero mock usage violations (Fakes over Mocks policy honored)
- ⚠️ Footnotes ledger not populated (MEDIUM)
- ⚠️ Memory/timer resource management needs improvement

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (Test Doc blocks present with all 5 fields)
- [x] Mock usage matches spec: **Fakes Only** ✅
- [x] Negative/edge cases covered (timeout, failed status, unknown agent)
- [ ] BridgeContext patterns followed (N/A - not VS Code extension)
- [x] Only in-scope files changed (3 justified neighbors documented)
- [x] Linters/type checks are clean (457 tests pass, tsc clean)
- [ ] Absolute paths used (cwd parameter not validated - SEC-002)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| COR-001 | HIGH | agent.service.ts:243-248 | Timeout timer not cleared on success | Add clearTimeout in finally block |
| COR-002 | HIGH | agent.service.ts:136-140 | Timeout only terminates if sessionId exists | Store adapter ref for termination |
| COR-003 | HIGH | agent.service.ts:153-163 | Sessions tracked even on failure | Track only on success with valid sessionId |
| PERF-001 | HIGH | agent.service.ts:68-71 | _activeSessions Map unbounded growth | Add cleanup after run() completion |
| SEC-001 | HIGH | agent.service.ts:101,111 | Unvalidated agentType parameter | Add whitelist validation |
| SEC-002 | HIGH | agent.service.ts:101,117 | Unvalidated cwd parameter | Validate against path traversal |
| SEC-003 | HIGH | agent.service.ts:101 | Unvalidated prompt parameter | Add length limits/sanitization |
| LINK-001 | MEDIUM | tasks.md vs acceptance.test.ts | Task says "20 AC" but 19 tests exist | Update task description |
| FOOTNOTE-001 | MEDIUM | agent-control-plan.md:1022-1035 | Footnotes ledger not populated | Run plan-6a to add footnotes |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: PASS (no regressions detected)

All 457 tests pass including:
- Unit tests from Phases 1-4: Adapters, parsers, process managers
- Contract tests: 27 tests verifying fake-real parity
- Integration tests: CLI adapter tests (skipped when CLI not installed)

Previous phase functionality verified:
- ClaudeCodeAdapter contract tests: 9 pass
- CopilotAdapter contract tests: 9 pass  
- ProcessManager contract tests: 9 pass

---

### E.1) Doctrine & Testing Compliance

#### TDD Compliance: ✅ PASS

| Check | Status | Evidence |
|-------|--------|----------|
| TDD order | ✅ | T001→T002→T003 (tests→impl), T007→T008 (timeout) |
| Tests as docs | ✅ | Test Doc blocks with all 5 required fields present |
| RED-GREEN-REFACTOR | ✅ | Execution log documents cycles clearly |
| Descriptive test names | ✅ | "should call adapter.run() with prompt", etc. |

#### Mock Usage Compliance: ✅ PASS

- **Policy**: Fakes over mocks (no mocking libraries)
- **Mock instances found**: 0
- **Violations**: 0
- Uses FakeAgentAdapter, FakeConfigService, FakeLogger throughout

#### Link Validation Summary

| Link Type | Validated | Broken |
|-----------|-----------|--------|
| Task↔Log | 10 | 1 (T008 "Done in T003" - cosmetic) |
| Footnote↔File | 0 | 0 (ledger unpopulated) |
| Scope Guard | 4 | 3 (justified neighbors) |

**Justified Out-of-Scope Files**:
1. `packages/shared/src/index.ts` - Export for AgentService
2. `packages/shared/src/services/index.ts` - New service directory export
3. `packages/shared/src/fakes/fake-agent-adapter.ts` - runDuration per DYK-03

---

### E.2) Semantic Analysis

**Plan Compliance**: ✅ PASS

All required functionality implemented per plan:

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Factory function pattern (DYK-02) | ✅ | Line 20: `AdapterFactory` type; Line 111: factory call |
| Timeout via Promise.race() (DYK-01) | ✅ | Lines 113-150: race implementation |
| Config via require() (DYK-05) | ✅ | Line 82: `configService.require(AgentConfigType)` |
| Stateless service (Discovery 10) | ✅ | Only tracks active sessions for terminate() |
| run() signature | ✅ | Line 100: matches AgentServiceRunOptions |
| compact() signature | ✅ | Line 179: matches plan |
| terminate() signature | ✅ | Line 209: matches plan |

---

### E.3) Quality & Safety Analysis

**Safety Score: 35/100** (CRITICAL: 0, HIGH: 8, MEDIUM: 2, LOW: 0)
**Verdict: REQUEST_CHANGES**

#### Correctness Issues

**COR-001 (HIGH)**: Timer resource leak
- **File**: agent.service.ts:243-248
- **Issue**: `_createTimeoutPromise` creates setTimeout but never clears it on success
- **Impact**: Timer continues executing after Promise.race() resolves, wasting resources
- **Fix**: Store timeoutId and clear in finally block:
```typescript
private _createTimeoutPromise(timeoutMs: number): { promise: Promise<never>; cancel: () => void } {
  let timeoutId: NodeJS.Timeout;
  const promise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  return { promise, cancel: () => clearTimeout(timeoutId) };
}
```

**COR-002 (HIGH)**: Incomplete timeout termination
- **File**: agent.service.ts:136-140
- **Issue**: On timeout, `terminate(sessionId)` only called if sessionId exists in options
- **Impact**: If no sessionId provided (new session), process continues running
- **Fix**: Store adapter reference and call terminate regardless:
```typescript
if (timedOut) {
  await adapter.terminate(sessionId || '').catch(() => {});
}
```

**COR-003 (HIGH)**: Session tracking on failure
- **File**: agent.service.ts:153-163
- **Issue**: Sessions added to _activeSessions even when run() fails (non-timeout errors)
- **Impact**: Failed sessions pollute the tracking map
- **Fix**: Only track on explicit success check

#### Security Issues

**SEC-001 (HIGH)**: Unvalidated agentType
- **File**: agent.service.ts:101,111
- **Issue**: agentType passed directly to factory without validation
- **Impact**: Factory throws but error message reveals implementation details
- **Fix**: Add whitelist validation before factory call

**SEC-002 (HIGH)**: Unvalidated cwd parameter
- **File**: agent.service.ts:101,117
- **Issue**: cwd passed to adapter without path traversal validation
- **Impact**: Potential directory traversal attack
- **Fix**: Validate cwd doesn't contain `..` and is within allowed paths

**SEC-003 (HIGH)**: Unvalidated prompt parameter
- **File**: agent.service.ts:101
- **Issue**: No length limit or sanitization on prompt
- **Impact**: Memory exhaustion or injection if adapter mishandles
- **Fix**: Add length limit (e.g., 100K chars per plan)

#### Performance Issues

**PERF-001 (HIGH)**: Unbounded session tracking
- **File**: agent.service.ts:68-71
- **Issue**: `_activeSessions` Map grows indefinitely
- **Impact**: Memory leak in long-running processes
- **Fix**: Remove sessions after run() completes (not just on terminate())

---

### E.4) Doctrine Evolution Recommendations

**Advisory - Does not affect verdict**

| Category | Recommendation | Priority |
|----------|---------------|----------|
| Rules | Add "Validate all user-provided paths before file operations" | HIGH |
| Rules | Add "Clear timers when no longer needed" | MEDIUM |
| Idioms | Document timeout-with-cleanup pattern for Promise.race() | MEDIUM |
| ADR | Consider ADR for input validation boundaries (service vs adapter) | LOW |

---

## F) Coverage Map

**Testing Approach**: Full TDD

| Acceptance Criterion | Test File | Confidence | Notes |
|---------------------|-----------|------------|-------|
| AC-1: Session ID in result | acceptance.test.ts:71-97 | 100% | Explicit ID reference |
| AC-2: Session resumption | acceptance.test.ts:102-120 | 100% | Explicit ID reference |
| AC-3: Claude Code CLI flags | acceptance.test.ts:125-140 | 100% | Tests adapter selection |
| AC-4: Copilot CLI flags | acceptance.test.ts:145-160 | 100% | Tests adapter selection |
| AC-5: Completed status | acceptance.test.ts:165-180 | 100% | Explicit assertion |
| AC-6: Failed status | acceptance.test.ts:185-211 | 100% | Explicit assertion |
| AC-7: Killed status | acceptance.test.ts:216-235 | 100% | Explicit assertion |
| AC-9: Token usage | acceptance.test.ts:240-255 | 100% | Explicit assertion |
| AC-10: Token limit | acceptance.test.ts:260-274 | 100% | Explicit assertion |
| AC-11: Copilot tokens null | acceptance.test.ts:279-293 | 100% | Explicit assertion |
| AC-12: Compact command | acceptance.test.ts:298-316 | 100% | Explicit assertion |
| AC-13: Compact returns tokens | acceptance.test.ts:321-336 | 100% | Explicit assertion |
| AC-14: Termination timeout | acceptance.test.ts:341-362 | 100% | Explicit assertion |
| AC-17: Session ID extraction | acceptance.test.ts:367-399 | 100% | Two tests (Claude/Copilot) |
| AC-20: Timeout enforcement | acceptance.test.ts:404-456 | 100% | Two tests |

**Overall Coverage Confidence**: 100%

**Missing AC Tests**: AC-8, AC-15, AC-18, AC-19 (not in spec Phase 5 scope)

---

## G) Commands Executed

```bash
# Test Suite
pnpm vitest run test/unit/services/agent-service.test.ts test/integration/acceptance.test.ts test/contracts/agent-adapter.contract.test.ts
# Result: 67 tests passed

# Full Test Suite
pnpm test
# Result: 457 passed | 7 skipped

# Type Check
pnpm typecheck
# Result: Success (no errors)
```

---

## H) Decision & Next Steps

### Required Before Merge

1. **Fix COR-001**: Add timer cleanup mechanism
2. **Fix COR-002**: Ensure termination fires regardless of sessionId presence
3. **Fix PERF-001**: Add session cleanup after run() completes
4. **Fix SEC-001**: Add agentType whitelist validation

### Recommended (Non-Blocking)

5. Add cwd path validation (SEC-002)
6. Add prompt length limits (SEC-003)
7. Populate footnotes ledger via `plan-6a`

### Approval Path

- Author fixes blocking issues
- Re-run `/plan-7-code-review` to verify fixes
- Upon APPROVE verdict, proceed to Phase 6 (Documentation)

---

## I) Footnotes Audit

| Diff File | Footnote | Plan Ledger Entry |
|-----------|----------|-------------------|
| packages/shared/src/services/agent.service.ts | - | Not populated |
| packages/shared/src/services/index.ts | - | Not populated |
| test/unit/services/agent-service.test.ts | - | Not populated |
| test/integration/acceptance.test.ts | - | Not populated |
| apps/web/src/lib/di-container.ts | - | Not populated |
| packages/shared/src/fakes/fake-agent-adapter.ts | - | Not populated |
| packages/shared/src/index.ts | - | Not populated |

**Status**: ⚠️ Footnotes ledger contains only placeholder entries. Run `plan-6a-update-progress` to populate.

---

*Review generated: 2026-01-23*
*Reviewer: AI Code Review Agent*
*Next: Author addresses blocking issues, then re-review*
