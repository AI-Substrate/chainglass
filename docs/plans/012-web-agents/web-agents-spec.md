# Multi-Agent Web UI

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md` and external research files.

---

## Research Context

**Key findings from codebase exploration and external research**:

**Components Affected**:
- Agent adapters (`ClaudeCodeAdapter`, `SdkCopilotAdapter`) - existing, production-ready
- SSE infrastructure (`SSEManager`, `useSSE`, route handler) - existing, production-ready (26 tests)
- DI container and adapter factory - extension required
- New: Chat UI components (0 existing - must build from scratch)
- New: Session persistence layer (localStorage + Zod validation)

**Critical Dependencies**:
- `@chainglass/shared` for agent adapters and types
- `react-markdown` (10.1.0) and `remark-gfm` (4.0.1) - already installed
- SSE event schemas - need extension for agent event types

**Modification Risks**:
- ✅ Safe: Creating new components in `apps/web/src/components/agents/`
- ✅ Safe: Adding new routes at `apps/web/app/(dashboard)/agents/`
- ⚠️ Caution: Extending SSE schemas (additive only)
- 🚫 Avoid: Modifying AgentService internals or process management

**Links**: See `research-dossier.md` for full analysis, `external-research/*.md` for patterns.

---

## Summary

**WHAT**: A web interface that enables users to run multiple AI coding agents (Claude Code, Copilot) concurrently in the browser, with real-time streaming responses, session persistence, and easy switching between active conversations.

**WHY**: Users currently interact with agents through CLI only. A web interface provides:
- Visual session management across multiple concurrent agents
- Persistent conversation history that survives browser reloads
- Rich UI features (markdown rendering, syntax highlighting, status indicators)
- Accessibility for users who prefer graphical interfaces over terminal
- Foundation for collaborative agent workflows in future releases

---

## Goals

1. **Run agents in browser**: Users can start Claude Code or Copilot sessions from the web UI
2. **Real-time streaming**: Agent responses stream token-by-token with minimal latency *(flexibility: may fall back to chunked/buffered delivery if token-level proves difficult)*
3. **Multiple concurrent sessions**: Users can have 3+ active agent sessions simultaneously
4. **Easy session switching**: One-click navigation between active sessions with visual status indicators
5. **Session persistence**: Conversations survive browser refresh and return visits
6. **Visual status indicators**: Clear indication when agents are running, waiting for input, or idle
7. **Markdown rendering**: Agent responses render with proper formatting, syntax highlighting, and code blocks
8. **Agent control**: Users can stop running agents and send slash commands (`/compact`, `/help`)
9. **Session lifecycle**: Create new sessions, archive completed ones, restore archived sessions
10. **Responsive design**: Functional on desktop and mobile devices

---

## Non-Goals

1. **Server-side session storage**: Initial implementation uses localStorage only (IndexedDB/server sync is future work)
2. **Collaborative sessions**: No real-time sharing of agent sessions between users
3. **Custom agent configuration**: Users cannot modify agent parameters (model, temperature, etc.)
4. **File upload/attachment**: No support for uploading files to agent context
5. **Voice input/output**: Text-only interface
6. **Agent-to-agent communication**: Sessions are independent; agents cannot interact with each other
7. **Message editing**: Users cannot edit previously sent messages
8. **Offline mode**: Requires network connectivity to function
9. **End-to-end encryption**: Messages stored in plaintext in localStorage
10. **Rate limiting UI**: No visual controls for API rate limiting (handled by adapters)

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**:
| Factor | Score | Rationale |
|--------|-------|-----------|
| Surface Area (S) | 2 | Many new files: routes, components, hooks, schemas, stores |
| Integration (I) | 1 | Uses existing adapters + SSE; no new external services |
| Data/State (D) | 1 | New session schema in localStorage; no database migrations |
| Novelty (N) | 1 | Chat UI patterns well-researched; some design decisions remain |
| Non-Functional (F) | 1 | Performance matters (streaming), but patterns are known |
| Testing/Rollout (T) | 2 | Needs integration tests for streaming; staged rollout for production |

**Total**: S(2) + I(1) + D(1) + N(1) + F(1) + T(2) = **8** → **CS-4**

**Confidence**: 0.85 (high confidence due to thorough research phase)

**Assumptions**:
- Existing agent adapters work correctly with web-initiated calls
- SSE infrastructure handles multi-session broadcasting without modification
- localStorage provides sufficient persistence for MVP
- Users have modern browsers with EventSource support

**Dependencies**:
- Agent adapters must be callable from Next.js API routes
- SSE channels must support per-session isolation (`agent-${sessionId}`)
- DI container must be accessible from server-side code

**Risks**:
- Long-running agent sessions may timeout (mitigated by existing adapter timeout handling)
- Many concurrent sessions could strain browser memory (mitigated by message pruning)
- Mobile keyboards may interfere with chat input (mitigated by sticky input pattern)

**Phases** (high-level):
1. **Foundation**: Session store, SSE schema extension, basic chat layout
2. **Core Chat**: Message streaming, markdown rendering, input handling
3. **Multi-Session**: Session list, switching, status indicators
4. **Polish**: Archive/restore, slash commands, responsive design
5. **Integration Testing**: E2E tests with real agent calls (feature-flagged)

---

## Acceptance Criteria

### Session Management

1. **AC-01**: User can create a new agent session by clicking "+ New Agent" button
   - A dialog appears with agent type selection (Claude Code, Copilot)
   - User can optionally name the session (default: "Session N")
   - New session becomes active immediately after creation

2. **AC-02**: User can see all active sessions in a sidebar/list view
   - Sessions display: name, agent type icon, status indicator, last activity time
   - Running sessions appear at top, idle sessions below, archived collapsed at bottom

3. **AC-03**: User can switch between sessions with a single click
   - Clicking a session card makes it the active session
   - The chat view updates to show that session's messages
   - Previous session state is preserved

4. **AC-04**: Sessions persist across browser refresh
   - Closing and reopening the browser restores all sessions
   - Active session selection is restored
   - Message history is preserved

5. **AC-05**: User can archive completed sessions
   - Archive button/action moves session to "Archived" section
   - Archived sessions are hidden from main list but not deleted
   - User can restore archived sessions to active state

### Chat Interaction

6. **AC-06**: User can send messages to the active agent
   - Text input field at bottom of chat view
   - Enter key or Send button submits message
   - Input clears after submission

7. **AC-07**: Agent responses stream in real-time
   - Tokens appear as they are generated (not waiting for full response)
   - *Flexibility*: May use chunked delivery (sentence/paragraph level) if token-level proves difficult
   - Visual indicator shows agent is currently responding
   - Streaming text displays without jarring layout shifts

8. **AC-08**: User can stop a running agent
   - Stop button appears while agent is responding
   - Clicking stop terminates the agent response
   - Session returns to idle state

9. **AC-09**: Messages render with proper markdown formatting
   - Code blocks display with syntax highlighting
   - Links are clickable
   - Lists, tables, and emphasis render correctly
   - User messages display as plain text
   - **Reuse existing components**:
     - `MarkdownServer` (`src/components/viewers/markdown-server.tsx`) - Server-side rendering with react-markdown + remark-gfm
     - `shiki-processor.ts` (`src/lib/server/shiki-processor.ts`) - Server-side Shiki highlighting (27+ languages, dual-theme CSS vars)
     - `MermaidRenderer` (`src/components/viewers/mermaid-renderer.tsx`) - Lazy-loaded diagram rendering
     - `CodeBlock` (`src/components/viewers/code-block.tsx`) - Routes code fences to appropriate renderers
     - Tailwind prose styling (`prose dark:prose-invert`)
   - **Live markdown rendering**: Render markdown continuously during streaming (partial/building appearance is acceptable)

10. **AC-10**: User can send slash commands
    - `/compact` triggers agent compaction
    - `/help` displays available commands
    - Invalid commands show error message

### Status Indicators

11. **AC-11**: Sessions show visual status indicators
    - Running: blue pulsing indicator
    - Waiting for input: yellow/amber indicator
    - Idle: gray indicator
    - Failed/Error: red indicator

12. **AC-12**: Context window usage is visible
    - Sessions nearing context limit (>75%) show warning badge
    - Critical usage (>90%) shows red alert
    - User can see percentage used

13. **AC-17**: Session count warning appears when exceeding 10 active sessions
    - Soft warning displayed when creating 11th+ active session
    - Warning indicates potential memory/performance impact
    - Does not block session creation (unlimited allowed)

### Error Handling

13. **AC-13**: Connection errors display gracefully
    - SSE disconnection shows reconnection attempt message
    - Failed reconnection shows error with retry button
    - Agent errors display in chat with error styling

14. **AC-14**: Invalid agent type selection is prevented
    - Only available agent types are selectable
    - Unavailable agents show "Coming soon" or disabled state

### Accessibility

15. **AC-15**: Interface is keyboard-navigable
    - Tab order follows logical flow
    - Enter submits messages
    - Escape closes dialogs

16. **AC-16**: Screen readers can navigate content
    - Messages have appropriate ARIA labels
    - Status changes are announced
    - Live regions update for new messages

---

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| SSE connection instability | Medium | High | Auto-reconnect with exponential backoff (existing in useSSE) |
| Browser localStorage quota exceeded | Low | Medium | Message pruning (max 1000 messages), compress old sessions |
| Agent adapter fails to start | Medium | High | Clear error messaging, fallback to error state |
| Mobile virtual keyboard breaks layout | Medium | Medium | Sticky input with `h-dvh`, test on real devices |
| Long sessions cause memory pressure | Medium | Medium | Virtualized message list (react-window if needed) |
| Token count inaccuracy (Copilot) | High | Low | Display "unavailable" for Copilot token counts |

### Assumptions

1. Users have modern browsers (Chrome 90+, Firefox 90+, Safari 14+, Edge 90+)
2. Agent CLI processes are accessible from the Next.js server runtime
3. Network latency to SSE endpoint is acceptable (<100ms typical)
4. localStorage is available and not disabled by user settings
5. Users understand agent concepts (sessions, context windows, compaction)
6. Agent adapters maintain session state correctly across `resume()` calls

---

## Open Questions

### Resolved

| # | Question | Resolution |
|---|----------|------------|
| Q2 | Max concurrent sessions | Unlimited with soft warning at 10 active sessions |
| Q5 | Last-Event-ID reconnection | Research only in MVP; spike approach, implement in follow-up |

### Deferred (Acceptable Defaults)

| # | Question | Default for MVP |
|---|----------|-----------------|
| Q1 | Keyboard shortcuts | No shortcuts in MVP (standard tab navigation only) |
| Q3 | Archived sessions searchable | No search; collapsible list only |
| Q4 | localStorage retention | Forever until manually deleted or archived |

### Outstanding

*None - all critical questions resolved*

---

## ADR Seeds (Optional)

### Decision: State Management Approach

**Decision Drivers**:
- Multiple concurrent sessions with independent state
- Persistence across browser sessions
- Avoid unnecessary re-renders when one session updates
- No desire to add external state libraries

**Candidate Alternatives**:
- A: Per-session useReducer + lightweight orchestrator (recommended by research)
- B: Single Zustand store with session slices
- C: React Context with selective subscriptions

**Stakeholders**: Frontend developers, UX team

### Decision: Message Virtualization Strategy

**Decision Drivers**:
- Messages can grow to 1000+ per session
- Variable height messages (code blocks, markdown)
- Smooth scrolling required
- Memory efficiency on mobile

**Candidate Alternatives**:
- A: react-window VariableSizeList (proven, complex setup)
- B: IntersectionObserver lazy rendering (simpler, less optimized)
- C: Simple DOM with message limit (simplest, may cause issues at scale)

**Stakeholders**: Frontend developers, performance team

### Decision: Session Identifier Source

**Decision Drivers**:
- Claude CLI provides its own session ID for resume
- Need consistent ID for localStorage key
- Must work across browser reloads

**Candidate Alternatives**:
- A: Use agent-provided session ID (tight coupling)
- B: Generate client-side UUID, map to agent session (more flexible)
- C: Hybrid: use agent ID when available, generate when not

**Stakeholders**: Backend developers, frontend developers

---

## External Research

**Incorporated**:
- `external-research/chat-ui-patterns.md` - Modern React chat UI patterns
- `external-research/session-management.md` - Multi-agent state management
- `external-research/sse-vs-websocket.md` - Streaming protocol decision

**Key Findings**:
1. **Streaming UI**: Two-phase rendering (plain text during stream, markdown after) prevents visual artifacts
2. **State Management**: Per-session useReducer with lightweight orchestrator beats global stores for multi-session
3. **Hydration Safety**: Two-pass rendering (deterministic SSR, useEffect hydration) prevents mismatches
4. **Persistence**: Zod-validated localStorage with 500ms debounced writes
5. **SSE Decision**: SSE + HTTP POST for commands beats WebSocket for this use case
6. **Virtualization**: react-window VariableSizeList maintains 60 FPS at 10,000+ messages

**Applied To**:
- Goals: Informed streaming and session requirements
- Complexity: Reduced novelty score due to documented patterns
- Acceptance Criteria: Shaped streaming, status indicator, and persistence criteria
- Risks: Identified memory and mobile keyboard risks with mitigations

---

## Testing Strategy

**Approach**: Full TDD
**Rationale**: CS-4 complexity with streaming, state machines, and persistence requires comprehensive test coverage before implementation.

**Focus Areas**:
- Session state machine transitions (useReducer logic)
- SSE message handling and reconnection
- localStorage persistence and hydration
- Multi-session orchestration
- Component rendering with streaming content

**Excluded**:
- Visual regression testing (not in MVP scope)
- Performance benchmarking (deferred)

**Mock Policy**: Fakes only, no mocking libraries
- Use existing fakes: `FakeAgentAdapter`, `FakeEventSource`, `FakeLocalStorage`, `FakeMatchMedia`, `FakeController`
- Create new fakes following established patterns (implement interface + add test helpers)
- No `vi.mock()` or `jest.mock()` - fakes provide more reliable behavior
- **Rationale**: Fakes are real implementations that run headless; mocks can hide integration issues

**Headless Requirement**: All tests must run without browser
- Use `@testing-library/react` with JSDOM for component tests
- Fakes replace all browser APIs (EventSource, localStorage, matchMedia)
- No Playwright/Cypress for unit/integration tests (E2E in separate phase)

**Available Fakes for This Feature**:
| Fake | Purpose | Location |
|------|---------|----------|
| `FakeAgentAdapter` | Agent operations | `packages/shared/src/fakes/` |
| `FakeEventSource` | SSE connections | `test/fakes/` |
| `FakeLocalStorage` | Session persistence | `test/fakes/` |
| `FakeMatchMedia` | Responsive layout | `test/fakes/` |
| `FakeController` | SSE stream controller | `test/fakes/` |
| `FakeCopilotClient` | Copilot SDK | `packages/shared/src/fakes/` |
| `FakeProcessManager` | Claude CLI | `packages/shared/src/fakes/` |

**Contract Tests**: Extend `agentAdapterContractTests` pattern for new session/SSE interfaces.

---

## Documentation Strategy

**Location**: docs/how/ only
**File**: `docs/how/web-agents.md`
**Rationale**: Feature-specific documentation for developers, keeps README focused on project overview.

**Content**:
- Agent UI architecture overview
- Session management patterns (state machine, persistence)
- SSE integration guide
- Available fakes for testing
- Troubleshooting common issues

**Target Audience**: Developers extending or maintaining the agent UI
**Maintenance**: Update when session management or SSE patterns change

---

## Clarifications

### Session 2026-01-26

**Q1: Workflow Mode**
- **Answer**: Full
- **Rationale**: CS-4 complexity requires multi-phase planning with comprehensive gates

**Q2: Testing Strategy**
- **Answer**: Full TDD
- **Rationale**: Streaming, state machines, and persistence require comprehensive test coverage

**Q3: Mock Usage**
- **Answer**: Fakes only (no mocking libraries)
- **Rationale**: Use existing fake implementations (FakeAgentAdapter, FakeEventSource, etc.) that run headless. No vi.mock/jest.mock.

**Q4: Documentation Strategy**
- **Answer**: docs/how/ only
- **Location**: `docs/how/web-agents.md`
- **Content**: Agent UI architecture, session management patterns, SSE integration guide
- **Target Audience**: Developers extending or maintaining the agent UI
- **Maintenance**: Update when session management or SSE patterns change

**Q5: Maximum Concurrent Sessions**
- **Answer**: Unlimited with soft warning at 10
- **Rationale**: No hard limit; show UX warning when user exceeds 10 active sessions about memory/performance impact

**Q6: Last-Event-ID Reconnection Resume**
- **Answer**: Research only (spike in MVP, implement in follow-up)
- **Rationale**: Spike the approach during implementation, defer full message buffer to post-MVP phase

**Q7: Token-by-Token Streaming Flexibility**
- **Answer**: Best-effort with fallback
- **Rationale**: True token-level streaming is ideal but may prove difficult with adapter architecture. Acceptable fallback: chunked/buffered delivery (e.g., sentence or paragraph level). Evaluate during implementation.

---

## Clarification Coverage Summary

| Category | Status | Count |
|----------|--------|-------|
| **Resolved** | ✅ | 7 (Mode, Testing, Mocks, Docs, Max Sessions, SSE Resume, Streaming Flexibility) |
| **Deferred** | ⏸️ | 3 (Keyboard shortcuts, Archive search, Retention policy) |
| **Outstanding** | ❌ | 0 |

**Next Step**: Run **/plan-3-architect** to generate the phase-based implementation plan.
