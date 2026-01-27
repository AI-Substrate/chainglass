# Phase 3: SSE Notification-Fetch Integration - Code Review Report

**Plan**: [../../better-agents-plan.md](../../better-agents-plan.md)
**Phase Dossier**: [../tasks/phase-3-sse-broadcast-integration/tasks.md](../tasks/phase-3-sse-broadcast-integration/tasks.md)
**Execution Log**: [../tasks/phase-3-sse-broadcast-integration/execution.log.md](../tasks/phase-3-sse-broadcast-integration/execution.log.md)
**Reviewed By**: plan-7-code-review
**Date**: 2026-01-27
**Diff Range**: `3f7a854..4b1862c`

---

## A) Verdict

# ⚠️ REQUEST_CHANGES

**Reason**: 3 HIGH severity findings require fixes before merge.

---

## B) Summary

Phase 3 successfully implements the notification-fetch architecture pattern for real-time agent events. The core implementation is solid:
- Server-side storage integration with DYK-06 error handling ✅
- SessionMetadataSchema and SessionMetadataService ✅
- React Query configuration with correct staleTime settings ✅
- contentType schema extension with backward compatibility ✅

**Issues requiring fixes**:
1. **HIGH**: Dual SSE connections in `useServerSession.ts` - unused `useAgentSSE` plus custom EventSource
2. **HIGH**: Unvalidated sessionId in route.ts before storage operations (security)
3. **HIGH**: EventSource lacks error handler (memory leak risk)
4. **MEDIUM**: Linting failures (3 files need formatting fixes)
5. **MEDIUM**: Task table path mismatch (useAgentSession vs useServerSession decision not synced)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (TDD RED tests documented in execution log)
- [x] Tests as docs (Test Doc blocks with 5 required fields present)
- [x] Mock usage matches spec: Targeted mocks (FakeEventStorage, FakeAgentAdapter)
- [ ] Negative/edge cases covered (TDD RED tests skipped, awaiting GREEN phase)

**Universal**:
- [x] BridgeContext patterns followed (N/A - no VS Code extension code)
- [ ] Only in-scope files changed (useServerSession NEW hook vs modifying useAgentSession)
- [ ] Linters/type checks are clean (lint failures in 3 files)
- [x] Absolute paths used (no hidden context assumptions)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | HIGH | apps/web/app/api/agents/run/route.ts:159 | Unvalidated sessionId before storage | Add validateSessionId() after body parse |
| COR-001 | HIGH | apps/web/src/hooks/useServerSession.ts:151-163 | Dual SSE connections - useAgentSSE unused | Remove useAgentSSE or consolidate |
| COR-002 | HIGH | apps/web/src/hooks/useServerSession.ts:169-191 | EventSource lacks error handler | Add .addEventListener('error', handler) |
| LNT-001 | MEDIUM | apps/web/app/layout.tsx:8-9 | Import order incorrect | Run `just format` |
| LNT-002 | MEDIUM | apps/web/src/hooks/useServerSession.ts:16-19 | Import order + trailing commas | Run `just format` |
| LNT-003 | MEDIUM | packages/shared/src/services/session-metadata.service.ts | Import order + trailing comma | Run `just format` |
| DOC-001 | MEDIUM | tasks.md:T006-T009 | Path mismatch: useAgentSession vs useServerSession | Update task table to reflect actual files |
| FN-001 | LOW | plan.md:§12 | Footnotes ledger not populated | Run plan-6a-update-progress to sync |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: PASS (no regressions detected)

**Tests rerun**: Full test suite executed
```
Test Files  140 passed | 2 skipped (142)
Tests  2056 passed | 34 skipped (2090)
Duration  50.76s
```

**Prior phase integrity**: Phase 1 EventStorageService and Phase 2 adapters unmodified.

---

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations

| ID | Link Type | Issue | Fix |
|----|-----------|-------|-----|
| V1 | Task→File | T006-T009 paths in tasks.md reference useAgentSession but useServerSession created | Update tasks.md Absolute Path column to reflect actual implementation |

