# Phase 6: Demo Pages – Fix Tasks

**Generated**: 2026-01-23
**Review**: [review.phase-6-demo-pages.md](review.phase-6-demo-pages.md)
**Verdict**: REQUEST_CHANGES

---

## Priority Order

Execute fixes in this order to address blocking issues first:

---

## FIX-001: Graph Integrity - Run plan-6a-update-progress (BLOCKING)

**Severity**: CRITICAL
**Findings**: LINK-001, LINK-002, LINK-003

### Issue
Phase 6 implementation is complete but graph integrity artifacts are missing:
- No footnotes [^16]+ in plan Change Footnotes Ledger
- Plan task statuses show [ ] while implementation is [x] complete
- No Task↔Log bidirectional links

### Fix
Run the `/plan-6a-update-progress` command:

```bash
/plan-6a-update-progress --phase "Phase 6: Demo Pages" --plan "/home/jak/substrate/005-web-slick/docs/plans/005-web-slick/web-slick-plan.md"
```

This will:
1. Add footnotes [^16]+ to plan § 12 Change Footnotes Ledger
2. Update plan task statuses from [ ] to [x]
3. Add log anchors to dossier Notes column
4. Populate dossier Phase Footnote Stubs table

---

## FIX-002: Security - Add SSE Message Validation (BLOCKING)

**Severity**: CRITICAL
**Finding**: SEC-001

### File
`/home/jak/substrate/005-web-slick/apps/web/src/hooks/useSSE.ts`

### Issue
SSE messages are parsed with JSON.parse() but not validated against Zod schema. Malicious payloads could bypass type assumptions.

### Patch
```diff
--- a/apps/web/src/hooks/useSSE.ts
+++ b/apps/web/src/hooks/useSSE.ts
@@ -107,7 +107,11 @@ export function useSSE<T>(
       eventSource.addEventListener('message', (event: MessageEvent) => {
         try {
-          const data = JSON.parse(event.data) as T;
+          const parsed = JSON.parse(event.data);
+          // If T extends SSEEvent, validate against schema
+          // For now, perform basic validation that required fields exist
+          const data = parsed as T;
           setMessages((prev) => {
             const newMessages = [...prev, data];
             // Keep only last maxMessages
```

**Full Fix**: Import `sseEventSchema` and add:
```typescript
import { sseEventSchema, type SSEEvent } from '@/lib/schemas/sse-events.schema';

// In message handler:
const parsed = JSON.parse(event.data);
const validated = sseEventSchema.safeParse(parsed);
if (!validated.success) {
  console.warn('Invalid SSE message:', validated.error);
  return;
}
const data = validated.data as T;
```

### Test
Update `use-sse.test.ts` to verify invalid messages are rejected.

---

## FIX-003: Security - Add sseChannel Validation (HIGH)

**Severity**: HIGH
**Findings**: SEC-002, SEC-003

### Files
- `/home/jak/substrate/005-web-slick/apps/web/src/components/workflow/workflow-content.tsx`
- `/home/jak/substrate/005-web-slick/apps/web/src/components/kanban/kanban-content.tsx`

### Issue
sseChannel prop passed to URL construction without client-side validation.

### Patch (workflow-content.tsx)
```diff
--- a/apps/web/src/components/workflow/workflow-content.tsx
+++ b/apps/web/src/components/workflow/workflow-content.tsx
@@ -62,8 +62,15 @@ export function WorkflowContent({
   const { nodes, edges, updateNode } = useFlowState(initialFlow);
   const [selectedNode, setSelectedNode] = useState<WorkflowNodeType | null>(null);

+  // Validate sseChannel matches server-side pattern
+  const validChannel = sseChannel && /^[a-zA-Z0-9_-]+$/.test(sseChannel);
+  if (sseChannel && !validChannel) {
+    console.warn('Invalid sseChannel format:', sseChannel);
+  }
+
   // SSE integration for real-time updates
   const { messages, isConnected } = useSSE<SSEEvent>(
-    sseChannel ? `/api/events/${sseChannel}` : '',
+    validChannel ? `/api/events/${sseChannel}` : '',
     undefined,
-    { autoConnect: !!sseChannel }
+    { autoConnect: !!validChannel }
   );
```

Apply same pattern to `kanban-content.tsx`.

---

## FIX-004: Correctness - Add Position Bounds Check (HIGH)

**Severity**: HIGH
**Finding**: CORR-002

### File
`/home/jak/substrate/005-web-slick/apps/web/src/hooks/useBoardState.ts`

### Issue
`splice(position, 0, card)` doesn't validate position is within valid bounds.

### Patch
```diff
--- a/apps/web/src/hooks/useBoardState.ts
+++ b/apps/web/src/hooks/useBoardState.ts
@@ -80,7 +80,10 @@ export function useBoardState(initialBoard: BoardState): UseBoardStateReturn {
       // Remove card from old column
       newColumns[oldColumnIndex].cards.splice(cardIndex, 1);

-      // Add card to new column at position
+      // Add card to new column at position (with bounds check)
+      const maxPosition = newColumns[targetColumnIndex].cards.length;
+      const safePosition = Math.max(0, Math.min(position, maxPosition));
+
-      newColumns[targetColumnIndex].cards.splice(position, 0, card);
+      newColumns[targetColumnIndex].cards.splice(safePosition, 0, card);
```

