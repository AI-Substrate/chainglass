# Subtask 001: Real Agent Integration

**Parent Plan:** [../../web-agents-plan.md](../../web-agents-plan.md)
**Parent Phase:** Phase 2: Core Chat
**Parent Task(s):** [T018: /agents page](./tasks.md#task-t018)
**Plan Task Reference:** [Task 2.12 in Plan](../../web-agents-plan.md#tasks-full-tdd-approach-1)

**Why This Subtask:**
Phase 2 was completed with a simulated/stub agent response (setTimeout with fake messages). The page needs to be wired to the real agent adapters (ClaudeCodeAdapter, SdkCopilotAdapter) via AgentService, with SSE streaming for real-time responses.

**Created:** 2026-01-26
**Requested By:** User

---

## Executive Briefing

### Purpose
This subtask connects the standalone `/agents` page to real agent adapters, enabling actual AI agent interactions. Users will send messages to Claude Code or Copilot and receive real streaming responses instead of simulated stub responses.

### What We're Building
A complete agent integration layer consisting of:
- **API route** (`/api/agents/run`) that invokes AgentService with SSE event streaming
- **Session resume support** storing and passing `agentSessionId` for conversation continuity
- **Real-time streaming** via existing SSE infrastructure and `useSSE` hook
- **Error handling** mapping adapter errors to UI error states
- **Token usage display** from real agent responses (Claude Code only)

### Unblocks
- **Full agent functionality** - Users can actually interact with AI agents
- **Phase 3: Multi-Session** - Real agent sessions enable meaningful multi-session orchestration
- **Phase 5: Integration Testing** - E2E tests require working agent integration

### Example

**Before (current stub):**
```typescript
// In page.tsx - lines 86-94
setTimeout(() => {
  dispatch({ type: 'APPEND_DELTA', delta: 'Hello! I am your AI assistant. ' });
  setTimeout(() => {
    dispatch({ type: 'APPEND_DELTA', delta: 'How can I help you today?' });
    dispatch({ type: 'COMPLETE_RUN' });
  }, 500);
}, 500);
```

**After (real integration):**
```typescript
// User sends message → POST /api/agents/run → AgentService.run() → SSE events → UI updates
const response = await fetch('/api/agents/run', {
  method: 'POST',
  body: JSON.stringify({ sessionId, agentType, prompt, channel: `agent-${sessionId}` }),
});

// SSE channel receives real streaming events
// agent_text_delta → APPEND_DELTA action → streaming message updates
// agent_session_status → UPDATE_STATUS action → status indicator updates
// agent_usage_update → UPDATE_CONTEXT_USAGE action → token display updates
```

---

## Objectives & Scope

### Objective
Wire the `/agents` page to real agent adapters via API route and SSE streaming, replacing the simulated stub response with actual AI agent interactions.

### Goals

- ✅ Create `/api/agents/run` POST route handler that invokes AgentService
- ✅ Implement SSE event streaming from AgentService.run() onEvent callback to sseManager
- ✅ Store and pass `agentSessionId` for session resumption (adapter-provided ID)
- ✅ Update `/agents` page to use API route instead of setTimeout stub
- ✅ Connect useSSE hook to receive real-time agent events
- ✅ Map agent events to sessionReducer actions (APPEND_DELTA, UPDATE_STATUS, etc.)
- ✅ Display real token usage from agent responses (contextUsage percentage)
- ✅ Handle errors gracefully with agent_error events

### Non-Goals

- ❌ Multi-session orchestration (Phase 3 scope)
- ❌ Slash command handling (/compact, /help) (Phase 4 scope)
- ❌ Mobile layout optimization (Phase 4 scope)
- ❌ Server-side session persistence (localStorage is MVP-adequate)
- ❌ API authentication/authorization (internal tool, trusted environment)
- ❌ Rate limiting (deferred unless issues observed)

---

## Architecture Map

### Component Diagram
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    style Parent fill:#F5F5F5,stroke:#E0E0E0
    style Subtask fill:#F5F5F5,stroke:#E0E0E0
    style Infrastructure fill:#E3F2FD,stroke:#1976D2
    style Files fill:#F5F5F5,stroke:#E0E0E0

    subgraph Parent["Parent Context"]
        T018["T018: /agents page (STUB)"]:::completed
    end

    subgraph Infrastructure["Existing Infrastructure"]
        SSE["SSEManager"]:::completed
        Hook["useSSE hook"]:::completed
        Service["AgentService"]:::completed
        Adapters["ClaudeCode + Copilot Adapters"]:::completed
        Schemas["Agent Event Schemas"]:::completed
    end

    subgraph Subtask["Subtask 001: Real Agent Integration"]
        ST001["ST001: API route"]:::pending
        ST002["ST002: Event translation"]:::pending
        ST003["ST003: Page integration"]:::pending
        ST004["ST004: Session resume"]:::pending
        ST005["ST005: Error handling"]:::pending

        ST001 --> ST002 --> ST003
        ST003 --> ST004
        ST003 --> ST005
    end

    subgraph Files["Files"]
        F1["/api/agents/run/route.ts"]:::pending
        F2["/agents/page.tsx (update)"]:::pending
        F3["useAgentSession.ts (update)"]:::pending
    end

    Service --> ST001
    Adapters --> ST001
    SSE --> ST002
    Schemas --> ST002
    Hook --> ST003
    ST001 -.-> F1
    ST003 -.-> F2
    ST004 -.-> F3
    ST005 -.->|completes| T018
```

### Task-to-Component Mapping

<!-- Status: ⬜ Pending | 🟧 In Progress | ✅ Complete | 🔴 Blocked -->

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| ST001 | API Route | `/apps/web/app/api/agents/run/route.ts` | ⬜ Pending | POST handler invoking AgentService |
| ST002 | Event Translation | (inline in route) | ⬜ Pending | Map AgentEvent → SSE broadcast |
| ST003 | Page Integration | `/apps/web/app/(dashboard)/agents/page.tsx` | ⬜ Pending | Replace stub with API call + useSSE |
| ST004 | Session Resume | `/apps/web/src/hooks/useAgentSession.ts` | ⬜ Pending | Store/pass agentSessionId |
| ST005 | Error Handling | `/apps/web/app/(dashboard)/agents/page.tsx` | ⬜ Pending | Map agent_error to UI state |

### Data Flow Sequence

```mermaid
sequenceDiagram
    participant User
    participant Page as /agents page
    participant API as /api/agents/run
    participant Service as AgentService
    participant Adapter as ClaudeCode/Copilot
    participant SSE as SSEManager
    participant Hook as useSSE

    User->>Page: Type message, submit
    Page->>Page: dispatch(ADD_MESSAGE, START_RUN)
    Page->>API: POST { prompt, agentType, sessionId, channel }
    API->>Service: run({ prompt, agentType, sessionId, onEvent })
    Service->>Adapter: run({ prompt, sessionId, onEvent })

    loop Streaming Response
        Adapter-->>Service: onEvent(text_delta)
        Service-->>API: onEvent callback
        API-->>SSE: broadcast(channel, 'agent_text_delta', data)
        SSE-->>Hook: EventSource message
        Hook-->>Page: message in messages array
        Page->>Page: dispatch(APPEND_DELTA)
    end

    Adapter-->>Service: onEvent(session_status: completed)
    Service-->>API: onEvent callback
    API-->>SSE: broadcast(channel, 'agent_session_status', data)
    SSE-->>Hook: EventSource message
    Hook-->>Page: status message
    Page->>Page: dispatch(COMPLETE_RUN)

    API-->>Page: Response { agentSessionId, tokens }
    Page->>Page: Save agentSessionId for resume
```

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|----|----- |--------------|------------------|------------|----------|-------|
| [ ] | ST001 | Create `/api/agents/run` POST route | 3 | Core | – | `/home/jak/substrate/007-manage-workflows/apps/web/app/api/agents/run/route.ts` | Route returns 200, invokes AgentService | – | Uses DI container, async params |
| [ ] | ST002 | Implement event translation (AgentEvent → SSE) | 2 | Core | ST001 | (inline in route.ts) | Events broadcast correctly to channel | – | Map text_delta, session_status, usage, error |
| [ ] | ST003 | Update /agents page to use API + useSSE | 3 | Core | ST001, ST002 | `/home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/agents/page.tsx` | Stub removed, real events flow | – | Remove setTimeout, add useSSE |
| [ ] | ST004 | Implement session resume (agentSessionId) | 2 | Core | ST003 | `/home/jak/substrate/007-manage-workflows/apps/web/src/hooks/useAgentSession.ts`, page.tsx | Can resume existing agent session | – | Store in AgentSession schema |
| [ ] | ST005 | Implement error handling + UI feedback | 2 | Core | ST003 | `/home/jak/substrate/007-manage-workflows/apps/web/app/(dashboard)/agents/page.tsx` | Errors display in UI, recoverable | – | SET_ERROR action, error UI |

---

## Alignment Brief

### Objective Recap

Phase 2 delivered a complete `/agents` page UI with all components working, but agent responses are simulated via `setTimeout`. This subtask wires the UI to real agent adapters, completing the vertical slice for actual AI agent interaction.

**Parent Phase Goal:** Build the primary chat interface with message streaming
**This Subtask:** Replace simulated streaming with real agent adapter streaming

### Acceptance Criteria Deltas

From parent Phase 2 acceptance criteria, this subtask specifically addresses:
- [ ] Real streaming responses (not simulated)
- [ ] Session resumption works (pass agentSessionId to adapter)
- [ ] Token usage displays real values (from agent response)
- [ ] Error states handle real adapter failures

### Critical Findings Affecting This Subtask

| ID | Finding | Impact | Mitigation |
|----|---------|--------|------------|
| CF-03 | SSE Schema Extension Risk | Must use additive-only changes | Agent events already added in Phase 1 ✓ |
| HF-05 | SSE Singleton Must Survive HMR | Use globalThis pattern | SSEManager already uses this ✓ |
| HF-08 | Race Condition SSE vs State | Merge-not-replace pattern | sessionReducer already implements this ✓ |
| MF-10 | Keep Agent Events Abstracted | UI receives only AgentEvent types | Route handler translates, UI consumes |

### Invariants/Guardrails

1. **No direct adapter access from UI** - All agent operations go through AgentService
2. **SSE additive-only** - Agent events already defined, don't modify existing types
3. **Fakes over mocks** - Test with FakeEventSource, FakeAgentAdapter if needed
4. **Error resilience** - Adapter failures must not crash the UI

### Inputs to Read

| File | Purpose |
|------|---------|
| `/apps/web/app/api/events/[channel]/route.ts` | Pattern for SSE route handlers |
| `/apps/web/src/lib/sse-manager.ts` | Broadcast API |
| `/apps/web/src/lib/di-container.ts` | DI tokens for AgentService |
| `/packages/shared/src/services/agent.service.ts` | AgentService API |
| `/packages/shared/src/interfaces/agent-types.ts` | AgentEvent types |
| `/apps/web/src/lib/schemas/agent-events.schema.ts` | SSE event schemas |

### Test Plan (Full TDD - Fakes Only)

**ST001: API Route Tests**
```typescript
// test/unit/web/api/agents/run.test.ts
describe('/api/agents/run', () => {
  it('should invoke AgentService with correct parameters', async () => {
    // Setup fake adapter via DI
    // POST to route with test body
    // Verify AgentService.run() called with correct args
  });

  it('should broadcast events via SSEManager', async () => {
    // Emit fake events from adapter
    // Verify sseManager.broadcast() called for each event
  });

  it('should return agentSessionId in response', async () => {
    // Verify response includes sessionId for resume
  });
});
```

**ST003: Page Integration Tests**
```typescript
// test/unit/web/app/agents/page-integration.test.tsx
describe('AgentsPage real integration', () => {
  it('should POST to /api/agents/run on message submit', async () => {
    // Setup FakeEventSource
    // Submit message
    // Verify API called
  });

  it('should update state from SSE events', async () => {
    // Emit fake SSE events
    // Verify reducer actions dispatched
    // Verify UI updates
  });
});
```

**Fakes Available:**
- `FakeEventSource` - `test/fakes/fake-event-source.ts`
- `FakeAgentAdapter` - `packages/shared/src/fakes/fake-agent-adapter.ts`
- `FakeLocalStorage` - `test/fakes/fake-local-storage.ts`

### Implementation Outline

1. **ST001: API Route**
   - Create `apps/web/app/api/agents/run/route.ts`
   - Use `bootstrap()` to get DI container
   - Resolve AgentService from container
   - Parse request body: `{ prompt, agentType, sessionId?, channel }`
   - Call `agentService.run()` with onEvent callback
   - Return `{ agentSessionId, tokens }` on completion

2. **ST002: Event Translation**
   - In onEvent callback, map AgentEvent types:
     - `text_delta` → `sseManager.broadcast(channel, 'agent_text_delta', { sessionId, delta })`
     - `session_*` → `sseManager.broadcast(channel, 'agent_session_status', { sessionId, status })`
     - `usage` → `sseManager.broadcast(channel, 'agent_usage_update', { sessionId, ...tokens })`
   - Handle errors → `agent_error` event

3. **ST003: Page Integration**
   - Remove setTimeout stub (lines 86-94)
   - Add useSSE hook: `useSSE(`/api/events/agent-${sessionId}`, agentEventSchema)`
   - Create API call function replacing stub
   - Connect SSE messages to reducer dispatch
   - Handle loading/error states

4. **ST004: Session Resume**
   - Add `agentSessionId?: string` field to reducer state (already in schema)
   - On API response, store `agentSessionId`
   - On next message, pass `sessionId` to API

5. **ST005: Error Handling**
   - Listen for `agent_error` SSE events
   - Dispatch SET_ERROR action
   - Show error in UI (existing error state)
   - Allow retry (CLEAR_ERROR + new message)

### Commands to Run

```bash
# Environment setup
cd /home/jak/substrate/007-manage-workflows
pnpm install  # if needed

# Create API route directory
mkdir -p apps/web/app/api/agents/run

# Run tests during TDD
pnpm test test/unit/web/api/agents/run.test.ts
pnpm test test/unit/web/app/agents/page-integration.test.tsx

# Run all Phase 2 tests (should still pass)
pnpm test test/unit/web/hooks/useAgentSession.test.ts test/unit/web/components/agents/*.test.tsx

# Verify existing tests don't break
pnpm test test/unit/web/services/sse-manager.test.ts test/unit/web/hooks/useSSE.test.ts

# Lint and typecheck
pnpm lint apps/web/app/api/agents apps/web/app/\(dashboard\)/agents
pnpm typecheck

# Manual verification (after implementation)
pnpm dev
# Navigate to http://localhost:3001/agents
# Create session, send message, verify real response
```

### Risks & Unknowns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| AgentService timeout (10 min) may be too long for web | Medium | Low | Use shorter timeout for web, or accept default |
| Adapter not available (missing API key) | Medium | Medium | Graceful error message in UI |
| SSE connection drops mid-stream | Low | Medium | useSSE has auto-reconnect |
| Claude Code CLI not installed | Medium | Low | Error message: "Claude Code CLI required" |

### Ready Check

- [x] Phase 2 complete: All 19 tasks done, 92 tests passing
- [x] Existing infrastructure verified: SSEManager, useSSE, AgentService, adapters
- [x] Agent event schemas in place (Phase 1)
- [x] DI container has AgentService token registered
- [x] FakeAgentAdapter available for testing
- [x] Session resume field in schema (`agentSessionId`)
- [ ] **Awaiting GO** to proceed with implementation

---

## Phase Footnote Stubs

| Footnote | Task | Description | Date |
|----------|------|-------------|------|
| | | | |

---

## Evidence Artifacts

Implementation will produce:
- `001-subtask-real-agent-integration.execution.log.md` - Detailed implementation narrative
- Test output showing new tests pass
- Screenshot/recording of real agent interaction (optional)

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

## After Subtask Completion

**This subtask resolves a blocker for:**
- Parent Task: [T018: /agents page](./tasks.md#task-t018)
- Plan Task: [Task 2.12 in Plan](../../web-agents-plan.md#tasks-full-tdd-approach-1)

**When all ST### tasks complete:**

1. **Record completion** in parent execution log:
   ```
   ### Subtask 001-subtask-real-agent-integration Complete

   Resolved: Connected /agents page to real agent adapters via API route + SSE streaming
   See detailed log: [subtask execution log](./001-subtask-real-agent-integration.execution.log.md)
   ```

2. **Update parent task** (T018 enhancement, not blocker):
   - Open: [`tasks.md`](./tasks.md)
   - Find: T018
   - Update Notes: Add "Subtask 001 complete - real agent integration"

3. **Resume parent phase work:**
   ```bash
   /plan-6-implement-phase --phase "Phase 3: Multi-Session" \
     --plan "/home/jak/substrate/007-manage-workflows/docs/plans/012-web-agents/web-agents-plan.md"
   ```
   (Note: NO `--subtask` flag to resume main phase)

**Quick Links:**
- [Parent Dossier](./tasks.md)
- [Parent Plan](../../web-agents-plan.md)
- [Parent Execution Log](./execution.log.md)

---

## Directory Layout

```
docs/plans/012-web-agents/
├── web-agents-spec.md
├── web-agents-plan.md
└── tasks/
    └── phase-2-core-chat/
        ├── tasks.md                                    # Phase dossier
        ├── execution.log.md                            # Phase log (complete)
        ├── 001-subtask-real-agent-integration.md       # This file
        └── 001-subtask-real-agent-integration.execution.log.md  # Created by plan-6
```

---

**Subtask Created:** 2026-01-26
**Subtask Status:** ⏳ PENDING
**Next Step:** Await human **GO**, then run `/plan-6-implement-phase --phase "Phase 2: Core Chat" --subtask "001-subtask-real-agent-integration" --plan "/home/jak/substrate/007-manage-workflows/docs/plans/012-web-agents/web-agents-plan.md"`