**Mitigation**: The execution log documents this decision (line 572): "Created useServerSession as NEW hook... localStorage vs server patterns are fundamentally different." This is a valid architectural decision but tasks.md should be updated for traceability.

#### Authority Conflicts

**Plan § 12 (Footnotes Ledger)**: Not populated during implementation. Per plan-6a protocol, footnotes should track file changes. This is LOW severity as the execution log documents changes adequately.

#### TDD Compliance (Full TDD approach)

**Test Doc Blocks**: 26/26 tests have complete 5-field documentation ✅
**Mock Policy**: Targeted mocks only (FakeEventStorage, FakeAgentAdapter) ✅
**RED-GREEN-REFACTOR**: RED tests documented in execution log, implementation completed ✅

**Coverage Gap**: T010 (contentType schema) and T011 (SessionMetadataSchema) lack dedicated test files. However, both schemas are validated implicitly through usage in service tests.

---

### E.2) Semantic Analysis

**Notification-Fetch Pattern**: Correctly implemented per ADR-0007.

```typescript
// route.ts:191-215 - CORRECT PATTERN
if (storableTypes.includes(event.type)) {
  eventStorage.append(sessionId, event)
    .then((stored) => {
      sseManager.broadcast(channel, 'session_updated', { sessionId }); // ← Tiny payload
    })
    .catch((err) => {
      console.warn(`Failed to store: ${err.message}`); // ← DYK-06 compliant
      sseManager.broadcast(channel, 'session_updated', { sessionId }); // ← Continue anyway
    });
}
```

**Schema Extension**: DYK-08 compliant with `.optional().default('text')` for backward compatibility.

---

### E.3) Quality & Safety Analysis

**Safety Score: 40/100** (CRITICAL: 0, HIGH: 3, MEDIUM: 4, LOW: 1)

#### HIGH: SEC-001 - Unvalidated sessionId (Security)

**File**: `apps/web/app/api/agents/run/route.ts:159`
**Issue**: sessionId from request body is validated as string but not checked for path traversal patterns before passing to `eventStorage.append()`.
**Impact**: Attacker could craft sessionId with `../../` to write files outside intended directory.
**Fix**:
```typescript
// After line 159
import { validateSessionId } from '@chainglass/shared/lib/validators/session-id-validator';

const { prompt, agentType, sessionId, channel, agentSessionId } = body;
validateSessionId(sessionId); // Add this line
```

#### HIGH: COR-001 - Dual SSE Connections (Correctness)

**File**: `apps/web/src/hooks/useServerSession.ts:151-163`
**Issue**: Hook calls `useAgentSSE()` but never uses its callbacks. A separate custom EventSource is created at line 174. This results in:
1. Two concurrent SSE connections
2. `isConnected` status from wrong connection
3. Resource waste

**Fix**: Remove useAgentSSE or extend it to support `session_updated` callback:
```typescript
// Option A: Remove useAgentSSE entirely
// Delete lines 149-163
// Track custom EventSource connection status manually

// Option B: Extend useAgentSSE (requires hook modification)
const { isConnected } = useAgentSSE(sseChannel, {
  onSessionUpdated: handleSessionUpdated, // Add this callback type
});
// Remove custom EventSource useEffect
```

#### HIGH: COR-002 - EventSource Memory Leak (Reliability)

**File**: `apps/web/src/hooks/useServerSession.ts:174`
**Issue**: EventSource created without error handler. If connection fails, no cleanup occurs.
**Impact**: Memory leak, potential resource exhaustion on reconnection attempts.
**Fix**:
```typescript
const eventSource = new EventSource(`/api/sse?channel=${channel}`);

// Add error handler
eventSource.addEventListener('error', () => {
  console.warn(`[useServerSession] SSE connection error for ${sessionId}`);
  eventSource.close();
});
```

---

### E.4) Doctrine Evolution Recommendations

**(Advisory - does not affect verdict)**

