# Phase 2: Core Chat – Tasks & Alignment Brief

**Spec**: [../../web-agents-spec.md](../../web-agents-spec.md)
**Plan**: [../../web-agents-plan.md](../../web-agents-plan.md)
**Date**: 2026-01-26

---

## Executive Briefing

### Purpose

This phase implements a **standalone Agents page** with full-featured agent interaction: real SSE streaming, session state management, message rendering, and agent creation. This is a **SPIKE/MVP** - a working vertical slice, not integrated with kanban boards yet.

### What We're Building

A standalone `/agents` page with complete agent interaction:
- **`/agents` route**: Standalone page accessible from main navigation menu
- **Agent creation form**: Create new agent sessions (name + agent type selector)
- **Agent list view**: See all agent sessions, click to switch between them
- **sessionReducer**: Pure reducer for session state machine (idle → running → completed → error)
- **useAgentSession hook**: React hook wrapping reducer with dispatch, integrating with SSE via `useSSE`
- **AgentChatInput**: Text input component with Cmd/Ctrl+Enter to submit
- **LogEntry/StreamingMessage**: Terminal-style message rendering with live markdown
- **AgentStatusIndicator**: Visual status display (running=blue pulse, idle=gray, error=red)
- **Context window display**: Token usage percentage with warning thresholds

**NOT building** (from kanban prototype):
- Question UI (QuestionInput, QuestionPanel) - not needed for standalone agent interaction
- Kanban board integration - deferred to later phase

### User Value

Users will be able to:
- Create new agent sessions with a name and agent type (claude-code, copilot, generic)
- See all their agent sessions in a list view
- Click to switch between active agent sessions
- Send messages to agents and see real-time streaming responses
- See properly formatted markdown with syntax highlighting
- Understand agent status at a glance via color indicators
- Monitor context window usage to avoid hitting limits

### Example

**Before**: Phase 1 provides schemas and storage, but no UI to interact with agents.

**After**:
```typescript
// Session reducer handles state transitions
const { state, dispatch } = useAgentSession(sessionId);

// User types message and presses Enter
dispatch({ type: 'START_RUN' }); // idle → running
await sendToAgent(message);

// SSE events update state as agent responds
// agent_text_delta → APPEND_DELTA action → streaming message updates
// agent_session_status → UPDATE_STATUS action → status indicator updates

dispatch({ type: 'COMPLETE_RUN' }); // running → idle
```

---

## Objectives & Scope

### Objective

Build the primary chat interface with message streaming, markdown rendering, and input handling as specified in Plan Phase 2. This phase must pass all quality gates before Phase 3 (Multi-Session) can begin.

**Behavior Checklist** (from Plan acceptance criteria):
- [ ] All tests passing: `pnpm test test/unit/web/hooks/useAgentSession.test.ts test/unit/web/components/agents/*.test.tsx`
- [ ] Test coverage >80%
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Submit button never disabled
- [ ] Markdown renders correctly (code blocks, links, lists)
- [ ] Status indicator shows correct colors
- [ ] Lint passes
- [ ] TypeScript strict mode passes

### Goals

- ✅ Create standalone `/agents` route with page layout
- ✅ Implement agent creation form (name + agent type selector)
- ✅ Implement agent list view with click-to-switch
- ✅ Add Agents link to main navigation menu
- ✅ Implement `sessionReducer` with state transitions (idle, running, completed, error)
- ✅ Implement `useAgentSession` hook with action dispatch and SSE integration
- ✅ Create `AgentChatInput` with Cmd/Ctrl+Enter to submit
- ✅ Create `LogEntry`/`StreamingMessage` for terminal-style message rendering
- ✅ Create `AgentStatusIndicator` with color mapping for all states
- ✅ Implement context window usage display with warning thresholds

### Non-Goals

- ❌ Kanban board integration (future phase)
- ❌ Question UI (QuestionInput, QuestionPanel) - not needed for standalone
- ❌ Slash command processing (`/compact`, `/help`) (Phase 4)
- ❌ Archive/restore functionality (Phase 4)
- ❌ Mobile-specific layouts or h-dvh optimization (Phase 4)
- ❌ Message virtualization (react-window) – defer unless performance issues observed
- ❌ Two-phase markdown rendering – live markdown confirmed acceptable (MF-11)
- ❌ `waiting_input` status - that was for question UI which we're not building

---

## Architecture Map

### Component Diagram
<!-- Status: grey=pending, orange=in-progress, green=completed, red=blocked -->
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff

    subgraph Phase["Phase 2: Standalone Agents Page"]
        direction TB

        subgraph Hooks["State Management (T001-T004)"]
            T001["T001: sessionReducer tests ✓"]:::completed
            T002["T002: sessionReducer"]:::inprogress
            T003["T003: useAgentSession tests"]:::pending
            T004["T004: useAgentSession"]:::pending
            T001 --> T002 --> T003 --> T004
        end

        subgraph Core["Core Components (T005-T012)"]
            T005["T005: AgentChatInput tests"]:::pending
            T006["T006: AgentChatInput"]:::pending
            T007["T007: LogEntry tests"]:::pending
            T008["T008: LogEntry"]:::pending
            T009["T009: StatusIndicator tests"]:::pending
            T010["T010: StatusIndicator"]:::pending
            T011["T011: ContextWindow tests"]:::pending
            T012["T012: ContextWindow"]:::pending

            T005 --> T006
            T007 --> T008
            T009 --> T010
            T011 --> T012
        end

        subgraph Page["Standalone Page (T013-T019)"]
            T013["T013: CreationForm tests"]:::pending
            T014["T014: CreationForm"]:::pending
            T015["T015: AgentListView tests"]:::pending
            T016["T016: AgentListView"]:::pending
            T017["T017: /agents page tests"]:::pending
            T018["T018: /agents page"]:::pending
            T019["T019: Navigation"]:::pending

            T013 --> T014
            T015 --> T016
            T017 --> T018 --> T019
        end

        T004 --> T005
        T004 --> T007
        T006 --> T017
        T008 --> T017
        T010 --> T015
        T012 --> T017
        T014 --> T017
        T016 --> T017
    end