### Test
Add edge case test in `use-board-state.test.ts`:
```typescript
it('should clamp position to valid bounds', () => {
  const { result } = renderHook(() => useBoardState(DEMO_BOARD));
  act(() => result.current.moveCard('card-1', 'done', 999)); // Invalid high position
  expect(result.current.board.columns.find(c => c.id === 'done')?.cards).toContainEqual(
    expect.objectContaining({ id: 'card-1' })
  );
});
```

---

## FIX-005: Mock Policy - Replace vi.mock() (HIGH)

**Severity**: CRITICAL (policy violation)
**Finding**: MOCK-001

### File
`/home/jak/substrate/005-web-slick/test/integration/web/dashboard-navigation.test.tsx`

### Issue
`vi.mock('next/navigation')` violates "Targeted mocks" policy which prohibits vi.mock() on application modules.

### Fix Options

**Option A (Recommended)**: Create a test wrapper component:
```typescript
// test/fakes/navigation-test-wrapper.tsx
import { createContext, useContext, type ReactNode } from 'react';

interface NavigationContextType {
  pathname: string;
  push: (url: string) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  pathname: '/',
  push: () => {},
});

export function NavigationTestWrapper({
  children,
  pathname = '/',
  push = () => {},
}: {
  children: ReactNode;
  pathname?: string;
  push?: (url: string) => void;
}) {
  return (
    <NavigationContext.Provider value={{ pathname, push }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useTestNavigation() {
  return useContext(NavigationContext);
}
```

**Option B**: Accept browser-only testing limitation and skip navigation tests in jsdom.

---

## FIX-006: Performance - Memoize Callbacks (RECOMMENDED)

**Severity**: HIGH-MEDIUM
**Findings**: PERF-001, PERF-002, PERF-003, PERF-005, PERF-006

### Files
- `workflow-content.tsx`
- `kanban-content.tsx`
- `kanban-column.tsx`

### Patches

**workflow-content.tsx** - Move nodeTypes outside component:
```diff
-// Local nodeTypes to avoid circular import with index.ts
-const nodeTypes = {
+// Move outside component to prevent recreation on each render
+const NODE_TYPES = {
   workflow: WorkflowNode,
   phase: PhaseNode,
   agent: AgentNode,
 } as const;

 export function WorkflowContent(...) {
   // ...
   <ReactFlow
     nodes={nodes}
     edges={edges}
-    nodeTypes={nodeTypes}
+    nodeTypes={NODE_TYPES}
```

**workflow-content.tsx** - Memoize callbacks:
```typescript
const handleNodeClick = useCallback<ReactFlowProps['onNodeClick']>(
  (_event, node) => {
    const workflowNode = node as WorkflowNodeType;
    setSelectedNode(workflowNode);
    onNodeClick?.(workflowNode);
  },
  [onNodeClick]
);

const nodeStrokeColor = useCallback((node: Node) => {
  if (node.type === 'workflow') return '#6366f1';
  if (node.type === 'phase') return '#a855f7';
  if (node.type === 'agent') return '#f59e0b';
  return '#999';
}, []);

const nodeColor = useCallback((node: Node) => {
  if (node.type === 'workflow') return '#e0e7ff';
  if (node.type === 'phase') return '#f3e8ff';
  if (node.type === 'agent') return '#fef3c7';
  return '#f5f5f5';
}, []);
```

**kanban-content.tsx** - Memoize handleDragEnd:
```typescript
const handleDragEnd = useCallback(
  (event: DragEndEvent) => {
    // ... existing logic
  },
  [board, moveCard, onMoveCard]
);
```

**kanban-column.tsx** - Memoize cardIds:
```typescript
const cardIds = useMemo(
  () => column.cards.map((card) => card.id),
  [column.cards]
);
```

---

## FIX-007: Mock Consolidation (RECOMMENDED)

**Severity**: HIGH
**Finding**: MOCK-002

### Issue
ResizeObserver and matchMedia mocks duplicated across test files.

### Fix
Create shared setup file:

```typescript
// test/setup-browser-mocks.ts
import { vi } from 'vitest';

// ResizeObserver mock
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// matchMedia mock
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
```

Update `vitest.config.ts`:
```typescript
export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts', './test/setup-browser-mocks.ts'],
  },
});
```

Then remove duplicate mocks from workflow-page.test.tsx and kanban-page.test.tsx.

---

## Verification

After applying fixes, run:

```bash
# Quality gates
just test && just typecheck && just lint && just build

# Specific test files
pnpm vitest test/integration/web/workflow-page.test.tsx
pnpm vitest test/integration/web/kanban-page.test.tsx
pnpm vitest test/unit/web/hooks/use-sse.test.ts
pnpm vitest test/unit/web/hooks/use-board-state.test.ts

# Then rerun code review
/plan-7-code-review --phase "Phase 6: Demo Pages" --plan "..."
```

---

*Fix tasks generated by plan-7-code-review*
