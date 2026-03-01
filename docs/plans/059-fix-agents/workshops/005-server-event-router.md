# Workshop: Server Event Router — Central Events → GlobalStateSystem Bridge

**Type**: Integration Pattern
**Plan**: 059-fix-agents
**Spec**: [fix-agents-spec.md](../fix-agents-spec.md)
**Created**: 2026-03-01
**Status**: Draft

**Related Documents**:
- [Plan 027 — Central Domain Event Notification System](../../027-central-domain-event-notify/): Three-layer pipeline architecture
- [Plan 053 — GlobalStateSystem](../../053-global-state-system/): Client-side state pub/sub
- [Plan 056 — State DevTools Panel](../../056-state-devtools/): StateChangeLog ring buffer
- [Workshop 003 — WorkUnit State System](./003-work-unit-state-system.md): Data model this router serves
- [ADR-0007](../../../adr/): Notification-fetch pattern (SSE carries IDs only)
- [ADR-0010](../../../adr/): Three-layer notification pattern
- [docs/how/dev/central-events/](../../../how/dev/central-events/): Adapter authoring guide

**Domain Context**:
- **Primary Domain**: `_platform/events` — extending the existing central event infrastructure
- **Related Domains**: `_platform/state` (target: GlobalStateSystem), `work-unit-state` (first consumer), `agents` (second consumer)

---

## Purpose