```

### Task-to-Component Mapping

<!-- Status: ⬜ Pending | 🟧 In Progress | ✅ Complete | 🔴 Blocked -->

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T001 | sessionReducer Tests | `/test/unit/web/hooks/useAgentSession.test.ts` | ✅ Complete | TDD RED: 23 tests written |
| T002 | sessionReducer | `/apps/web/src/hooks/useAgentSession.ts` | 🟧 In Progress | TDD GREEN: pure reducer |
| T003 | useAgentSession Tests | `/test/unit/web/hooks/useAgentSession.test.ts` | ⬜ Pending | TDD RED: hook integration |
| T004 | useAgentSession | `/apps/web/src/hooks/useAgentSession.ts` | ⬜ Pending | TDD GREEN: hook + SSE |
| T005 | AgentChatInput Tests | `/test/unit/web/components/agents/agent-chat-input.test.tsx` | ⬜ Pending | TDD RED: input behavior |
| T006 | AgentChatInput | `/apps/web/src/components/agents/agent-chat-input.tsx` | ⬜ Pending | TDD GREEN: Cmd+Enter submit |
| T007 | LogEntry Tests | `/test/unit/web/components/agents/log-entry.test.tsx` | ⬜ Pending | TDD RED: terminal-style |
| T008 | LogEntry | `/apps/web/src/components/agents/log-entry.tsx` | ⬜ Pending | TDD GREEN: message rendering |
| T009 | AgentStatusIndicator Tests | `/test/unit/web/components/agents/agent-status-indicator.test.tsx` | ⬜ Pending | TDD RED: colors |
| T010 | AgentStatusIndicator | `/apps/web/src/components/agents/agent-status-indicator.tsx` | ⬜ Pending | TDD GREEN: status badge |
| T011 | ContextWindowDisplay Tests | `/test/unit/web/components/agents/context-window-display.test.tsx` | ⬜ Pending | TDD RED: progress bar |
| T012 | ContextWindowDisplay | `/apps/web/src/components/agents/context-window-display.tsx` | ⬜ Pending | TDD GREEN: usage display |
| T013 | AgentCreationForm Tests | `/test/unit/web/components/agents/agent-creation-form.test.tsx` | ⬜ Pending | TDD RED: form |
| T014 | AgentCreationForm | `/apps/web/src/components/agents/agent-creation-form.tsx` | ⬜ Pending | TDD GREEN: name + type |
| T015 | AgentListView Tests | `/test/unit/web/components/agents/agent-list-view.test.tsx` | ⬜ Pending | TDD RED: list |
| T016 | AgentListView | `/apps/web/src/components/agents/agent-list-view.tsx` | ⬜ Pending | TDD GREEN: session list |
| T017 | /agents Page Tests | `/test/unit/web/app/agents/page.test.tsx` | ⬜ Pending | TDD RED: integration |
| T018 | /agents Page | `/apps/web/app/(dashboard)/agents/page.tsx` | ⬜ Pending | TDD GREEN: standalone page |
| T019 | Navigation Update | `/apps/web/src/components/layout/` | ⬜ Pending | Add Agents link |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|----|------|--------------|------------------|------------|----------|-------|
| [x] | T001 | Write tests for `sessionReducer` state transitions | 3 | Test | – | `/home/jak/substrate/007-manage-workflows/test/unit/web/hooks/useAgentSession.test.ts` | Tests cover: all action types (START_RUN, APPEND_DELTA, UPDATE_STATUS, COMPLETE_RUN, SET_ERROR, CLEAR_ERROR), invalid transitions rejected (same ref returned), merge-not-replace for deltas | – | Per HF-08: merge-not-replace pattern |
| [~] | T002 | Implement `sessionReducer` | 2 | Core | T001 | `/home/jak/substrate/007-manage-workflows/apps/web/src/hooks/useAgentSession.ts` | All T001 tests pass; pure function with state machine transitions; handles concurrent SSE events safely | – | States: idle, running, completed, error (no waiting_input) |
| [ ] | T003 | Write tests for `useAgentSession` hook | 2 | Test | T002 | `/home/jak/substrate/007-manage-workflows/test/unit/web/hooks/useAgentSession.test.ts` | Tests cover: action dispatch, state updates via reducer, memoization (dispatch stable across renders), integration with session store | – | Uses renderHook |
| [ ] | T004 | Implement `useAgentSession` hook | 2 | Core | T003 | `/home/jak/substrate/007-manage-workflows/apps/web/src/hooks/useAgentSession.ts` | All T003 tests pass; wraps sessionReducer; dispatch is memoized; loads from AgentSessionStore (Phase 1) | – | |
| [ ] | T005 | Write tests for `AgentChatInput` component | 2 | Test | T004 | `/home/jak/substrate/007-manage-workflows/test/unit/web/components/agents/agent-chat-input.test.tsx` | Tests cover: Cmd/Ctrl+Enter submits, button click submits, empty input disabled, Tab navigation, ARIA labels | – | Follows prototype pattern |
| [ ] | T006 | Implement `AgentChatInput` component | 2 | Core | T005 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/agents/agent-chat-input.tsx` | All T005 tests pass; textarea with Cmd/Ctrl+Enter shortcut; keyboard hint in footer | – | Based on prototype |
| [ ] | T007 | Write tests for `LogEntry` (StreamingMessage) component | 2 | Test | T004 | `/home/jak/substrate/007-manage-workflows/test/unit/web/components/agents/log-entry.test.tsx` | Tests cover: user/assistant/tool/system rendering, streaming indicator, tool expansion, markdown rendering | – | Terminal-style design |
| [ ] | T008 | Implement `LogEntry` component | 2 | Core | T007 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/agents/log-entry.tsx` | All T007 tests pass; terminal-style rendering; reuses MarkdownServer for content | – | Based on prototype LogEntry |
| [ ] | T009 | Write tests for `AgentStatusIndicator` component | 1 | Test | – | `/home/jak/substrate/007-manage-workflows/test/unit/web/components/agents/agent-status-indicator.test.tsx` | Tests cover: status states (idle, running, completed, error), color mapping (running=blue, idle=gray, error=red), ARIA live region | – | No waiting_input status |
| [ ] | T010 | Implement `AgentStatusIndicator` component | 1 | Core | T009 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/agents/agent-status-indicator.tsx` | All T009 tests pass; color-coded status with pulsing animation for running | – | |
| [ ] | T011 | Write tests for `ContextWindowDisplay` | 1 | Test | – | `/home/jak/substrate/007-manage-workflows/test/unit/web/components/agents/context-window-display.test.tsx` | Tests cover: percentage, warning at >75%, critical at >90%, unavailable graceful | – | |
| [ ] | T012 | Implement `ContextWindowDisplay` component | 1 | Core | T011 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/agents/context-window-display.tsx` | All T011 tests pass; compact progress bar with colors | – | Based on prototype |
| [ ] | T013 | Write tests for `AgentCreationForm` | 2 | Test | – | `/home/jak/substrate/007-manage-workflows/test/unit/web/components/agents/agent-creation-form.test.tsx` | Tests cover: name input, agent type selector, form submission, validation | – | Standalone page feature |
| [ ] | T014 | Implement `AgentCreationForm` component | 2 | Core | T013 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/agents/agent-creation-form.tsx` | All T013 tests pass; name input + agent type dropdown; calls onCreate callback | – | |
| [ ] | T015 | Write tests for `AgentListView` | 2 | Test | T010 | `/home/jak/substrate/007-manage-workflows/test/unit/web/components/agents/agent-list-view.test.tsx` | Tests cover: list rendering, click to select, active indicator, empty state | – | Standalone page feature |
| [ ] | T016 | Implement `AgentListView` component | 2 | Core | T015 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/agents/agent-list-view.tsx` | All T015 tests pass; shows all sessions with status, click to switch | – | |
| [ ] | T017 | Write tests for `/agents` page | 3 | Test | T006, T008, T012, T014, T016 | `/home/jak/substrate/007-manage-workflows/test/unit/web/app/agents/page.test.tsx` | Tests cover: page renders, list + chat view integration, creation flow | – | Integration test |
| [ ] | T018 | Implement `/agents` route and page | 3 | Core | T017 | `/home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/agents/page.tsx` | All T017 tests pass; standalone agents page with list, creation, chat view | – | Main deliverable |
| [ ] | T019 | Add Agents to main navigation | 1 | Core | T018 | `/home/jak/substrate/007-manage-workflows/apps/web/src/components/layout/` | Agents link visible in sidebar/nav; navigates to /agents | – | |

---

## Alignment Brief

### Prior Phases Review

#### Phase 1: Foundation (Complete ✅)

**A. Deliverables Created**

| File | Purpose | Key Exports |
|------|---------|-------------|
| `/home/jak/substrate/007-manage-workflows/apps/web/src/lib/schemas/agent-session.schema.ts` | Session validation | `AgentSessionSchema`, `AgentMessageSchema`, `SessionStatusSchema`, `AgentTypeSchema` |
| `/home/jak/substrate/007-manage-workflows/apps/web/src/lib/schemas/agent-events.schema.ts` | SSE agent events | `AgentTextDeltaEventSchema`, `AgentSessionStatusEventSchema`, `AgentUsageUpdateEventSchema`, `AgentErrorEventSchema`, `AgentEventSchema` |
| `/home/jak/substrate/007-manage-workflows/apps/web/src/lib/stores/agent-session.store.ts` | localStorage persistence | `AgentSessionStore` class |
| `/home/jak/substrate/007-manage-workflows/apps/web/src/lib/schemas/sse-events.schema.ts` | Extended SSE schema | `sseEventSchema` (now includes 11 event types) |

**B. Lessons Learned**

- TDD RED/GREEN workflow effective: write failing test first, implement minimal code
- Domain-based test paths (`test/unit/web/schemas/`, `test/unit/web/stores/`) maintain organization
- Test Doc format provides valuable contract documentation

**C. Technical Discoveries**

| Type | Discovery | Resolution |
|------|-----------|------------|
| gotcha | Node.js `globalThis.localStorage` is empty object without methods | Check `typeof localStorage.getItem === 'function'` not just truthy |

**D. Dependencies Exported (Available for Phase 2)**

- `AgentSessionSchema` – for typing session state in reducer
- `SessionStatusSchema` – for status enum in reducer and components
- `AgentEventSchema` – for SSE event handling in hook
- `AgentSessionStore` – for persistence integration in `useAgentSession`
- `DI_TOKENS.SESSION_STORE` – for DI container resolution

**E. Critical Findings Applied**

- CF-02 (Two-pass hydration): Implemented in `AgentSessionStore.loadSession()`
- CF-03 (SSE additive-only): Agent events appended to `sseEventSchema` union

**F. Incomplete/Blocked Items**

None – all 10 tasks completed.

**G. Test Infrastructure**

- 11 tests in `agent-session.schema.test.ts`
- 10 tests in `agent-events.schema.test.ts`
- 12 tests in `agent-session.store.test.ts`
- 11 tests in `sse-events.contract.test.ts`
- 3 new tests in `di-container.test.ts`
- FakeLocalStorage available at `test/fakes/fake-local-storage.ts`
- FakeResizeObserver verified at `test/fakes/fake-resize-observer.ts`

**H. Technical Debt**

None introduced.

**I. Architectural Decisions**

- Direct instantiation of fakes in `beforeEach()` (per DYK #4 from Plan 010)
- Constants over configuration for limits (1000 message pruning limit)
- Two-pass hydration pattern for localStorage

**J. Scope Changes**

None.

**K. Key Log References**

- `tasks/phase-1-foundation/execution.log.md` – Full implementation narrative
- Task T009 discovery: localStorage gotcha in DI container setup

### Critical Findings Affecting This Phase

| Finding | Title | Constraint/Requirement | Addressed By |
|---------|-------|------------------------|--------------|
| CF-01 | No Chat UI Exists | Build entire chat UI from scratch in `apps/web/src/components/agents/` | T005-T014 |
| CF-02 | Session Persistence Gap | Use AgentSessionStore (Phase 1) for persistence; hook should integrate with store | T003, T004 |
| HF-08 | Race Condition SSE vs State | Design reducers with merge-not-replace pattern for concurrent SSE events | T001, T002 |
| MF-09 | Never Disable Submit Buttons | Submit button always enabled; validate on submit, show error messages | T005, T006 |
| MF-10 | Keep Agent Events Abstracted | UI receives only `AgentEvent` types from `@chainglass/shared`, no raw parsing | T004 |
| MF-11 | Live Markdown During Streaming | Render markdown continuously (partial appearance acceptable) | T007, T008 |
| MF-12 | Existing Markdown Components | Reuse `MarkdownServer`, `CodeBlock`, `shiki-processor` | T008 |

### ADR Decision Constraints

- **ADR-0004: DI Container Architecture** – Use `useFactory` pattern, no decorators
  - Constrains: T004 (hook may resolve SESSION_STORE from container)
  - Addressed by: Follow Phase 1 DI patterns

- **ADR-0005: Next.js MCP Developer Experience Loop** – Headless TDD + Playwright visual verification
  - Constrains: All UI components (T005-T014)
  - Workflow: **Headless TDD first** → tests pass → **Playwright MCP visual verification**
  - Reference: `/docs/adr/adr-0005-nextjs-mcp-developer-experience-loop.md`

### Invariants & Guardrails

- **Accessibility**: Submit button must never have `disabled` attribute
- **State machine**: Only valid transitions allowed (idle → running → idle/waiting_input/completed)
- **Shiki server-only**: `StreamingMessage` must use `MarkdownServer` (server component), not client-side highlighting
- **No mocks**: Use fakes only (FakeEventSource, FakeLocalStorage, callback trackers)

### Inputs to Read

| File | Purpose |
|------|---------|
| `/apps/web/src/lib/schemas/agent-session.schema.ts` | Session types for reducer state |
| `/apps/web/src/lib/schemas/agent-events.schema.ts` | Event types for SSE handling |
| `/apps/web/src/lib/stores/agent-session.store.ts` | Store for persistence integration |
| `/apps/web/src/hooks/useSSE.ts` | Existing SSE hook pattern to integrate |
| `/apps/web/src/components/viewers/markdown-server.tsx` | Server-side markdown to reuse |
| `/apps/web/src/components/viewers/code-block.tsx` | Code block rendering to reuse |
| `/test/fakes/fake-event-source.ts` | Fake for SSE testing |
| `/test/fakes/fake-resize-observer.ts` | Fake for textarea tests |

**Local Prototype Reference** (built in parallel):
| File | Purpose |
|------|---------|
| `/apps/web/src/components/agents/agent-session-dialog.tsx` | Terminal-style dialog with LogEntry, QuestionInput |
| `/apps/web/src/data/fixtures/agent-sessions.fixture.ts` | Types: AgentSession, AgentMessage, AgentQuestion, etc. |
| `/apps/web/src/components/kanban/run-kanban-card.tsx` | Integration example with "Open Agent Session" button |

### Visual Alignment Aids

#### State Flow Diagram

```mermaid
stateDiagram-v2
    [*] --> idle: Initial state
    idle --> running: START_RUN
    running --> running: APPEND_DELTA (merge)
    running --> waiting_input: Agent requests input
    running --> completed: COMPLETE_RUN
    running --> idle: STOP_RUN (user stops)
    waiting_input --> running: User provides input
    completed --> idle: New conversation
    idle --> idle: Invalid transition (no-op)
    running --> running: Invalid duplicate START_RUN (no-op)

    note right of running
        APPEND_DELTA uses merge-not-replace
        to handle concurrent SSE events safely
    end note
