# Central Domain Event Notification System — Adapters Guide

How to add a new workspace domain to the central event notification system. Each domain needs two adapters (watcher + domain event) and registration in the bootstrap.

## When to Add a New Domain Adapter

Add an adapter when:

- A new workspace data domain stores files under `<worktree>/.chainglass/data/` and needs real-time browser notifications
- You want to emit domain events from server-side code (API routes, background tasks) through the central SSE pipeline
- You're migrating an existing ad-hoc notification pattern to the central system

## Understanding the Two Adapter Types

Each domain has two adapter types with distinct responsibilities:

| Adapter | Input | Output | Package | Role |
|---------|-------|--------|---------|------|
| **Watcher Adapter** | Raw `WatcherEvent` (path, eventType, worktree) | Domain-specific event (e.g., `WorkGraphChangedEvent`) | `@chainglass/workflow` | Filter filesystem events by path pattern, extract domain identifiers |
| **Domain Event Adapter** | Domain-specific event | `notifier.emit(domain, eventType, data)` | `apps/web` | Transform domain event into minimal SSE payload |

Why two? The watcher adapter is filesystem-specific — it filters paths and parses identifiers. The domain event adapter is source-agnostic — it can receive events from the watcher, from API routes, or from tests. This separation keeps the domain adapter testable without filesystem dependencies.

## Reference Implementation: Workgraphs

### WorkGraphWatcherAdapter

```typescript
// packages/workflow/src/features/023-central-watcher-notifications/workgraph-watcher.adapter.ts

const STATE_JSON_REGEX = /work-graphs\/([^/]+)\/state\.json$/;

export class WorkGraphWatcherAdapter implements IWatcherAdapter {
  readonly name = 'workgraph-watcher';
  private readonly subscribers = new Set<GraphChangedCallback>();

  handleEvent(event: WatcherEvent): void {
    const match = event.path.match(STATE_JSON_REGEX);
    if (!match) return;  // Not a state.json change — ignore

    const graphSlug = match[1];
    const changedEvent: WorkGraphChangedEvent = {
      graphSlug,
      workspaceSlug: event.workspaceSlug,
      worktreePath: event.worktreePath,
      filePath: event.path,
      timestamp: new Date(),
    };

    for (const callback of this.subscribers) {
      try {
        callback(changedEvent);
      } catch (error) {
        console.warn(`[${this.name}] Subscriber callback threw`, { graphSlug, error });
      }
    }
  }

  onGraphChanged(callback: GraphChangedCallback): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }
}
```

Key patterns:
- Path regex filters only relevant files
- Callback-set pattern (not EventEmitter) — `onGraphChanged()` returns an unsubscribe function
- Error isolation: one throwing subscriber doesn't block others

### WorkgraphDomainEventAdapter

```typescript
// apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter.ts

export class WorkgraphDomainEventAdapter extends DomainEventAdapter<WorkGraphChangedEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.Workgraphs, 'graph-updated');
  }

  extractData(event: WorkGraphChangedEvent): Record<string, unknown> {
    return { graphSlug: event.graphSlug };
  }
}
```

Key patterns:
- Extends `DomainEventAdapter<WorkGraphChangedEvent>` — generic type parameter defines the input event
- Constructor passes domain (`'workgraphs'`) and event type (`'graph-updated'`) to base class
- `extractData()` returns only `{ graphSlug }` — minimal payload per ADR-0007
- 10 lines of code total

## Step-by-Step: Adding a New Domain

We'll use "samples" as an example domain.

### Step 1: Extend WorkspaceDomain

In `packages/shared/src/features/027-central-notify-events/workspace-domain.ts`:

```typescript
export const WorkspaceDomain = {
  Workgraphs: 'workgraphs',
  Agents: 'agents',
  Samples: 'samples',  // <-- new
} as const;
```

The value `'samples'` becomes the SSE channel name. Clients subscribe to `/api/events/samples`.

### Step 2: Define the Domain Event Type

In your domain package (e.g., `packages/workflow`):

```typescript
export interface SampleChangedEvent {
  sampleId: string;
  workspaceSlug: string;
  worktreePath: string;
  filePath: string;
  timestamp: Date;
}
```

### Step 3: Create the Watcher Adapter

In your domain package:

```typescript
// packages/workflow/src/features/xxx-samples/sample-watcher.adapter.ts

import type { IWatcherAdapter, WatcherEvent } from '../023-central-watcher-notifications/watcher-adapter.interface.js';

const SAMPLE_REGEX = /samples\/([^/]+)\/data\.json$/;

type SampleChangedCallback = (event: SampleChangedEvent) => void;

export class SampleWatcherAdapter implements IWatcherAdapter {
  readonly name = 'sample-watcher';
  private readonly subscribers = new Set<SampleChangedCallback>();

  handleEvent(event: WatcherEvent): void {
    const match = event.path.match(SAMPLE_REGEX);
    if (!match) return;

    const changedEvent: SampleChangedEvent = {
      sampleId: match[1],
      workspaceSlug: event.workspaceSlug,
      worktreePath: event.worktreePath,
      filePath: event.path,
      timestamp: new Date(),
    };

    for (const callback of this.subscribers) {
      try {
        callback(changedEvent);
      } catch (error) {
        console.warn(`[${this.name}] Subscriber threw`, { sampleId: changedEvent.sampleId, error });
      }
    }
  }

  onSampleChanged(callback: SampleChangedCallback): () => void {
    this.subscribers.add(callback);
    return () => { this.subscribers.delete(callback); };
  }
}
```

### Step 4: Create the Domain Event Adapter

In `apps/web/src/features/027-central-notify-events/`:

```typescript
// sample-domain-event-adapter.ts

import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { DomainEventAdapter } from '@chainglass/shared/features/027-central-notify-events/domain-event-adapter';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import type { SampleChangedEvent } from '@chainglass/workflow';

export class SampleDomainEventAdapter extends DomainEventAdapter<SampleChangedEvent> {
  constructor(notifier: ICentralEventNotifier) {
    super(notifier, WorkspaceDomain.Samples, 'sample-updated');
  }

  extractData(event: SampleChangedEvent): Record<string, unknown> {
    return { sampleId: event.sampleId };
  }
}
```

### Step 5: Wire into Bootstrap

In `apps/web/src/features/027-central-notify-events/start-central-notifications.ts`, add after the workgraph wiring:

```typescript
// Existing workgraph wiring
const workgraphDomainAdapter = new WorkgraphDomainEventAdapter(notifier);
const workgraphWatcherAdapter = new WorkGraphWatcherAdapter();
watcher.registerAdapter(workgraphWatcherAdapter);
workgraphWatcherAdapter.onGraphChanged((event) => workgraphDomainAdapter.handleEvent(event));

// New sample wiring
const sampleDomainAdapter = new SampleDomainEventAdapter(notifier);
const sampleWatcherAdapter = new SampleWatcherAdapter();
watcher.registerAdapter(sampleWatcherAdapter);
sampleWatcherAdapter.onSampleChanged((event) => sampleDomainAdapter.handleEvent(event));
```

### Step 6: Subscribe in the Browser

The SSE route handler at `/api/events/[channel]` already handles any channel name — no new route needed. Subscribe with `useSSE`:

```typescript
const { messages } = useSSE<{ type: string; sampleId: string }>(
  '/api/events/samples'
);

useEffect(() => {
  const latest = messages[messages.length - 1];
  if (latest?.type === 'sample-updated') {
    refetchSample(latest.sampleId);
  }
}, [messages]);
```

## What You Don't Need to Change

- `CentralEventNotifierService` — routes by domain value automatically
- `SSEManager` — broadcasts to any channel
- `/api/events/[channel]/route.ts` — handles any channel name
- DI container — the notifier and watcher are already registered

## Checklist

- [ ] Extended `WorkspaceDomain` with new domain value
- [ ] Domain event type defined (e.g., `SampleChangedEvent`)
- [ ] Watcher adapter created with path regex filter
- [ ] Domain event adapter created extending `DomainEventAdapter<T>`
- [ ] Wired into `startCentralNotificationSystem()` bootstrap
- [ ] Exported from barrel (if applicable)
- [ ] Client subscribes to `/api/events/<domain>` via `useSSE`
- [ ] Unit tests with `FakeCentralEventNotifier` (see [Testing Guide](./4-testing.md))

## Next Steps

- [Overview](./1-overview.md) — Architecture and components
- [Usage Guide](./2-usage.md) — Triggering events and debugging
- [Testing Guide](./4-testing.md) — Testing patterns
