# Fix Tasks: Subtask 002 - Agent Chat Page

**Review**: [review.002-subtask-agent-chat-page.md](./review.002-subtask-agent-chat-page.md)
**Priority**: CRITICAL findings must be fixed before merge

---

## CRITICAL: MOCK-001 - Replace vi.mock('@/hooks/useAgentSSE')

**File**: `test/unit/web/app/agents/chat-page.test.tsx`
**Lines**: 25-29

### Current (Violates R-TEST-007)
```typescript
const mockUseAgentSSE = vi.fn();
vi.mock('@/hooks/useAgentSSE', () => ({
  useAgentSSE: (...args: unknown[]) => mockUseAgentSSE(...args),
}));
```

### Fix Strategy

1. **Create FakeAgentSSE class** at `test/fakes/fake-agent-sse.ts`:

```typescript
/**
 * FakeAgentSSE - Test double for useAgentSSE hook
 * 
 * Per R-TEST-007: Full fake implementation with three-part API
 */
export interface FakeAgentSSECallbacks {
  onTextDelta?: (delta: string, sessionId: string) => void;
  onStatusChange?: (status: string, sessionId: string) => void;
  onUsageUpdate?: (usage: { tokensUsed: number; tokensTotal: number; tokensLimit?: number }, sessionId: string) => void;
  onError?: (message: string, sessionId: string, code?: string) => void;
}

export class FakeAgentSSE {
  private callbacks: FakeAgentSSECallbacks = {};
  isConnected = true;
  error: Error | null = null;

  // ========== State Setup ==========
  setCallbacks(callbacks: FakeAgentSSECallbacks) {
    this.callbacks = callbacks;
  }

  setConnected(connected: boolean) {
    this.isConnected = connected;
  }

  setError(error: Error | null) {
    this.error = error;
  }

  // ========== State Inspection ==========
  private connectCalls: unknown[][] = [];
  private disconnectCalls: unknown[][] = [];

  get calls() {
    return {
      connect: [...this.connectCalls],
      disconnect: [...this.disconnectCalls],
    };
  }

  // ========== Error Injection ==========
  simulateTextDelta(delta: string, sessionId: string) {
    this.callbacks.onTextDelta?.(delta, sessionId);
  }

  simulateStatusChange(status: string, sessionId: string) {
    this.callbacks.onStatusChange?.(status, sessionId);
  }

  simulateUsageUpdate(usage: { tokensUsed: number; tokensTotal: number; tokensLimit?: number }, sessionId: string) {
    this.callbacks.onUsageUpdate?.(usage, sessionId);
  }

  simulateError(message: string, sessionId: string, code?: string) {
    this.callbacks.onError?.(message, sessionId, code);
  }

  // ========== Interface Implementation ==========
  connect() {
    this.connectCalls.push([]);
  }

  disconnect() {
    this.disconnectCalls.push([]);
  }

  // ========== Test Cleanup ==========
  reset() {
    this.callbacks = {};
    this.isConnected = true;
    this.error = null;
    this.connectCalls = [];
    this.disconnectCalls = [];
  }
}
```

2. **Update AgentChatView** to accept optional SSE hook via props or context:

```typescript
// apps/web/src/components/agents/agent-chat-view.tsx
export interface AgentChatViewProps {
  // ... existing props ...
  
  /** Optional SSE hook override for testing */
  _testSSEHook?: typeof useAgentSSE;
}

export function AgentChatView({
  // ... existing props ...
  _testSSEHook,
}: AgentChatViewProps) {
  // Use injected hook for tests, real hook for production
  const sseHook = _testSSEHook ?? useAgentSSE;
  const { isConnected: sseConnected } = sseHook('agents', { ... });
}
```

3. **Update test file** to use fake:

```typescript
// test/unit/web/app/agents/chat-page.test.tsx
import { FakeAgentSSE } from '../../fakes/fake-agent-sse';

describe('AgentChatView', () => {
  let fakeSSE: FakeAgentSSE;

  beforeEach(() => {
    fakeSSE = new FakeAgentSSE();
  });

  it('should display streaming content from SSE', () => {
    render(
      <AgentChatView 
        {...defaultProps} 
        _testSSEHook={() => ({
          isConnected: fakeSSE.isConnected,
          error: fakeSSE.error,
          connect: () => fakeSSE.connect(),
          disconnect: () => fakeSSE.disconnect(),
        })}
      />
    );

    // Simulate SSE event
    fakeSSE.simulateTextDelta('Hello, how can I help?', 'test-session-123');

    // Assert streaming content displayed
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
  });
});
```

---

## CRITICAL: MOCK-002 - Replace vi.mock('@/hooks/useServerSession')

**File**: `test/unit/web/app/agents/chat-page.test.tsx`
**Lines**: 29-33

### Fix Strategy

1. **Create FakeServerSession class** at `test/fakes/fake-server-session.ts`:

```typescript
/**
 * FakeServerSession - Test double for useServerSession hook
 * 
 * Per R-TEST-007: Full fake implementation with three-part API
 */
export interface FakeSessionData {
  metadata: { id: string; status?: string };
  events: Array<{ id: string; type: string; timestamp: string; data: unknown }>;
}

export class FakeServerSession {
  private _session: FakeSessionData | null = null;
  private _isLoading = false;
  private _error: Error | null = null;
  private _isConnected = true;

  // ========== State Setup ==========
  setSession(session: FakeSessionData | null) {
    this._session = session;
  }

  setLoading(loading: boolean) {
    this._isLoading = loading;
  }

  setError(error: Error | null) {
    this._error = error;
  }

  setConnected(connected: boolean) {
    this._isConnected = connected;
  }

  // ========== State Inspection ==========
  private refetchCalls: unknown[][] = [];

  get calls() {
    return {
      refetch: [...this.refetchCalls],
    };
  }

  // ========== Hook Interface ==========
  getHookResult() {
    return {
      session: this._session,
      isLoading: this._isLoading,
      error: this._error,
      refetch: () => { this.refetchCalls.push([]); },
      isConnected: this._isConnected,
    };
  }

  // ========== Test Cleanup ==========
  reset() {
    this._session = null;
    this._isLoading = false;
    this._error = null;
    this._isConnected = true;
    this.refetchCalls = [];
  }
}
```