```

#### Sequence Diagram: Message Send Flow

```mermaid
sequenceDiagram
    participant User
    participant Input as AgentChatInput
    participant Hook as useAgentSession
    participant Reducer as sessionReducer
    participant SSE as SSE Channel
    participant Message as StreamingMessage

    User->>Input: Type message + Enter
    Input->>Input: Validate (not empty)
    alt Empty message
        Input->>User: Show error message
    else Valid message
        Input->>Hook: dispatch(START_RUN)
        Hook->>Reducer: START_RUN
        Reducer-->>Hook: status: running
        Input->>SSE: Send message to agent
        loop Streaming
            SSE-->>Hook: agent_text_delta event
            Hook->>Reducer: APPEND_DELTA
            Reducer-->>Hook: messages updated (merged)
            Hook-->>Message: Re-render with new content
        end
        SSE-->>Hook: agent_session_status: completed
        Hook->>Reducer: COMPLETE_RUN
        Reducer-->>Hook: status: idle
    end
```

### UI Reference Patterns (from local prototype)

**Source**: `apps/web/src/components/agents/agent-session-dialog.tsx` - Terminal/log-style prototype built in parallel.

#### Design Philosophy: Terminal-Style, Not Chat Bubbles
The prototype uses **log entry rendering** instead of chat bubbles for a more developer-focused experience:
- Tool calls display inline with expandable output
- User messages have a violet left border highlight
- Assistant messages are plain text with icon prefix
- Compact, information-dense layout

#### LogEntry Component Pattern
```tsx
// Tool calls - compact inline with expandable output
<div className="px-4 py-1.5 hover:bg-muted/30">
  <button className="w-full text-left flex items-center gap-2 text-sm">
    {/* Status dot with ping animation when running */}
    <div className={cn('h-1.5 w-1.5 rounded-full',
      status === 'complete' && 'bg-emerald-500',
      status === 'running' && 'bg-blue-500',
      status === 'failed' && 'bg-red-500'
    )} />
    <Terminal className="h-3 w-3 text-muted-foreground" />
    <span className="font-mono text-xs">{input || name}</span>
    {hasOutput && <ChevronRight className={cn('h-3 w-3', expanded && 'rotate-90')} />}
  </button>
  {expanded && <pre className="font-mono text-[11px] text-zinc-400">{output}</pre>}
