# Research Dossier: SSE Multiplexing

**Generated**: 2026-03-08T05:30:00Z
**Research Query**: "Multiplexed SSE endpoint to consolidate all channels into one EventSource per tab"
**Mode**: Pre-Plan (Plan 072)
**Location**: `docs/plans/072-sse-multiplexing/research-dossier.md`
**FlowSpace**: Available
**Findings**: 45+ across 8 subagents

## Executive Summary

### What It Does
The codebase has a mature SSE infrastructure (`_platform/events`) that broadcasts real-time events from server to browser via per-channel `EventSource` connections. Each SSE channel (file-changes, event-popper, work-unit-state, workflows, agents) opens a separate HTTP connection per tab. Under HTTP/1.1's 6-connection-per-origin limit, 2-3 tabs exhaust the budget and lock up the app.

### Business Purpose
A single multiplexed SSE endpoint would consolidate all channels into one `EventSource` per tab, eliminating connection pressure. This unblocks: (1) the post-merge question-popper regression, (2) re-enabling GlobalStateConnector (disabled since Plan 053), and (3) all future SSE consumers.

### Key Insights
1. **Server-side is already centralized** — all events flow through `CentralEventNotifier` → `SSEManagerBroadcaster` → `SSEManager`. The fix is client-side transport consolidation.
2. **The code already documents this as the intended fix** — `state-connector.tsx` line 30-32 says "single multiplexed SSE endpoint that carries all channels in one connection."
3. **Adding `channel` to SSEManager.broadcast() payload is the critical server change** — one line, non-breaking, enables client-side demultiplexing.
4. **Mount at workspace layout level** — above all consumers, persists across page navigation within a workspace, cleanly unmounts on workspace change.

### Quick Stats
- **SSE Consumers**: 10 (4 easy, 2 medium, 2 hard, 2 infrastructure)
- **WebSocket Consumers**: 1 (terminal — out of scope)
- **Server Changes**: ~50 lines (route + SSEManager channel tag)
- **Client Changes**: ~200 lines (MultiplexedSSEProvider + hook)
- **Migration**: ~100 lines per consumer (gradual, non-breaking)
- **Test Infrastructure**: FakeEventSource + FakeController exist; need FakeMultiplexedEventSource extension
- **Prior Learnings**: 8+ relevant discoveries from Plans 005, 015, 019, 053, 059, 067
- **Domain**: Extension of `_platform/events` (not a new domain)

---

## How It Currently Works

### Entry Points (Server → Client Event Flow)

| Step | Component | File | Action |
|------|-----------|------|--------|
| 1 | Domain Service | `question-popper.service.ts`, etc. | Calls `notifier.emit(domain, eventType, data)` |
| 2 | CentralEventNotifierService | `central-event-notifier.service.ts` | Passthrough to `broadcaster.broadcast(domain, eventType, data)` |
| 3 | SSEManagerBroadcaster | `sse-manager-broadcaster.ts` | Passthrough to `sseManager.broadcast(channel, eventType, data)` |
| 4 | SSEManager | `sse-manager.ts` | Builds `{...data, type: eventType}`, sends to all controllers on channel |
| 5 | API Route | `api/events/[channel]/route.ts` | ReadableStream → EventSource |
| 6 | Client Hook/Provider | `useSSE.ts` / direct EventSource | Receives JSON, processes events |

### DI Container Wiring

```typescript
// apps/web/src/lib/di-container.ts (lines 541-544)
const centralNotifier = new CentralEventNotifierService(
  new SSEManagerBroadcaster(sseManager)  // sseManager is globalThis singleton
);
container.register<ICentralEventNotifier>(
  WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER,
  { useValue: centralNotifier }
);
```

### Channel Registry

```typescript
// packages/shared/src/features/027-central-notify-events/workspace-domain.ts
WorkspaceDomain = {
  Agents: 'agents',
  FileChanges: 'file-changes',
  Workflows: 'workflows',
  WorkUnitState: 'work-unit-state',
  UnitCatalog: 'unit-catalog',
  EventPopper: 'event-popper',
}
```

### Current Payload Format (Missing Channel)

