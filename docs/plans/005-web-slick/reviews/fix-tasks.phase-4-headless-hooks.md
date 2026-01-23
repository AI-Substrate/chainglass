# Phase 4: Headless Hooks – Fix Tasks

**Phase**: Phase 4: Headless Hooks  
**Review**: [review.phase-4-headless-hooks.md](./review.phase-4-headless-hooks.md)  
**Created**: 2026-01-22

---

## HIGH Priority Fixes (Blocking)

### FIX-001: Batch State Updates in useFlowState.removeNode

**Finding**: CORR-001  
**Severity**: HIGH  
**File**: `apps/web/src/hooks/useFlowState.ts:54-58`

**Issue**: Sequential `setNodes` and `setEdges` creates race condition.

**Current Code**:
```typescript
const removeNode = useCallback((nodeId: string) => {
  setNodes((prev) => prev.filter((n) => n.id !== nodeId));
  setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
}, []);
```

**Fix**: Use combined state or batch updates:

```typescript
// Option A: Combined state object
const [flow, setFlow] = useState({ nodes: [...initialFlow.nodes], edges: [...initialFlow.edges] });

const removeNode = useCallback((nodeId: string) => {
  setFlow((prev) => ({
    nodes: prev.nodes.filter((n) => n.id !== nodeId),
    edges: prev.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  }));
}, []);

// Option B: Use React 18 automatic batching (already works in event handlers)
// Document that this relies on automatic batching
```

**Test**: Existing tests should pass. Add test for rapid sequential removals.

---

### FIX-002: Validate Node Existence in useFlowState.addEdge

**Finding**: CORR-002  
**Severity**: HIGH  
**File**: `apps/web/src/hooks/useFlowState.ts:83-85`

**Issue**: Creates orphaned edges pointing to non-existent nodes.

**Current Code**:
```typescript
const addEdge = useCallback((source: string, target: string) => {
  const newEdge: WorkflowEdge = {
    id: `edge-${source}-${target}`,
    source,
    target,
  };
  setEdges((prev) => [...prev, newEdge]);
}, []);
```

**Fix**: Validate node existence:

```typescript
const addEdge = useCallback((source: string, target: string) => {
  setEdges((prev) => {
    // Validate nodes exist - need access to nodes state
    // This requires combining nodes/edges state or using ref
    const newEdge: WorkflowEdge = {
      id: `edge-${source}-${target}`,
      source,
      target,
    };
    return [...prev, newEdge];
  });
}, []);
```

**Better Fix** (combine with FIX-001):
```typescript
const addEdge = useCallback((source: string, target: string) => {
  setFlow((prev) => {
    // Validate both nodes exist
    const sourceExists = prev.nodes.some((n) => n.id === source);
    const targetExists = prev.nodes.some((n) => n.id === target);
    if (!sourceExists || !targetExists) {
      console.warn(`addEdge: Invalid nodes - source=${source} target=${target}`);
      return prev; // No-op
    }
    
    const newEdge: WorkflowEdge = {
      id: `edge-${source}-${target}`,
      source,
      target,
    };
    return { ...prev, edges: [...prev.edges, newEdge] };
  });
}, []);
```

**Test**: Add test for invalid node IDs:
```typescript
it('should not add edge with non-existent source node', () => {
  const { result } = renderHook(() => useFlowState(DEMO_FLOW), { wrapper: ReactFlowWrapper });
  const originalEdgeCount = result.current.edges.length;
  
  act(() => {
    result.current.addEdge('non-existent', 'node-1');
  });
  
  expect(result.current.edges).toHaveLength(originalEdgeCount);
});
```

---

### FIX-003: Clear Timeout on Reconnect in useSSE

**Finding**: CORR-004  
**Severity**: HIGH  
**File**: `apps/web/src/hooks/useSSE.ts:79-118`

**Issue**: Multiple reconnect timeouts can accumulate.

**Current Code**:
```typescript
const connect = useCallback(() => {
  // Clean up existing connection
  if (eventSourceRef.current) {
    eventSourceRef.current.close();
  }
  // ... creates new timeout on error without clearing old ones
}, [url, eventSourceFactory, reconnectDelay, maxReconnectAttempts]);
```

**Fix**: Clear existing timeout at start of connect:

```typescript
const connect = useCallback(() => {
  // Clear any pending reconnect timeout
  if (reconnectTimeoutRef.current) {
    clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }
  
  // Clean up existing connection
  if (eventSourceRef.current) {
    eventSourceRef.current.close();
  }
  
  // ... rest of connect logic
}, [url, eventSourceFactory, reconnectDelay, maxReconnectAttempts]);
```

