# Workshop: Agent SSE Migration to Multiplexed Provider

**Type**: Integration Pattern
**Plan**: 072-sse-multiplexing
**Created**: 2026-03-09
**Status**: Draft

**Related Documents**:
- [001-multiplexer-design.md](001-multiplexer-design.md)
- [SSE Multiplexing Spec](../sse-multiplexing-spec.md)
- [SSE Improve Dossier](../../../scratch/sse-improve.md)

**Domain Context**:
- **Primary Domain**: `_platform/events` (SSE transport)
- **Related Domains**: `agents` (consumer), `_platform/state` (state connector)

---

## Purpose

Migrate `useAgentManager` and `useAgentInstance` from direct `EventSource` connections to the multiplexed SSE provider. These two hooks were **not migrated** during Plan 072's Phase 5 and are now causing browser lockups when navigating to the agents page — each hook opens an independent connection to `/api/agents/events`, exhausting the HTTP/1.1 connection limit alongside the multiplexed `/api/events/mux`.

## Key Questions Addressed

- What exact code changes are needed in each file?
- Do we need backend changes to `/api/agents/events`?
- How do named SSE events map to the multiplexed wire format?
- What happens to the `agent_event` wrapper pattern in `useAgentInstance`?

---

## The Problem

### Connection Inventory (Current)

When a user opens the agents page and clicks an agent:

| Connection | Source | Type | Lifetime |
|------------|--------|------|----------|
| `/api/events/mux?channels=...` | MultiplexedSSEProvider | SSE | Page lifetime |
| `/api/agents/events` | useAgentManager | SSE | Component lifetime |
| `/api/agents/events` | useAgentInstance | SSE | Overlay lifetime |
| `GET /api/agents?workspace=X` | useAgentManager (polling) | REST 5s | Component lifetime |
| `GET /api/agents?workspace=X` | useRecentAgents (polling) | REST 5s | Page lifetime |
| Terminal WebSocket | Terminal sidecar | WS | Session lifetime |

**Result**: 3 SSE + 1 WS + continuous polling = browser connection exhaustion → lockup.

### Target State

| Connection | Source | Type | Lifetime |
|------------|--------|------|----------|
| `/api/events/mux?channels=...,agents` | MultiplexedSSEProvider | SSE | Page lifetime |
| Terminal WebSocket | Terminal sidecar | WS | Session lifetime |

**Result**: 1 SSE + 1 WS. All agent events arrive via the `agents` channel on the existing mux connection.

---

## Migration Pattern

### Reference: How File Changes Was Migrated

```typescript
// BEFORE: Direct EventSource with reconnect logic
const es = new EventSource(`/api/events/file-changes?worktree=${path}`);
es.addEventListener('file-changed', handler);
// + 50 lines of reconnect/cleanup logic

// AFTER: One line via multiplexed provider
const { isConnected } = useChannelCallback('file-changes', (msg) => {
  if (msg.type !== 'file-changed') return;
  // ... handle event
});
```

The pattern removes all EventSource lifecycle management. The `MultiplexedSSEProvider` (mounted in workspace layout) handles connection, reconnection, and fan-out.

---

## Changes Required

### File 1: `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx`

Add `'agents'` to the channel list:

```typescript
// BEFORE
const WORKSPACE_SSE_CHANNELS = [
  'event-popper',
  'file-changes',
  'work-unit-state',
  'workflows',
  'unit-catalog',
] as const;

// AFTER
const WORKSPACE_SSE_CHANNELS = [
  'event-popper',
  'file-changes',
  'work-unit-state',
  'workflows',
  'unit-catalog',
  'agents',
] as const;
```

**Why**: The mux endpoint subscribes to exactly the channels in this array. Without `'agents'`, agent events won't flow through the mux.

---

### File 2: `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts`

**Remove** (~80 lines):
- `EventSource` ref, reconnect refs, reconnect counter
- `connectSSE()` function (entire reconnect state machine)
- SSE cleanup `useEffect`

**Replace with** (~10 lines):

```typescript
import { useChannelCallback } from '@/lib/sse';

// Inside the hook, replace the SSE block with:
const { isConnected } = useChannelCallback('agents', (msg) => {
  if (!subscribeToSSE) return;

  const eventType = msg.type ?? 'unknown';

  // List-affecting events → invalidate query
  if (['agent_status', 'agent_intent', 'agent_created', 'agent_terminated'].includes(eventType)) {
    queryClient.invalidateQueries({ queryKey: [AGENTS_QUERY_KEY] });
  }

  // Forward all events to optional callback
  if (onAgentEvent) {
    onAgentEvent(eventType, msg as AgentSSEEvent);
  }
});
```