```json
{"type": "question-asked", "questionId": "q_abc", "outstandingCount": 3}
```

**Problem**: No `channel` field. Client can't demultiplex when multiple channels share one EventSource.

---

## Complete SSE Consumer Inventory

### Priority 1: Easy Migration (~1h each)

| Consumer | File | SSE URL | Mount Point | Always On? | Events |
|----------|------|---------|-------------|------------|--------|
| QuestionPopperProvider | `067-question-popper/hooks/use-question-popper.tsx:154` | `/api/events/event-popper` | Workspace layout | Yes | question-asked, answered, dismissed, clarification, alert-sent, acknowledged |
| useWorkflowSSE | `050-workflow-page/hooks/use-workflow-sse.ts` | `/api/events/workflows` | Workflow page | Only if open | workflow_status, task_update |
| useWorkunitCatalogChanges | (catalog editor) | `/api/events/unit-catalog` | Catalog page | Only if open | catalog changes |
| KanbanContent | (kanban board) | `/api/events/{sseChannel}` | Kanban page | Only if open | card updates |

### Priority 2: Medium Migration (~2h each)

| Consumer | File | SSE URL | Mount Point | Always On? | Notes |
|----------|------|---------|-------------|------------|-------|
| useAgentManager | `019-agent-manager-refactor/useAgentManager.ts` | `/api/agents/events` | Agent chrome | Yes | 8 named event types, filters by agentId |
| useAgentInstance | (agent detail) | `/api/agents/events` | Agent detail | Conditional | Filters by specific agentId |

### Priority 3: Hard Migration (~3h each)

| Consumer | File | SSE URL | Mount Point | Always On? | Notes |
|----------|------|---------|-------------|------------|-------|
| FileChangeProvider | `045-live-file-events/file-change-provider.tsx` | `/api/events/file-changes` | Browser page | Yes | Filters by worktreePath client-side, 50 reconnect attempts, hub pattern |
| useServerSession | `hooks/useServerSession.ts` | `/api/workspaces/{slug}/agents/events` | Workspace-scoped | Conditional | Named event listener, workspace-scoped variant |

### Infrastructure (Meta-consumers)

| Consumer | File | Notes |
|----------|------|-------|
| ServerEventRoute | `lib/state/server-event-route.tsx` | Bridges SSE → GlobalStateSystem. Uses `useSSE` per route descriptor. |
| GlobalStateConnector | `lib/state/state-connector.tsx` | **DISABLED**. Mounts ServerEventRoute instances. Re-enable after multiplexing. |

### Out of Scope

| Consumer | Protocol | Notes |
|----------|----------|-------|
| useTerminalSocket | WebSocket | Bidirectional, different protocol, separate concern |

---

## Architecture & Design

### Component Map: Multiplexed SSE

```
┌─────────────────────────────────────────────────────────────┐
│ Server                                                       │
│                                                              │
│  Domain Services → CentralEventNotifier → SSEManagerBroadcaster │
│                                              ↓               │
│                                         SSEManager           │
│                                    (per-channel Sets)        │
│                                              ↓               │
│                            /api/events/multiplexed           │
│                     (one controller in ALL channel Sets)     │
│                                              ↓               │
│                    payload: { channel, type, ...data }       │
└──────────────────────────────┬──────────────────────────────┘
                               │ SSE stream (1 connection)
                               ↓
┌─────────────────────────────────────────────────────────────┐
│ Browser Tab                                                  │
│                                                              │
│  MultiplexedSSEProvider (workspace layout)                    │
│    └── 1× EventSource('/api/events/multiplexed?channels=...') │
│         ↓ demultiplexer (filter by msg.channel)              │
│         ├── event-popper → QuestionPopperProvider            │
│         ├── file-changes → FileChangeProvider                │
│         ├── work-unit-state → ServerEventRoute → GlobalState │
│         ├── workflows → useWorkflowSSE (if page open)        │
│         └── agents → useAgentManager                         │
└─────────────────────────────────────────────────────────────┘
```

### Optimal Mount Point

