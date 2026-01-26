# Code Review: Subtask 001 - Real Agent Integration

**Review Date**: 2026-01-26
**Subtask**: 001-subtask-real-agent-integration
**Parent Phase**: Phase 2: Core Chat
**Plan**: [../web-agents-plan.md](../web-agents-plan.md)
**Diff Range**: `2b7e706..HEAD` (2 commits)

---

## A) Verdict

**REQUEST_CHANGES**

While the implementation successfully completes all 5 subtask objectives (ST001-ST005) with passing tests and type checks, there are 3 HIGH severity issues and 5 MEDIUM severity issues that should be addressed before merge.

---

## B) Summary

The subtask successfully:
- ✅ Created `/api/agents/run` POST route with SSE streaming
- ✅ Implemented event translation (AgentEvent → SSE broadcast)
- ✅ Updated `/agents` page with real API integration + useAgentSSE hook
- ✅ Implemented session resume via `agentSessionIdRef`
- ✅ Added inline error handling with retry button
- ✅ 9 new tests with 100% Test Doc compliance
- ✅ All 389 unit tests passing, type checking clean, linting clean

However, security and memory safety issues need attention:
- **HIGH**: Error message information leakage to client
- **HIGH**: Missing JSON parse error handling (pre-Zod)
- **MEDIUM**: Memory leak in useAgentSSE (event listeners accumulate)
- **MEDIUM**: URL injection risk with unsanitized channel parameter

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (TDD evidence in execution log)
- [x] Tests as docs (all 11 tests have full Test Doc blocks)
- [x] Fakes only (no mocking - uses FakeAgentAdapter, FakeConfigService, FakeSSECapture)
- [x] Negative/edge cases covered (validation errors, invalid agent types)
- [x] BridgeContext patterns followed (globalThis singleton pattern)
- [ ] **ISSUE**: Error messages leak to client (route.ts line 225)
- [x] Linters/type checks are clean
- [x] Absolute paths used in task table

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| SEC-001 | HIGH | route.ts:205-225 | Error message information leakage | Return generic error message to client |
| COR-001 | HIGH | route.ts:136-145 | Missing JSON parse error handling | Distinguish SyntaxError from ZodError |
| MEM-001 | MEDIUM | useAgentSSE.ts:176-223 | Event listeners accumulate on reconnect | Remove listeners before adding new ones |
| SEC-002 | MEDIUM | useAgentSSE.ts:162 | URL injection risk - unsanitized channel | Validate channel with regex pattern |
| SEC-003 | MEDIUM | route.ts:141-143 | Zod validation error details exposed | Sanitize validation messages |
| OBS-001 | MEDIUM | page.tsx:276-278 | Missing error logging for API failures | Add structured error logging |
| STY-001 | LOW | route.ts:18-20 | Relative imports instead of @ alias | Use `@/lib/` path alias |
| LOG-001 | LOW | route.ts:167 | CWD exposed in logs | Remove or restrict in production |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**N/A** - This is a subtask, not a phase. No previous phases to regress against.

### E.1) Doctrine & Testing Compliance

**Graph Integrity**: Subtask does not have separate footnote stubs in plan ledger (as expected for subtask scope).

**TDD Compliance** ✅:
- Test files created with full Test Doc blocks (Why/Contract/Usage Notes/Quality Contribution/Worked Example)
- 11 tests cover validation, SSE broadcasting, response format, and session resumption
- Zero mocking framework usage - uses only fakes (FakeAgentAdapter, FakeConfigService, FakeSSECapture)

**Coverage Gaps** (LOW severity):
- Error handling during agent execution not tested (timeout, adapter failure)
- Network resilience/reconnect behavior not tested in useAgentSSE
- Bootstrap singleton circular dependency scenarios not covered

### E.2) Semantic Analysis

**Domain Logic** ✅: Implementation correctly wires UI to real agent adapters via AgentService.

**Data Flow** ✅: 
1. User sends message → POST /api/agents/run
2. Route broadcasts `agent_session_status: running`
3. AgentService.run() with onEvent callback
4. Events broadcast via SSEManager to channel
5. useAgentSSE hook receives events and calls callbacks
6. Page updates session state via updateSession()

**Specification Alignment**: All 5 subtask objectives (ST001-ST005) implemented as specified in dossier.

### E.3) Quality & Safety Analysis

#### SEC-001: Error Message Information Leakage (HIGH)

**File**: `apps/web/app/api/agents/run/route.ts:205-225`

**Issue**: Raw `error.message` returned to client:
```typescript
const errorMessage = error instanceof Error ? error.message : 'Unknown error';
// ...
return Response.json({ error: errorMessage }, { status: 500 });
```

**Impact**: May expose sensitive stack traces, internal paths, or system details to clients.

**Fix**:
```typescript
// Log detailed error server-side
console.error('[/api/agents/run] Agent execution failed:', error);

// Return generic message to client
return Response.json({ error: 'Agent execution failed' }, { status: 500 });
```

#### COR-001: Missing JSON Parse Error Handling (HIGH)

**File**: `apps/web/app/api/agents/run/route.ts:136-145`

**Issue**: `request.json()` can throw `SyntaxError` before Zod validation. Current catch assumes all errors are Zod errors:
```typescript
const rawBody = await request.json(); // Can throw SyntaxError!
body = AgentRunRequestSchema.parse(rawBody);
```

