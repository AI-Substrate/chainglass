# Phase 5: SSE Infrastructure - Code Review Report

**Phase**: Phase 5: SSE Infrastructure  
**Plan**: /docs/plans/005-web-slick/web-slick-plan.md  
**Dossier**: /docs/plans/005-web-slick/tasks/phase-5-sse-infrastructure/tasks.md  
**Date**: 2026-01-23  
**Reviewer**: Code Review Agent (plan-7-code-review)

---

## A) Verdict

**REQUEST_CHANGES**

**Reason**: 1 CRITICAL and 1 HIGH severity issue found in correctness and security review. Additionally, Phase 5 footnotes are missing from the Change Footnotes Ledger (graph integrity issue).

---

## B) Summary

Phase 5 implements SSE (Server-Sent Events) infrastructure for real-time updates. The implementation follows TDD discipline with comprehensive test documentation and proper fake-based testing. However, correctness review identified a **critical memory leak** where failed heartbeats don't remove connections from SSEManager, and security review found **HIGH severity event type injection risk**.

**Key Positives**:
- ✅ Full TDD compliance (RED→GREEN cycles documented)
- ✅ All 11 tests pass (8 unit + 3 integration)
- ✅ Complete 5-field Test Doc blocks on all tests
- ✅ FakeController implementation follows fakes-over-mocks policy
- ✅ Proper globalThis singleton pattern (DYK-01)
- ✅ force-dynamic export (DYK-04)

**Issues Requiring Changes**:
- ❌ Memory leak: heartbeat errors don't clean up connections (CRITICAL)
- ❌ Event type injection vulnerability (HIGH)
- ❌ Phase 5 footnotes missing from Change Footnotes Ledger (HIGH)
- ⚠️ Iterator invalidation risk during broadcast (MEDIUM)
- ⚠️ Unbounded connections per channel (MEDIUM)

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence)
- [x] Tests as docs (assertions show behavior)
- [x] Mock usage matches spec: Targeted (fakes preferred)
- [x] Negative/edge cases covered (empty channel, connection cleanup)
- [x] BridgeContext patterns followed (N/A - server-side)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [ ] **Graph integrity intact (footnotes synchronized)** - FAILED: Phase 5 missing from ledger

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| F002 | CRITICAL | route.ts:38-45 | Memory leak: heartbeat error handler doesn't remove connection from SSEManager | Add `sseManager.removeConnection()` in catch block |
| SSE-002 | HIGH | sse-manager.ts:67 | Event type injection - eventType not sanitized before SSE format | Validate eventType against `/^[a-zA-Z0-9_]+$/` |
| GRAPH-001 | HIGH | web-slick-plan.md | Phase 5 missing from Change Footnotes Ledger | Run `plan-6a-update-progress` to sync footnotes |
| F003 | MEDIUM | sse-manager.ts:71-78 | Iterator invalidation: modifying Set during broadcast iteration | Copy to array before iteration |
| F004 | MEDIUM | sse-manager.ts:113-119 | Same iterator issue in sendHeartbeat | Copy to array before iteration |
| SSE-003 | MEDIUM | route.ts:28-62 | Unbounded connections - no per-channel limits | Add connection limits (recommended: 1000/channel) |
| SSE-001 | MEDIUM | route.ts:25 | Channel parameter not validated | Validate against `/^[a-zA-Z0-9_-]+$/` |
| F005 | MEDIUM | route.ts:47-56 | AbortSignal may already be aborted before listener registered | Check `request.signal.aborted` before setup |
| F001 | LOW | route.ts:48-56 | Race condition: concurrent abort and heartbeat error cleanup | Consider cleanup flag to prevent double-removal |
| SSE-004 | LOW | route.ts:52-54 | Silent error handling masks cleanup failures | Log errors for observability |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Status**: Skipped (no previous phase tests rerun)

Phase 5 introduces new functionality (SSE) with no direct dependencies on prior phase code. Cross-phase regression testing not applicable for this isolated feature addition.

### E.1) Doctrine & Testing Compliance

#### Graph Integrity Violations