```tsx
// apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx
<WorkspaceProvider>
  <SDKWorkspaceConnector>
    <WorkspaceAttentionWrapper>
      <TerminalOverlayWrapper>
        <ActivityLogOverlayWrapper>
          {/* ★ NEW: Single SSE connection for all channels */}
          <MultiplexedSSEProvider channels={['event-popper','file-changes','work-unit-state']}>
            <QuestionPopperOverlayWrapper>  {/* consumes event-popper channel */}
              <WorkspaceAgentChrome>        {/* consumes agents channel */}
                {children}                  {/* page consumes file-changes etc */}
              </WorkspaceAgentChrome>
            </QuestionPopperOverlayWrapper>
          </MultiplexedSSEProvider>
        </ActivityLogOverlayWrapper>
      </TerminalOverlayWrapper>
    </WorkspaceAttentionWrapper>
  </SDKWorkspaceConnector>
</WorkspaceProvider>
```

**Why workspace level**: Persists across page navigation within a workspace, cleanly unmounts on workspace change, can access slug for channel scoping.

### Server-Side Changes Required

#### 1. SSEManager — Add `channel` to payload (1 line)

```typescript
// sse-manager.ts, broadcast() method
const payload =
  typeof data === 'object' && data !== null
    ? { ...(data as Record<string, unknown>), type: eventType, channel: channelId }  // ← ADD channel
    : { type: eventType, data, channel: channelId };
```

**Non-breaking**: Adds optional field. All existing consumers ignore unknown fields.

#### 2. Multiplexed Route — New endpoint

```typescript
// /api/events/multiplexed/route.ts
// Parse ?channels=file-changes,event-popper,work-unit-state
// Register ONE controller in SSEManager for EACH requested channel
// Single heartbeat, single cleanup
```

**Key**: SSEManager already supports adding the same controller to multiple channel Sets. The controller receives broadcasts from ALL registered channels.

#### 3. No changes needed to:
- CentralEventNotifierService (passthrough)
- SSEManagerBroadcaster (passthrough)
- Domain services (emit same as today)

### Client-Side Changes Required

#### 1. MultiplexedSSEProvider — New provider

```typescript
// Context providing channel-filtered message streams
interface MultiplexedSSEContextValue {
  subscribe(channel: string, callback: (event: ServerEvent) => void): () => void;
  isConnected: boolean;
  error: Error | null;
}
```

#### 2. useChannelEvents — New consumer hook

```typescript
// For consumers: subscribe to one channel's events
function useChannelEvents(channel: string): ServerEvent[] {
  const ctx = useMultiplexedSSE();
  // Filter messages where msg.channel === channel
}
```

#### 3. Consumer migration (gradual, per-consumer)
Each consumer replaces its direct EventSource with `useChannelEvents(channel)`. Processing logic stays identical.

---

## Dependencies & Integration

### What This Depends On
| Dependency | Type | Purpose |
|------------|------|---------|
| SSEManager singleton | Required | Connection pool, broadcast |
| WorkspaceDomain registry | Required | Channel name validation |
| Auth (session check) | Required | Route protection |
| React context | Required | Provider/consumer pattern |

### What Depends on This (After Migration)
| Consumer | Contract |
|----------|----------|
| QuestionPopperProvider | `useChannelEvents('event-popper')` |
| FileChangeProvider | `useChannelEvents('file-changes')` |
| GlobalStateConnector | `useChannelEvents('work-unit-state')` |
| useWorkflowSSE | `useChannelEvents('workflows')` |
| useAgentManager | `useChannelEvents('agents')` |

---

## Quality & Testing

### Existing Test Infrastructure

| Component | File | Tests | Pattern |
|-----------|------|-------|---------|
| FakeEventSource | `test/fakes/fake-event-source.ts` | N/A (utility) | `simulateOpen()`, `simulateMessage(data)`, `simulateError()`, factory tracking |
| FakeController | (SSEManager tests) | N/A (utility) | `enqueue()`, `close()`, `getAllContent()`, `getDecodedChunks()` |
| SSEManager | `test/unit/web/services/sse-manager.test.ts` | ~10 | Broadcast, cleanup, channel isolation, error handling |
| useSSE | `test/unit/web/hooks/use-sse.test.tsx` | ~11 | Connection, messages, reconnect, cleanup |
| FileChangeHub | `test/unit/web/features/045-live-file-events/` | Multiple | Pattern matching, event dispatch |