**Impact**: SyntaxError (malformed JSON) caught but error type check may fail.

**Fix**:
```typescript
try {
  const rawBody = await request.json();
  body = AgentRunRequestSchema.parse(rawBody);
} catch (error) {
  // Handle JSON parse errors
  if (error instanceof SyntaxError) {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
  // Handle Zod validation errors
  if (error instanceof Error && error.name === 'ZodError' && 'errors' in error) {
    const message = (error as z.ZodError).errors.map((e) => e.message).join(', ');
    return Response.json({ error: message }, { status: 400 });
  }
  return Response.json({ error: 'Invalid request' }, { status: 400 });
}
```

#### MEM-001: Event Listener Memory Leak (MEDIUM)

**File**: `apps/web/src/hooks/useAgentSSE.ts:176-223`

**Issue**: Event listeners added on every `connect()` call without cleanup:
```typescript
eventSource.addEventListener('agent_text_delta', (event) => {...});
eventSource.addEventListener('agent_session_status', (event) => {...});
// Never removed before reconnection!
```

**Impact**: On reconnection, listeners accumulate. After 3 reconnects, each event fires 4 callbacks.

**Fix**:
```typescript
// Store handler references
const handleTextDelta = (event: MessageEvent) => {...};
const handleStatus = (event: MessageEvent) => {...};

eventSource.addEventListener('agent_text_delta', handleTextDelta);
// ...

// In disconnect or before reconnect:
eventSource.removeEventListener('agent_text_delta', handleTextDelta);
```

#### SEC-002: URL Injection Risk (MEDIUM)

**File**: `apps/web/src/hooks/useAgentSSE.ts:162`

**Issue**: Channel parameter inserted directly into URL without validation:
```typescript
const url = `/api/events/${channel}`;
```

**Impact**: User-controlled input could inject query params or path traversal.

**Fix**:
```typescript
// Validate channel format
const CHANNEL_PATTERN = /^[a-zA-Z0-9-_]+$/;
if (!CHANNEL_PATTERN.test(channel)) {
  console.error('[useAgentSSE] Invalid channel name:', channel);
  setError(new Error('Invalid channel name'));
  return;
}
const url = `/api/events/${encodeURIComponent(channel)}`;
```

### E.4) Doctrine Evolution Recommendations

**New Idiom Candidate**: Error Response Pattern
- Pattern: Always return generic error messages to clients; log detailed errors server-side
- Evidence: SEC-001 finding shows this pattern needed
- Priority: HIGH

**New Rule Candidate**: SSE Channel Validation
- Rule: SSE channel names MUST be validated with alphanumeric pattern before use in URLs
- Evidence: SEC-002 finding
- Priority: MEDIUM

---

## F) Coverage Map

| Acceptance Criterion | Test(s) | Confidence |
|---------------------|---------|------------|
| Route returns 200, invokes AgentService | run.test.ts (3 tests) | 100% |
| Events broadcast correctly to channel | run.test.ts (2 tests) | 100% |
| Stub removed, real events flow | page.test.tsx (5 tests) | 75% (SSE mock, not integration) |
| Can resume existing agent session | run.test.ts (1 test) | 100% |
| Errors display in UI, recoverable | Not directly tested | 50% (manual verification only) |

**Overall Confidence**: 75%

---

## G) Commands Executed

```bash
# Tests (all pass)
pnpm test test/unit/web/api/agents/run.test.ts  # 9 tests pass
pnpm test test/unit/web/                         # 389 tests pass, 1 skipped

# Type checking (clean)
pnpm typecheck

# Linting (clean)
pnpm lint apps/web/app/api/agents apps/web/src/hooks/useAgentSSE.ts apps/web/src/lib/bootstrap-singleton.ts
```

---

## H) Decision & Next Steps

**Verdict**: REQUEST_CHANGES

**Before merge**, address these issues:

1. **SEC-001 (HIGH)**: Replace raw error messages with generic client messages
2. **COR-001 (HIGH)**: Add explicit SyntaxError handling in JSON parse
3. **MEM-001 (MEDIUM)**: Fix event listener cleanup in useAgentSSE reconnection logic

**Optional improvements** (not blocking):
- SEC-002: Add channel validation (MEDIUM)
- OBS-001: Add structured error logging (MEDIUM)
- STY-001: Use @ path aliases (LOW)

**After fixes**: Re-run `/plan-7-code-review` to verify, then merge.

---

## I) Footnotes Audit

| Diff Path | Task | Footnote | Status |
|-----------|------|----------|--------|
| apps/web/app/api/agents/run/route.ts | ST001 | N/A (subtask) | New file |
| apps/web/src/hooks/useAgentSSE.ts | ST003 | N/A (subtask) | New file |
| apps/web/src/lib/bootstrap-singleton.ts | ST001 | N/A (subtask) | New file |
| apps/web/app/(dashboard)/agents/page.tsx | ST003,ST004,ST005 | N/A (subtask) | Modified |
| packages/shared/src/services/agent.service.ts | DYK-02 | N/A (subtask) | Modified |
| test/unit/web/api/agents/run.test.ts | ST001 | N/A (subtask) | New file |

**Note**: Subtasks do not require footnote entries in the plan ledger. Footnotes will be added when the parent phase is marked complete with these subtask changes incorporated.

---

**Review Completed**: 2026-01-26
**Reviewer**: AI Code Review Agent
