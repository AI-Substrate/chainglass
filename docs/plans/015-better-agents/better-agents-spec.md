# Agent Activity Fidelity Enhancement

**Mode**: Full

📚 This specification incorporates findings from `research-dossier.md`

## Research Context

Research confirms that rich agent activity data (tool calls, tool results, thinking blocks) is **already available** from both Claude Code CLI and GitHub Copilot SDK but is being filtered out at three layers before reaching the UI.

- **Components affected**: Adapters (2), API route (1), SSE schemas (1), hooks (1), UI components (2), message schemas (2)
- **Critical dependencies**: Existing event pipeline architecture, SSE infrastructure, adapter abstractions
- **Modification risks**: Three-layer changes must be synchronized; backward compatibility with existing sessions
- **Link**: See `research-dossier.md` for full analysis

## Summary

**WHAT**: Surface tool calls (bash commands, file reads, etc.), tool results (command output), and thinking/reasoning blocks in the agents page UI, so users can see exactly what the agent is doing—not just its final text responses. Events are persisted server-side so sessions can be resumed after page refresh.

**WHY**: Users currently have no visibility into agent activity. When Claude runs a command or reads a file, that activity is invisible. This makes it difficult to understand what the agent is doing, debug issues, or trust the agent's actions. Full visibility builds trust and enables effective human-agent collaboration. Server-side persistence ensures session history survives page refreshes and can be reviewed later.

## Goals