</div>

// User messages - highlighted with left border
<div className="px-4 py-2 bg-muted/40 border-l-2 border-violet-500">
  <User className="h-3.5 w-3.5 text-violet-500" />
  <p className="text-sm">{content}</p>
</div>

// Assistant messages - plain with icon
<div className="px-4 py-2 hover:bg-muted/20">
  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
  <p className="text-sm">{content}</p>
  {isStreaming && <span className="text-blue-500">typing...</span>}
</div>
```

#### Context Window Progress Bar (compact)
```tsx
<div className="px-4 py-1.5 flex items-center gap-3">
  <span className="text-[10px] text-muted-foreground">Context</span>
  <div className="flex-1 h-1 bg-muted rounded-full">
    <div className={cn('h-full rounded-full',
      usage > 90 ? 'bg-red-500' :
      usage > 75 ? 'bg-amber-500' : 'bg-violet-500'
    )} style={{ width: `${usage}%` }} />
  </div>
  <span className="text-[10px] font-mono">{usage}%</span>
</div>
```

#### QuestionInput Component Pattern
```tsx
// Replaces text input when question is active
// Types: single_choice, multi_choice, confirm, free_text
<QuestionInput
  question={pendingQuestion}
  onAnswer={(answer) => sendMessage(formatAnswer(answer))}
  onCancel={() => setShowQuestionUI(false)}  // Switch to text input
