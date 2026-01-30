# Code Review: Subtask 002 - Agent Chat Page

**Plan**: agents-workspace-data-model-plan.md
**Phase**: Phase 3: Web UI Integration
**Subtask**: 002-subtask-agent-chat-page.md
**Review Date**: 2026-01-28
**Commit Range**: e09ab0c..b416eda

---

## A) Verdict

**REQUEST_CHANGES**

| Category | Status |
|----------|--------|
| Typecheck | ✅ PASS |
| Lint | ✅ PASS |
| Tests | ✅ PASS (2411 passed, 35 skipped) |
| Doctrine Compliance | ❌ **CRITICAL VIOLATION** |
| Testing Approach | ❌ Violates R-TEST-007 |

---

## B) Summary

The subtask implementation successfully delivers the agent chat page functionality with:
- AgentChatView component (395 lines) with SSE integration
- SessionSelector component (231 lines) with URL-based navigation
- 21 new tests covering both components
- Page rewrite from raw JSON view to interactive chat UI

**However**, there is a **CRITICAL** doctrine violation: The test files use `vi.mock()` extensively, directly violating the plan's **R-TEST-007: Mock Usage: Fakes Only (No vi.mock)**. This must be fixed before merge.

---

## C) Checklist

**Testing Approach: Full TDD**

- [x] Tests precede code (RED-GREEN-REFACTOR evidence in execution log)
- [x] Tests as docs (assertions show behavior)
- [x] ~~Mock usage matches spec: Fakes Only~~ **❌ VIOLATION: Uses vi.mock()**
- [x] Negative/edge cases covered

**Universal (all approaches)**:
- [x] BridgeContext patterns followed (N/A - not VS Code extension)
- [x] Only in-scope files changed
- [x] Linters/type checks are clean
- [x] Absolute paths used (no hidden context)

---

## D) Findings Table

| ID | Severity | File:Lines | Summary | Recommendation |
|----|----------|------------|---------|----------------|
| MOCK-001 | **CRITICAL** | test/unit/web/app/agents/chat-page.test.tsx:25-29 | Uses `vi.mock('@/hooks/useAgentSSE')` violating R-TEST-007 | Create FakeAgentSSE implementation |
| MOCK-002 | **CRITICAL** | test/unit/web/app/agents/chat-page.test.tsx:29-33 | Uses `vi.mock('@/hooks/useServerSession')` violating R-TEST-007 | Create FakeServerSession implementation |
| MOCK-003 | **HIGH** | test/unit/web/components/agents/session-selector.test.tsx:23-27 | Uses `vi.mock('next/navigation')` violating R-TEST-007 | Use dependency injection for router |
| MOCK-004 | **MEDIUM** | test/unit/web/app/agents/chat-page.test.tsx:34 | Uses `globalThis.fetch = vi.fn()` for fetch mock | Consider creating FakeFetch test helper |
| DOC-001 | **LOW** | subtask dossier Phase Footnote Stubs | Footnote stubs table empty despite completed implementation | Populate with FlowSpace node IDs |
| DOC-002 | **LOW** | subtask Discoveries section | Discoveries table empty despite 4 learnings in exec log | Populate from execution log discoveries |

---

## E) Detailed Findings

### E.0) Cross-Phase Regression Analysis

**Skipped**: Subtask review (no prior phases to regress against within subtask scope)

### E.1) Doctrine & Testing Compliance

#### MOCK-001: vi.mock('@/hooks/useAgentSSE') [CRITICAL]

**File**: `test/unit/web/app/agents/chat-page.test.tsx:25-29`

**Issue**: Plan R-TEST-007 explicitly prohibits `vi.mock()`:
> **Mock Usage: Fakes Only (No vi.mock per R-TEST-007)**
> - NO `vi.mock()`, `jest.mock()`, `vi.spyOn()`, Sinon stubs
> - YES `FakeAgentSessionAdapter`, `FakeAgentEventAdapter` with test helper methods

**Evidence**:
```typescript
const mockUseAgentSSE = vi.fn();
vi.mock('@/hooks/useAgentSSE', () => ({
  useAgentSSE: (...args: unknown[]) => mockUseAgentSSE(...args),
}));
```

**Impact**: Tests don't exercise real hook implementation, potential for fake drift.

**Fix**: Create `FakeAgentSSE` class implementing the hook interface:
```typescript
// test/fakes/fake-agent-sse.ts
export class FakeAgentSSE {
  private callbacks: Record<string, Function> = {};
  isConnected = true;
  error = null;
  
  // Test helper methods (three-part API)
  simulateTextDelta(delta: string, sessionId: string) { ... }
  simulateStatusChange(status: string, sessionId: string) { ... }
  getCallHistory() { return this.calls; }
  
  // Real interface
  connect() { ... }
  disconnect() { ... }
}
```

Then use dependency injection or React context to provide the fake in tests.

---

#### MOCK-002: vi.mock('@/hooks/useServerSession') [CRITICAL]

**File**: `test/unit/web/app/agents/chat-page.test.tsx:29-33`

**Issue**: Same R-TEST-007 violation.

**Evidence**:
```typescript
vi.mock('@/hooks/useServerSession', () => ({
  useServerSession: (...args: unknown[]) => mockUseServerSession(...args),
}));
```

**Fix**: Create `FakeServerSession` class with three-part API:
- State Setup: `setSession()`, `setEvents()`
- Call Inspection: `fetchCalls`, `refetchCalls`
- Error Injection: `injectError()`

---

#### MOCK-003: vi.mock('next/navigation') [HIGH]

**File**: `test/unit/web/components/agents/session-selector.test.tsx:23-27`

**Issue**: Mocking framework internals.