- **G1**: Display tool invocations in real-time as they happen (tool name, input parameters)
- **G2**: Display tool results when execution completes (output, success/error status)
- **G3**: Display thinking/reasoning blocks when available (Claude extended thinking)
- **G4**: Provide collapsible UI for verbose output (don't overwhelm the conversation view)
- **G5**: Maintain consistent experience across both Claude and Copilot agents
- **G6**: Preserve accessibility (screen reader support, keyboard navigation)
- **G7**: Handle graceful degradation when features aren't available (e.g., Copilot has no thinking blocks)

## Architecture Decisions

### Event-Sourced Storage Model

Events are persisted server-side, not streamed directly to the client. This enables:
- **Resumability**: Page refresh just re-fetches events
- **Reviewability**: Can return to old sessions
- **Reliability**: SSE drops don't lose data

### Storage Structure

```
.chainglass/
  workspaces/
    <workspace-slug>/           # Hardcoded for now (concept in development)
      data/
        <agent-instance-slug>/  # e.g., "claude-code" or "copilot"
          <session-id>/         # Format: YYYY-MM-DD-<hash>, e.g., "2026-01-27-a1b2c3"
            events.ndjson       # Append-only event log
          archived/             # Old or deleted sessions moved here
            <session-id>/
              events.ndjson
```

### Event Schema

```typescript
interface AgentEvent {
  id: string;              // Sequential: evt_001, evt_002, ...
  sessionId: string;       // Parent session ID
  timestamp: string;       // ISO 8601
  type: AgentEventType;    // See below
  data: Record<string, unknown>;
}

type AgentEventType =
  | 'text_delta'      // Streaming text chunk
  | 'message'         // Complete message
  | 'tool_call'       // Tool invocation (name, input)
  | 'tool_result'     // Tool output (result, success/error)
  | 'thinking'        // Reasoning block (Claude only)
  | 'usage'           // Token metrics
  | 'status'          // Session status change
  | 'error';          // Error occurred
```

### API Endpoints

```
GET  /api/agents/sessions/:sessionId/events              # All events
GET  /api/agents/sessions/:sessionId/events?since=evt_X  # Events after ID
POST /api/agents/sessions/:sessionId/archive             # Move to archived
```

### SSE Model (Notification Only)

SSE sends lightweight notifications, client fetches full data:
```
event: agent_update
data: { "sessionId": "2026-01-27-a1b2c3", "eventId": "evt_042", "type": "tool_call" }
```

Client workflow:
1. **Page load**: `GET /events` → render all
2. **Subscribe SSE**: Listen for notifications
3. **On notification**: `GET /events?since=lastEventId` → append new events
4. **Page refresh**: Repeat from step 1

### Message Content Types

Messages include a `contentType` field for UI rendering:
```typescript
contentType?: 'text' | 'tool_call' | 'tool_result' | 'thinking'
```
- `text`: Regular chat message (default)
- `tool_call`: Render as collapsible tool card with input
- `tool_result`: Render as tool output (grouped with its tool_call)
- `thinking`: Render as collapsible thinking block

## Non-Goals

- **NG1**: Adding new agent capabilities (this is visibility only, not new features)
- **NG2**: Modifying how agents execute tools (backend behavior unchanged)
- **NG3**: Real-time editing or intervention in tool execution
- **NG4**: Database storage (file-based NDJSON is sufficient for MVP)
- **NG5**: Performance optimization via virtualization (can be addressed in future iteration)
- **NG6**: Supporting agents beyond Claude Code and GitHub Copilot

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=2, N=1, F=1, T=1 (Total: 8)
  - Surface Area (S=2): Cross-cutting changes across shared package, web app, and components
  - Integration (I=1): Existing SDK integrations, well-documented event formats
  - Data/State (D=2): New event storage system with file-based persistence, API endpoints
  - Novelty (N=1): Requirements clear from research, architecture now well-defined
  - Non-Functional (F=1): Accessibility requirements, streaming performance considerations
  - Testing/Rollout (T=1): Integration tests needed, but no feature flags required
- **Confidence**: 0.85 (research provides strong foundation, implementation path is clear)
- **Assumptions**:
  - Claude CLI stream-json format is stable and matches research findings
  - Copilot SDK tool.execution_* events work as documented
  - Existing SSE infrastructure can handle additional event types without performance issues
- **Dependencies**:
  - Claude Code CLI installed and authenticated
  - GitHub Copilot SDK v0.1.16+ (technical preview)
- **Risks**:
  - Claude CLI bugs (#1920, #2904) may affect tool event reliability
  - Copilot SDK in technical preview—API may change
  - Three-layer synchronization complexity
- **Phases**:
  1. Event storage system (file-based NDJSON, storage service, API endpoints)
  2. Extend shared event types and adapter parsing (tool_call, tool_result, thinking)
  3. Update web layer (SSE notifications, event fetching hooks)
  4. Build UI components (ToolCallCard, ThinkingBlock, collapsible sections)
  5. Integration testing and accessibility verification

## Acceptance Criteria

### Tool Call Visibility

- **AC1**: When Claude executes a bash command, the UI displays a tool card showing the command being run within 500ms of execution start
- **AC2**: When a tool completes, the UI updates the tool card to show success/error status and output
- **AC3**: Tool cards are collapsible—collapsed by default shows tool name and status; expanded shows full input/output
- **AC4**: When Copilot executes a tool, the same visibility is provided (tool name, input, output, status)

### Thinking Block Visibility

- **AC5**: When Claude emits thinking blocks (extended thinking enabled), they appear in the UI as collapsible "Thinking..." sections
- **AC6**: Thinking blocks are visually distinct from regular assistant messages (different styling)
- **AC6a**: Thinking blocks display by default but start collapsed (user can expand to read)
- **AC7**: When using Copilot with reasoning enabled, reasoning blocks appear in UI (Copilot uses `assistant.reasoning` events)

### Streaming and Real-Time Updates

- **AC8**: Tool execution status updates in real-time via SSE (user sees "Running..." then "Complete")
- **AC9**: Long tool outputs stream progressively, not all-at-once after completion
- **AC10**: Text responses continue to stream normally alongside tool activity

### Visual Design and UX

- **AC11**: Tool calls are visually distinguished from chat messages (distinct background, border, icon)
- **AC12**: Error states are clearly indicated (red styling, error icon, error message visible)
- **AC12a**: Tool cards auto-expand when an error occurs (errors need immediate visibility)
- **AC13**: Expand/collapse state persists during the session (user's preference remembered)
- **AC13a**: Tool output is truncated at 20 lines or 2000 characters with "Show more" link

### Accessibility

- **AC14**: Tool cards have proper ARIA attributes (`aria-expanded`, `aria-controls`)
- **AC15**: Streaming content uses `aria-live` regions for screen reader announcements
- **AC16**: All interactive elements are keyboard accessible (Enter/Space to toggle, Tab to navigate)

### Persistence and Resumability

- **AC17**: Events are persisted to `.chainglass/workspaces/<slug>/data/` as NDJSON files
- **AC18**: Page refresh reloads session events from server (no data loss)
- **AC19**: `GET /events?since=<id>` returns only events after the specified ID
- **AC20**: Old/deleted sessions can be archived (moved to `archived/` subfolder)

### Backward Compatibility

- **AC21**: Existing sessions without tool data continue to work (no migration required)
- **AC22**: If adapters fail to parse new event types, they fall back to current behavior (no crashes)

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Claude CLI bug #1920 causes missing tool events | Medium | Medium | Idle detection + timeout fallback already in place |
| Copilot SDK changes in future release | Medium | Low | Version-pin SDK, wrap in adapter abstraction |
| Performance degradation with many tool calls | Low | Medium | Defer virtualization to future iteration if needed |
| Three-layer sync bugs | Medium | High | Careful phased implementation with tests at each layer |

### Assumptions

- Users want to see tool activity (validated by user request)
- Collapsible UI is the right pattern for verbose output (supported by UI research)
- Current SSE infrastructure has capacity for additional event types
- localStorage persistence is sufficient (no need for server-side storage)

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Cross-cutting changes across adapters, schemas, and UI require comprehensive test coverage to ensure three-layer synchronization works correctly
- **Focus Areas**:
  - Adapter event parsing (unit tests for Claude content blocks, Copilot tool events)
  - SSE event schema validation (Zod schema tests)
  - UI component rendering (React Testing Library for ToolCallCard, ThinkingBlock)
  - Integration tests for full event flow (adapter → API → SSE → hook → UI)
  - Accessibility tests (ARIA attributes, keyboard navigation)
- **Excluded**: E2E tests requiring live Claude/Copilot sessions (use fixtures from demo scripts)
- **Mock Usage**: Targeted mocks — mock external SDKs and CLI, use real implementations for internal code
- **Test-First Workflow**: Write failing tests before implementation at each layer

## Documentation Strategy

- **Location**: docs/how/ only
- **Rationale**: Internal feature enhancement; users don't need README changes. Developer guide for extending event types may be useful.
- **Content**: Guide for adding new event types to the pipeline (for future maintainers)
- **Target Audience**: Developers extending agent capabilities
- **Maintenance**: Update when adding new agent types or event types

## Open Questions (Resolved)

- **OQ1**: Should tool cards auto-expand on error, or remain collapsed with error indicator?
  - **Resolution**: Auto-expand on error — errors need immediate visibility
- **OQ2**: Should there be a "show all" / "collapse all" button for conversations with many tool calls?
  - **Resolution**: Defer to future iteration — not critical for MVP
- **OQ3**: What is the maximum output length to display inline before truncating with "Show more"?
  - **Resolution**: 20 lines or 2000 characters, whichever comes first
- **OQ4**: Should thinking blocks be on by default or require user opt-in to display?
  - **Resolution**: On by default (collapsed) — users can expand if interested

## ADR Seeds (Optional)

### Decision Drivers
- Need real-time visibility without page refresh
- Must work with existing adapter abstraction pattern
- Accessibility is non-negotiable
- Should feel native to existing chat UI

### Candidate Alternatives
- **A**: Extend existing event types inline (chosen direction from research)
- **B**: Create separate "activity log" panel alongside chat
- **C**: Use polling instead of SSE for tool status

### Stakeholders
- End users of the agents page
- Developers maintaining adapter code

## Unresolved Research

The research dossier identified external research opportunities that were partially addressed:

- **Claude CLI stream-json schema**: ✅ Addressed via Perplexity research
- **Copilot SDK tool events**: ✅ Addressed via Perplexity research
- **UI patterns for agent activity**: ✅ Addressed via Perplexity research

No unresolved external research topics remain.

## Clarifications

### Session 2026-01-27

| # | Question | Answer | Updated Section |
|---|----------|--------|-----------------|
| Q1 | Workflow mode? | **B (Full)** — CS-4 with cross-cutting changes + storage | Header |
| Q2 | Testing approach? | **Full TDD** — comprehensive coverage for event storage + UI | Testing Strategy |
| Q3 | Mock usage? | **Targeted mocks** — mock SDKs/CLI, real internal code | Testing Strategy |
| Q4 | Documentation location? | **docs/how/ only** — internal feature, dev guide for maintainers | Documentation Strategy |
| Q5 | Auto-expand on error? | **Yes** — errors need immediate visibility | Open Questions |
| Q6 | Show all/collapse all? | **Deferred** — not critical for MVP | Open Questions |
| Q7 | Max output length? | **20 lines or 2000 chars** | Open Questions |
| Q8 | Thinking blocks default? | **On by default (collapsed)** | Open Questions |
| Q9 | Event storage architecture? | **Server-side NDJSON** — events persisted to `.chainglass/workspaces/<slug>/data/`, SSE sends notifications only, client fetches via API | Architecture Decisions |
| Q10 | Storage path format? | **`.chainglass/workspaces/<workspace-slug>/data/<agent-slug>/<session-id>/`** — session-id is ISO date + hash, archived sessions moved to `archived/` | Architecture Decisions |

**Coverage Summary**:
- **Resolved**: Mode, Testing Strategy, Documentation Strategy, all 4 Open Questions, Event Storage Architecture
- **Deferred**: Collapse all button (future iteration), workspace-slug (hardcoded for now)
- **Outstanding**: None

---

**Spec Status**: ✅ Clarified
**Next Step**: Run `/plan-3-architect` to generate phase-based plan
