# Research Dossier: SSE Connection Duplication Problem

**Plan**: 067-question-popper
**Date**: 2026-03-08
**Trigger**: Post-merge regression — 3 browser tabs locks up entire application
**Status**: Research complete, fix path identified

---

## Problem Statement

After merging PR #39 (Plan 067: Event Popper / Question Popper) to main, opening 3+ browser tabs causes the application to lock up. The root cause is that each workspace tab now opens **two independent SSE (Server-Sent Events) connections** instead of one:

1. `/api/events/file-changes` — from `FileChangeProvider` (Plan 045, pre-existing)
2. `/api/events/event-popper` — from `useQuestionPopper` (Plan 067, new)

HTTP/1.1 browsers enforce a **6-connection-per-origin limit**. With 2 SSE connections per tab, 3 tabs consume 6 SSE connections, exhausting the budget and stalling all REST fetches, asset loads, and navigation.

### Reproduction

1. Start dev server: `just dev`
2. Open 3 workspace tabs in the same browser
3. Observe: REST API calls hang, pages become unresponsive, SSE connections fail to establish

---

## Architecture Analysis

### Server-Side SSE Pipeline (Correct ✅)

The server-side broadcast architecture is sound. All domains use the same 3-layer pipeline:

```
Domain Service (e.g., QuestionPopperService)
  ↓ emit(domain, eventType, data)
CentralEventNotifierService (Plan 027)
  ↓ broadcast(channel, eventType, data)  
SSEManagerBroadcaster (Plan 019)
  ↓ broadcast(channel, eventType, data)
SSEManager singleton (globalThis pattern)
  ↓ enqueue(encoded) to all controllers on channel
ReadableStreamDefaultController → EventSource
```

The `SSEManager` is a per-channel connection pool:
- `Map<channelId, Set<ReadableStreamDefaultController>>`
- Singleton survives HMR via `globalThis`
- Validates event types against `/^[a-zA-Z0-9_-]+$/`
- Iterates snapshot array to avoid iterator invalidation
- Auto-removes dead controllers and empty channels

**File**: `apps/web/src/lib/sse-manager.ts`

### Client-Side SSE Consumers (Problem ❌)

Each feature opens its own independent `EventSource`. No connection sharing exists.

#### Consumer 1: FileChangeProvider

- **File**: `apps/web/src/features/045-live-file-events/file-change-provider.tsx`
- **URL**: `/api/events/file-changes`
- **Mount point**: `browser-client.tsx` inside `<FileChangeProvider worktreePath={...}>`
- **Lifecycle**: Opens on mount, closes on unmount. Always-on when browser page visible.
- **Reconnection**: Max 50 attempts, 2s-30s exponential backoff
- **Pattern**: Direct `new EventSource()`, fan-out via `FileChangeHub` context

#### Consumer 2: useQuestionPopper (NEW — the regression)

- **File**: `apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx`
- **URL**: `/api/events/event-popper`
- **Mount point**: Workspace layout via `<QuestionPopperOverlayWrapper>` (line 71 of layout.tsx)
- **Lifecycle**: Opens on provider mount, closes on unmount. **Always-on regardless of overlay open/closed state.**
- **Reconnection**: Max 5 attempts, 2s-10s exponential backoff
- **Pattern**: Direct `new EventSource()`, notification-fetch (SSE → refetch `list?limit=all`)

#### Consumer 3: useAgentManager

- **File**: `apps/web/src/features/019-agent-manager-refactor/useAgentManager.ts`
- **URL**: `/api/agents/events` (separate route file, not `[channel]`)
- **Lifecycle**: Always-on when agent chrome is mounted
- **Pattern**: Named event listeners, notification-fetch with React Query invalidation

#### Consumer 4: GlobalStateConnector (DISABLED)

- **File**: `apps/web/src/lib/state/state-connector.tsx`
- **Mount point**: Was in `browser-client.tsx`, now **commented out**
- **Why disabled**: "its work-unit-state SSE channel combined with file-changes SSE + terminal WS hits browser per-origin connection limits, stalling client-side navigation"
- **Contains**: `ServerEventRoute` components, each using `useSSE` hook → one EventSource per route
- **Current routes**: `[workUnitStateRoute]` (1 route, would add 1 more SSE if enabled)

