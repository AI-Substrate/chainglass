# Central Domain Event Notification System — Testing Guide

Patterns for testing domain event adapters and services that depend on the central event notification system. All tests use fakes — no `vi.mock()`.

## Core Principle: Fakes Over Mocks

Per project convention, every interface has a matching Fake class. The central event system provides:

| Interface | Fake | Package |
|-----------|------|---------|
| `ICentralEventNotifier` | `FakeCentralEventNotifier` | `@chainglass/shared` |
| `ICentralWatcherService` | `FakeCentralWatcherService` | `@chainglass/workflow` |
| `IFileWatcherFactory` | `FakeFileWatcherFactory` | `@chainglass/workflow` |

## Testing a Domain Event Adapter

### Basic Usage

```typescript
import { describe, it, expect } from 'vitest';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkgraphDomainEventAdapter } from '@/features/027-central-notify-events/workgraph-domain-event-adapter';
import type { WorkGraphChangedEvent } from '@chainglass/workflow';

describe('WorkgraphDomainEventAdapter', () => {
  it('should emit graph-updated event with graphSlug only', () => {
    const notifier = new FakeCentralEventNotifier();
    const adapter = new WorkgraphDomainEventAdapter(notifier);

    const event: WorkGraphChangedEvent = {
      graphSlug: 'demo-graph',
      workspaceSlug: 'chainglass-main',
      worktreePath: '/home/jak/substrate/chainglass',
      filePath: '/home/jak/substrate/chainglass/.chainglass/data/work-graphs/demo-graph/state.json',
      timestamp: new Date(),
    };

    adapter.handleEvent(event);

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: 'workgraphs',
      eventType: 'graph-updated',
      data: { graphSlug: 'demo-graph' },
    });
  });
});
```

### Verifying Minimal Payload (ADR-0007)

The adapter should only emit identifiers, not full state:

```typescript
it('should emit only graphSlug — not full event data', () => {
  const notifier = new FakeCentralEventNotifier();
  const adapter = new WorkgraphDomainEventAdapter(notifier);

  adapter.handleEvent({
    graphSlug: 'my-graph',
    workspaceSlug: 'ws',
    worktreePath: '/path',
    filePath: '/path/state.json',
    timestamp: new Date(),
  });

  const emitted = notifier.emittedEvents[0];
  // Only graphSlug — no workspaceSlug, worktreePath, filePath, or timestamp
  expect(Object.keys(emitted.data)).toEqual(['graphSlug']);
});
```

### Verifying Event Ordering

```typescript
it('should preserve event ordering', () => {
  const notifier = new FakeCentralEventNotifier();
  const adapter = new WorkgraphDomainEventAdapter(notifier);

  adapter.handleEvent({ graphSlug: 'first', /* ... */ } as WorkGraphChangedEvent);
  adapter.handleEvent({ graphSlug: 'second', /* ... */ } as WorkGraphChangedEvent);

  expect(notifier.emittedEvents).toHaveLength(2);
  expect(notifier.emittedEvents[0].data).toEqual({ graphSlug: 'first' });
  expect(notifier.emittedEvents[1].data).toEqual({ graphSlug: 'second' });
});
```

## Testing CentralEventNotifierService

The service wraps `ISSEBroadcaster`. Test with a fake broadcaster:

```typescript
import { describe, it, expect } from 'vitest';
import { CentralEventNotifierService } from '@/features/027-central-notify-events/central-event-notifier.service';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';

describe('CentralEventNotifierService', () => {
  it('should broadcast to domain channel with eventType and data', () => {
    const broadcasts: Array<{ channel: string; eventType: string; data: unknown }> = [];
    const fakeBroadcaster = {
      broadcast(channel: string, eventType: string, data: unknown) {
        broadcasts.push({ channel, eventType, data });
      },
    };

    const service = new CentralEventNotifierService(fakeBroadcaster);
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'demo' });

    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]).toEqual({
      channel: 'workgraphs',  // domain value IS the channel name
      eventType: 'graph-updated',
      data: { graphSlug: 'demo' },
    });
  });

  it('should route agents domain to agents channel', () => {
    const broadcasts: Array<{ channel: string; eventType: string; data: unknown }> = [];
    const fakeBroadcaster = {
      broadcast(channel: string, eventType: string, data: unknown) {
        broadcasts.push({ channel, eventType, data });
      },
    };

    const service = new CentralEventNotifierService(fakeBroadcaster);
    service.emit(WorkspaceDomain.Agents, 'agent-status', { agentId: 'abc' });

    expect(broadcasts[0].channel).toBe('agents');
  });
});
```

## Testing with the DI Container

### Test Container Setup

The test container automatically registers fakes:

```typescript
import { createTestContainer } from '@/lib/di-container';
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared/di-tokens';
import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';

describe('feature that emits domain events', () => {
  it('should emit via DI-resolved notifier', () => {
    const container = createTestContainer();
    const notifier = container.resolve<ICentralEventNotifier>(
      WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER
    );

    // notifier is a FakeCentralEventNotifier in test container
    notifier.emit('workgraphs', 'graph-updated', { graphSlug: 'test' });

    const fake = notifier as FakeCentralEventNotifier;
    expect(fake.emittedEvents).toHaveLength(1);
  });
});
```

### Fresh Container Per Test

Per ADR-0004, create a fresh container in each test to prevent state leakage:

```typescript
describe('domain event tests', () => {
  let notifier: FakeCentralEventNotifier;

  beforeEach(() => {
    const container = createTestContainer();
    notifier = container.resolve<ICentralEventNotifier>(
      WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER
    ) as FakeCentralEventNotifier;
  });

  it('test 1', () => {
    notifier.emit('workgraphs', 'graph-updated', { graphSlug: 'a' });
    expect(notifier.emittedEvents).toHaveLength(1);  // Clean slate
  });

  it('test 2', () => {
    expect(notifier.emittedEvents).toHaveLength(0);  // No bleed from test 1
  });
});
```

## Testing a New Domain Adapter

When you create a new adapter (see [Adapters Guide](./3-adapters.md)), follow this test pattern:

```typescript
import { describe, it, expect } from 'vitest';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { SampleDomainEventAdapter } from '@/features/027-central-notify-events/sample-domain-event-adapter';

describe('SampleDomainEventAdapter', () => {
  it('should emit to samples domain with sample-updated event type', () => {
    const notifier = new FakeCentralEventNotifier();
    const adapter = new SampleDomainEventAdapter(notifier);

    adapter.handleEvent({
      sampleId: 'sample-001',
      workspaceSlug: 'ws',
      worktreePath: '/path',
      filePath: '/path/data.json',
      timestamp: new Date(),
    });

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: 'samples',
      eventType: 'sample-updated',
      data: { sampleId: 'sample-001' },
    });
  });

  it('should emit only sampleId — minimal payload per ADR-0007', () => {
    const notifier = new FakeCentralEventNotifier();
    const adapter = new SampleDomainEventAdapter(notifier);

    adapter.handleEvent({ sampleId: 'x', /* full event */ } as any);

    expect(Object.keys(notifier.emittedEvents[0].data)).toEqual(['sampleId']);
  });
});
```

## Integration Testing: Watcher → Notifier Chain

For testing the full chain from filesystem event to domain event:

```typescript
import { describe, it, expect } from 'vitest';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkGraphWatcherAdapter } from '@chainglass/workflow';
import { WorkgraphDomainEventAdapter } from '@/features/027-central-notify-events/workgraph-domain-event-adapter';
import type { WatcherEvent } from '@chainglass/workflow';

describe('watcher → notifier integration', () => {
  it('should flow filesystem event through to domain event', () => {
    const notifier = new FakeCentralEventNotifier();
    const domainAdapter = new WorkgraphDomainEventAdapter(notifier);
    const watcherAdapter = new WorkGraphWatcherAdapter();

    // Wire subscription (same as bootstrap)
    watcherAdapter.onGraphChanged((event) => domainAdapter.handleEvent(event));

    // Simulate filesystem event
    const watcherEvent: WatcherEvent = {
      path: '/home/jak/.chainglass/data/work-graphs/demo-graph/state.json',
      eventType: 'change',
      worktreePath: '/home/jak/substrate/chainglass',
      workspaceSlug: 'chainglass-main',
    };
    watcherAdapter.handleEvent(watcherEvent);

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: 'workgraphs',
      eventType: 'graph-updated',
      data: { graphSlug: 'demo-graph' },
    });
  });

  it('should not emit for non-state.json files', () => {
    const notifier = new FakeCentralEventNotifier();
    const domainAdapter = new WorkgraphDomainEventAdapter(notifier);
    const watcherAdapter = new WorkGraphWatcherAdapter();
    watcherAdapter.onGraphChanged((event) => domainAdapter.handleEvent(event));

    watcherAdapter.handleEvent({
      path: '/home/jak/.chainglass/data/work-graphs/demo-graph/other-file.json',
      eventType: 'change',
      worktreePath: '/home/jak/substrate/chainglass',
      workspaceSlug: 'chainglass-main',
    });

    expect(notifier.emittedEvents).toHaveLength(0);
  });
});
```

## Existing Test Files

The Plan 027 tests live in:

| Test | File | Verifies |
|------|------|----------|
| Domain event adapter unit | `test/unit/web/027-central-notify-events/workgraph-domain-event-adapter.test.ts` | `extractData()`, `handleEvent()`, ordering, minimal payload |
| Notifier service unit | `test/unit/web/027-central-notify-events/central-event-notifier.service.test.ts` | Domain→channel routing, passthrough, multi-domain |
| Bootstrap unit | `test/unit/web/027-central-notify-events/start-central-notifications.test.ts` | globalThis flag, idempotency |
| Watcher→notifier integration | `test/integration/027-central-notify-events/watcher-to-notifier.integration.test.ts` | Full chain, filter correctness |

## Anti-Patterns to Avoid

### Don't Use vi.mock()

```typescript
// BAD — banned by architecture rules
vi.mock('@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface');

// GOOD — use the provided fake
const notifier = new FakeCentralEventNotifier();
```

### Don't Test SSEManager Directly

Test through the `ICentralEventNotifier` interface, not through `SSEManager.broadcast()`:

```typescript
// BAD — couples test to SSE internals
import { sseManager } from '@/lib/sse-manager';
sseManager.broadcast('workgraphs', 'graph-updated', { graphSlug: 'x' });

// GOOD — test through the interface
const notifier = new FakeCentralEventNotifier();
const adapter = new WorkgraphDomainEventAdapter(notifier);
adapter.handleEvent(event);
expect(notifier.emittedEvents).toHaveLength(1);
```

### Don't Share Fakes Between Tests

```typescript
// BAD — state leakage
const sharedNotifier = new FakeCentralEventNotifier();

// GOOD — fresh per test
beforeEach(() => {
  notifier = new FakeCentralEventNotifier();
});
```

## Next Steps

- [Overview](./1-overview.md) — Architecture and components
- [Usage Guide](./2-usage.md) — Triggering events and debugging
- [Adapters Guide](./3-adapters.md) — How to add a new domain adapter