/>
```

#### Existing Types (from fixtures)
Already defined in `apps/web/src/data/fixtures/agent-sessions.fixture.ts`:
- `AgentSession`, `AgentMessage`, `AgentQuestion`
- `AgentSessionStatus`: idle, running, waiting_input, error
- `AgentType`: claude-code, copilot, generic
- `MessageRole`: user, assistant, system, tool
- `ToolStatus`: pending, running, complete, failed
- `QuestionType`: free_text, single_choice, multi_choice, confirm

#### Key Design Decisions
| Aspect | Implementation | Rationale |
|--------|---------------|-----------|
| Layout | Terminal/log style | Developer-focused, information-dense |
| Tool calls | Expandable inline | Shows command + output without clutter |
| Submit | `Cmd/Ctrl + Enter` | Allows Shift+Enter for newlines |
| Questions | Toggle panel | Can switch to free text input |
| Status | Compact badge in header | Doesn't take space in message area |

---

### Test Plan (Full TDD - Fakes Only)

#### Development Workflow: Headless TDD → Playwright Verification

**Per ADR-0005**, this phase uses a two-stage development workflow:

**Stage 1: Headless TDD (Primary)**
- Build components test-first using `@testing-library/react`
- All tests run headless via Vitest (`pnpm test`)
- Focus on behavior, accessibility, state management
- No visual browser required during TDD loop

**Stage 2: Playwright MCP Visual Verification (After TDD Green)**
Once tests pass, use Next.js MCP + Playwright to visually verify:

```bash
# 1. Ensure dev server running
pnpm dev