2. **Update test file** to use fake via prop injection (same pattern as MOCK-001).

---

## HIGH: MOCK-003 - Replace vi.mock('next/navigation')

**File**: `test/unit/web/components/agents/session-selector.test.tsx`
**Lines**: 23-27

### Fix Strategy

**Option A: Prop-based navigation callback** (Recommended)

1. **Update SessionSelector** to accept optional navigation callback:

```typescript
// apps/web/src/components/agents/session-selector.tsx
export interface SessionSelectorProps {
  // ... existing props ...
  
  /** Optional navigation override for testing */
  onNavigate?: (url: string) => void;
}

const handleSelect = useCallback((sessionId: string) => {
  const url = `/workspaces/${workspaceSlug}/agents/${sessionId}...`;
  
  if (onNavigate) {
    onNavigate(url);
  } else {
    router.push(url);
  }
}, [router, workspaceSlug, worktreePath, onNavigate]);
```

2. **Update test file**:

```typescript
// test/unit/web/components/agents/session-selector.test.tsx
const mockNavigate = vi.fn(); // vi.fn() for callbacks is OK (not vi.mock())

it('should navigate to session URL when clicked', async () => {
  render(
    <SessionSelector 
      {...defaultProps} 
      sessions={sessions}
      onNavigate={mockNavigate}
    />
  );

  await user.click(screen.getByText('Session Two'));

  expect(mockNavigate).toHaveBeenCalledWith(
    expect.stringContaining('/workspaces/test-workspace/agents/session-2')
  );
});
```

---

## MEDIUM: MOCK-004 - Replace globalThis.fetch mock

**File**: `test/unit/web/app/agents/chat-page.test.tsx`
**Line**: 34

### Current
```typescript
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;
```

### Fix Strategy

Create `FakeFetch` utility in test helpers:

```typescript
// test/fakes/fake-fetch.ts
export class FakeFetch {
  private responses: Map<string, Response> = new Map();
  private calls: Array<{ url: string; options: RequestInit }> = [];

  // State Setup
  respondWith(urlPattern: string, response: { status: number; json: unknown }) {
    this.responses.set(urlPattern, new Response(
      JSON.stringify(response.json),
      { status: response.status }
    ));
  }

  // State Inspection
  getCalls() {
    return [...this.calls];
  }

  getCallsMatching(urlPattern: string) {
    return this.calls.filter(c => c.url.includes(urlPattern));
  }

  // Interface
  async fetch(url: string, options: RequestInit): Promise<Response> {
    this.calls.push({ url, options });
    
    for (const [pattern, response] of this.responses) {
      if (url.includes(pattern)) return response.clone();
    }
    
    return new Response('Not Found', { status: 404 });
  }

  // Cleanup
  reset() {
    this.responses.clear();
    this.calls = [];
  }
}
```

---

## LOW: DOC-001 - Populate Phase Footnote Stubs

**File**: `docs/plans/018-agents-workspace-data-model/tasks/phase-3-web-ui-integration/002-subtask-agent-chat-page.md`

### Fix

Update the Phase Footnote Stubs section with actual changes:

```markdown
## Phase Footnote Stubs

| ID | Change | Task | Commit |
|----|--------|------|--------|
| [^ST02-1] | function:agent-chat-view.tsx:AgentChatView | ST002 | b416eda |
| [^ST02-2] | function:session-selector.tsx:SessionSelector | ST003 | b416eda |
| [^ST02-3] | file:page.tsx (agents/[id]) | ST005 | b416eda |
```

---

## LOW: DOC-002 - Populate Discoveries from Execution Log

**File**: `docs/plans/018-agents-workspace-data-model/tasks/phase-3-web-ui-integration/002-subtask-agent-chat-page.md`

### Fix

Copy discoveries from execution log to dossier:

```markdown
## Discoveries & Learnings

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-01-28 | ST001 | gotcha | scrollIntoView not in jsdom | Added mock to setup-browser-mocks.ts | setup-browser-mocks.ts:46 |
| 2026-01-28 | ST005 | gotcha | Status type mismatch: backend 'active'\|'completed'\|'terminated' vs UI 'idle'\|'running' | Added mapping in page component | page.tsx:73-76 |
| 2026-01-28 | ST007 | gotcha | Lucide icons don't have title prop | Wrap in span with title instead | – |
| 2026-01-28 | ST005 | insight | AgentSession has no name field | Use session ID suffix as display name | page.tsx:70 |
```

---

## Verification After Fixes

```bash
# Run tests to ensure fakes work correctly
pnpm test test/unit/web/app/agents/chat-page.test.tsx
pnpm test test/unit/web/components/agents/session-selector.test.tsx

# Full suite
just fft

# Re-request review
/plan-7-code-review --subtask 002-subtask-agent-chat-page.md \
  --plan "/home/jak/substrate/015-better-agents/docs/plans/018-agents-workspace-data-model/agents-workspace-data-model-plan.md"
```
