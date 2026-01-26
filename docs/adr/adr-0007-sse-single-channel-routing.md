---
title: "ADR-0007: SSE Single-Channel Event Routing Pattern"
status: "Accepted"
date: "2026-01-26"
authors: "Development Team"
tags: ["architecture", "decision", "sse", "real-time", "events", "streaming"]
supersedes: ""
superseded_by: ""
---

# ADR-0007: SSE Single-Channel Event Routing Pattern

## Status

Accepted

## Context

The Multi-Agent Web UI (Plan 012) requires real-time event streaming for multiple concurrent agent sessions. Each session runs independently, producing events (text deltas, status changes, usage updates, errors) that must be routed to the correct UI state.

**Initial Approach (Per-Session Channels):**
The original implementation created dedicated SSE channels per session (`/api/events/agent-${sessionId}`). Each session opened its own EventSource connection, and the backend broadcast events to session-specific channels.

**Problems Discovered:**

1. **Cross-Session Message Leakage**: When users switched between sessions rapidly, SSE callbacks would dispatch events to the currently active session rather than the session that generated the event. The callbacks received `sessionId` in the event data but ignored it, dispatching to whatever session was currently focused.

2. **Lost Events When Tab Backgrounded**: If a user started an agent, then switched to another session (or backgrounded the tab), the original session's SSE events would arrive but be discarded because validation logic rejected events for non-active sessions.

3. **Race Conditions During Session Switching**: Brief periods existed where both old and new SSE connections were active. Buffered events from the old connection could fire after the new connection established, causing events to route to the wrong session.

4. **Complexity Scaling**: N sessions meant N EventSource connections, approaching browser limits (6 concurrent HTTP/1.1 connections per domain) and multiplying heartbeat/cleanup overhead.

**Constraints:**
- Sessions must remain isolated (no cross-talk)
- Events must be delivered even when session is not focused
- Must work reliably across tab switching, backgrounding, and rapid session changes
- Must support concurrent agent execution (multiple sessions running simultaneously)

## Decision

Adopt a **Single Global SSE Channel with Client-Side Routing** pattern:

1. **One SSE connection** to `/api/events/agents` for all agent events
2. **Every event includes `sessionId`** in the payload for routing
3. **Centralized sessions store** (Map) holds all session states
4. **SSE callbacks route by sessionId** to update the correct session regardless of which is active
5. **API response fallback** catches completion if SSE missed events (tab backgrounded)

**Exemplar Implementation:** `apps/web/app/(dashboard)/agents/page.tsx`

```typescript
// Single global SSE channel - one connection for all sessions
const { isConnected } = useAgentSSE('agents', {
  onTextDelta: useCallback(
    (delta: string, sessionId: string) => {
      // Route to correct session by ID - not the active session
      updateSession(sessionId, (s) => ({
        ...s,
        streamingContent: s.streamingContent + delta,
      }));
    },
    [updateSession]
  ),
  // ... other callbacks follow same pattern
});
```

## Consequences

**Positive**

- **POS-001**: Single connection regardless of session count eliminates browser connection limit concerns and reduces resource overhead
- **POS-002**: Events route to correct session even when not focused, enabling concurrent agent execution with reliable state updates
- **POS-003**: Simpler mental model - one channel, sessionId-based routing, centralized state
- **POS-004**: Fallback mechanism (API response body) ensures no lost events even if SSE connection fails or tab is backgrounded
- **POS-005**: Scales gracefully from 1 to 100+ concurrent sessions without additional connections

**Negative**

- **NEG-001**: All events broadcast to all clients (slight amplification), though filtering is O(1) lookup by sessionId
- **NEG-002**: Requires sessionId in every event payload (minor bandwidth overhead)
- **NEG-003**: Client-side routing logic must be correct; bugs could cause cross-session leakage (mitigated by centralized updateSession helper)

## Alternatives Considered

### Per-Session SSE Channels

- **ALT-001**: **Description**: Each session opens dedicated EventSource to `/api/events/agent-${sessionId}`. Backend broadcasts to session-specific channels only.
- **ALT-002**: **Rejection Reason**: Caused the original problems - cross-session leakage when callbacks ignored sessionId, lost events when session not active, N connections approaching browser limits. More complex connection lifecycle management.

### WebSocket Connections

- **ALT-003**: **Description**: Single WebSocket connection with bidirectional communication. Server maintains connection state, broadcasts events via WebSocket frames.
- **ALT-004**: **Rejection Reason**: Higher complexity (different protocol, stateful server), no automatic retry (must implement reconnection manually), proxy/firewall compatibility concerns, deployment complexity (some edge platforms don't support WebSocket). SSE's built-in auto-reconnect and HTTP simplicity won for this use case.

### Polling

- **ALT-005**: **Description**: Client polls `/api/agents/status/${sessionId}` every 500ms-2s. Backend buffers events per session.
- **ALT-006**: **Rejection Reason**: Fundamentally incompatible with streaming text deltas. 500ms-2s latency creates visible gaps in streamed content. High request overhead (N sessions × 2 polls/sec). Not true real-time experience.

## Implementation Notes

- **IMP-001**: The centralized sessions Map (`useState<Map<string, SessionState>>`) is the single source of truth. SSE callbacks update sessions by ID, not by "active session" reference. This eliminates stale closure bugs.
- **IMP-002**: The `updateSession(sessionId, updater)` helper ensures atomic updates to the correct session. All SSE callbacks use this pattern rather than direct dispatch.
- **IMP-003**: API response fallback (lines 232-258 in exemplar) checks if session is still 'running' after API returns. If SSE didn't complete it, the response body provides the final state. This handles backgrounded tabs gracefully.
- **IMP-004**: Success criteria: Multiple agents can run concurrently, user can switch between sessions freely, each session shows only its own events, no cross-session contamination visible in console logs.

## References

- **REF-001**: [Plan 012 Spec](../plans/012-web-agents/web-agents-spec.md)
- **REF-002**: [Plan 012 Plan](../plans/012-web-agents/web-agents-plan.md)
- **REF-003**: [ADR-0006: CLI-Based Workflow Agent Orchestration](./adr-0006-cli-based-workflow-agent-orchestration.md) - Related agent orchestration patterns
- **REF-004**: [SSE Integration Guide](../how/sse-integration.md) - Technical SSE documentation
- **REF-005**: Exemplar: `apps/web/app/(dashboard)/agents/page.tsx` - Reference implementation