#### Consumer 5: useWorkflowSSE

- **File**: `apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts`
- **URL**: `/api/events/workflows`
- **Lifecycle**: Only when workflow page is open
- **Pattern**: Filtered by `graphSlug`, debounced callbacks

### Complete SSE Connection Budget

| Consumer | SSE URL | Mount Level | Always On? | Connections |
|----------|---------|-------------|------------|-------------|
| FileChangeProvider | `/api/events/file-changes` | browser-client | Yes | 1 per tab |
| useQuestionPopper | `/api/events/event-popper` | workspace layout | **Yes** | 1 per tab |
| useAgentManager | `/api/agents/events` | agent chrome | Yes | 1 per tab |
| GlobalStateConnector | `/api/events/work-unit-state` | browser-client | **Disabled** | 0 (would be 1) |
| useWorkflowSSE | `/api/events/workflows` | workflow page | Only if open | 0-1 per tab |

**Per tab**: 2-3 always-on SSE + 0-1 conditional = **2-4 connections**
**3 tabs**: 6-12 connections → **exceeds HTTP/1.1 limit of 6**

---

## Provider / Context Hierarchy

Understanding where SSE consumers sit in the React tree:

```
<html> (app/layout.tsx)
└── <ThemeProvider>
    └── <Providers> (QueryClient, NuqsAdapter, SDKProvider, GlobalStateProvider)
        └── <AuthProvider> (dashboard/layout.tsx)
            └── <WorkspaceProvider> (workspaces/[slug]/layout.tsx)
                └── <SDKWorkspaceConnector>
                    └── <WorkspaceAttentionWrapper>
                        └── <TerminalOverlayWrapper>
                            └── <ActivityLogOverlayWrapper>
                                └── <QuestionPopperOverlayWrapper>     ← SSE #2 opens here
                                    └── <WorkspaceAgentChrome>         ← SSE #3 (agents) 
                                        └── {children} → browser-client.tsx
                                            └── <FileChangeProvider>   ← SSE #1 opens here
                                                └── <BrowserClientInner>
                                                    └── {/* GlobalStateConnector DISABLED */}
```

**Key observation**: `QuestionPopperOverlayWrapper` sits at workspace layout level — it mounts on EVERY workspace page, not just the browser page. This means the event-popper SSE opens even on non-browser workspace routes.

---

## SSE Infrastructure Components

### Generic SSE Route: `/api/events/[channel]`

- **File**: `apps/web/app/api/events/[channel]/route.ts`
- **Pattern**: Dynamic channel param, auth required, `ReadableStream` + SSEManager
- **Heartbeat**: 30-second interval (SSE comment format)
- **Cleanup**: Abort signal listener + heartbeat interval clear
- **Used by**: file-changes, event-popper, work-unit-state, workflows, unit-catalog

### useSSE Hook

- **File**: `apps/web/src/hooks/useSSE.ts`
- **Features**: Auto-reconnect (5s, max 5 attempts), JSON parsing, Zod validation, message accumulation
- **Factory injection**: `EventSourceFactory` param for testing
- **Used by**: `ServerEventRoute` (GlobalStateConnector), workflow SSE
- **NOT used by**: FileChangeProvider (direct EventSource), useQuestionPopper (direct EventSource)

### ServerEventRoute Component

- **File**: `apps/web/src/lib/state/server-event-route.tsx`
- **Pattern**: Invisible component (`return null`), bridges `useSSE` → `GlobalStateSystem`
- **Processing**: Index-based cursor, processes ALL messages since last render, per-event error isolation
- **Mounted by**: `GlobalStateConnector` (currently disabled)

### WorkspaceDomain Channel Registry

- **File**: `packages/shared/src/features/027-central-notify-events/workspace-domain.ts`

```typescript
WorkspaceDomain = {
  Agents: 'agents',
  FileChanges: 'file-changes',
  Workflows: 'workflows',
  WorkUnitState: 'work-unit-state',
  UnitCatalog: 'unit-catalog',
  EventPopper: 'event-popper',
  // Workgraphs: 'workgraphs' — DEPRECATED
}
```

---

## Why "Just Move to GlobalStateConnector" Won't Help

The user identified this correctly. Moving question-popper to GlobalStateConnector means:

1. Create a `ServerEventRouteDescriptor` for event-popper
2. Add it to `SERVER_EVENT_ROUTES` array in state-connector.tsx
3. `ServerEventRoute` calls `useSSE('/api/events/event-popper')` → **still creates its own EventSource**

Each `ServerEventRoute` gets its own `useSSE` instance which creates its own `EventSource`. The GlobalStateConnector pattern organizes SSE → state mapping, but does NOT reduce the number of SSE connections. It would add MORE connections (one per route descriptor).

The GlobalStateConnector is ALREADY disabled for exactly this reason — adding work-unit-state SSE on top of file-changes SSE hit the connection limit.

---

## Prior Architectural Decisions

### ADR-0007: SSE Single-Channel Event Routing
- **Decision**: One SSE channel per domain type, client-side routing by instance ID
- **Solved**: N agents → 1 channel (instead of 1 SSE per agent)
- **Did NOT solve**: Multiple channel types still = multiple EventSource connections
- **Key quote**: "approaching browser limits (6 concurrent HTTP/1.1 connections per domain)"

### ADR-0009: Workspace-Scoped SSE Hooks
- **Decision**: Notification-fetch pattern (SSE is hint, storage is truth)
- **Implication**: SSE payloads are thin (just IDs + counts), full data fetched via REST
- **Benefit**: Resilient to SSE reconnection gaps

### ADR-0010: Central Domain Event Notification Architecture
- **Decision**: Three-layer pipeline (Service → Notifier → Broadcaster → SSEManager)
- **Implication**: Server-side is correctly centralized; client-side is not

### state-connector.tsx Future Fix Comment (Plan 053)

Lines 30-32 explicitly document the intended solution:
> "Future fix: A single multiplexed SSE endpoint that carries all channels in one connection, with server-side channel filtering. This requires changes to both the SSE API route and the useSSE hook."

---

## Prior Bugs and Learnings

### From Plan 005 Phase 5 (SSE Infrastructure Review)
- **Memory leak**: Heartbeat cleanup missing when dead connections accumulate
- **Event type injection**: Raw eventType needs validation → fixed with regex
- **Iterator invalidation**: Set mutated during broadcast iteration → fixed with array snapshot

### From Plan 015 Phase 3 (Agent SSE Integration)
- **EventSource missing error handlers**: Orphaned listeners accumulate
- **Cleanup on connection failure**: Must be explicit

### From Plan 053 (GlobalStateSystem)
- **Connection limit awareness**: DYK #4 documented HTTP/1.1 6-connection cap
- **Safe ceiling**: ~4 SSE routes before multiplexing needed
- **GlobalStateConnector disabled**: Connection pressure stalled navigation

### Named SSE Events Don't Work
- Browser `EventSource.onmessage` only receives unnamed events
- Named events (with `event:` field) require `addEventListener()`
- Current SSEManager correctly embeds `type` in JSON payload, uses unnamed events

---

## Recommended Fix Path

### Phase 1: Multiplexed SSE Endpoint (Architectural Fix)

**Server**: New `/api/events/multiplexed?channels=file-changes,event-popper,...` route
- Registers one controller with SSEManager for multiple channels
- Events include `channel` field: `{"channel":"event-popper","type":"question-asked",...}`
- Single heartbeat shared across all channels

**Client**: New `MultiplexedSSEProvider` at workspace layout level
- One `EventSource` per tab
- Channel-specific hooks filter events by `channel` field
- Replaces all individual `EventSource` instances

**Impact**: Reduces N connections per tab → 1 connection per tab. Re-enables GlobalStateConnector.

### Phase 2: Migrate Consumers

1. `useQuestionPopper` → subscribe to multiplexed provider (remove direct EventSource)
2. `FileChangeProvider` → subscribe to multiplexed provider (remove direct EventSource)
3. `GlobalStateConnector` → re-enable, `ServerEventRoute` subscribes to multiplexed provider
4. `useAgentManager` → migrate from `/api/agents/events` to multiplexed channel

### Phase 3 (Optional): Cross-Tab Optimization

`BroadcastChannel` so N tabs share 1 SSE connection. Leader election: first tab owns connection, broadcasts to others.

### Complementary: Visibility-Aware Disconnect

Add `document.visibilitychange` handler — disconnect SSE when tab backgrounds, reconnect on foreground.

