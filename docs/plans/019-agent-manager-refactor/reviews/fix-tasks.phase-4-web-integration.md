# Phase 4: Web Integration - Fix Tasks

**Review**: [./review.phase-4-web-integration.md](./review.phase-4-web-integration.md)
**Verdict**: REQUEST_CHANGES
**Date**: 2026-01-29
**Testing Approach**: Full TDD

---

## Blocking Fixes (Must complete before re-review)

### FIX-001: Memory Leak in useAgentManager SSE Event Listeners (QS-001)

**Severity**: HIGH
**File**: `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts`
**Lines**: 197-209

**Issue**: Event listeners added via `addEventListener` are not removed when component unmounts or when EventSource reconnects. This causes:
- Memory exhaustion from accumulated listeners
- Duplicate event handling
- Stale callbacks executing after component unmount

**Fix (TDD approach)**:
1. **RED**: Create test `test/unit/web/hooks/useAgentManager.test.tsx`:
```typescript
it('should remove event listeners on unmount', () => {
  const mockEventSource = { addEventListener: vi.fn(), removeEventListener: vi.fn(), close: vi.fn() };
  const { unmount } = renderHook(() => useAgentManager());
  unmount();
  expect(mockEventSource.removeEventListener).toHaveBeenCalledTimes(8); // 8 event types
});
```

2. **GREEN**: Implement listener tracking in `connectSSE`:
```typescript
// Add after eventSource creation
const listeners: Array<{ type: string; handler: (e: MessageEvent) => void }> = [];

// Modify event type loop
for (const eventType of eventTypes) {
  const handler = (event: MessageEvent) => {
    // ... existing logic
  };
  eventSource.addEventListener(eventType, handler);
  listeners.push({ type: eventType, handler });
}

// Add to cleanup return in useEffect
return () => {
  if (eventSourceRef.current) {
    for (const { type, handler } of listeners) {
      eventSourceRef.current.removeEventListener(type, handler);
    }
    eventSourceRef.current.close();
    eventSourceRef.current = null;
  }
  // ... rest of cleanup
};
```

3. **REFACTOR**: Extract listener management to helper function if pattern is repeated.

---

### FIX-002: Memory Leak in useAgentInstance SSE Event Listeners (QS-002)

**Severity**: HIGH
**File**: `apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts`
**Lines**: 214-231

**Issue**: Same as FIX-001, applied to useAgentInstance hook.

**Fix (TDD approach)**:
1. **RED**: Create test `test/unit/web/hooks/useAgentInstance.test.tsx`:
```typescript
it('should remove event listeners on unmount', () => {
  const { unmount } = renderHook(() => useAgentInstance('test-agent-id'));
  unmount();
  // Verify removeEventListener called for all 8 event types
});
```

2. **GREEN**: Apply same listener tracking pattern as FIX-001.

3. **REFACTOR**: Consider extracting shared SSE connection logic to a custom hook (useSSEConnection).

---

### FIX-003: Unprotected JSON.parse in useAgentManager (QS-003)

**Severity**: HIGH
**File**: `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts`
**Line**: 199

**Issue**: `JSON.parse(event.data)` will throw on malformed data, crashing the component.

**Fix (TDD approach)**:
1. **RED**: Add test case:
```typescript
it('should handle malformed SSE event data gracefully', () => {
  // Simulate EventSource receiving malformed JSON
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  // ... trigger event with invalid JSON
  expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
  consoleSpy.mockRestore();
});
```

2. **GREEN**: Wrap JSON.parse in try/catch:
```typescript
eventSource.addEventListener(eventType, (event) => {
  try {
    const data = JSON.parse(event.data) as AgentSSEEvent;
    
    // Invalidate queries to refetch agent list
    queryClient.invalidateQueries({ queryKey: [AGENTS_QUERY_KEY] });
    
    // Call callback if provided
    if (onAgentEvent) {
      onAgentEvent(eventType, data);
    }
  } catch (e) {
    console.error('[useAgentManager] Failed to parse SSE event:', e);
    // Continue processing other events - don't crash component
  }
});
```

---

### FIX-004: Unprotected JSON.parse in useAgentInstance (QS-004)

**Severity**: HIGH
**File**: `apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts`
**Line**: 216

**Issue**: Same as FIX-003, applied to useAgentInstance hook.

**Fix (TDD approach)**:
1. **RED**: Add test case for malformed SSE handling.
2. **GREEN**: Apply same try/catch pattern as FIX-003.

---

### FIX-005: Create Unit Tests for useAgentManager Hook (TDD-003)

**Severity**: CRITICAL (TDD compliance)
**File**: Create `test/unit/web/hooks/useAgentManager.test.tsx`

**Issue**: 219-line hook has no unit tests. Only integration tests via FakeAgentManagerService exist.