| Violation | Severity | Issue | Fix |
|-----------|----------|-------|-----|
| GRAPH-001 | HIGH | Phase 5 has ZERO entries in Change Footnotes Ledger | Add footnotes for all 6 changed files |

The Change Footnotes Ledger in `web-slick-plan.md` ends at Phase 2 (footnotes [^1]-[^9]). Phase 5 created 6 new files that require footnote documentation:
- `apps/web/src/lib/schemas/sse-events.schema.ts`
- `apps/web/src/lib/sse-manager.ts`
- `apps/web/app/api/events/[channel]/route.ts`
- `test/fakes/fake-controller.ts`
- `test/unit/web/services/sse-manager.test.ts`
- `test/integration/web/api/sse-route.test.ts`

**Fix**: Run `plan-6a-update-progress` or manually add Phase 5 section with footnotes.

#### TDD Compliance ✅ PASS

| Check | Status | Evidence |
|-------|--------|----------|
| Tests precede code | ✅ | RED phase documented for T002 (SSEManager) and T004 (route) |
| Test Doc blocks complete | ✅ | All 11 tests have 5-field blocks |
| RED-GREEN cycles | ✅ | T002→T003, T004→T005 cycles in execution log |

#### Mock Usage Compliance ✅ PASS

| Check | Status | Evidence |
|-------|--------|----------|
| Fakes over mocks | ✅ | FakeController used; zero vi.mock() calls |
| Timer mocks allowed | ✅ | vi.useFakeTimers() for heartbeat (permitted) |
| Complete fake impl | ✅ | FakeController has enqueue/close/error + helpers |

### E.2) Semantic Analysis

The implementation correctly follows SSE protocol:
- Event format: `event: {type}\ndata: {json}\n\n` ✅
- Heartbeat comment: `: heartbeat\n\n` ✅
- ReadableStream with TextEncoder ✅
- Proper response headers (text/event-stream, no-cache, keep-alive) ✅

**No semantic violations** - implementation matches spec requirements for SSE protocol.

### E.3) Quality & Safety Analysis

**Safety Score: 50/100** (CRITICAL: 1, HIGH: 1, MEDIUM: 5, LOW: 2)
**Verdict: REQUEST_CHANGES**

#### CRITICAL: Memory Leak (F002)

**File**: `apps/web/app/api/events/[channel]/route.ts:38-45`
**Issue**: Heartbeat interval catch block clears interval but does NOT remove connection from SSEManager.

```typescript
// Current code (BUGGY)
const heartbeatInterval = setInterval(() => {
  try {
    controller.enqueue(encoder.encode(': heartbeat\n\n'));
  } catch {
    clearInterval(heartbeatInterval);  // ❌ Missing removeConnection!
  }
}, HEARTBEAT_INTERVAL);
```

**Impact**: Dead controllers accumulate in SSEManager.connections Map, consuming memory and causing broadcasts to fail silently.

**Fix**:
```diff
  } catch {
    clearInterval(heartbeatInterval);
+   sseManager.removeConnection(channel, controller);
  }
```

#### HIGH: Event Type Injection (SSE-002)

**File**: `apps/web/src/lib/sse-manager.ts:67`
**Issue**: `eventType` parameter used directly in SSE format without validation.

```typescript
const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
```

**Impact**: Malicious event types with newlines could inject false SSE events:
- Input: `"fake\n\ndata: malicious"`
- Output: Creates spurious SSE message interpreted by client

**Fix**:
```typescript
// Add validation before formatting
if (!/^[a-zA-Z0-9_]+$/.test(eventType)) {
  throw new Error(`Invalid SSE event type: ${eventType}`);
}
```

#### MEDIUM: Iterator Invalidation (F003, F004)

**Files**: `sse-manager.ts:71-78`, `sse-manager.ts:113-119`
**Issue**: Removing items from Set while iterating can cause skipped elements.

**Fix**:
```typescript
// Create copy before iteration
const controllers = Array.from(channelConnections);
for (const controller of controllers) {
  // ...
}
```

### E.4) Doctrine Evolution Recommendations

_This section is advisory and does not affect the verdict._

#### New Rule Candidate