# 2. Agent uses browser_eval MCP tool:
browser_eval(action: "start", headless: true)
browser_eval(action: "navigate", url: "http://localhost:3001/demo/agents")  # or test page
browser_eval(action: "screenshot")  # Agent views screenshot
browser_eval(action: "console_messages")  # Check for JS errors
```

**When to use Playwright verification:**
- After T012 (AgentChatView) is complete - verify full chat assembly renders
- After T014 (ContextWindowDisplay) - verify progress bar visual appearance
- If any visual regression suspected
- Before marking phase complete

**MCP Tools Available** (from `next-devtools`):
| Tool | Purpose |
|------|---------|
| `nextjs_index` | Discover running dev servers and MCP tools |
| `nextjs_call` | Call Next.js MCP tools (get_errors, get_routes) |
| `browser_eval` | Playwright browser automation (screenshot, navigate, console) |

---

**Test Pattern** (per Phase 1): Use **direct instantiation** of fakes in `beforeEach()`, not DI container.

```typescript
// ✅ CORRECT - Direct instantiation
describe('AgentChatInput', () => {
  let handler: FakeMessageHandler;

  beforeEach(() => {
    handler = new FakeMessageHandler();
  });

  it('should submit on Enter', async () => {
    render(<AgentChatInput onMessage={handler.onMessage} />);
    // ...
  });
});
```

#### T001/T002: sessionReducer Tests

| Test Name | Rationale | Expected Output |
|-----------|-----------|-----------------|
| `should transition from idle to running on START_RUN` | Core state machine | `{ status: 'running' }` |
| `should reject START_RUN when already running` | Prevents double submission | Same ref returned |
| `should append delta with merge-not-replace` | Per HF-08: SSE race handling | Messages array updated, other state preserved |
| `should transition to completed on COMPLETE_RUN` | Normal completion flow | `{ status: 'completed' }` |
| `should set error on SET_ERROR` | Error handling | `{ error: { message, code } }` |
| `should clear error on CLEAR_ERROR` | Error recovery | `{ error: null }` |
| `should handle waiting_input status` | Agent needs user input | `{ status: 'waiting_input' }` |

#### T005/T006: AgentChatInput Tests

| Test Name | Rationale | Expected Output |
|-----------|-----------|-----------------|
| `should submit message on Enter key` | Standard chat UX | onMessage callback called |
| `should submit message on button click` | Mouse users | onMessage callback called |
| `should insert newline on Shift+Enter` | Multi-line messages | Newline in textarea |
| `should never disable submit button` | Per MF-09: accessibility | No `disabled` attr |
| `should show error for empty submit` | Validation feedback | Error message visible |
| `should clear input after submit` | UX expectation | Input empty |
| `should have ARIA labels` | Accessibility | aria-label present |

**Callback Tracking Pattern** (no vi.fn()):
```typescript
class FakeMessageHandler {
  calls: string[] = [];
  onMessage = (msg: string) => { this.calls.push(msg); };
  assertCalledWith(expected: string) {
    expect(this.calls).toContain(expected);
  }
  assertNotCalled() {
    expect(this.calls).toHaveLength(0);
  }
}
```

#### T007/T008: StreamingMessage (LogEntry) Tests

| Test Name | Rationale | Expected Output |
|-----------|-----------|-----------------|
| `should render partial content during streaming` | Live streaming feedback | Partial text visible |
| `should show streaming indicator when isStreaming` | Visual feedback | "typing..." indicator visible |
| `should hide streaming indicator when complete` | Clean final state | No indicator |
| `should render completed content` | Final message display | Full text visible |
| `should render markdown code blocks` | Code formatting | Code block rendered |
| `should render markdown links` | Link formatting | Clickable links |
| `should render markdown lists` | List formatting | List items visible |
| `should style user messages with left border` | Visual differentiation | `border-l-2 border-violet-500` |
| `should style assistant messages plain` | Visual differentiation | No border, muted icon |
| `should render tool calls with status dot` | Tool visualization | Colored dot + command text |
| `should expand tool output on click` | Interactive output | Output visible when expanded |

#### T009/T010: AgentStatusIndicator Tests

| Test Name | Rationale | Expected Output |
|-----------|-----------|-----------------|
| `should show gray for idle` | Visual status | Gray indicator |
| `should show blue pulse for running` | Active feedback | Blue with animation |
| `should show green for completed` | Session done | Green indicator |
| `should show red for error` | Error visibility | Red indicator |
| `should have ARIA live region` | Accessibility | Status announced |

#### T011/T012: ContextWindowDisplay Tests

| Test Name | Rationale | Expected Output |
|-----------|-----------|-----------------|
| `should display percentage text` | Token awareness | "45%" visible |
| `should render progress bar with correct width` | Visual feedback | Bar at 45% width |
| `should show gradient color under 75%` | Normal state | Purple gradient |
| `should show amber at 75%+` | Approaching limit | Amber bar and text |
| `should show red at 90%+` | Near limit | Red bar and text |
| `should handle unavailable gracefully` | Copilot limitation | Hidden or "N/A" |

### Step-by-Step Implementation Outline

#### State Management (T001-T004)

1. **T001**: Create `test/unit/web/hooks/useAgentSession.test.ts`
   - Write reducer tests with Test Doc format
   - **Note**: Types already exist in `apps/web/src/data/fixtures/agent-sessions.fixture.ts`
   - Run: → RED

2. **T002**: Create `apps/web/src/hooks/useAgentSession.ts`
   - Define `SessionAction` union type
   - Implement `sessionReducer` with state machine (idle → running → completed/error)
   - Handle merge-not-replace for APPEND_DELTA (per HF-08)
   - Run: → GREEN

3. **T003**: Extend test file with hook tests
   - Use `renderHook` from `@testing-library/react`
   - Test dispatch behavior and state updates
   - Run: → RED

4. **T004**: Implement `useAgentSession` hook
   - Wrap reducer with `useReducer`
   - Memoize dispatch with `useCallback`
   - Integrate with `AgentSessionStore` (Phase 1) for persistence
   - Run: → GREEN

#### Core Components (T005-T012)

5. **T005**: Create `test/unit/web/components/agents/agent-chat-input.test.tsx`
   - Tests: Cmd/Ctrl+Enter submits, button click, empty validation
   - Run: → RED

6. **T006**: Create `apps/web/src/components/agents/agent-chat-input.tsx`
   - Textarea with Cmd/Ctrl+Enter shortcut (per prototype)
   - Keyboard hint in footer
   - Run: → GREEN

7. **T007**: Create `test/unit/web/components/agents/log-entry.test.tsx`
   - Tests: user/assistant/tool rendering, streaming indicator, tool expansion
   - Run: → RED

8. **T008**: Create `apps/web/src/components/agents/log-entry.tsx`
   - **Terminal-style design** (per local prototype):
     - User: left border highlight (`border-l-2 border-violet-500`)
     - Assistant: plain with Bot icon, "typing..." when streaming
     - Tool: expandable with status dot (colored by status)
   - Use `MarkdownServer` for content rendering
   - Run: → GREEN

9. **T009**: Create `test/unit/web/components/agents/agent-status-indicator.test.tsx`
   - Tests: idle/running/completed/error colors, ARIA
   - Run: → RED

10. **T010**: Create `apps/web/src/components/agents/agent-status-indicator.tsx`
    - Color mapping: idle=gray, running=blue+pulse, completed=green, error=red
    - Run: → GREEN

11. **T011**: Create `test/unit/web/components/agents/context-window-display.test.tsx`
    - Tests: percentage, thresholds (75%, 90%), unavailable
    - Run: → RED

12. **T012**: Create `apps/web/src/components/agents/context-window-display.tsx`
    - Compact progress bar: >90% red, >75% amber, else violet
    - Run: → GREEN

#### Standalone Page (T013-T019)

13. **T013**: Create `test/unit/web/components/agents/agent-creation-form.test.tsx`
    - Tests: name input, agent type selector, validation, submit
    - Run: → RED

14. **T014**: Create `apps/web/src/components/agents/agent-creation-form.tsx`
    - Name input field
    - Agent type dropdown (claude-code, copilot, generic)
    - onCreate callback
    - Run: → GREEN

15. **T015**: Create `test/unit/web/components/agents/agent-list-view.test.tsx`
    - Tests: list rendering, click to select, active state, empty state
    - Run: → RED

16. **T016**: Create `apps/web/src/components/agents/agent-list-view.tsx`
    - List of agent sessions with status indicators
    - Click to switch active session
    - Run: → GREEN

17. **T017**: Create `test/unit/web/app/agents/page.test.tsx`
    - Integration tests: page renders, list + chat integration, creation flow
    - Run: → RED

18. **T018**: Create `apps/web/app/(dashboard)/agents/page.tsx`
    - **Main deliverable**: Standalone agents page
    - Layout: sidebar (list + creation) | main (chat view)
    - Wire up all components with state management
    - Run: → GREEN
    - **🎯 CHECKPOINT**: Run Playwright MCP visual verification (per ADR-0005)

19. **T019**: Add Agents link to main navigation
    - Update sidebar/nav component
    - Link to `/agents`
    - **🎯 FINAL CHECKPOINT**: Full visual verification before phase complete

### Commands to Run

```bash
# Environment setup (from repo root)
cd /home/jak/substrate/007-manage-workflows
pnpm install  # if needed