Design a generic, first-class bridge that routes server-side central events (Plan 027) into client-side GlobalStateSystem paths (Plan 053). Today, each domain hand-rolls its own SSE→state publisher (only FileChanges does this fully; Workflows and Agents don't publish to state at all). This workshop designs the missing infrastructure piece: a reusable `ServerEventRouter` that any domain can plug into.

## The Problem

```
┌─────────────────────────────────────────────────────────────────┐
│ Today: Each domain hand-rolls its own SSE→state bridge          │
│                                                                 │
│  FileChanges:  SSE → FileChangeProvider → Hub → Publisher → GSS │
│                     (4 components, ~200 lines)                  │
│                                                                 │
│  Workflows:    SSE → useWorkflowSSE → callbacks (NO state)      │
│  Agents:       SSE → useAgentManager → React Query (NO state)   │
│  WorkUnitState: ??? (doesn't exist yet)                         │
│                                                                 │
│  Result: Every new domain that wants GlobalStateSystem           │
│  visibility must reimplement the same plumbing.                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Questions Addressed

- Q1: What does a generic server→client event router look like?
- Q2: How does it integrate with Plan 027 central events and Plan 053 GlobalStateSystem?
- Q3: How do we tag server-originated state entries for debugging (vs client-originated)?
- Q4: What does domain registration look like — how does a domain opt in?
- Q5: How does this interact with the notification-fetch pattern (ADR-0007)?

---

## Q1: The ServerEventRouter Component

A single React component that subscribes to an SSE channel and publishes received events as GlobalStateSystem paths. Domains register a **route descriptor** that maps event types to state paths.

```typescript
/** Route descriptor: maps server events to state paths */
interface ServerEventRouteDescriptor {
  /** SSE channel to subscribe to (matches WorkspaceDomain value) */
  channel: string;
  /** Domain name in GlobalStateSystem */
  stateDomain: string;
  /** Multi-instance domain? (most are — keyed by entity ID) */
  multiInstance: boolean;
  /** Properties this domain publishes */
  properties: StatePropertyDescriptor[];
  /** Map an SSE event to state path updates */
  mapEvent: (event: ServerEvent) => StateUpdate[] | null;
}

/** What arrives from SSE (Plan 027 shape) */
interface ServerEvent {
  type: string;
  [key: string]: unknown;
}

/** What gets published to GlobalStateSystem */
interface StateUpdate {
  /** Instance ID (for multi-instance domains) */
  instanceId?: string;
  /** Property name */
  property: string;
  /** Value to publish */
  value: unknown;
}
```

### Example: WorkUnitState Route Descriptor

```typescript
const workUnitStateRoute: ServerEventRouteDescriptor = {
  channel: 'work-unit-state',
  stateDomain: 'work-unit-state',
  multiInstance: true,
  properties: [
    { key: 'status', typeHint: 'string' },
    { key: 'has-question', typeHint: 'boolean' },
    { key: 'intent', typeHint: 'string' },
    { key: 'name', typeHint: 'string' },
  ],
  mapEvent: (event) => {
    if (event.type === 'unit-status-changed') {
      return [
        { instanceId: event.unitId as string, property: 'status', value: event.status },
        { instanceId: event.unitId as string, property: 'intent', value: event.intent ?? '' },
      ];
    }
    if (event.type === 'unit-question-asked') {
      return [
        { instanceId: event.unitId as string, property: 'has-question', value: true },
      ];
    }
    if (event.type === 'unit-question-answered') {
      return [
        { instanceId: event.unitId as string, property: 'has-question', value: false },
        { instanceId: event.unitId as string, property: 'status', value: 'working' },
      ];
    }
    return null; // Unknown event type — ignore
  },
};
```

---

## Q2: Integration Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Server (Plan 027)                                                        │
│                                                                          │
│  WorkUnitStateService                                                    │
│    │  persist to JSON                                                    │
│    │  emit via CentralEventNotifierService                              │
│    ▼                                                                     │
│  CentralEventNotifierService.emit('work-unit-state', 'unit-status-changed', │
│    { unitId, status, intent })                                           │
│    │                                                                     │
│    ▼                                                                     │
│  SSEManager.broadcast('work-unit-state', 'unit-status-changed', data)   │
│                                                                          │
├──────────────────────────── SSE boundary ────────────────────────────────┤
│                                                                          │
│ Client (Plan 053)                                                        │
│                                                                          │
│  ServerEventRouter                                                       │
│    │  useSSE('/api/events/work-unit-state')                             │
│    │  for each message:                                                  │
│    │    updates = route.mapEvent(message)                               │
│    │    for each update:                                                 │
│    │      state.publish('work-unit-state:{unitId}:{property}', value)   │
│    ▼        ↑ tagged with _source: 'server'                             │
│                                                                          │
│  GlobalStateSystem                                                       │
│    │  subscribers notified                                               │
│    ▼                                                                     │
│  useGlobalState('work-unit-state:agent-1:status')                       │
│    → 'working'                                                           │
│                                                                          │
│  useGlobalStateList('work-unit-state:*:has-question')                   │
│    → [{ path: 'work-unit-state:agent-1:has-question', value: true }]    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Why Not Notification-Fetch?

ADR-0007 says "SSE carries identifiers, clients fetch via REST." But for state system entries, the value IS the identifier/status — a single string or boolean. Fetching via REST would mean a round-trip for `status = 'working'`. The router publishes the value directly from the SSE payload because:

1. State entries are tiny (string/boolean/number), not rich objects
2. The server already validated and persisted the data
3. Round-trip latency defeats the purpose of real-time state visibility
4. WorkUnitEntry details (full question text, sourceRef) are still fetched via REST when needed — only status-level fields go through state paths

This is a **documented extension** of ADR-0007: state path values are small enough to carry inline. Full entity data still uses notification-fetch.

---

## Q3: Server-Origin Tagging for Debug

Every state entry published by the ServerEventRouter should be distinguishable from client-originated entries. This serves debugging (Plan 056 State DevTools) and tracing.

### Approach: Metadata on StateEntry

```typescript
/** Extended state entry shape (internal to GlobalStateSystem) */
interface StateEntry<T = unknown> {
  path: string;
  value: T;
  updatedAt: number;
  // NEW: source metadata
  source?: StateEntrySource;
}

interface StateEntrySource {
  origin: 'client' | 'server';
  /** SSE channel that produced this entry */
  channel?: string;
  /** Server event type that triggered this entry */
  eventType?: string;
}
```

### How It Works

1. `GlobalStateSystem.publish()` already accepts `(path, value)` — extend with optional 3rd arg:
   ```typescript
   publish<T>(path: string, value: T, source?: StateEntrySource): void
   ```
2. ServerEventRouter passes source metadata on every publish:
   ```typescript
   state.publish(path, value, {
     origin: 'server',
     channel: route.channel,
     eventType: event.type,
   });
   ```
3. Client-originated publishes (e.g., WorktreeStatePublisher) don't pass source — defaults to `{ origin: 'client' }`
4. StateChangeLog (Plan 056) captures source in its ring buffer entries
5. State DevTools panel can filter/color-code by origin

### Why Not a Separate Store?

We considered keeping server state in a parallel store, but that fragments the query surface. Consumers should use `useGlobalState('work-unit-state:agent-1:status')` regardless of origin. The metadata is for debugging, not routing.

---

## Q4: Domain Registration — How to Opt In

A domain opts into server→state routing by providing a `ServerEventRouteDescriptor` and mounting it in the `ServerEventRouter`.

### Step 1: Define route descriptor (in domain code)

```typescript
// apps/web/src/lib/work-unit-state/state-route.ts
import type { ServerEventRouteDescriptor } from '@/lib/state/server-event-router';

export const workUnitStateRoute: ServerEventRouteDescriptor = {
  channel: 'work-unit-state',
  stateDomain: 'work-unit-state',
  multiInstance: true,
  properties: [
    { key: 'status', typeHint: 'string' },
    { key: 'has-question', typeHint: 'boolean' },
    { key: 'intent', typeHint: 'string' },
    { key: 'name', typeHint: 'string' },
  ],
  mapEvent: (event) => { /* ... */ },
};
```

### Step 2: Register in ServerEventRouter

```typescript
// apps/web/src/lib/state/state-connector.tsx (extended)
import { workUnitStateRoute } from '@/lib/work-unit-state/state-route';
import { agentStateRoute } from '@/features/059-fix-agents/state-route';

const SERVER_EVENT_ROUTES: ServerEventRouteDescriptor[] = [
  workUnitStateRoute,
  agentStateRoute,
  // Future domains add here
];

export function GlobalStateConnector({ slug, worktreeBranch }: Props) {
  const state = useStateSystem();

  useState(() => {
    registerWorktreeState(state);
    // Register all server event domains
    for (const route of SERVER_EVENT_ROUTES) {
      state.registerDomain({
        domain: route.stateDomain,
        multiInstance: route.multiInstance,
        properties: route.properties,
      });
    }
  });

  return (
    <>
      <WorktreeStatePublisher slug={slug} worktreeBranch={worktreeBranch} />
      {SERVER_EVENT_ROUTES.map((route) => (
        <ServerEventRoute key={route.channel} route={route} />
      ))}
    </>
  );
}
```

### Step 3: ServerEventRoute component (the actual bridge)

```typescript
// apps/web/src/lib/state/server-event-route.tsx
'use client';

import { useEffect } from 'react';
import { useSSE } from '@/hooks/useSSE';
import { useStateSystem } from './state-provider';
import type { ServerEventRouteDescriptor, ServerEvent } from './server-event-router';

interface Props {
  route: ServerEventRouteDescriptor;
}

export function ServerEventRoute({ route }: Props) {
  const state = useStateSystem();
  const { messages } = useSSE<ServerEvent>(`/api/events/${route.channel}`);

  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest) return;

    const updates = route.mapEvent(latest);
    if (!updates) return;

    for (const update of updates) {
      const path = update.instanceId
        ? `${route.stateDomain}:${update.instanceId}:${update.property}`
        : `${route.stateDomain}:${update.property}`;

      state.publish(path, update.value, {
        origin: 'server',
        channel: route.channel,
        eventType: latest.type,
      });
    }
  }, [messages, route, state]);

  return null; // Invisible wiring component
}
```

---

## Q5: ADR-0007 Compatibility

The ServerEventRouter **extends** the notification-fetch pattern, not replaces it:

| Data Type | Pattern | Example |
|-----------|---------|---------|
| Status-level fields (small, ephemeral) | **Direct publish** via ServerEventRouter | `status = 'working'`, `has-question = true` |
| Entity data (rich, structured) | **Notification-fetch** per ADR-0007 | Full WorkUnitEntry with question text, choices, sourceRef |

The router handles the first case. UI components that need full entity data (e.g., the overlay showing question text) still fetch via REST when notified.

---

## Full Component List

| Component | Location | New? | Purpose |
|-----------|----------|------|---------|
| `ServerEventRouteDescriptor` | `apps/web/src/lib/state/server-event-router.ts` | NEW | Type: route config mapping SSE events to state paths |
| `ServerEventRoute` | `apps/web/src/lib/state/server-event-route.tsx` | NEW | Component: subscribes SSE, publishes to state |
| `StateEntrySource` | `packages/shared/src/interfaces/state.interface.ts` | NEW | Type: origin metadata on state entries |
| `GlobalStateSystem.publish()` | `apps/web/src/lib/state/global-state-system.ts` | MODIFY | Add optional `source` parameter |
| `StateChangeLog` | `apps/web/src/lib/state/state-change-log.ts` | MODIFY | Capture source in ring buffer entries |
| `GlobalStateConnector` | `apps/web/src/lib/state/state-connector.tsx` | MODIFY | Mount ServerEventRoute instances |
| `WorkspaceDomain` | `packages/shared/src/.../workspace-domain.ts` | MODIFY | Add `WorkUnitState: 'work-unit-state'` |
| `workUnitStateRoute` | `apps/web/src/lib/work-unit-state/state-route.ts` | NEW | Route descriptor for work-unit-state domain |

---

## Open Questions

### Q6: Should the router debounce rapid SSE events?

**RESOLVED**: No debouncing at the router level. GlobalStateSystem already handles stable references and cached lists. If a domain needs debouncing (e.g., rapid file change events), it should debounce in its `mapEvent` function or at the server-side emitter. The router is a dumb pipe.

### Q7: What happens if SSE disconnects?

**RESOLVED**: `useSSE` already handles reconnection with exponential backoff. On reconnect, the client gets current state via REST (notification-fetch). The router doesn't need special disconnect handling — state paths remain with their last known values until updated.

### Q8: Should the router support `removeInstance` when entities disappear?

**RESOLVED**: Yes. Add an optional `isRemoval` flag to `StateUpdate`:
```typescript
interface StateUpdate {
  instanceId?: string;
  property: string;
  value: unknown;
  remove?: boolean; // If true, calls state.removeInstance()
}
```
The `mapEvent` function returns `{ remove: true }` for termination events.

### Q9: How does this relate to the existing FileChange pipeline?

**RESOLVED**: The FileChange pipeline (Provider → Hub → Publisher) is a domain-specific implementation that predates this generic router. It can coexist — no need to migrate it immediately. Future work could replace `WorktreeStatePublisher` with a `fileChangeRoute` descriptor, but that's optional.

---

## Summary

The ServerEventRouter is ~60 lines of actual code (type + component), but it eliminates the need for each domain to build its own SSE→state bridge. The key insight: state path values are small enough to carry inline in SSE events (extending ADR-0007 for status-level fields), and server-origin tagging via `StateEntrySource` metadata enables debugging without fragmenting the query surface.