**Evidence**:
```typescript
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));
```

**Fix**: Use Next.js testing utilities or wrapper component with router prop:
```typescript
// Option 1: Prop injection
interface SessionSelectorProps {
  onNavigate?: (url: string) => void; // Test can inject mock
}

// Option 2: Context-based fake
<FakeRouterProvider onPush={mockPush}>
  <SessionSelector ... />
</FakeRouterProvider>
```

---

#### TDD Compliance: ✅ PASS

**Evidence from execution log**:
```
**RED Phase** - Tests failed initially because components didn't exist:
Error: Failed to resolve import "@/components/agents/agent-chat-view"
Error: Failed to resolve import "@/components/agents/session-selector"

**GREEN Phase** - After creating components, all 21 tests pass
```

The implementation followed proper RED-GREEN-REFACTOR cycle.

---

### E.2) Semantic Analysis

#### Correctness: ✅ PASS

- Business logic correctly implements workspace-scoped chat
- SSE integration follows DYK-01 Connect-First pattern
- Session switching uses URL navigation per DYK Insight #4
- Server-first session creation per DYK Insight #3

#### Specification Alignment: ✅ PASS

All acceptance criteria from subtask dossier met:
- [x] Agent chat restores interactive experience from page.tsx.bak
- [x] Session selector allows switching agents without navigation
- [x] Create agent form works inline
- [x] SSE streaming displays tool calls, thinking, text in real-time
- [x] Works with workspace-scoped API paths

---

### E.3) Quality & Safety Analysis

**Safety Score: 80/100** (CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 1)
**Note**: Score excludes doctrine violations (covered in E.1)

#### Performance: ✅ PASS

- Uses `useMemo` for timeline computation
- Auto-scroll with `scrollIntoView({ behavior: 'smooth' })`
- No N+1 patterns detected

#### Security: ✅ PASS

- Session ID comes from server (not user input)
- Workspace slug validated by server routes
- No XSS vectors (React escaping handles content)

#### Observability: ⚠️ MEDIUM

**Finding OBS-001**: No error logging to console or monitoring system when SSE callbacks fail.

**File**: `apps/web/src/components/agents/agent-chat-view.tsx:130-135`

**Impact**: Silent failures in SSE callbacks could be hard to debug.

**Fix**:
```typescript
onError: useCallback((message: string, eventSessionId: string, code?: string) => {
  if (eventSessionId !== sessionId) return;
  console.error('[AgentChatView] SSE Error:', { message, code, sessionId });
  setError({ message, code });
  setIsRunning(false);
}, [sessionId]),
```

---

### E.4) Doctrine Evolution Recommendations

#### Advisory: No new ADRs/rules suggested

The implementation correctly follows existing patterns:
- ✅ ADR-0007 (SSE Architecture): Uses global `agents` channel
- ✅ ADR-0008 (Workspace Split Storage): All API calls include workspace slug

---

## F) Coverage Map

**Testing Approach**: Full TDD
**Overall Coverage Confidence**: 75% (acceptable but improvable)

| Acceptance Criterion | Test Assertion | Confidence |
|---------------------|----------------|------------|
| Chat restores interactive experience | `should render events from server session` | 75% (behavioral match) |
| Session selector switching | `should navigate to session URL when clicked` | 100% (explicit) |
| Create form works inline | `should render create session button/form` | 75% (behavioral) |
| SSE streaming displays events | `should display streaming content from SSE` | 50% (weak - mocked) |
| Workspace-scoped API paths | `should call API when message is sent` | 100% (explicit URL check) |

**Note**: SSE streaming coverage is weak because `vi.mock()` prevents testing real SSE behavior.

---

## G) Commands Executed

```bash
# Type checking
pnpm typecheck
# → Exit code 0, no errors

# Lint
pnpm lint
# → Checked 588 files, No fixes applied

# Tests
pnpm test
# → Test Files  160 passed | 4 skipped (164)
# → Tests  2411 passed | 35 skipped (2446)

# Diff analysis
git diff e09ab0c..b416eda --stat
# → 10 files changed, 2364 insertions(+), 162 deletions(-)
```

---

## H) Decision & Next Steps

### Approval Path

1. **Fix CRITICAL violations** (MOCK-001, MOCK-002, MOCK-003):
   - Create fake implementations for hooks
   - Remove all `vi.mock()` calls from test files
   - Use dependency injection or context-based fakes

2. **Fix MEDIUM/LOW items** (optional but recommended):
   - Add error logging in SSE callbacks
   - Populate Phase Footnote Stubs in dossier
   - Move discoveries from exec log to dossier Discoveries table

3. **Re-run review**:
   ```bash
   /plan-7-code-review --phase "Phase 3: Web UI Integration" \
     --plan "/home/jak/substrate/015-better-agents/docs/plans/018-agents-workspace-data-model/agents-workspace-data-model-plan.md"
   ```

### Who Approves

- **Technical**: Lead developer after mock violations fixed
- **Merge**: CI must pass with new fake implementations

---

## I) Footnotes Audit

| Diff-Touched Path | Footnote Tag | Node ID |
|-------------------|--------------|---------|
| apps/web/app/(dashboard)/workspaces/[slug]/agents/[id]/page.tsx | – | – |
| apps/web/src/components/agents/agent-chat-view.tsx | – | – |
| apps/web/src/components/agents/session-selector.tsx | – | – |
| test/unit/web/app/agents/chat-page.test.tsx | – | – |
| test/unit/web/components/agents/session-selector.test.tsx | – | – |
| test/setup-browser-mocks.ts | – | – |

**Note**: Footnote ledger not populated in subtask dossier. This is a LOW severity documentation gap.
