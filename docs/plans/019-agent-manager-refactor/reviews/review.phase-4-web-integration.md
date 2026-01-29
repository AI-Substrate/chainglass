# Phase 4: Web Integration - Code Review Report

**Plan**: [../../agent-manager-refactor-plan.md](../../agent-manager-refactor-plan.md)
**Dossier**: [../tasks/phase-4-web-integration/tasks.md](../tasks/phase-4-web-integration/tasks.md)
**Phase**: 4 of 5
**Review Date**: 2026-01-29
**Testing Approach**: Full TDD (per constitution Principle 3)
**Mock Policy**: Fakes over mocks (per constitution Principle 4)

---

## A) Verdict

**REQUEST_CHANGES**

**Reason**: Multiple HIGH severity findings in correctness (memory leaks, unprotected JSON parsing), TDD compliance violations (tests written after implementation, missing hook unit tests), and observability gaps (no structured logging, no request tracing). These must be addressed before merge.

---

## B) Summary

Phase 4 Web Integration implements 10 tasks creating API routes (GET/POST /api/agents, SSE), React hooks (useAgentManager, useAgentInstance), and integration tests. **All functional requirements are met** and pass quality gates (2565 tests, lint clean, typecheck clean).

**Key Issues Requiring Fixes:**
1. **Memory leaks** in SSE event listeners (no cleanup on unmount/reconnect)
2. **Missing error handling** for JSON.parse in SSE handlers
3. **TDD order violated** - implementation completed before tests
4. **Missing unit tests** for useAgentManager and useAgentInstance hooks
5. **No structured logging** - console.error instead of ILogger
6. **Bidirectional links missing** - footnotes/log anchors not populated via plan-6a

**Positive Notes:**
- ✅ All API routes implement correct HTTP semantics (201, 404, 409)
- ✅ SSE follows ADR-0007 single channel pattern
- ✅ Hooks use React Query with proper invalidation
- ✅ Fakes used correctly (0 mocks, 4+ Fakes)
- ✅ PlanPak file placement compliant

---

## C) Checklist

**Testing Approach: Full TDD** (per plan § Testing Philosophy)

### TDD Compliance
- [ ] Tests precede code (RED-GREEN-REFACTOR evidence) - **FAIL** (TDD-001, TDD-002)
- [ ] Tests as docs (assertions show behavior) - **PARTIAL** (TDD-006, TDD-007)
- [ ] Mock usage matches spec: **Fakes over mocks** - **PASS** (MOCK compliance)
- [ ] Negative/edge cases covered - **PASS** (double-run 409, 404 handling)

### Hook Testing
- [ ] useAgentManager unit tests exist - **FAIL** (TDD-003)
- [ ] useAgentInstance unit tests exist - **FAIL** (TDD-004)
- [ ] DYK-19 (404→null) has test coverage - **FAIL** (in integration only)

### Quality Gates
- [x] BridgeContext patterns followed (Uri, RelativePattern) - **N/A** (no VS Code extension)
- [x] Only in-scope files changed - **PASS** (minor: 3 undeclared support files)
- [x] Linters/type checks are clean - **PASS** (2565 tests, just fft clean)
- [x] Absolute paths used (no hidden context) - **PASS**

### Documentation
- [ ] Task↔Log bidirectional links - **FAIL** (V1 validation)
- [ ] Footnotes populated via plan-6a - **FAIL** (still placeholders)
- [ ] Phase Footnote Stubs populated - **FAIL** (empty table)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| QS-001 | HIGH | useAgentManager.ts:197-209 | Event listeners not removed on unmount - memory leak | Add cleanup in useEffect return |
| QS-002 | HIGH | useAgentInstance.ts:214-231 | Event listeners not removed on unmount - memory leak | Add cleanup in useEffect return |
| QS-003 | HIGH | useAgentManager.ts:199 | Unprotected JSON.parse crashes component | Wrap in try/catch |
| QS-004 | HIGH | useAgentInstance.ts:216 | Unprotected JSON.parse crashes component | Wrap in try/catch |
| QS-005 | MEDIUM | route.ts:22-40 | Race condition in ensureInitialized (all routes) | Use Promise guard pattern |
| TDD-001 | CRITICAL | execution.log.md | Implementation before tests (violates TDD order) | Document test-first in future |
| TDD-002 | CRITICAL | execution.log.md | No RED-GREEN-REFACTOR cycles documented | Add cycle timestamps |
| TDD-003 | CRITICAL | useAgentManager.ts | No unit tests for 219-line hook | Create hook unit tests |
| TDD-004 | CRITICAL | useAgentInstance.ts | No unit tests for 237-line hook | Create hook unit tests |
| TDD-005 | HIGH | agent-api.integration.test.ts:31-46 | Tests don't test actual routes (per own comment) | Create true route tests or rename |
| OBS-001 | HIGH | route.ts:82-90 | No structured logging, uses console.error | Inject ILogger via DI |
| OBS-012 | CRITICAL | All API routes | No request ID for distributed tracing | Generate/propagate x-request-id |
| V1 | HIGH | tasks.md | All 10 tasks missing log anchors in Notes | Run plan-6a to populate |
| V2 | CRITICAL | Phase Footnote Stubs | Section is empty (placeholder table) | Run plan-6a to populate |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: PASS (no regressions)

