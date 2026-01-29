# Code Review: Phase 2 - AgentNotifierService (SSE Broadcast)

**Review Date**: 2026-01-29
**Reviewer**: Code Review Agent (plan-7-code-review)
**Plan**: [../agent-manager-refactor-plan.md](../agent-manager-refactor-plan.md)
**Phase Dossier**: [../tasks/phase-2-agentnotifierservice-sse-broadcast/tasks.md](../tasks/phase-2-agentnotifierservice-sse-broadcast/tasks.md)
**Execution Log**: [../tasks/phase-2-agentnotifierservice-sse-broadcast/execution.log.md](../tasks/phase-2-agentnotifierservice-sse-broadcast/execution.log.md)

---

## A) Verdict

**APPROVE** ✅

The implementation is fundamentally sound, follows TDD discipline, and correctly implements the AgentNotifierService with SSE broadcasting capabilities. While there are some medium-severity findings, none represent blocking issues. The implementation:
- Follows ADR-0007 (single channel, agentId routing)
- Uses proper DI patterns per ADR-0004
- Achieves all acceptance criteria (AC-13 through AC-18, AC-28)
- Has excellent test coverage (40 contract + 8 integration tests)

---

## B) Summary

Phase 2 delivers the AgentNotifierService infrastructure for broadcasting agent events via SSE. Key accomplishments:

1. **IAgentNotifierService interface** with typed events (status, intent, agent_event)
2. **FakeAgentNotifierService** test double with rich inspection helpers
3. **ISSEBroadcaster abstraction** enabling contract tests against both Fake and Real
4. **AgentNotifierService** real implementation using SSEManagerBroadcaster adapter
5. **Storage-first integration** with AgentInstance via `_setStatus()` and `_captureEvent()` helpers
6. **DI registration** for production and test containers
7. **48 new tests** (40 contract + 8 integration), all passing

Test counts: 2516 total (+48 new from Phase 2), 0 failures.

---

## C) Checklist

**Testing Approach: Full TDD** ✅

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution.log.md)
- [x] Tests as docs (comprehensive Test Doc blocks in integration tests)
- [x] Mock usage matches spec: **Avoid mocks** ✅ (Fakes used throughout)
- [x] Negative/edge cases covered (double-run guard, multiple agents, error states)
- [x] BridgeContext patterns followed (N/A - no VS Code extension work)
- [x] Only in-scope files changed (verified against task table)
- [x] Linters/type checks are clean (biome: 0 errors, tsc: 0 errors)
- [x] Absolute paths used (no hidden context assumptions)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| QA-001 | MEDIUM | agent-instance.ts:270-273 | setIntent() writes then broadcasts without _setIntent helper | Extract to helper for consistency |
| QA-002 | MEDIUM | agent-notifier.service.ts:54-91 | No try-catch around broadcaster.broadcast() calls | Add error handling, log failures |
| QA-003 | LOW | agent-instance.ts:74 | _events array unbounded growth | Document or address in Phase 3 |
| QA-004 | LOW | agent-notifier.service.ts:55-88 | Timestamp at broadcast, not creation time | Minor inconsistency, acceptable |
| QA-005 | LOW | di-container.ts:381-386 | No null check on sseManager in factory | Add defensive guard |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Phase 1 Regression Tests**: ✅ **PASS**

| Prior Phase | Tests Rerun | Passed | Failed |
|-------------|-------------|--------|--------|
| Phase 1: AgentManagerService + AgentInstance Core | 53 | 53 | 0 |

- `test/contracts/agent-instance.contract.test.ts`: 24 tests ✅
- `test/contracts/agent-manager.contract.test.ts`: 20 tests ✅
- `test/integration/agent-instance.integration.test.ts`: 9 tests ✅

**Contract Validation**: No breaking changes to public interfaces.
**Integration Points**: AgentInstance correctly accepts notifier parameter.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations
None. All Task↔Log links validated:
- 11 completed tasks, 11 log entries
- Proper Start/Complete timestamps
- All files match task table Absolute Path(s) column