**Test**: Add test for multiple rapid errors:
```typescript
it('should not accumulate reconnect timeouts on rapid errors', async () => {
  const { result } = renderHook(() => useSSE('/api/events', factory.create));
  
  act(() => {
    // Rapid errors
    factory.lastInstance?.simulateError();
    factory.lastInstance?.simulateError();
    factory.lastInstance?.simulateError();
  });
  
  // Advance time - should only have ONE reconnect attempt
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  
  // Verify only 2 instances created (initial + 1 reconnect)
  // This requires tracking instance count in factory
});
```

---

### FIX-004: Add Message Size Limit to useSSE

**Finding**: PERF-007  
**Severity**: HIGH  
**File**: `apps/web/src/hooks/useSSE.ts:94-97`

**Issue**: Messages array grows without bound.

**Current Code**:
```typescript
setMessages((prev) => [...prev, data]);
```

**Fix**: Add maxMessages option with automatic pruning:

```typescript
export interface UseSSEOptions {
  autoConnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
  /** Maximum number of messages to retain (default: 1000, 0 = unlimited) */
  maxMessages?: number;
}

// In hook:
const { 
  autoConnect = true, 
  reconnectDelay = 5000, 
  maxReconnectAttempts = 5,
  maxMessages = 1000  // Sensible default
} = options;

// In onmessage handler:
eventSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data) as T;
    setMessages((prev) => {
      const updated = [...prev, data];
      // Prune to maxMessages if set
      if (maxMessages > 0 && updated.length > maxMessages) {
        return updated.slice(-maxMessages);
      }
      return updated;
    });
  } catch {
    console.warn('useSSE: Failed to parse message as JSON:', event.data);
  }
};
```

**Test**: Add test for message pruning:
```typescript
it('should prune messages when exceeding maxMessages', () => {
  const { result } = renderHook(() => 
    useSSE('/api/events', factory.create, { maxMessages: 3 })
  );
  
  act(() => {
    factory.lastInstance?.simulateOpen();
    factory.lastInstance?.simulateMessage('{"id":1}');
    factory.lastInstance?.simulateMessage('{"id":2}');
    factory.lastInstance?.simulateMessage('{"id":3}');
    factory.lastInstance?.simulateMessage('{"id":4}');
  });
  
  expect(result.current.messages).toHaveLength(3);
  expect(result.current.messages[0]).toEqual({ id: 2 }); // First message pruned
});
```

---

## MEDIUM Priority Fixes (Recommended)

### FIX-005: Add Duplicate Edge Detection

**Finding**: CORR-003  
**File**: `apps/web/src/hooks/useFlowState.ts:83-85`

**Fix**: Check for existing edge before adding:
```typescript
const addEdge = useCallback((source: string, target: string) => {
  setEdges((prev) => {
    // Check for duplicate
    const exists = prev.some(e => e.source === source && e.target === target);
    if (exists) return prev;
    
    const newEdge: WorkflowEdge = { id: `edge-${source}-${target}`, source, target };
    return [...prev, newEdge];
  });
}, []);
```

---

### FIX-006: Add Position Boundary Validation

**Finding**: CORR-007  
**File**: `apps/web/src/hooks/useBoardState.ts:43-88`

**Fix**: Clamp position to valid range:
```typescript
// At start of moveCard, after finding target column:
const clampedPosition = Math.max(0, Math.min(position, newColumns[targetColumnIndex].cards.length));
newColumns[targetColumnIndex].cards.splice(clampedPosition, 0, card);
```

---

### FIX-007: Update Plan Footnotes

**Finding**: FOOTNOTE-001  

**Action**: Run `/plan-6a-update-progress` to add Phase 4 footnotes [^10] through [^19] to the plan's Change Footnotes Ledger.

---

## Verification Commands

After fixes, run:

```bash
# Type check
pnpm exec tsc --noEmit

# Run Phase 4 tests
pnpm vitest run test/unit/web/hooks/use-board-state.test.tsx test/unit/web/hooks/use-flow-state.test.tsx test/unit/web/hooks/use-sse.test.tsx

# Verify coverage maintained
pnpm vitest run --coverage --coverage.include='apps/web/src/hooks/**'
```

All tests should pass with >80% coverage before requesting re-review.

---

*Fix tasks generated by plan-7-code-review*