- Tests: 2565 passed | 41 skipped (baseline maintained)
- Prior phase functionality intact (Phase 1-3 deliverables work correctly)
- No breaking changes to IAgentManagerService, IAgentInstance, IAgentNotifierService
- Storage layer (Phase 3) integrates correctly with API routes

### E.1) Doctrine & Testing Compliance

#### Graph Integrity (Bidirectional Links)

**Status**: ❌ BROKEN (must fix before merge)

| Violation | Severity | Issue | Fix |
|-----------|----------|-------|-----|
| Task↔Log | HIGH | All 10 tasks missing log anchors in Notes column | Run plan-6a-update-progress |
| Log→Task | MEDIUM | Log entries missing **Dossier Task** metadata | Add backlinks to tasks.md |
| Footnotes | CRITICAL | Plan § 12 has placeholders only | Run plan-6a to populate |
| Dossier Stubs | CRITICAL | Phase Footnote Stubs section is empty | Run plan-6a to populate |

**Note**: This is expected before plan-6a runs. The implementation is complete but documentation sync is pending.

#### TDD Compliance

**Status**: ❌ FAIL (CRITICAL violations)

| ID | Severity | Issue | Evidence | Fix |
|----|----------|-------|----------|-----|
| TDD-001 | CRITICAL | Tests written AFTER implementation | Log shows T001-T007 (19:02-19:16), THEN T008 (19:18) | Document test-first for future phases |
| TDD-002 | CRITICAL | No RED-GREEN-REFACTOR cycles in log | Zero references to RED, GREEN, REFACTOR | Add cycle timestamps to execution logs |
| TDD-003 | CRITICAL | No unit tests for useAgentManager (219 lines) | Only integration tests exist | Create test/unit/web/hooks/useAgentManager.test.tsx |
| TDD-004 | CRITICAL | No unit tests for useAgentInstance (237 lines) | Only integration tests exist | Create test/unit/web/hooks/useAgentInstance.test.tsx |
| TDD-005 | HIGH | Integration tests acknowledge they don't test routes | Lines 31-46: "test verifies business logic...not actual routes" | Create true HTTP integration tests |
| TDD-006 | HIGH | Event structure per ADR-0007 not verified | Only checks Array.isArray(events) | Add agentId field assertions |
| TDD-007 | MEDIUM | Weak assertion: expect(true).toBe(true) | Tautology, documents nothing | Replace with meaningful assertion |

#### Mock Usage Compliance

**Status**: ✅ PASS

| Metric | Value |
|--------|-------|
| Policy | Fakes over mocks |
| Mock instances | 1 (unused import) |
| Fakes used | 4+ (FakeAgentManagerService, FakeAgentNotifierService, FakeAgentStorageAdapter, FakeAgentAdapter) |
| Violations | 1 (LOW - unused MockedFunction import) |

**Assessment**: Excellent adherence to constitution Principle 4. All tests use Fakes, not mocks.

### E.2) Semantic Analysis

**Status**: ✅ PASS (implementation matches spec)

All acceptance criteria satisfied:
- AC-08: SSE endpoint streams agent events with agentId ✓
- AC-09: React hooks subscribe to agent events ✓
- AC-24: Hooks enable menu status display ✓
- AC-05: Web can rehydrate conversation history (events returned via getEvents) ✓
- R1-06: localStorage quota mitigated via server-side storage ✓

### E.3) Quality & Safety Analysis

**Safety Score: 65/100** (CRITICAL: 0, HIGH: 6, MEDIUM: 5, LOW: 2)
**Verdict: REQUEST_CHANGES**

#### Correctness Issues

| ID | Severity | File:Lines | Issue | Fix |
|----|----------|------------|-------|-----|
| QS-001 | HIGH | useAgentManager.ts:197-209 | Event listeners not removed on unmount causing memory leak | Store listeners, remove in cleanup |
| QS-002 | HIGH | useAgentInstance.ts:214-231 | Event listeners not removed on unmount causing memory leak | Store listeners, remove in cleanup |
| QS-003 | HIGH | useAgentManager.ts:199 | Unprotected JSON.parse crashes component on malformed data | Wrap in try/catch |
| QS-004 | HIGH | useAgentInstance.ts:216 | Unprotected JSON.parse crashes component on malformed data | Wrap in try/catch |
| QS-005 | MEDIUM | route.ts:22-40 | Race condition in ensureInitialized (multiple concurrent init) | Use Promise guard pattern |
| QS-008 | MEDIUM | route.ts:111 | Unsafe type assertion without full validation | Validate complete shape |

**Patch for QS-001/QS-002 (Memory Leak Fix):**
```typescript
// In connectSSE useCallback
const listeners: Array<{ type: string; handler: (e: MessageEvent) => void }> = [];

for (const eventType of eventTypes) {
  const handler = (event: MessageEvent) => {
    // ... existing logic
  };
  eventSource.addEventListener(eventType, handler);
  listeners.push({ type: eventType, handler });
}

// In cleanup return
return () => {
  for (const { type, handler } of listeners) {
    eventSource.removeEventListener(type, handler);
  }
  eventSource.close();
};
```