| Category | Recommendation | Evidence | Priority |
|----------|---------------|----------|----------|
| **New Rule** | "All sessionId parameters MUST be validated via validateSessionId() before file operations" | SEC-001 finding | HIGH |
| **New Idiom** | "EventSource connections should always have error handlers with cleanup" | COR-002 finding | MEDIUM |
| **ADR Update** | ADR-0007 could document notification-fetch as preferred pattern for storable events | Phase 3 implementation | LOW |

---

## F) Coverage Map

**Testing Approach**: Full TDD (RED-GREEN-REFACTOR)

| Acceptance Criteria | Test | Confidence | Notes |
|---------------------|------|------------|-------|
| AC8: Tool status real-time | TDD RED in run.test.ts:402-456 | 75% | Tests defined, awaiting GREEN |
| AC17: Events persisted NDJSON | route.ts:191-215 + TDD RED | 75% | Implementation done, tests skipped |
| AC18: Page refresh reloads | useServerSession fetchSession() | 100% | Query fetches on mount |
| AC19: GET /events?since | Phase 1 endpoint exists | 100% | Not modified in Phase 3 |

**Overall Coverage Confidence**: 75%

**Narrative Tests**: 1 smoke test in useServerSession.test.ts (line 133: "should export useServerSession hook")

---

## G) Commands Executed

```bash
# Test suite
just test
# Result: 140 passed | 2 skipped (142 files), 2056 passed | 34 skipped tests

# Type check
just typecheck
# Result: Exit code 0

# Linter
just lint
# Result: Exit code 1 - 6 errors in 3 files (import order, trailing commas)

# Diff
git diff 3f7a854..4b1862c --stat
# Result: 17 files changed, +2765 -45 insertions/deletions
```

---

## H) Decision & Next Steps

### Approval Requirements

To achieve **APPROVE** status, fix these issues:

1. **SEC-001**: Add `validateSessionId(sessionId)` call in route.ts POST handler
2. **COR-001**: Remove unused `useAgentSSE` hook OR consolidate to single SSE connection
3. **COR-002**: Add EventSource error handler with cleanup
4. **LNT-001-003**: Run `just format` to fix linting issues

### Recommended Fix Order

1. Run `just format` (2 min) - fixes LNT-001/002/003
2. Add validateSessionId in route.ts (5 min) - fixes SEC-001
3. Refactor useServerSession SSE handling (15 min) - fixes COR-001, COR-002
4. Update tasks.md paths to reflect useServerSession (5 min) - fixes DOC-001
5. Run `just fft` to verify (2 min)

### Next Phase Readiness

After fixes are applied and this review passes:
- Proceed to `/plan-5-phase-tasks-and-brief` for Phase 4 (UI Components)
- Ensure Phase 3 hooks are stable before building UI on top of them

---

## I) Footnotes Audit

**Status**: Plan § 12 footnotes ledger not populated during Phase 3 implementation.

**Diff-Touched Paths vs Execution Log**:

| Path | Task(s) | Footnote | Status |
|------|---------|----------|--------|
| apps/web/app/api/agents/run/route.ts | T002, T004 | [^N/A] | Logged in execution.log |
| apps/web/src/hooks/useServerSession.ts | T008, T009 | [^N/A] | Logged in execution.log |
| apps/web/src/components/providers.tsx | T009 | [^N/A] | Logged in execution.log |
| apps/web/src/lib/schemas/agent-session.schema.ts | T010 | [^N/A] | Logged in execution.log |
| packages/shared/src/schemas/session-metadata.schema.ts | T011 | [^N/A] | Logged in execution.log |
| packages/shared/src/services/session-metadata.service.ts | T005 | [^N/A] | Logged in execution.log |
| test/unit/web/api/agents/run.test.ts | T001, T003 | [^N/A] | Logged in execution.log |
| test/unit/web/hooks/useServerSession.test.ts | T006, T007 | [^N/A] | Logged in execution.log |

**Recommendation**: Run `plan-6a-update-progress` to populate footnotes ledger before Phase 4.

---

**Review Status**: REQUEST_CHANGES
**Next Action**: Implementer should address HIGH findings, then request re-review.