**Rule Statement**: "All SSE event types MUST be validated against alphanumeric pattern before formatting."
**Evidence**: SSE-002 vulnerability shows need for defensive coding at SSE boundaries.
**Priority**: HIGH (security implication)
**Enforcement**: Can be linted via custom rule checking string interpolation patterns.

#### Architecture Note

Phase 5 establishes SSE singleton pattern (`globalThis.sseManager`). Future phases should:
- Use this singleton for all real-time broadcasting
- Not create additional SSE managers
- Consider connection limits before production deployment

---

## F) Coverage Map

| Acceptance Criterion | Test File | Test Name | Confidence |
|---------------------|-----------|-----------|------------|
| SSE route handler returns ReadableStream | sse-route.test.ts | should return 200 with text/event-stream content-type | 95% |
| SSEManager manages connection map | sse-manager.test.ts | should add connection to channel | 100% |
| SSEManager broadcast logic | sse-manager.test.ts | should broadcast to all connections | 100% |
| Zod schemas for event types | (schema defined, no dedicated tests) | N/A | 60% |
| Heartbeat every 30 seconds | sse-route.test.ts | should return valid SSE format in first chunk | 45% |
| AbortSignal cleanup | sse-route.test.ts | should cleanup connection on AbortSignal | 100% |
| Multiple concurrent clients | sse-manager.test.ts | should broadcast to all connections | 100% |
| Channel isolation | sse-manager.test.ts | should not broadcast to other channels | 100% |

**Overall Coverage Confidence**: 85%

**Gaps Identified**:
- Zod schema validation not tested (schemas exist but no validation tests)
- Heartbeat timing precision deferred (DYK-03)

---

## G) Commands Executed

```bash
# Quality gates
pnpm typecheck  # Exit 0
pnpm vitest run # 294 tests pass, 3 files fail (@/ alias issues - pre-existing)

# File inspection
view apps/web/src/lib/schemas/sse-events.schema.ts
view apps/web/src/lib/sse-manager.ts
view apps/web/app/api/events/[channel]/route.ts
view test/fakes/fake-controller.ts
view test/unit/web/services/sse-manager.test.ts
view test/integration/web/api/sse-route.test.ts
```

---

## H) Decision & Next Steps

### Required Before Merge

1. **Fix CRITICAL memory leak (F002)** - Add `sseManager.removeConnection()` in heartbeat catch block
2. **Fix HIGH injection risk (SSE-002)** - Validate eventType before use
3. **Add Phase 5 footnotes (GRAPH-001)** - Update Change Footnotes Ledger

### Recommended (MEDIUM priority)

4. Fix iterator invalidation (F003, F004) - Copy array before iteration
5. Add AbortSignal.aborted check (F005) - Handle already-aborted signals
6. Validate channel parameter (SSE-001) - Prevent path traversal

### Optional Improvements

7. Add connection limits (SSE-003) - Prevent resource exhaustion
8. Log errors instead of silent catch (SSE-004) - Improve observability

### Approval Path

After fixing items 1-3, re-run `/plan-7-code-review` to verify fixes. Once CRITICAL/HIGH issues resolved and footnotes added, phase can be approved for merge.

---

## I) Footnotes Audit

**Status**: ❌ INCOMPLETE

| Diff-Touched File | Footnote Tag | Plan Ledger Entry |
|-------------------|--------------|-------------------|
| apps/web/src/lib/schemas/sse-events.schema.ts | MISSING | MISSING |
| apps/web/src/lib/sse-manager.ts | MISSING | MISSING |
| apps/web/app/api/events/[channel]/route.ts | MISSING | MISSING |
| test/fakes/fake-controller.ts | MISSING | MISSING |
| test/unit/web/services/sse-manager.test.ts | MISSING | MISSING |
| test/integration/web/api/sse-route.test.ts | MISSING | MISSING |

**Action Required**: Add Phase 5 section to Change Footnotes Ledger with:
- [^10]: T001 - SSE event schemas
- [^11]: T002 - FakeController test fake  
- [^12]: T002 - SSEManager unit tests
- [^13]: T003 - SSEManager implementation
- [^14]: T004 - SSE route integration tests
- [^15]: T005/T006 - SSE route handler with cleanup

---

*Review completed: 2026-01-23*
