# Multi-Agent Web UI Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-01-26
**Spec**: [./web-agents-spec.md](./web-agents-spec.md)
**Status**: READY

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Foundation](#phase-1-foundation)
   - [Phase 2: Core Chat](#phase-2-core-chat)
   - [Phase 3: Multi-Session](#phase-3-multi-session)
   - [Phase 4: Polish](#phase-4-polish)
   - [Phase 5: Integration Testing](#phase-5-integration-testing)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [Complexity Tracking](#complexity-tracking)
8. [Progress Tracking](#progress-tracking)
9. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

### Problem Statement

Users currently interact with AI coding agents (Claude Code, Copilot) only through CLI. There is no web interface for running agents, which limits accessibility and prevents visual session management across multiple concurrent conversations.

### Solution Approach

- Build a complete chat UI from scratch using existing agent adapter infrastructure
- Extend SSE schemas (additive only) for agent-specific events
- Implement per-session state machines with localStorage persistence
- Leverage existing markdown rendering components (MarkdownServer, CodeBlock, shiki)
- Use Full TDD with fakes over mocks (constitution-mandated)

### Expected Outcomes

- Users can run Claude Code or Copilot agents directly from the web UI
- Real-time streaming responses with live markdown rendering
- Multiple concurrent sessions (unlimited, soft warning at 10)
- Session persistence across browser refresh
- Visual status indicators for agent states

### Success Metrics

- All 17 acceptance criteria (AC-01 through AC-17) verified
- Test coverage >80% for new code
- No regressions in existing SSE infrastructure (26 tests pass)
- Accessible UI (keyboard navigation, screen reader support)

---

## Technical Context

### Current System State

**Existing Infrastructure (Production-Ready)**:
| Component | Location | Status |
|-----------|----------|--------|
| `IAgentAdapter` interface | `packages/shared/src/interfaces/agent-adapter.interface.ts` | ✅ Ready |
| `ClaudeCodeAdapter` | `packages/shared/src/adapters/claude-code.adapter.ts` | ✅ Ready |
| `SdkCopilotAdapter` | `packages/shared/src/adapters/sdk-copilot-adapter.ts` | ✅ Ready |
| `AgentService` | `packages/shared/src/services/agent.service.ts` | ✅ Ready |
| `SSEManager` | `apps/web/src/lib/sse-manager.ts` | ✅ Ready (26 tests) |
| `useSSE` hook | `apps/web/src/hooks/useSSE.ts` | ✅ Ready |
| SSE event schemas | `apps/web/src/lib/schemas/sse-events.schema.ts` | ✅ Ready |
| `MarkdownServer` | `apps/web/src/components/viewers/markdown-server.tsx` | ✅ Ready |
| `CodeBlock` | `apps/web/src/components/viewers/code-block.tsx` | ✅ Ready |
| `shiki-processor` | `apps/web/src/lib/server/shiki-processor.ts` | ✅ Ready |

**Missing (Must Build)**:
| Component | Purpose |
|-----------|---------|
| Chat UI components | Session list, chat view, message list, input |
| Session persistence | localStorage store with Zod validation |
| Agent SSE events | Event types for text_delta, status, usage |
| Multi-session orchestration | Concurrent session management |
| Agent routes | `/agents`, `/agents/[sessionId]` pages |

### Integration Requirements

1. **DI Container**: Extend `apps/web/src/lib/di-container.ts` with session factory tokens
2. **SSE Channels**: Use pattern `/api/events/agent-${sessionId}` for per-session streaming
3. **Agent Adapters**: Call via `AgentService` (no direct adapter access from UI)
4. **Markdown Rendering**: Reuse existing server components (shiki must stay server-side)

### Constraints and Limitations

- **Shiki server-only**: Syntax highlighting cannot run client-side (next.config serverExternalPackages)
- **No global state libraries**: Use React 19 hooks only (useReducer, useCallback)
- **Fakes over mocks**: No vi.mock/jest.mock (constitution mandate)
- **SSE additive-only**: Cannot modify existing event types, only add new ones

### Assumptions

- Agent adapters correctly handle `resume()` with existing sessionId
- SSE infrastructure handles multi-session broadcasting without modification
- localStorage provides sufficient persistence for MVP (5MB typical quota)
- Modern browsers with EventSource support (Chrome 90+, Firefox 90+, Safari 14+)

---

## Critical Research Findings

**Source Notation Legend**:
- `I1-XX` = Implementation Strategy discoveries (from research subagent)
- `R1-XX` = Risk & Mitigation discoveries (from research subagent)
- `PL-XX` = Prior Learnings from previous implementations
- `Research Dossier` = Main research dossier findings

### 🚨 Critical Finding 01: No Chat UI Exists
**Impact**: Critical
**Sources**: [Research Dossier, I1-01]
**Problem**: The codebase has backend agent infrastructure but zero frontend chat components
**Root Cause**: Feature not previously implemented
**Solution**: Build entire chat UI from scratch using component hierarchy in research
**Action Required**: Create all components in `apps/web/src/components/agents/`
**Affects Phases**: Phase 2, Phase 3

### 🚨 Critical Finding 02: Session Persistence Gap
**Impact**: Critical
**Sources**: [Research Dossier, I1-01]
**Problem**: Agent sessions tracked in memory only; no localStorage persistence for web
**Root Cause**: AgentService designed for CLI, not browser persistence
**Solution**: Implement `agent-session.store.ts` with Zod validation and two-pass hydration
**Example**:
```typescript
// ❌ WRONG - Direct localStorage access
const sessions = JSON.parse(localStorage.getItem('sessions'));

// ✅ CORRECT - Validated hydration
const raw = localStorage.getItem('sessions');
const parsed = SessionsDataSchema.safeParse(JSON.parse(raw ?? '{}'));
if (parsed.success) hydrateSessions(parsed.data);
```
**Action Required**: Build session store in Phase 1
**Affects Phases**: Phase 1, Phase 2, Phase 3

### 🚨 Critical Finding 03: SSE Schema Extension Risk
**Impact**: Critical
**Sources**: [R1-01]
**Problem**: Adding agent event types could break existing SSE consumers
**Root Cause**: Discriminated unions are sensitive to modification
**Solution**: Additive-only changes; append new types, never remove/rename existing
**Example**:
```typescript
// ❌ WRONG - Reordering or replacing types
export const sseEventSchema = z.discriminatedUnion('type', [
  agentTextDeltaSchema,  // New type added at beginning
  workflowStatusSchema,  // Existing type moved
]);

// ✅ CORRECT - Append only
export const sseEventSchema = z.discriminatedUnion('type', [
  workflowStatusSchema,   // Existing - unchanged
  phaseStatusSchema,      // Existing - unchanged
  // ... all existing types ...
  agentTextDeltaSchema,   // New - appended at end
  agentSessionSchema,     // New - appended at end
]);
```
**Action Required**: Contract test verifying old types still parse
**Affects Phases**: Phase 1

### High Finding 04: AgentService Timeout Can Leave Zombies
**Impact**: High
**Sources**: [R1-03]
**Problem**: Timeout fires but terminate fails silently, leaving hung processes
**Root Cause**: `adapter.terminate()` failures suppressed with `.catch(() => {})`
**Solution**: Track termination in-flight, log failures, sub-timeout for termination
**Action Required**: Document but don't modify AgentService (out of scope)
**Affects Phases**: Phase 5 (testing only)

### High Finding 05: SSE Singleton Must Survive HMR
**Impact**: High
**Sources**: [PL-01, R1-02]
**Problem**: Module-level singletons lose connections on hot reload
**Root Cause**: HMR re-executes module, creating new instance
**Solution**: Already fixed using `globalThis` pattern in SSEManager
**Example**:
```typescript
// ✅ CORRECT - Already implemented
const globalForSSE = globalThis as typeof globalThis & { sseManager?: SSEManager };
export const sseManager = globalForSSE.sseManager ??= new SSEManager();
```
**Action Required**: Verify pattern used in any new singletons
**Affects Phases**: Phase 1

### High Finding 06: localStorage Quota Can Exhaust
**Impact**: High
**Sources**: [R1-04]
**Problem**: Long sessions (1000+ messages) can exceed 5MB quota
**Root Cause**: No message pruning or quota monitoring
**Solution**: Implement message pruning (max 1000), quota detection with graceful degradation
**Action Required**: Add pruning to session store
**Affects Phases**: Phase 1, Phase 4

### High Finding 07: Mobile Virtual Keyboard Breaks Layouts
**Impact**: High
**Sources**: [R1-05, External Research]
**Problem**: Virtual keyboard reduces viewport, overlapping fixed elements
**Root Cause**: CSS `h-screen` doesn't account for keyboard
**Solution**: Use `h-dvh` (dynamic viewport height), `visualViewport` API for keyboard detection
**Action Required**: Mobile-aware CSS in Phase 4
**Affects Phases**: Phase 4

### High Finding 08: Race Condition Between SSE and State Updates
**Impact**: High
**Sources**: [R1-06]
**Problem**: SSE events can interleave with user actions, causing stale state
**Root Cause**: React batching delays SSE-triggered updates
**Solution**: Immutable merge pattern, consider `flushSync` for SSE handlers
**Action Required**: Design reducers with merge-not-replace pattern
**Affects Phases**: Phase 2, Phase 3

### Medium Finding 09: Never Disable Submit Buttons
**Impact**: Medium
**Sources**: [PL-07, R1-07]
**Problem**: Disabled buttons break accessibility (keyboard nav, screen readers)
**Root Cause**: Common anti-pattern for form validation
**Solution**: Always enable submit, validate on submission, show error messages
**Example**:
```typescript
// ❌ WRONG - Disables button
<button disabled={!isValid}>Submit</button>

// ✅ CORRECT - Always enabled, validates on submit
<button onClick={handleSubmit}>Submit</button>
{error && <span role="alert">{error}</span>}
```
**Action Required**: Never use disabled on submit buttons
**Affects Phases**: Phase 2

### Medium Finding 10: Keep Agent Events Abstracted
**Impact**: Medium
**Sources**: [PL-04]
**Problem**: Exposing raw NDJSON/stdout to UI creates coupling
**Root Cause**: Temptation to parse events in components
**Solution**: All event translation happens in adapters; UI receives only `AgentEvent` types
**Action Required**: Only import types from `@chainglass/shared`, never parse raw streams
**Affects Phases**: Phase 2, Phase 3

### Medium Finding 11: Two-Phase Markdown Rendering Unnecessary
**Impact**: Medium (Positive)
**Sources**: [Spec Clarification Q7]
**Problem**: Research suggested two-phase rendering (text during stream, markdown after)
**Root Cause**: Concern about partial markdown artifacts
**Solution**: User confirmed live markdown is acceptable ("partial md is fine")
**Action Required**: Render markdown continuously during streaming
**Affects Phases**: Phase 2

### Medium Finding 12: Existing Markdown Components Ready
**Impact**: Medium (Positive)
**Sources**: [I1-06, Spec AC-09]
**Problem**: Need markdown rendering with syntax highlighting
**Root Cause**: N/A - components exist
**Solution**: Reuse `MarkdownServer`, `CodeBlock`, `shiki-processor`, `MermaidRenderer`
**Action Required**: Import and configure existing components
**Affects Phases**: Phase 2

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: CS-4 complexity with streaming, state machines, and persistence requires comprehensive test coverage before implementation (from spec § Testing Strategy)

### Test-Driven Development

- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Test Documentation Format

Every test includes:
```typescript
it('should [behavior]', () => {
  /*
  Test Doc:
  - Why: [business/technical reason]
  - Contract: [invariant being asserted]
  - Usage Notes: [how to use the API]
  - Quality Contribution: [what failure this catches]
  - Worked Example: [inputs/outputs]
  */
  // test implementation
});
```

### Mock Usage Policy

**Policy**: Fakes only (no mocking libraries)

Per constitution and spec:
- NO `vi.mock()`, `jest.mock()`, `vi.spyOn()`, Sinon stubs
- YES full fake implementations with test helpers

**Available Fakes**:
| Fake | Purpose | Location |
|------|---------|----------|
| `FakeAgentAdapter` | Agent operations | `packages/shared/src/fakes/` |
| `FakeEventSource` | SSE connections | `test/fakes/` |
| `FakeLocalStorage` | Session persistence | `test/fakes/` |
| `FakeMatchMedia` | Responsive layout | `test/fakes/` |
| `FakeController` | SSE stream controller | `test/fakes/` |
| `FakeCopilotClient` | Copilot SDK | `packages/shared/src/fakes/` |
| `FakeProcessManager` | Claude CLI | `packages/shared/src/fakes/` |

**New Fakes to Create** (if not present):
- `FakeResizeObserver` for textarea expansion tests

### Contract Tests

Extend `agentAdapterContractTests` pattern for new interfaces:
- Session store interface
- Agent SSE event interface

---

## Implementation Phases

### Phase 1: Foundation

**Objective**: Establish session persistence, SSE schema extensions, and DI container setup.

**Deliverables**:
- Session persistence store with Zod validation
- Agent SSE event schemas (additive extension)
- DI container tokens for agent sessions
- Test infrastructure for agent components

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE schema breaks existing consumers | Low | High | Contract tests, additive-only changes |
| localStorage not available | Low | Medium | Check availability, graceful fallback |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for `AgentSessionSchema` Zod validation | 2 | Tests cover: valid session, missing fields, invalid status, message array | - | `test/unit/schemas/agent-session.schema.test.ts` |
| 1.2 | [ ] | Implement `AgentSessionSchema` and related schemas | 2 | All tests from 1.1 pass | - | `apps/web/src/lib/schemas/agent-session.schema.ts` |
| 1.3 | [ ] | Write tests for `AgentEventSchema` SSE extension | 2 | Tests cover: text_delta, session_status, usage_update, error events | - | `test/unit/schemas/agent-events.schema.test.ts` |
| 1.4 | [ ] | Implement `AgentEventSchema` (additive to existing) | 2 | All tests from 1.3 pass, existing 26 SSE tests pass (`pnpm test test/unit/web/services/sse-manager.test.ts test/unit/web/hooks/useSSE.test.ts`) | - | `apps/web/src/lib/schemas/agent-events.schema.ts` |
| 1.5 | [ ] | Write contract test: existing SSE events still parse | 1 | Contract test verifies all 7 existing event types (workflow_status, phase_status, run_status, question, answer, checkpoint, heartbeat) parse correctly with extended schema | - | `test/contracts/sse-events.contract.test.ts` |
| 1.6 | [ ] | Write tests for session store (localStorage) | 3 | Tests cover: save, load, hydration, pruning, quota handling | - | Uses `FakeLocalStorage` |
| 1.7 | [ ] | Implement `AgentSessionStore` class | 3 | All tests from 1.6 pass, two-pass hydration works | - | `apps/web/src/lib/stores/agent-session.store.ts` |
| 1.8 | [ ] | Write tests for DI container extensions | 2 | Tests cover: token registration, factory resolution, test container | - | |
| 1.9 | [ ] | Extend DI container with agent session tokens | 2 | All tests from 1.8 pass | - | `apps/web/src/lib/di-container.ts` |
| 1.10 | [ ] | Create `FakeResizeObserver` if needed | 1 | Fake implements ResizeObserver interface with test helpers | - | `test/fakes/` |

### Test Examples (Write First!)

```typescript
// test/unit/schemas/agent-session.schema.test.ts
describe('AgentSessionSchema', () => {
  it('should validate a complete session', () => {
    /*
    Test Doc:
    - Why: Ensures session data roundtrips correctly through localStorage
    - Contract: Valid sessions have id, name, agentType, status, messages array
    - Usage Notes: Use schema.safeParse() for validation
    - Quality Contribution: Catches malformed session data before it corrupts state
    - Worked Example: { id: 'uuid', name: 'Session 1', ... } → success
    */
    const validSession = {
      id: crypto.randomUUID(),
      name: 'Test Session',
      agentType: 'claude-code',
      status: 'idle',
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    const result = AgentSessionSchema.safeParse(validSession);
    expect(result.success).toBe(true);
  });

  it('should reject invalid agent type', () => {
    /*
    Test Doc:
    - Why: Prevents unknown agent types from corrupting session state
    - Contract: agentType must be 'claude-code' or 'copilot'
    - Usage Notes: Invalid types return { success: false, error: ZodError }
    - Quality Contribution: Catches integration errors with new agent types
    - Worked Example: { agentType: 'gpt-4' } → failure
    */
    const invalidSession = {
      id: crypto.randomUUID(),
      name: 'Test Session',
      agentType: 'unknown-agent', // Invalid
      status: 'idle',
      messages: [],
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
    };

    const result = AgentSessionSchema.safeParse(invalidSession);
    expect(result.success).toBe(false);
  });
});
```

### Non-Happy-Path Coverage
- [ ] Null/undefined session data
- [ ] Corrupted JSON in localStorage
- [ ] Quota exceeded error handling
- [ ] Missing required fields
- [ ] Invalid enum values

### Acceptance Criteria
- [ ] All tests passing: `pnpm test test/unit/schemas/agent-session.schema.test.ts test/unit/schemas/agent-events.schema.test.ts test/unit/stores/agent-session.store.test.ts test/contracts/sse-events.contract.test.ts`
- [ ] Test coverage >80% for new code: `pnpm test --coverage apps/web/src/lib/schemas/agent-*.ts apps/web/src/lib/stores/agent-*.ts`
- [ ] No mocks used (fakes only) - verified by grep: `grep -r "vi.mock\|jest.mock" test/unit/schemas test/unit/stores` returns empty
- [ ] Existing SSE tests still pass (26 tests): `pnpm test test/unit/web/services/sse-manager.test.ts test/unit/web/hooks/useSSE.test.ts`
- [ ] TypeScript strict mode passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint apps/web/src/lib/schemas apps/web/src/lib/stores`

---

### Phase 2: Core Chat

**Objective**: Build the primary chat interface with message streaming, markdown rendering, and input handling.

**Deliverables**:
- `useAgentSession` hook with reducer
- `AgentChatInput` component
- `StreamingMessage` component (reuses MarkdownServer)
- `AgentChatView` container component
- `AgentStatusIndicator` component

**Dependencies**: Phase 1 complete (schemas, store)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Markdown streaming artifacts | Medium | Low | Live rendering acceptable per spec |
| Input focus management | Low | Medium | Test keyboard navigation |
| Scroll position jumps | Medium | Medium | Smart scroll management |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for `sessionReducer` state transitions | 3 | Tests cover: all action types, invalid transitions rejected | - | Pure reducer tests |
| 2.2 | [ ] | Implement `sessionReducer` | 2 | All tests from 2.1 pass | - | `apps/web/src/hooks/useAgentSession.ts` |
| 2.3 | [ ] | Write tests for `useAgentSession` hook | 2 | Tests cover: action dispatch, state updates, memoization | - | Uses `renderHook` |
| 2.4 | [ ] | Implement `useAgentSession` hook | 2 | All tests from 2.3 pass | - | |
| 2.5 | [ ] | Write tests for `AgentChatInput` | 2 | Tests cover: message submit (Enter key, button click), keyboard nav (Tab, Shift+Enter for newline), accessibility (submit never disabled, error messages) | - | Slash commands tested in Phase 4 |
| 2.6 | [ ] | Implement `AgentChatInput` component | 2 | All tests from 2.5 pass | - | `apps/web/src/components/agents/` |
| 2.7 | [ ] | Write tests for `StreamingMessage` | 2 | Tests cover: partial content, completed content, markdown rendering | - | Uses existing MarkdownServer |
| 2.8 | [ ] | Implement `StreamingMessage` component | 2 | All tests from 2.7 pass | - | |
| 2.9 | [ ] | Write tests for `AgentStatusIndicator` | 1 | Tests cover: all status states, color mapping | - | |
| 2.10 | [ ] | Implement `AgentStatusIndicator` component | 1 | All tests from 2.9 pass | - | |
| 2.11 | [ ] | Write tests for `AgentChatView` assembly | 3 | Tests cover: message display, input integration, status bar | - | Integration test |
| 2.12 | [ ] | Implement `AgentChatView` component | 3 | All tests from 2.11 pass | - | |
| 2.13 | [ ] | Write tests for context window usage display | 1 | Tests cover: percentage calculation, warning thresholds | - | |
| 2.14 | [ ] | Implement context window UI in status bar | 1 | All tests from 2.13 pass | - | |

### Test Examples (Write First!)

```typescript
// test/unit/hooks/useAgentSession.test.ts
describe('sessionReducer', () => {
  it('should transition from idle to running on START_RUN', () => {
    /*
    Test Doc:
    - Why: Running state enables streaming and disables input submission
    - Contract: idle → running is valid; running → running is no-op
    - Usage Notes: Dispatch START_RUN before sending message to adapter
    - Quality Contribution: Prevents double-submission during agent run
    - Worked Example: { status: 'idle' } + START_RUN → { status: 'running' }
    */
    const initialState = createTestSession({ status: 'idle' });
    const result = sessionReducer(initialState, { type: 'START_RUN' });
    expect(result.status).toBe('running');
  });

  it('should reject START_RUN when already running', () => {
    /*
    Test Doc:
    - Why: Prevents state corruption from duplicate actions
    - Contract: running → running returns unchanged state
    - Usage Notes: Check state before dispatching to avoid unnecessary renders
    - Quality Contribution: Catches double-click or rapid fire bugs
    - Worked Example: { status: 'running' } + START_RUN → { status: 'running' } (same ref)
    */
    const initialState = createTestSession({ status: 'running' });
    const result = sessionReducer(initialState, { type: 'START_RUN' });
    expect(result).toBe(initialState); // Same reference
  });
});

// test/unit/components/agents/agent-chat-input.test.tsx

// Fake callback tracker (no vi.fn() - fakes over mocks)
class FakeMessageHandler {
  calls: string[] = [];
  onMessage = (msg: string) => { this.calls.push(msg); };
  assertCalledWith(expected: string) {
    expect(this.calls).toContain(expected);
  }
}

describe('AgentChatInput', () => {
  it('should submit message on Enter key', () => {
    /*
    Test Doc:
    - Why: Standard chat UX expects Enter to submit
    - Contract: Enter key triggers onMessage callback with input value
    - Usage Notes: Shift+Enter should insert newline (not submit)
    - Quality Contribution: Catches keyboard handling regressions
    - Worked Example: Type "hello" + Enter → onMessage("hello")
    */
    const handler = new FakeMessageHandler();
    render(<AgentChatInput onMessage={handler.onMessage} />);

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'hello{Enter}');

    handler.assertCalledWith('hello');
  });

  it('should never disable submit button', () => {
    /*
    Test Doc:
    - Why: Disabled buttons break accessibility (PL-07)
    - Contract: Submit button is always enabled regardless of form state
    - Usage Notes: Validate on submit, show error messages instead
    - Quality Contribution: Ensures keyboard navigation works for all users
    - Worked Example: Empty input + click Submit → shows error, button still enabled
    */
    const handler = new FakeMessageHandler();
    render(<AgentChatInput onMessage={handler.onMessage} />);

    const submitButton = screen.getByRole('button', { name: /send/i });
    expect(submitButton).not.toBeDisabled();
    expect(submitButton).toHaveAttribute('aria-disabled', 'false');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Empty message submission
- [ ] Very long messages (>10KB)
- [ ] Rapid message submission
- [ ] Network error during streaming
- [ ] Session becomes archived while typing

### Acceptance Criteria
- [ ] All tests passing: `pnpm test test/unit/hooks/useAgentSession.test.ts test/unit/components/agents/*.test.tsx`
- [ ] Test coverage >80%: `pnpm test --coverage apps/web/src/hooks/useAgentSession.ts apps/web/src/components/agents/`
- [ ] Keyboard navigation works (Tab, Enter, Escape) - verified by test output
- [ ] Submit button never disabled - verified by test: `grep -l "toBeDisabled" test/unit/components/agents/agent-chat-input.test.tsx` shows accessibility test
- [ ] Markdown renders correctly (code blocks, links, lists) - verified by StreamingMessage tests
- [ ] Status indicator shows correct colors - verified by AgentStatusIndicator tests
- [ ] Lint passes: `pnpm lint apps/web/src/hooks/useAgentSession.ts apps/web/src/components/agents/`
- [ ] TypeScript strict mode: `pnpm typecheck`

---

### Phase 3: Multi-Session

**Objective**: Enable multiple concurrent agent sessions with easy switching and orchestrated state management.

**Deliverables**:
- `useAgentSessions` hook for orchestration
- `AgentSessionCard` component
- `AgentSessionList` component
- `NewAgentDialog` component
- `AgentSessionManager` container
- Agent routes (`/agents`, `/agents/[sessionId]`)

**Dependencies**: Phase 2 complete (chat components)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Re-render cascade on session update | Medium | Medium | Memoization, callback pattern |
| SSE connection per session | Low | Medium | Verify SSE supports multi-channel |
| Session switching loses scroll | Low | Low | Preserve scroll per session |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for `sessionsReducer` | 3 | Tests cover: create, update, delete, archive, restore, batch | - | Pure reducer tests |
| 3.2 | [ ] | Implement `sessionsReducer` | 2 | All tests from 3.1 pass | - | |
| 3.3 | [ ] | Write tests for `useAgentSessions` hook | 3 | Tests cover: CRUD operations, active session, selectors | - | |
| 3.4 | [ ] | Implement `useAgentSessions` hook | 3 | All tests from 3.3 pass | - | |
| 3.5 | [ ] | Write tests for `AgentSessionCard` | 2 | Tests cover: display, status, click handler, memoization | - | |
| 3.6 | [ ] | Implement `AgentSessionCard` component | 2 | All tests from 3.5 pass | - | |
| 3.7 | [ ] | Write tests for `AgentSessionList` | 2 | Tests cover: sorting, grouping, empty state | - | |
| 3.8 | [ ] | Implement `AgentSessionList` component | 2 | All tests from 3.7 pass | - | |
| 3.9 | [ ] | Write tests for `NewAgentDialog` | 2 | Tests cover: agent type selection, naming, validation | - | |
| 3.10 | [ ] | Implement `NewAgentDialog` component | 2 | All tests from 3.9 pass | - | |
| 3.11 | [ ] | Write tests for session persistence integration | 2 | Tests cover: save on change, load on mount, 500ms debounce (verify: 3 rapid updates → single localStorage.setItem after 500ms) | - | Uses FakeLocalStorage |
| 3.12 | [ ] | Integrate persistence with `useAgentSessions` | 2 | All tests from 3.11 pass | - | |
| 3.13 | [ ] | Write tests for `AgentSessionManager` | 3 | Tests cover: SSE subscription, adapter calls, state updates | - | Integration test |
| 3.14 | [ ] | Implement `AgentSessionManager` component | 3 | All tests from 3.13 pass | - | |
| 3.15 | [ ] | Create `/agents` route (page.tsx) | 2 | Route renders, session list displays | - | `apps/web/app/(dashboard)/agents/` |
| 3.16 | [ ] | Create `/agents/[sessionId]` route | 2 | Route renders, chat view displays for session | - | |

### Test Examples (Write First!)

```typescript
// test/unit/hooks/useAgentSessions.test.ts
describe('useAgentSessions', () => {
  it('should create new session and make it active', () => {
    /*
    Test Doc:
    - Why: New sessions should be immediately usable
    - Contract: createSession() adds session to map and sets it as active
    - Usage Notes: Session ID is provided, not generated
    - Quality Contribution: Prevents orphaned sessions
    - Worked Example: createSession({ id: 'abc' }) → activeSessionId === 'abc'
    */
    const { result } = renderHook(() => useAgentSessions());

    const newSession = createTestSession({ id: 'test-session' });
    act(() => {
      result.current.actions.createSession(newSession);
    });

    expect(result.current.state.activeSessionId).toBe('test-session');
    expect(result.current.selectors.getActiveSession()).toEqual(newSession);
  });

  it('should not re-render siblings when one session updates', () => {
    /*
    Test Doc:
    - Why: Performance - updating session A shouldn't re-render session B card
    - Contract: Session cards are memoized, only re-render on own data change
    - Usage Notes: Use React.memo and stable callbacks
    - Quality Contribution: Prevents lag with 10+ sessions
    - Worked Example: Update session A status → session B render count unchanged
    */
    const renderCounts = { sessionA: 0, sessionB: 0 };
    // ... test implementation
  });
});

// test/unit/components/agents/agent-session-list.test.tsx
describe('AgentSessionList', () => {
  it('should sort sessions: running > waiting > idle > archived', () => {
    /*
    Test Doc:
    - Why: Active sessions should be prominently visible
    - Contract: List order is running, waiting_input, idle, then archived (collapsed)
    - Usage Notes: Archived sessions are in collapsible section
    - Quality Contribution: Catches sorting regressions
    - Worked Example: [idle, running, archived] → displays [running, idle, (archived)]
    */
    const sessions = [
      createTestSession({ id: '1', status: 'idle' }),
      createTestSession({ id: '2', status: 'running' }),
      createTestSession({ id: '3', status: 'archived' }),
    ];

    render(<AgentSessionList sessions={sessions} />);

    const cards = screen.getAllByRole('button');
    // Running should be first
    expect(cards[0]).toHaveTextContent('Session 2');
  });
});
```

### Non-Happy-Path Coverage
- [ ] Create session while another is running
- [ ] Switch session while message streaming
- [ ] Archive active session
- [ ] Restore to full session list (>10 active)
- [ ] Delete session with unsaved messages

### Acceptance Criteria
- [ ] All tests passing: `pnpm test test/unit/hooks/useAgentSessions.test.ts test/unit/components/agents/agent-session-*.test.tsx test/integration/agents/`
- [ ] Test coverage >80%: `pnpm test --coverage apps/web/src/hooks/useAgentSessions.ts apps/web/src/components/agents/`
- [ ] Can create Claude Code and Copilot sessions - verified by NewAgentDialog tests
- [ ] Sessions persist across browser refresh - verified by persistence integration tests (uses FakeLocalStorage)
- [ ] Switching sessions preserves scroll position - verified by AgentSessionManager tests
- [ ] Archived sessions are collapsible - verified by AgentSessionList tests
- [ ] Soft warning at 10+ active sessions - verified by useAgentSessions tests
- [ ] Lint passes: `pnpm lint apps/web/src/hooks/useAgentSessions.ts apps/web/src/components/agents/ apps/web/app/\(dashboard\)/agents/`
- [ ] TypeScript strict mode: `pnpm typecheck`

---

### Phase 4: Polish

**Objective**: Implement remaining UX features, responsive design, and accessibility improvements.

**Deliverables**:
- Slash command handlers (`/compact`, `/help`, `/clear`)
- Archive/restore workflow
- Responsive mobile layout
- Accessibility improvements (ARIA, keyboard)
- Error boundary and graceful error display

**Dependencies**: Phase 3 complete (multi-session)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Mobile keyboard overlap | Medium | Medium | visualViewport API |
| Slash command parsing edge cases | Low | Low | Thorough regex testing |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for slash command parsing | 2 | Tests cover: /compact, /help, /clear, unknown commands | - | |
| 4.2 | [ ] | Implement slash command handler | 2 | All tests from 4.1 pass | - | |
| 4.3 | [ ] | Write tests for archive/restore workflow | 2 | Tests cover: archive, restore, confirm dialog | - | |
| 4.4 | [ ] | Implement archive/restore UI flow | 2 | All tests from 4.3 pass | - | |
| 4.5 | [ ] | Write tests for mobile responsive layout | 2 | Tests cover: viewport breakpoints (mobile 375px, tablet 768px, desktop 1024px), virtual keyboard detection via visualViewport API | - | Uses FakeMatchMedia |
| 4.6 | [ ] | Implement responsive CSS with `h-dvh` | 2 | All tests from 4.5 pass | - | |
| 4.7 | [ ] | Write tests for ARIA attributes | 1 | Tests cover: live regions, roles, labels | - | |
| 4.8 | [ ] | Implement accessibility improvements | 2 | All tests from 4.7 pass | - | |
| 4.9 | [ ] | Write tests for error boundary | 1 | Tests cover: render error, reset button | - | |
| 4.10 | [ ] | Implement error boundary component | 1 | All tests from 4.9 pass | - | |
| 4.11 | [ ] | Write tests for connection error display | 2 | Tests cover: SSE disconnect, reconnect, retry | - | |
| 4.12 | [ ] | Implement connection error UI | 2 | All tests from 4.11 pass | - | |

### Test Examples (Write First!)

```typescript
// test/unit/utils/slash-commands.test.ts
describe('parseSlashCommand', () => {
  it('should parse /compact command', () => {
    /*
    Test Doc:
    - Why: /compact triggers context window reduction
    - Contract: Input starting with /compact returns { command: 'compact', args: [] }
    - Usage Notes: Case-insensitive matching
    - Quality Contribution: Catches command parsing regressions
    - Worked Example: "/compact" → { command: 'compact', args: [] }
    */
    const result = parseSlashCommand('/compact');
    expect(result).toEqual({ command: 'compact', args: [] });
  });

  it('should return null for non-command input', () => {
    /*
    Test Doc:
    - Why: Regular messages shouldn't be treated as commands
    - Contract: Input not starting with / returns null
    - Usage Notes: Check for null before executing command
    - Quality Contribution: Prevents false command detection
    - Worked Example: "hello /compact" → null (not a command)
    */
    const result = parseSlashCommand('hello /compact');
    expect(result).toBeNull();
  });
});
```

### Non-Happy-Path Coverage
- [ ] Unknown slash command
- [ ] Slash command with malformed args
- [ ] Archive while offline
- [ ] Restore corrupted session
- [ ] SSE reconnect fails multiple times

### Acceptance Criteria
- [ ] All tests passing: `pnpm test test/unit/utils/slash-commands.test.ts test/unit/components/agents/*error*.test.tsx test/unit/components/agents/*responsive*.test.tsx`
- [ ] Slash commands work correctly - verified by parseSlashCommand tests (/compact, /help, /clear, unknown)
- [ ] Mobile layout functional (no keyboard overlap) - verified by responsive tests at breakpoints: mobile (375px), tablet (768px), desktop (1024px) using FakeMatchMedia
- [ ] Screen reader announces new messages - verified by ARIA tests: `grep -l "role=\"alert\"\|aria-live" test/unit/components/agents/`
- [ ] Error states display gracefully - verified by error boundary and connection error tests
- [ ] Retry button works for connection errors - verified by connection error UI tests
- [ ] Lint passes: `pnpm lint apps/web/src/utils/slash-commands.ts apps/web/src/components/agents/`
- [ ] TypeScript strict mode: `pnpm typecheck`

---

### Phase 5: Integration Testing

**Objective**: End-to-end testing with real agent adapters (feature-flagged), performance validation, and production readiness.

**Deliverables**:
- E2E tests with real Claude Code adapter
- E2E tests with real Copilot adapter
- Performance tests for 100+ messages
- Feature flag for agent UI
- Documentation in `docs/how/web-agents.md`

**Dependencies**: Phase 4 complete (polish)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Real adapter tests flaky | Medium | Low | Retry logic, longer timeouts |
| Performance degrades at scale | Medium | Medium | Message virtualization if needed |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write E2E test: create Claude Code session | 3 | Test creates session, sends message, receives streaming response | - | Requires real adapter |
| 5.2 | [ ] | Write E2E test: create Copilot session | 3 | Test creates session, sends message, receives response | - | |
| 5.3 | [ ] | Write E2E test: stop running agent | 2 | Test sends stop, agent terminates, session goes idle | - | |
| 5.4 | [ ] | Write E2E test: session persistence | 2 | Test creates session, refreshes page, session restored | - | |
| 5.5 | [ ] | Write performance test: 100+ messages | 2 | Run `pnpm test test/e2e/agents/performance.test.ts`, verify: FPS ≥58/60 during scroll, heap memory ≤100MB after rendering 100 messages, no memory leaks on session switch | - | Uses Playwright performance API |
| 5.6 | [ ] | Implement feature flag for agent UI | 1 | Feature flag `NEXT_PUBLIC_ENABLE_AGENTS` in `.env.local`, agent routes hidden when false, documented in `docs/how/web-agents.md` | - | |
| 5.7 | [ ] | Write documentation: `docs/how/web-agents.md` | 2 | Covers: architecture, usage, testing, troubleshooting, feature flag configuration | - | Per spec Documentation Strategy |
| 5.8 | [ ] | Final accessibility audit | 2 | Run accessibility audit, verify WCAG 2.1 AA: color contrast ≥4.5:1 (check with axe), keyboard navigation complete (Tab through all controls), screen reader announces status changes (verify aria-live regions) | - | |

### Test Examples (Write First!)

```typescript
// test/e2e/agents/create-session.e2e.test.ts
describe('Agent Session E2E', () => {
  it('should create Claude Code session and receive streaming response', async () => {
    /*
    Test Doc:
    - Why: Validates full integration path from UI to adapter
    - Contract: User can create session, send message, see streaming response
    - Usage Notes: Requires CLAUDE_API_KEY in env, uses real adapter
    - Quality Contribution: Catches integration issues not caught by unit tests
    - Worked Example: Create session → send "hello" → see streaming "Hello!" response
    */
    // Navigate to agents page
    await page.goto('/agents');

    // Create new session
    await page.click('[data-testid="new-agent-button"]');
    await page.click('[data-testid="agent-type-claude-code"]');
    await page.fill('[data-testid="session-name"]', 'E2E Test Session');
    await page.click('[data-testid="create-session"]');

    // Send message
    await page.fill('[data-testid="chat-input"]', 'Say hello');
    await page.press('[data-testid="chat-input"]', 'Enter');

    // Wait for streaming response
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 30000 });

    // Verify response contains text
    const response = await page.textContent('[data-testid="assistant-message"]');
    expect(response.length).toBeGreaterThan(0);
  }, 60000);
});
```

### Non-Happy-Path Coverage
- [ ] Agent adapter unavailable
- [ ] API rate limit hit
- [ ] Network timeout during streaming
- [ ] Browser memory pressure

### Acceptance Criteria
- [ ] All E2E tests passing: `pnpm test test/e2e/agents/*.test.ts` (requires `CLAUDE_API_KEY` or `COPILOT_TOKEN` in env, skipped if unavailable)
- [ ] Performance meets targets: `pnpm test test/e2e/agents/performance.test.ts` shows FPS ≥58/60, heap ≤100MB
- [ ] Feature flag works correctly: verify `NEXT_PUBLIC_ENABLE_AGENTS=false` hides `/agents` route from navigation
- [ ] Documentation complete: `docs/how/web-agents.md` exists with sections: overview, architecture, usage, testing, troubleshooting
- [ ] Accessibility audit passes: run axe-core via `pnpm exec playwright test --project=accessibility`, verify zero critical/serious violations, WCAG 2.1 AA compliant (color contrast ≥4.5:1, keyboard nav complete)
- [ ] All phases complete: `pnpm test` passes all 50 tasks across phases 1-5

---

## Cross-Cutting Concerns

### Security Considerations

- **Input Validation**: All user input validated via Zod schemas before processing
- **SSE Event Validation**: Agent events validated with `AgentEventSchema` before rendering
- **localStorage**: No sensitive data (API keys, tokens) stored in localStorage
- **XSS Prevention**: Markdown rendered via react-markdown with default sanitization

### Observability

- **Logging Strategy**: Use existing `ILogger` via DI container for all new components
- **Metrics**: Log session creation, message submission, error rates
- **Error Tracking**: Errors logged with session context for debugging

### Documentation

- **Location**: `docs/how/web-agents.md` (per spec Documentation Strategy)
- **Content Structure**:
  1. Overview and architecture
  2. Session management patterns
  3. SSE integration guide
  4. Available fakes for testing
  5. Troubleshooting common issues
- **Target Audience**: Developers extending or maintaining the agent UI
- **Maintenance**: Update when session management or SSE patterns change

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Feature | 4 | Large | S=2,I=1,D=1,N=1,F=1,T=2 | Many new files, uses existing adapters+SSE, new localStorage persistence, patterns researched, streaming performance, needs integration tests | Phased rollout, feature flag, comprehensive tests |
| Session Store | 3 | Medium | S=1,I=1,D=1,N=0,F=1,T=1 | Single file, localStorage integration, new schema, known patterns, quota handling | Zod validation, message pruning |
| useAgentSessions | 3 | Medium | S=1,I=1,D=1,N=0,F=1,T=1 | Hook + reducer, SSE integration, Map state, known patterns, memoization | Callback pattern, memo |
| AgentChatView | 3 | Medium | S=1,I=1,D=0,N=0,F=1,T=2 | Component tree, SSE + existing markdown, no new data, known patterns, streaming render, needs integration tests | Reuse existing components |

---

## Progress Tracking

### Phase Completion Checklist

- [x] Phase 1: Foundation - COMPLETE (2026-01-26)
- [ ] Phase 2: Core Chat - PENDING
- [ ] Phase 3: Multi-Session - PENDING
- [ ] Phase 4: Polish - PENDING
- [ ] Phase 5: Integration Testing - PENDING

### STOP Rule

**IMPORTANT**: This plan was validated on 2026-01-26 (v1.1.0).

**Validation Status**: ✅ READY
- All HIGH severity violations fixed
- Test commands specified for all phases
- Source notation legend added
- Test examples use fakes (not vi.fn())

**Next Step**: Run `/plan-5-phase-tasks-and-brief --phase "Phase 2: Core Chat"` to generate Phase 2 task dossier

---

## Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

**Initial State** (before implementation begins):
```markdown
[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
...
```

---

**Plan Created**: 2026-01-26
**Plan Validated**: 2026-01-26 (v1.1.0 - fixes applied for HIGH violations)
**Next Step**: Run `/plan-5-phase-tasks-and-brief --phase "Phase 2: Core Chat"` to generate Phase 2 task dossier