### Testing Gaps for Multiplexed SSE

1. **Multi-channel on one connection** — FakeEventSource doesn't track channels
2. **Channel-specific message filtering** — No existing test pattern
3. **Channel subscription/unsubscription lifecycle** — New concept
4. **Cross-channel error isolation** — One bad channel shouldn't kill others

### Recommended Test Extensions

- `FakeMultiplexedEventSource` with `simulateChannelMessage(channel, data)`
- Contract tests for MultiplexedSSEProvider (subscribe, filter, reconnect per channel)
- Integration test: broadcast on server → received on correct channel client

---

## Prior Learnings

### PL-01: Iterator Invalidation During Broadcast (Plan 005)
**Source**: Phase 5 SSE Infrastructure review
**What**: Set mutated during iteration causes skipped connections
**Resolution**: Copy to array before iterating (already fixed in SSEManager)
**Action**: Multiplexed route must use same snapshot pattern

### PL-02: Named SSE Events Silently Dropped (Plan 027)
**Source**: Central Event Notification implementation
**What**: Browser `EventSource.onmessage` only receives unnamed events. Named events (`event: foo`) require `addEventListener()`
**Resolution**: SSEManager uses unnamed events with `type` in JSON payload
**Action**: Multiplexed endpoint MUST use unnamed events. Add `channel` to JSON payload, not as SSE `event:` field.

### PL-03: GlobalStateConnector Disabled Due to Connection Limits (Plan 053)
**Source**: DYK #4 in state-connector.tsx
**What**: Adding work-unit-state SSE to browser page stalled navigation
**Resolution**: Commented out GlobalStateConnector with "re-enable when SSE channels multiplexed"
**Action**: Plan 072 directly unblocks this. Re-enable GlobalStateConnector as final phase.

### PL-04: Notification-Fetch Pattern (ADR-0009)
**Source**: Workspace-scoped SSE hooks design
**What**: SSE is a hint; storage is truth. Client refetches full data on SSE event.
**Resolution**: Established as project-wide pattern
**Action**: Multiplexed events are still thin hints. No change to fetch patterns.

### PL-05: Domain Value IS Channel Name (Plan 027)
**Source**: WorkspaceDomain const
**What**: `WorkspaceDomain.EventPopper === 'event-popper'` — mismatch causes silent event loss
**Resolution**: Strict naming convention
**Action**: Multiplexed `channel` field must use exact WorkspaceDomain values.

### PL-06: State Domain Name Mismatch (Plan 059)
**Source**: ServerEventRoute implementation
**What**: `work-unit` vs `work-unit-state` mismatch broke state routing
**Resolution**: Standardized all paths
**Action**: Channel names in multiplexed payload must match WorkspaceDomain exactly.

### PL-07: Memory Leak in Heartbeat Cleanup (Plan 005)
**Source**: Phase 5 review
**What**: Dead connections accumulate when heartbeat fails without cleanup
**Resolution**: Added `removeConnection()` in catch block
**Action**: Multiplexed route must clean up controller from ALL registered channels on disconnect.

### PL-08: HTTP/2 Incompatible with Next.js App Router (Plan 067)
**Source**: Workshop 002
**What**: Custom `http2.createSecureServer()` breaks middleware with pseudo-header errors
**Resolution**: HTTP/2 deferred; multiplexed SSE chosen instead
**Action**: Design must work on HTTP/1.1. One connection per tab is the hard constraint.

---

## Domain Context

### Owning Domain: `_platform/events`

This is an **extension** of the existing `_platform/events` infrastructure domain. Not a new domain.

| Aspect | Current | After Plan 072 |
|--------|---------|----------------|
| Contracts | ICentralEventNotifier, ISSEBroadcaster, useSSE, useWorkspaceSSE, WorkspaceDomain | + MultiplexedSSEProvider, useChannelEvents |
| Routes | `/api/events/[channel]` | + `/api/events/multiplexed` |
| Composition | SSEManager, CentralEventNotifierService, SSEManagerBroadcaster | + multiplexed route handler |
| Payload | `{type, ...data}` | `{channel, type, ...data}` |