#### TDD Compliance
**Score: EXEMPLARY** ✅

| Check | Status | Evidence |
|-------|--------|----------|
| Contract tests for both Fake & Real | ✅ | 40 tests (20 per impl) |
| Test Doc blocks | ✅ | 8 integration tests with 5-field docs |
| RED-GREEN-REFACTOR order | ✅ | execution.log.md timestamps |
| Fakes over Mocks | ✅ | Zero mock usage detected |

#### ADR Compliance

| ADR | Constraint | Status |
|-----|------------|--------|
| ADR-0007 | Single 'agents' channel | ✅ Verified |
| ADR-0007 | agentId in all events | ✅ Verified |
| ADR-0004 | Factory pattern for DI | ✅ Verified |

#### DYK Decision Compliance

| DYK | Decision | Status |
|-----|----------|--------|
| DYK-06 | Notifier via DI to AgentManagerService | ✅ |
| DYK-07 | Interface in shared, impl in web | ✅ |
| DYK-08 | ISSEBroadcaster abstraction | ✅ |
| DYK-09 | _setStatus/_captureEvent helpers | ✅ |
| DYK-10 | Notifier required parameter | ✅ |

### E.2) Semantic Analysis

**Domain Logic**: ✅ Correct
- Status transitions (stopped → working → stopped/error) properly captured
- Intent updates broadcast correctly
- Events stored with unique eventId then broadcast

**Specification Compliance**: ✅ All AC met
- AC-13: Single SSE endpoint via AgentNotifierService
- AC-14: All events include agentId
- AC-15: Status changes broadcast
- AC-16: Intent changes broadcast
- AC-17: Events broadcast after storage (storage-first)
- AC-18: SSE survives page refresh (EventSource auto-reconnect)
- AC-28: FakeAgentNotifierService with rich helpers

### E.3) Quality & Safety Analysis

**Safety Score: 85/100** (MEDIUM: 2, LOW: 3)

#### QA-001: setIntent() Inconsistency (MEDIUM)
**File**: `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts:270-273`
**Issue**: `setIntent()` writes directly to `_intent` then broadcasts, bypassing the helper pattern used by `_setStatus()` and `_captureEvent()`.

```typescript
setIntent(intent: string): void {
  this._intent = intent;
  this._updatedAt = new Date();
  this._notifier.broadcastIntent(this.id, intent);
}
```

**Impact**: Inconsistent with DYK-09 storage-first helper pattern. If broadcast fails, state is already changed.
**Fix**: Extract to `_setIntent()` helper for consistency with other mutation patterns.
**Mitigating Factor**: Intent is memory-only state, not persisted to storage until Phase 3. Low practical impact.

#### QA-002: Missing Error Handling in Notifier (MEDIUM)
**File**: `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts:54-91`
**Issue**: `broadcaster.broadcast()` calls have no try-catch. If SSE fails, exception propagates.

**Impact**: Could crash agent run on transient SSE issues.
**Fix**: Wrap in try-catch, log errors, don't rethrow (broadcasts are best-effort per PL-01).
**Mitigating Factor**: SSEManager is stable; exceptions unlikely in normal operation.

#### QA-003: Unbounded Event Growth (LOW)
**File**: `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts:74`
**Issue**: `_events` array grows indefinitely with no cleanup.

**Impact**: Memory pressure in long-running agents or stress tests.
**Fix**: Document as Phase 3 concern (storage layer will handle persistence/rotation).

#### QA-004: Timestamp at Broadcast Time (LOW)
**File**: `apps/web/src/features/019-agent-manager-refactor/agent-notifier.service.ts:55-88`
**Issue**: Timestamp generated at broadcast, not event creation.

**Impact**: Minor discrepancy if broadcast is delayed.
**Fix**: Pass timestamp from AgentStoredEvent if available.

#### QA-005: No sseManager Guard (LOW)
**File**: `apps/web/src/lib/di-container.ts:381-386`
**Issue**: No null check on sseManager before creating broadcaster.