**Keep unchanged**:
- `useQuery` for fetching agent list (including `refetchInterval: 5000` when SSE disabled)
- `createMutation`
- All return values (add `isConnected` if not already exposed)

### Named Event → msg.type Mapping

The old code used `es.addEventListener('agent_status', ...)`. The multiplexed provider delivers all events via `onmessage` with the event type in `msg.type`:

| Old Pattern | New Pattern |
|-------------|-------------|
| `es.addEventListener('agent_status', fn)` | `if (msg.type === 'agent_status')` |
| `es.addEventListener('agent_created', fn)` | `if (msg.type === 'agent_created')` |
| `es.addEventListener('agent_terminated', fn)` | `if (msg.type === 'agent_terminated')` |
| `es.addEventListener('agent_intent', fn)` | `if (msg.type === 'agent_intent')` |

---

### File 3: `apps/web/src/features/019-agent-manager-refactor/useAgentInstance.ts`

**Remove** (~100 lines):
- `EventSource` ref, reconnect state machine
- `connectSSE()` function
- SSE cleanup `useEffect`

**Replace with** (~20 lines):

```typescript
import { useChannelCallback } from '@/lib/sse';

// Inside the hook:
const { isConnected } = useChannelCallback('agents', (msg) => {
  if (!subscribeToSSE) return;

  const data = msg as AgentSSEEvent;
  const eventType = data.type ?? 'unknown';

  // Filter by agentId (client-side — all agent events arrive on same channel)
  if (data.agentId !== agentId) return;

  // Status/intent changes → refetch instance data
  if (eventType === 'agent_status' || eventType === 'agent_intent') {
    queryClient.invalidateQueries({ queryKey: [AGENT_QUERY_KEY, agentId] });
  }

  // Forward to callback (unwrap agent_event wrapper if needed)
  if (onAgentEvent) {
    if (eventType === 'agent_event' && data.event) {
      const inner = data.event as { type?: string; data?: Record<string, unknown> };
      onAgentEvent(inner.type ? `agent_${inner.type}` : eventType, {
        agentId,
        ...inner.data,
      } as AgentSSEEvent);
    } else {
      onAgentEvent(eventType, data);
    }
  }
});
```

**Keep unchanged**:
- `useQuery` for fetching agent instance
- `runMutation`, `stopMutation`
- All derived values (`status`, `intent`, `events`, `isWorking`)
- `agentId` filtering logic (just moved into the callback)

---

### File 4: `/api/agents/events/route.ts` — NO CHANGES NEEDED

The agent events endpoint already uses `sseManager.broadcast('agents', eventType, data)` which the mux endpoint picks up automatically. The old direct endpoint can remain for backwards compatibility or be removed later.

---

## Verification Checklist

After migration, verify:

- [ ] **Agents page loads without lockup** — `networkidle` may still not fire (SSE is intentionally open), but page should be responsive
- [ ] **Agent list updates in real-time** — create/terminate an agent, list reflects change
- [ ] **Clicking an agent works** — overlay opens, no additional connections created
- [ ] **Agent streaming works** — `agent_text_delta` events flow to chat view
- [ ] **Connection count**: exactly 1 SSE (`/api/events/mux`) + 1 WS (terminal) per tab
- [ ] **Network tab**: no requests to `/api/agents/events` (all via mux)
- [ ] **Existing tests pass** — `just fft` green

### Harness Verification

```bash
# Screenshot agents page (should not timeout)
just harness screenshot agents --url "http://127.0.0.1:3159/workspaces/harness-test-workspace/agents"

# Console logs (should show no new errors)
just harness console-logs --url "http://127.0.0.1:3159/workspaces/harness-test-workspace/agents" --wait 5 --filter errors
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Named events not flowing through mux | Low | High | SSEManager already tags `type` field; verify in browser |
| `agent_event` wrapper breaks | Medium | Medium | Keep exact unwrap logic from useAgentInstance |
| Polling still creating load | Low | Low | Polling only active when `subscribeToSSE: false`; this is intentional fallback |
| Tests break | Low | Medium | Agent tests may mock EventSource directly; update to use fake mux |

---

## Lines of Code Impact

| File | Lines Removed | Lines Added | Net |
|------|--------------|-------------|-----|
| layout.tsx | 0 | 1 | +1 |
| useAgentManager.ts | ~80 | ~15 | -65 |
| useAgentInstance.ts | ~100 | ~25 | -75 |
| **Total** | ~180 | ~41 | **-139** |

Net removal of ~139 lines of duplicated SSE connection/reconnect logic.