# Ensure directories exist
mkdir -p apps/web/src/components/agents
mkdir -p apps/web/app/\(dashboard\)/agents

# Run specific test files during TDD
pnpm test test/unit/web/hooks/useAgentSession.test.ts
pnpm test test/unit/web/components/agents/agent-chat-input.test.tsx
pnpm test test/unit/web/components/agents/log-entry.test.tsx
pnpm test test/unit/web/components/agents/agent-status-indicator.test.tsx
pnpm test test/unit/web/components/agents/context-window-display.test.tsx
pnpm test test/unit/web/components/agents/agent-creation-form.test.tsx
pnpm test test/unit/web/components/agents/agent-list-view.test.tsx
pnpm test test/unit/web/app/agents/page.test.tsx

# Run all Phase 2 tests
pnpm test test/unit/web/hooks/useAgentSession.test.ts test/unit/web/components/agents/*.test.tsx test/unit/web/app/agents/*.test.tsx

# Coverage check
pnpm test --coverage apps/web/src/hooks/useAgentSession.ts apps/web/src/components/agents/

# Verify no mocks used
grep -r "vi.mock\|jest.mock" test/unit/web/hooks test/unit/web/components/agents test/unit/web/app/agents

# Lint and typecheck
pnpm lint apps/web/src/hooks/useAgentSession.ts apps/web/src/components/agents apps/web/app/\(dashboard\)/agents
pnpm typecheck

# ─────────────────────────────────────────────────────────────
# STAGE 2: Playwright MCP Visual Verification (per ADR-0005)
# Run AFTER all TDD tests pass
# ─────────────────────────────────────────────────────────────

# Ensure dev server is running (in separate terminal)
pnpm dev

# Use MCP tools via Claude Code or similar agent:
# 1. nextjs_index()                           # Discover dev server
# 2. nextjs_call(port, "get_errors")          # Check for build errors
# 3. browser_eval(action: "start", headless: true)
# 4. browser_eval(action: "navigate", url: "http://localhost:3001/agents")
# 5. browser_eval(action: "screenshot")        # View rendered components
# 6. browser_eval(action: "console_messages")  # Check for JS errors

# Visual verification checklist:
# [ ] /agents page renders without errors
# [ ] Agent list displays sessions
# [ ] Agent creation form works (name + type)
# [ ] Chat view shows messages in terminal style (LogEntry)
# [ ] User messages have violet left border
# [ ] Tool calls show expandable output
# [ ] Context window progress bar shows correct colors
# [ ] Status indicators show correct colors
# [ ] Navigation menu has Agents link

# Verify Phase 1 tests still pass (no regressions)
pnpm test test/unit/web/schemas/agent-*.test.ts test/unit/web/stores/agent-*.test.ts
```

### Risks/Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| MarkdownServer integration in tests | Medium | Medium | May need server component testing setup or simplified test rendering |
| Shiki server-only constraint | Medium | Low | StreamingMessage must be server component or use client-safe wrapper |
| Scroll behavior complexity | Low | Medium | Start simple; virtualization deferred unless needed |
| SSE event timing in tests | Low | Medium | FakeEventSource provides controllable timing |

### Ready Check

- [ ] Phase 1 complete: All 10 tasks ✅, tests passing
- [ ] Spec reviewed: Standalone agents page with full SSE interaction
- [ ] Plan Phase 2 tasks mapped: **T001-T019** (19 tasks)
- [ ] Critical Findings HF-08 (merge-not-replace), MF-11 (live markdown), MF-12 (reuse components) incorporated
- [ ] Phase 1 outputs available: schemas, store, DI tokens
- [ ] Existing markdown components located: `apps/web/src/components/viewers/`
- [ ] Fakes available: FakeEventSource, FakeLocalStorage, FakeResizeObserver
- [ ] Commands documented for all quality gates
- [ ] Test Doc format will be used in all tests
- [ ] **ADR-0004 reviewed**: DI patterns from Phase 1 followed (useFactory, no decorators)
- [ ] **ADR-0005 reviewed**: Headless TDD → Playwright MCP visual verification workflow understood
- [ ] **Local prototype reviewed**: `agent-session-dialog.tsx` patterns (LogEntry, terminal style)
- [ ] **Existing types available**: `agent-sessions.fixture.ts` has AgentSession, AgentMessage, etc.
- [ ] **Scope confirmed**: Standalone `/agents` page, not integrated with kanban

**Awaiting**: Human **GO** to proceed with implementation.

---

## Phase Footnote Stubs

<!-- Footnote entries will be added by plan-6 during implementation -->

| Footnote | Task | Description | Date |
|----------|------|-------------|------|
| | | | |

---

## Evidence Artifacts

Implementation will produce:
- `phase-2-core-chat/execution.log.md` - Detailed implementation narrative
- Test output showing all tests pass
- Coverage report showing >80% for new code
- Grep output confirming no mocks used

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._

---

## Directory Layout

```
docs/plans/012-web-agents/
├── web-agents-spec.md
├── web-agents-plan.md
├── research-dossier.md
├── external-research/
│   ├── chat-ui-patterns.md
│   ├── session-management.md
│   └── sse-vs-websocket.md
└── tasks/
    ├── phase-1-foundation/
    │   ├── tasks.md          # Phase 1 dossier (complete)
    │   └── execution.log.md  # Phase 1 log (complete)
    └── phase-2-core-chat/
        ├── tasks.md          # This file
        └── execution.log.md  # Created by plan-6
```

---

**Dossier Created**: 2026-01-26
**Phase**: 2 of 5 (Core Chat)
**Phase Status**: ⏳ PENDING
**Next Step**: Await human **GO**, then run `/plan-6-implement-phase --phase "Phase 2: Core Chat" --plan "/home/jak/substrate/007-manage-workflows/docs/plans/012-web-agents/web-agents-plan.md"`
