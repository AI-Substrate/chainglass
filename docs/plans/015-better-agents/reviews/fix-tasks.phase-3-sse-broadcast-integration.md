# Phase 3: Fix Tasks

**Review**: [review.phase-3-sse-broadcast-integration.md](./review.phase-3-sse-broadcast-integration.md)
**Date**: 2026-01-27
**Verdict**: REQUEST_CHANGES

---

## Fix Tasks (Priority Order)

### FIX-001: Run Formatter (LNT-001/002/003)
**Severity**: MEDIUM
**Effort**: 2 min
**Command**:
```bash
just format
```

**Expected Result**: 3 files auto-formatted:
- `apps/web/app/layout.tsx` - import order
- `apps/web/src/hooks/useServerSession.ts` - import order + trailing commas
- `packages/shared/src/services/session-metadata.service.ts` - import order + trailing comma

---

### FIX-002: Add sessionId Validation (SEC-001)
**Severity**: HIGH
**Effort**: 5 min
**File**: `apps/web/app/api/agents/run/route.ts`

**Current** (line 159):
```typescript
const { prompt, agentType, sessionId, channel, agentSessionId } = body;
```

**Required Change**:
```typescript
import { validateSessionId } from '@chainglass/shared';

// ... existing code ...

const { prompt, agentType, sessionId, channel, agentSessionId } = body;

// ADD: Validate sessionId to prevent path traversal
validateSessionId(sessionId);
```

**Test**:
```bash
pnpm test test/unit/web/api/agents/run.test.ts
```

---

### FIX-003: Remove Duplicate SSE Connection (COR-001)
**Severity**: HIGH
**Effort**: 10 min
**File**: `apps/web/src/hooks/useServerSession.ts`

**Issue**: Two SSE connections exist:
1. `useAgentSSE()` at lines 151-163 (unused)
2. Custom `EventSource` at lines 168-193 (actually used)

**Option A - Remove useAgentSSE** (Recommended):
```diff
- // SSE subscription for `session_updated` notifications
- // The channel is 'agents' (global), we filter by sessionId in the callback
- const sseChannel = subscribeToUpdates ? 'agents' : null;
-
- const { isConnected, error: sseError } = useAgentSSE(
-   sseChannel,
-   {
-     // We need to listen for session_updated events
-     // But useAgentSSE doesn't have this callback yet...
-     // We'll need to extend it or use a different approach
-   },
-   {
-     autoConnect: subscribeToUpdates,
-   },
- );
-
- // TODO: Extend useAgentSSE to support onSessionUpdated callback
- // For now, we'll use a custom SSE listener

+ // Track SSE connection status
+ const [isConnected, setIsConnected] = useState(false);
```

Then update the custom EventSource effect to set connection status:
```typescript
useEffect(() => {
  if (!subscribeToUpdates || !sessionId) return;

  const channel = `agent-${sessionId}`;
  const eventSource = new EventSource(`/api/sse?channel=${channel}`);

  eventSource.addEventListener('open', () => setIsConnected(true));
  eventSource.addEventListener('error', () => {
    setIsConnected(false);
    eventSource.close();
  });

  // ... rest of handler code ...

  return () => {
    eventSource.close();
    setIsConnected(false);
  };
}, [subscribeToUpdates, sessionId, handleSessionUpdated]);
```

**Required Import**:
```typescript
import { useCallback, useEffect, useRef, useState } from 'react';
```

---

### FIX-004: Add EventSource Error Handler (COR-002)
**Severity**: HIGH
**Effort**: 5 min
**File**: `apps/web/src/hooks/useServerSession.ts`

**Current** (lines 174-192):
```typescript
const eventSource = new EventSource(`/api/sse?channel=${channel}`);

const handleMessage = (event: MessageEvent) => {
  // ...
};

eventSource.addEventListener('session_updated', handleMessage);
eventSource.addEventListener('message', handleMessage);

return () => {
  eventSource.close();
};
```

**Add error handler**:
```typescript
const eventSource = new EventSource(`/api/sse?channel=${channel}`);

// ADD: Error handler to prevent memory leaks
eventSource.addEventListener('error', () => {
  console.warn(`[useServerSession] SSE connection error for session ${sessionId}`);
  eventSource.close();
});

const handleMessage = (event: MessageEvent) => {
  // ... existing code ...
};

eventSource.addEventListener('session_updated', handleMessage);
eventSource.addEventListener('message', handleMessage);

return () => {
  eventSource.close();
};
```

---

### FIX-005: Update Task Table Paths (DOC-001)
**Severity**: MEDIUM
**Effort**: 5 min
**File**: `docs/plans/015-better-agents/tasks/phase-3-sse-broadcast-integration/tasks.md`

**Update Absolute Path(s) column for T006-T009**:

| Task | Current Path | Correct Path |
|------|--------------|--------------|
| T006 | `/test/unit/web/hooks/useAgentSession.test.ts` | `/home/jak/substrate/015-better-agents/test/unit/web/hooks/useServerSession.test.ts` |
| T007 | `/test/unit/web/hooks/useAgentSession.test.ts` | `/home/jak/substrate/015-better-agents/test/unit/web/hooks/useServerSession.test.ts` |
| T008 | `/apps/web/src/hooks/useAgentSession.ts` | `/home/jak/substrate/015-better-agents/apps/web/src/hooks/useServerSession.ts` |
| T009 | `/apps/web/src/hooks/useAgentSession.ts` | `/home/jak/substrate/015-better-agents/apps/web/src/hooks/useServerSession.ts` |

**Also add discovery note to tasks.md** (after line 572 in Discoveries section):
```markdown
| 2026-01-27 | T008 | decision | Created useServerSession as NEW hook (not modify existing) | localStorage vs server patterns are fundamentally different | Implementation |
```

---

## Verification Checklist

After completing all fixes:

```bash
# 1. Format
just format

# 2. Lint (should pass now)
just lint

# 3. Type check
just typecheck

# 4. Test suite
just test

# 5. Full quality check
just fft
```

**Expected**: All commands pass with exit code 0.

---

## Re-Review Request

After fixes are complete:
1. Commit with message: `fix(phase-3): address code review findings SEC-001, COR-001, COR-002`
2. Request re-review via `/plan-7-code-review`

---

**Status**: Awaiting fixes
**Estimated Fix Time**: 30 minutes