### Domain Map Changes
- Add `useChannelEvents` contract edges from consumer domains → `_platform/events`
- Update existing `useSSE` edges to show deprecation path

### Domains Needing domain.md Updates
1. `_platform/events` — new contracts, composition, history
2. `question-popper` — migration from direct EventSource to useChannelEvents
3. `agents` — migration from dedicated route to multiplexed
4. Other consumer domains — as they migrate

---

## Modification Considerations

### ✅ Safe to Modify
- **SSEManager.broadcast() payload** — adding `channel` field is non-breaking
- **New route `/api/events/multiplexed`** — additive, doesn't touch existing routes
- **New client provider/hook** — additive, consumers migrate gradually
- **QuestionPopperProvider SSE code** — self-contained, well-tested

### ⚠️ Modify with Caution
- **useSSE hook** — used by 4+ consumers. Prefer wrapping over modifying.
- **FileChangeProvider** — complex reconnection (50 attempts), worktreePath filtering, hub pattern
- **useAgentManager** — 8 named event types, React Query invalidation, agentId filtering

### 🚫 Danger Zones
- **SSEManager singleton** — survives HMR, all features depend on it. Changes must be non-breaking.
- **CentralEventNotifierService** — pipeline passthrough. Don't change the interface.
- **ServerEventRoute index cursor** — message ordering is critical. Don't break accumulation semantics.

---

## Recommendations

### Implementation Phases (Suggested)

**Phase 1: Server Foundation**
- Add `channel` to SSEManager.broadcast() payload
- Create `/api/events/multiplexed` route
- Tests for multi-channel registration, channel tagging, cleanup

**Phase 2: Client Provider**
- Create MultiplexedSSEProvider + useChannelEvents hook
- Mount in workspace layout
- FakeMultiplexedEventSource for testing

**Phase 3: Migrate Question Popper + File Changes**
- QuestionPopperProvider → useChannelEvents('event-popper')
- FileChangeProvider → useChannelEvents('file-changes')
- Remove direct EventSource from both

**Phase 4: Re-enable GlobalStateConnector**
- ServerEventRoute consumes from multiplexed provider
- Enable GlobalStateConnector in browser-client.tsx
- Add work-unit-state channel

**Phase 5 (Optional): Migrate Agents + Visibility Optimization**
- useAgentManager → useChannelEvents('agents')
- Add document.visibilitychange disconnect/reconnect
- BroadcastChannel cross-tab sharing (future)

### Stopgap (Can Ship Immediately on 067 Branch)
Make question-popper SSE lazy — only connect when outstanding items > 0 or overlay open. One-line change reduces steady-state from 2 SSEs to 1 per tab.

---

## External Research Opportunities

### Research Opportunity 1: SSE Multiplexing Patterns in Production

**Why Needed**: While we've designed the multiplexed endpoint, industry patterns for large-scale SSE multiplexing (backpressure, channel priority, graceful degradation) aren't documented in our codebase.

**Ready-to-use prompt:**
```
/deepresearch "Production SSE multiplexing patterns: How do large-scale applications (Slack, Discord, Figma, Linear) handle multiplexing multiple event channels over a single SSE connection? Focus on: channel priority/bandwidth allocation, backpressure handling, graceful channel degradation, client-side demultiplexing patterns, and any open-source libraries that implement multiplexed SSE."
```

**Results location**: `docs/plans/072-sse-multiplexing/external-research/sse-multiplexing-patterns.md`

---

## Next Steps

1. **Run `/plan-1b-specify`** to create the feature specification for Plan 072
2. Optionally run the `/deepresearch` prompt above for industry patterns
3. The research dossier, HTTP/2 workshop, and SSE problem dossier from Plan 067 provide complete context

---

**Research Complete**: 2026-03-08T05:35:00Z
**Report Location**: `docs/plans/072-sse-multiplexing/research-dossier.md`
