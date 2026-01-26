# Fix Tasks: Subtask 001 - Real Agent Integration

**Review**: [review.001-subtask-real-agent-integration.md](./review.001-subtask-real-agent-integration.md)
**Created**: 2026-01-26

---

## Priority Order

Fix in this order (HIGH severity first, then MEDIUM):

1. SEC-001: Error message information leakage
2. COR-001: Missing JSON parse error handling  
3. MEM-001: Event listener memory leak

---

## Task 1: SEC-001 - Error Message Information Leakage

**Severity**: HIGH
**File**: `apps/web/app/api/agents/run/route.ts`
**Lines**: 205-225

### Issue
Raw `error.message` returned to client, potentially exposing stack traces or internal system details.

### Fix

Replace the error handling in the catch block:

```diff
  } catch (error) {
    // Broadcast error
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
+   
+   // Log detailed error server-side only
+   console.error('[/api/agents/run] Agent execution failed:', error);
+   
    sseManager.broadcast(channel, 'agent_error', {
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
-       message: errorMessage,
+       message: 'Agent execution failed. Please try again.',
      },
    });

    // Also broadcast error status
    sseManager.broadcast(channel, 'agent_session_status', {
      timestamp: new Date().toISOString(),
      data: {
        sessionId,
        status: 'error',
      },
    });

-   return Response.json({ error: errorMessage }, { status: 500 });
+   return Response.json({ error: 'Agent execution failed' }, { status: 500 });
  }
```

### Test Verification
Existing tests should still pass - they check for 500 status and error property existence, not specific message content.

---

## Task 2: COR-001 - Missing JSON Parse Error Handling

**Severity**: HIGH
**File**: `apps/web/app/api/agents/run/route.ts`
**Lines**: 133-146

### Issue
`request.json()` can throw `SyntaxError` for malformed JSON before Zod validation runs.

### Fix

Update the try/catch block to handle both error types:

```diff
  // Parse and validate request body
  let body: AgentRunRequest;
  try {
    const rawBody = await request.json();
    body = AgentRunRequestSchema.parse(rawBody);
  } catch (error) {
+   // Handle JSON syntax errors (malformed JSON)
+   if (error instanceof SyntaxError) {
+     return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
+   }
+   
    // Check for Zod validation errors (use name check for cross-module compatibility)
    const isZodError = error instanceof Error && error.name === 'ZodError' && 'errors' in error;
    const message = isZodError
      ? (error as z.ZodError).errors.map((e) => e.message).join(', ')
      : 'Invalid request body';

    return Response.json({ error: message }, { status: 400 });
  }
```

### Test to Add

Add a test for malformed JSON:

```typescript
it('should reject malformed JSON', async () => {
  /*
  Test Doc:
  - Why: Prevent crashes from invalid JSON before Zod validation
  - Contract: SyntaxError returns 400 with descriptive message
  - Usage Notes: Handles edge case of malformed request body
  - Quality Contribution: Proper error handling for all input types
  - Worked Example: "{ invalid json }" → 400 "Invalid JSON in request body"
  */
  const { POST } = await import('../../../../../apps/web/app/api/agents/run/route');

  const request = new NextRequest('http://localhost:3000/api/agents/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ invalid json without quotes }',
  });

  const response = await POST(request);
  
  expect(response.status).toBe(400);
  const body = await response.json();
  expect(body.error).toContain('Invalid JSON');
});
```

---

## Task 3: MEM-001 - Event Listener Memory Leak

**Severity**: MEDIUM
**File**: `apps/web/src/hooks/useAgentSSE.ts`
**Lines**: 168-238

### Issue
Event listeners are added on every `connect()` call but never removed before reconnection. After 3 reconnects, each event fires 4 callbacks.

### Fix

Store handler references and remove them in `disconnect()` and before reconnecting:

```diff
+ // Store event handler references for cleanup
+ const handlersRef = useRef<{
+   textDelta?: (event: MessageEvent) => void;
+   status?: (event: MessageEvent) => void;
+   usage?: (event: MessageEvent) => void;
+   error?: (event: MessageEvent) => void;
+ }>({});

  const connect = useCallback(() => {
    console.log(`[useAgentSSE] connect() called, channel=${channel}`);
    if (!channel) {
      console.log('[useAgentSSE] No channel, skipping connect');
      return;
    }

    // Clear pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

-   // Close existing connection
+   // Close existing connection and remove old listeners
    if (eventSourceRef.current) {
+     const es = eventSourceRef.current;
+     const handlers = handlersRef.current;
+     if (handlers.textDelta) es.removeEventListener('agent_text_delta', handlers.textDelta);
+     if (handlers.status) es.removeEventListener('agent_session_status', handlers.status);
+     if (handlers.usage) es.removeEventListener('agent_usage_update', handlers.usage);
+     if (handlers.error) es.removeEventListener('agent_error', handlers.error);
      eventSourceRef.current.close();
    }

    const url = `/api/events/${channel}`;
    console.log(`[useAgentSSE] Creating EventSource for: ${url}`);
    const eventSource = eventSourceFactory(url);
    console.log(`[useAgentSSE] EventSource created, readyState=${eventSource.readyState}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[useAgentSSE] Connected to channel: ${channel}`);
      setIsConnected(true);
      setError(null);
      reconnectAttemptsRef.current = 0;
    };

    // Listen for agent-specific event types
-   eventSource.addEventListener('agent_text_delta', (event) => {
+   const handleTextDelta = (event: MessageEvent) => {
      console.log('[useAgentSSE] Received text_delta event');
      try {
        const parsed = JSON.parse(event.data) as AgentTextDeltaEvent;
        callbacksRef.current.onTextDelta?.(parsed.data.delta, parsed.data.sessionId);
      } catch (e) {
        console.warn('useAgentSSE: Failed to parse text_delta event:', e);
      }
-   });
+   };
+   eventSource.addEventListener('agent_text_delta', handleTextDelta);
+   handlersRef.current.textDelta = handleTextDelta;

    // ... Apply same pattern to other event handlers ...
```

### Test Verification
No existing tests exercise reconnection behavior. Consider adding an integration test that simulates disconnect/reconnect cycles and verifies callbacks are not duplicated.

---

## Verification Steps

After applying fixes:

```bash
# Run affected tests
pnpm test test/unit/web/api/agents/run.test.ts

# Run all web tests
pnpm test test/unit/web/

# Type check
pnpm typecheck

# Lint
pnpm lint apps/web/app/api/agents apps/web/src/hooks

# Re-run code review
# /plan-7-code-review --plan "..." 
```

---

## Optional Improvements (Not Blocking)

### SEC-002: URL Injection - Channel Validation
Add channel validation in useAgentSSE before building URL.

### OBS-001: Structured Error Logging
Add `console.error` calls with context in page.tsx catch blocks.

### STY-001: Path Aliases
Replace relative imports in route.ts with `@/lib/` aliases.

---

**Fix Tasks Created**: 2026-01-26