**Patch for QS-003/QS-004 (JSON Parse Safety):**
```typescript
eventSource.addEventListener(eventType, (event) => {
  try {
    const data = JSON.parse(event.data) as AgentSSEEvent;
    // ... existing logic
  } catch (e) {
    console.error('Failed to parse SSE event:', e);
    return;
  }
});
```

### E.4) Doctrine Evolution Recommendations

**Status**: Advisory (does not affect verdict)

#### New Rules Candidates

| ID | Rule Statement | Evidence | Priority |
|----|----------------|----------|----------|
| RULE-REC-001 | All React hooks with EventSource must cleanup listeners in useEffect return | QS-001, QS-002 patterns | HIGH |
| RULE-REC-002 | All JSON.parse in event handlers must be wrapped in try/catch | QS-003, QS-004 patterns | HIGH |
| RULE-REC-003 | API routes must inject ILogger, not use console.error | OBS-001, OBS-002 patterns | MEDIUM |

#### New Idioms Candidates

| ID | Pattern | Code Example | Priority |
|----|---------|--------------|----------|
| IDIOM-REC-001 | Promise guard for lazy initialization | `let initPromise: Promise<void> \| null = null;` | MEDIUM |
| IDIOM-REC-002 | Request ID propagation pattern | `const requestId = req.headers.get('x-request-id') \|\| crypto.randomUUID();` | HIGH |

---

## F) Coverage Map

**Testing Approach: Full TDD**

| Acceptance Criteria | Test File | Assertion | Confidence |
|--------------------|-----------|-----------|------------|
| AC-08 (SSE streams events with agentId) | agent-api.integration.test.ts | Line 327-339 | 50% (infra only, no event structure) |
| AC-09 (Hook subscribes to events) | No direct test | N/A | 25% (inferred from implementation) |
| AC-24 (Menu status badges) | No test | N/A | 0% (no test coverage) |
| AC-05 (Rehydrate history) | agent-api.integration.test.ts:201-232 | Checks events array | 75% (behavioral match) |
| AC-07a (Double-run 409) | agent-api.integration.test.ts:273-301 | Checks throw + status | 100% (explicit) |
| AC-04 (404 for unknown) | agent-api.integration.test.ts:234-246 | Checks null return | 100% (explicit) |

**Overall Coverage Confidence: 58%** (MEDIUM - acceptable but improvable)

**Narrative Tests Identified:**
- T010 (real-agent-web-routes.test.ts) is describe.skip - not validating any criteria currently

**Recommendations:**
- Add criterion IDs to test names (e.g., `it('AC-08: should stream events with agentId')`)
- Create hook unit tests with explicit AC mapping
- Enable T010 E2E or create HTTP-level integration tests

---

## G) Commands Executed

```bash
# Quality gates (all passed)
just fft                    # Fix, Format, Test - 2565 passed | 41 skipped

# File verification
ls -la apps/web/app/api/agents/           # All routes present
ls -la apps/web/src/features/019-agent-manager-refactor/  # Both hooks present
ls -la test/integration/agent-api*        # Integration test present

# Git history check
git log --oneline -20       # Verified Phase 4 changes
git diff HEAD~5..HEAD --name-only  # Identified all changed files
```

---

## H) Decision & Next Steps

### For Approval (fixes required)

**Blocking (must fix):**
1. **QS-001/QS-002**: Fix memory leaks in SSE event listener cleanup
2. **QS-003/QS-004**: Add try/catch around JSON.parse in event handlers
3. **TDD-003/TDD-004**: Create unit tests for useAgentManager and useAgentInstance hooks

**Recommended (non-blocking):**
4. QS-005-007: Use Promise guard for ensureInitialized race condition
5. OBS-001/OBS-012: Replace console.error with ILogger, add request ID
6. Run plan-6a to populate bidirectional links and footnotes

### After Fixes

1. Re-run quality gates: `just fft`
2. Re-run this review: `/plan-7-code-review --phase "Phase 4: Web Integration"`
3. Upon APPROVE: Merge and proceed to Phase 5

---

## I) Footnotes Audit

**Status**: ❌ INCOMPLETE (plan-6a not yet run)

| File Changed | Footnote Tag | Plan § 12 Entry |
|--------------|--------------|-----------------|
| apps/web/app/api/agents/route.ts | – | [^1] placeholder |
| apps/web/app/api/agents/[id]/route.ts | – | [^2] placeholder |
| apps/web/app/api/agents/[id]/run/route.ts | – | [^3] placeholder |
| apps/web/app/api/agents/events/route.ts | – | – |
| apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts | – | – |
| apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts | – | – |
| test/integration/agent-api.integration.test.ts | – | – |
| test/integration/real-agent-web-routes.test.ts | – | – |
| apps/web/src/hooks/useAgentSSE.ts | – | – |

**Action Required**: Run `/plan-6a-update-progress` to populate footnotes with FlowSpace node IDs.

---

*Review generated 2026-01-29 by plan-7-code-review*