**Test Cases to Implement**:
```typescript
describe('useAgentManager', () => {
  describe('Query Integration', () => {
    it('should fetch agents on mount');
    it('should filter agents by workspace when provided');
    it('should handle fetch errors gracefully');
  });
  
  describe('SSE Connection', () => {
    it('should connect to /api/agents/events on mount');
    it('should set isConnected=true when EventSource opens');
    it('should set isConnected=false on error');
    it('should attempt reconnection up to MAX_RECONNECT_ATTEMPTS');
    it('should stop reconnecting after max attempts');
    it('should remove event listeners on unmount');
  });
  
  describe('Event Handling', () => {
    it('should invalidate queries on agent_status event');
    it('should invalidate queries on agent_created event');
    it('should call onAgentEvent callback when provided');
    it('should handle malformed SSE event data gracefully');
  });
  
  describe('Create Agent', () => {
    it('should call POST /api/agents with params');
    it('should invalidate queries on success');
    it('should throw on API error');
  });
});
```

---

### FIX-006: Create Unit Tests for useAgentInstance Hook (TDD-004)

**Severity**: CRITICAL (TDD compliance)
**File**: Create `test/unit/web/hooks/useAgentInstance.test.tsx`

**Issue**: 237-line hook has no unit tests. DYK-19 (404→null) behavior not explicitly tested.

**Test Cases to Implement**:
```typescript
describe('useAgentInstance', () => {
  describe('Query Integration', () => {
    it('should fetch agent by ID on mount');
    it('should return null when agent not found (DYK-19)');
    it('should return agent with events array');
  });
  
  describe('SSE Connection', () => {
    it('should connect to /api/agents/events');
    it('should filter events by agentId (client-side per ADR-0007)');
    it('should ignore events for other agents');
    it('should remove event listeners on unmount');
  });
  
  describe('Derived Values', () => {
    it('should derive status from agent.status');
    it('should derive intent from agent.intent');
    it('should derive isWorking from status==="working"');
    it('should derive events from agent.events');
  });
  
  describe('Run Mutation', () => {
    it('should call POST /api/agents/{id}/run');
    it('should throw "Agent is already running" on 409');
    it('should throw "Agent not found" on 404');
    it('should invalidate query on success');
  });
});
```

---

## Recommended Fixes (Non-blocking but valuable)

### FIX-007: Race Condition in ensureInitialized (QS-005, QS-006, QS-007)

**Severity**: MEDIUM
**Files**: All API route files (route.ts, [id]/route.ts, run/route.ts)
**Lines**: 22-40 in each

**Issue**: Boolean flag `initialized` doesn't prevent concurrent initialization when multiple requests arrive before first completes.

**Fix**:
```typescript
let initPromise: Promise<void> | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    const container = getContainer();
    const agentManager = container.resolve<IAgentManagerService>(
      SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
    );
    await agentManager.initialize();
    initialized = true;
  })();
  
  await initPromise;
}
```

---

### FIX-008: Replace console.error with ILogger (OBS-001, OBS-002)

**Severity**: HIGH (observability)
**Files**: All API route files
**Lines**: Error handlers

**Issue**: Uses `console.error` instead of structured ILogger, breaking observability in production.

**Fix**:
```typescript
import { SHARED_DI_TOKENS, type ILogger } from '@chainglass/shared';

// In each error handler:
const logger = container.resolve<ILogger>(SHARED_DI_TOKENS.LOGGER);
logger.error('GET /api/agents failed', error, { workspace, agentCount: agents?.length });
```

---

### FIX-009: Add Request ID Tracing (OBS-012)

**Severity**: CRITICAL (observability)
**Files**: All API route files

**Issue**: No request ID for distributed tracing across browser→API→agent logs.

**Fix**:
```typescript
export async function GET(request: NextRequest): Promise<Response> {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  // Include in all logs
  logger.info('GET /api/agents', { requestId, workspace });
  
  // Include in response headers
  return NextResponse.json(response, {
    headers: { 'x-request-id': requestId }
  });
}
```

---

### FIX-010: Run plan-6a for Documentation Sync

**Severity**: HIGH (documentation)
**Files**: tasks.md, plan.md

**Issue**: Bidirectional links and footnotes not populated.

**Fix**:
```bash
/plan-6a-update-progress --phase "Phase 4: Web Integration"
```

This will:
- Add log anchors to Notes column in tasks.md
- Add Dossier Task/Plan Task backlinks to execution.log.md
- Populate Phase Footnote Stubs with FlowSpace node IDs
- Sync plan § 12 Change Footnotes Ledger

---

## Verification Steps After Fixes

1. **Run quality gates**:
```bash
just fft
```

2. **Verify hook tests exist and pass**:
```bash
pnpm vitest test/unit/web/hooks/useAgentManager.test.tsx
pnpm vitest test/unit/web/hooks/useAgentInstance.test.tsx
```

3. **Re-run code review**:
```bash
/plan-7-code-review --phase "Phase 4: Web Integration"
```

4. **Expected outcome**: Verdict changes to APPROVE

---

*Fix tasks generated 2026-01-29 by plan-7-code-review*