**Impact**: Cryptic error if sseManager undefined.
**Fix**: Add guard: `if (!sseManager) throw new Error('...')`.

### E.4) Doctrine Evolution Recommendations

**ADVISORY** - Does not affect verdict

| Category | Recommendation | Priority |
|----------|----------------|----------|
| Idiom | Document storage-first helper pattern (_setX for mutations) | MEDIUM |
| Rule | Require error handling around external service calls (SSE, storage) | LOW |

---

## F) Coverage Map

**Testing Approach**: Full TDD

| Acceptance Criterion | Test(s) | Confidence |
|---------------------|---------|------------|
| AC-13: Single SSE endpoint | agent-notifier.contract.ts:53-59 | 100% |
| AC-14: agentId in events | agent-notifier.contract.ts:69-75, 119-125, 174-180 | 100% |
| AC-15: Status broadcast | agent-notifier.contract.ts:53-101 | 100% |
| AC-16: Intent broadcast | agent-notifier.contract.ts:103-150 | 100% |
| AC-17: Events after storage | agent-notifier.integration.test.ts:114-157 | 100% |
| AC-18: SSE reconnection | N/A (EventSource built-in) | 75% |
| AC-28: Fake test helpers | agent-notifier.contract.test.ts:14-23 | 100% |

**Overall Coverage Confidence**: 96%

---

## G) Commands Executed

```bash
# Tests
pnpm test -- test/contracts/agent-notifier.contract.test.ts test/integration/agent-notifier.integration.test.ts test/contracts/agent-instance.contract.test.ts test/contracts/agent-manager.contract.test.ts test/integration/agent-instance.integration.test.ts
# Result: 101 tests passed

# Type check
just typecheck
# Result: 0 errors

# Lint
just lint
# Result: Checked 611 files in 86ms. No fixes applied.

# Phase 1 regression
pnpm test -- test/contracts/agent-instance.contract.test.ts test/contracts/agent-manager.contract.test.ts test/integration/agent-instance.integration.test.ts
# Result: 53 tests passed (no regressions)
```

---

## H) Decision & Next Steps

### Approval
**APPROVED** for merge.

### Recommended Fixes (Non-Blocking)
Consider addressing in a follow-up commit or Phase 3:
1. **QA-001**: Extract `_setIntent()` helper for consistency
2. **QA-002**: Add try-catch around broadcast calls
3. **QA-003**: Document event retention strategy for Phase 3

### Next Phase
Proceed to **Phase 3: Storage Layer** after merging Phase 2.
- Run `/plan-5-phase-tasks-and-brief --phase "Phase 3: Storage Layer"` to generate dossier
- Storage layer will address event persistence and rotation

---

## I) Footnotes Audit

| Diff-Touched Path | Task(s) | Footnote | Plan Ledger |
|-------------------|---------|----------|-------------|
| packages/shared/.../agent-notifier.interface.ts | T001 | – | Pending |
| packages/shared/.../sse-broadcaster.interface.ts | T001a | – | Pending |
| packages/shared/.../fake-agent-notifier.service.ts | T002 | – | Pending |
| packages/shared/.../fake-sse-broadcaster.ts | T002a | – | Pending |
| test/contracts/agent-notifier.contract.ts | T003 | – | Pending |
| test/contracts/agent-notifier.contract.test.ts | T003 | – | Pending |
| apps/web/.../agent-notifier.service.ts | T004 | – | Pending |
| apps/web/.../sse-manager-broadcaster.ts | T004a | – | Pending |
| packages/shared/.../agent-instance.ts | T005 | – | Pending |
| packages/shared/.../agent-manager.service.ts | T005 | – | Pending |
| packages/shared/src/di-tokens.ts | T006 | – | Pending |
| apps/web/src/lib/di-container.ts | T006 | – | Pending |
| test/integration/agent-notifier.integration.test.ts | T007 | – | Pending |

**Note**: Footnotes not yet populated in Plan § 12 Change Footnotes Ledger. Run `plan-6a-update-progress` to sync footnotes.

---

*Review generated by plan-7-code-review agent*