---

## Key Files Reference

| File | Purpose | Lines of Interest |
|------|---------|-------------------|
| `apps/web/src/lib/sse-manager.ts` | Server SSE singleton | All — core connection pool |
| `apps/web/app/api/events/[channel]/route.ts` | Generic SSE endpoint | 40-92 — stream creation |
| `apps/web/src/hooks/useSSE.ts` | Client SSE hook | 50-150 — EventSource lifecycle |
| `apps/web/src/lib/state/state-connector.tsx` | GlobalStateConnector (disabled) | 18-32 — connection limit docs |
| `apps/web/src/lib/state/server-event-route.tsx` | SSE→State bridge | 30-85 — index cursor + publishing |
| `apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx` | Question popper hook | 145-217 — direct EventSource |
| `apps/web/src/features/045-live-file-events/file-change-provider.tsx` | File change provider | 55-80 — direct EventSource |
| `apps/web/app/(dashboard)/workspaces/[slug]/layout.tsx` | Workspace layout | 71 — QuestionPopperOverlayWrapper mount |
| `apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx` | Browser client | 76-80 — GlobalStateConnector disabled |
| `packages/shared/src/features/027-central-notify-events/workspace-domain.ts` | Channel registry | All — WorkspaceDomain enum |
| `docs/adr/adr-0007-sse-single-channel-routing.md` | ADR: single-channel pattern | All |
| `docs/plans/067-question-popper/workshops/002-http2-sse-feasibility.md` | HTTP/2 workshop | All — why HTTP/2 isn't viable |

---

---

## Harness Reproduction Evidence (from 066-wf-real-agents branch)

A separate investigation on the `066-wf-real-agents` branch performed a full harness-based reproduction using Playwright-over-CDP with injected `EventSource` instrumentation. Key evidence:

### Steady-State Server Connections (3 tabs)

From server logs with 3 browser tabs open:
- `file-changes` total: **3** (1 per tab)
- `event-popper` total: **3** (1 per tab)
- **6 long-lived SSE connections** consuming the entire HTTP/1.1 budget

### Client-Side EventSource Construction (per page)

Injected page instrumentation observed per tab:
```json
[
  "/api/events/file-changes",
  "/api/events/event-popper",
  "/api/events/file-changes",
  "/api/events/event-popper"
]
```
The double construction is React strict-mode dev behavior (mount → unmount → remount). Server-side steady-state counts are the source of truth.

### Compounding Background Traffic

Each tab also generated:
- `GET /api/workspaces?include=worktrees`
- `GET /api/agents?workspace=...` + `GET /api/agents`
- `GET /api/event-popper/list?limit=all`
- `GET /api/activity-log?...`
- Repeated `POST /workspaces/.../browser?file=...` (server action file-preview reads)

The repeated browser POSTs are server actions invoked by the file browser for preview reads and refreshes. These pile on top of SSE connection pressure — the combination of always-on SSEs consuming connection slots plus background fetch traffic is what makes pages feel locked up.

### Harness Protocol Verification

```bash
curl -sS -o /dev/null -w '%{http_version}\n' http://127.0.0.1:3159/         # → 1.1
curl -sS -N -o /dev/null -w '%{http_version}\n' --max-time 2 \
  http://127.0.0.1:3159/api/events/file-changes                              # → 1.1
curl --http2-prior-knowledge http://127.0.0.1:3159/                          # → failed
```
Browser: `performance.getEntriesByType('navigation')[0].nextHopProtocol` → `http/1.1`

### `just dev-https` Attempt

```bash
PORT=3300 just dev-https
```
Result: Self-signed cert generation failed → fell back to HTTP. Terminal sidecar crashed (missing `apps/web/certificates/localhost.pem`). Lock conflict with existing dev server.

### Key Principle from Investigation

> **"Do not call something a fix unless it reduces the number of real EventSource connections."**

Source: `/Users/jordanknight/substrate/066-wf-real-agents/scratch/sse-improve.md`

---

## Related Workshop

See [Workshop 002: HTTP/2 Feasibility for SSE Connection Consolidation](../workshops/002-http2-sse-feasibility.md) for detailed analysis of why HTTP/2 is not a viable near-term solution and comparison of all alternatives.
