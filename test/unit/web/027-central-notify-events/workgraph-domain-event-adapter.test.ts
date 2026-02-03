/**
 * Plan 027: Central Domain Event Notification System
 *
 * Unit tests for DomainEventAdapter<T> base class and WorkgraphDomainEventAdapter.
 * Uses FakeCentralEventNotifier — no vi.mock() per Constitution Principle 4.
 *
 * Tests verify:
 * - AC-05: Adapter transforms watcher events to domain events
 * - AC-13: Adapters can emit for any reason (not just filesystem)
 * - AC-12: Tests use fakes, no vi.mock()
 *
 * Base class tests (B01-B02): Trivial TestAdapter verifies generic handleEvent/extractData contract.
 * Concrete adapter tests (A01-A03): WorkgraphDomainEventAdapter verifies workgraph-specific behavior.
 */

import {
  FakeCentralEventNotifier,
  WorkspaceDomain,
} from '@chainglass/shared/features/027-central-notify-events';
import { DomainEventAdapter } from '@chainglass/shared/features/027-central-notify-events/domain-event-adapter';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkgraphDomainEventAdapter } from '../../../../apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter';

// === Trivial TestAdapter for base class contract tests ===

interface TestEvent {
  id: string;
  extra: number;
}

class TestAdapter extends DomainEventAdapter<TestEvent> {
  constructor(notifier: FakeCentralEventNotifier) {
    super(notifier, WorkspaceDomain.Agents, 'test-event');
  }

  extractData(event: TestEvent): Record<string, unknown> {
    return { id: event.id };
  }
}

// === Base class tests ===

describe('DomainEventAdapter (base class)', () => {
  let notifier: FakeCentralEventNotifier;
  let adapter: TestAdapter;

  beforeEach(() => {
    notifier = new FakeCentralEventNotifier();
    adapter = new TestAdapter(notifier);
  });

  it('B01: handleEvent() emits with configured domain, eventType, and extracted data', () => {
    /*
    Test Doc:
    - Why: Base class contract — handleEvent() must delegate to notifier.emit() with configured params
    - Contract: handleEvent(event) → notifier.emit(domain, eventType, extractData(event))
    - Usage Notes: Domain and eventType are set in constructor; extractData is abstract
    - Quality Contribution: Catches broken delegation in base class
    - Worked Example: TestAdapter('agents', 'test-event') + handleEvent({id:'x',extra:1}) → emit('agents', 'test-event', {id:'x'})
    */
    adapter.handleEvent({ id: 'x', extra: 1 });

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: 'agents',
      eventType: 'test-event',
      data: { id: 'x' },
    });
  });

  it('B02: extractData return value reaches emit()', () => {
    /*
    Test Doc:
    - Why: Data transformation contract — extractData() output must be what reaches emit()
    - Contract: The data field in emittedEvents equals exactly what extractData returns
    - Usage Notes: Subclasses control payload shape via extractData; base class passes it through
    - Quality Contribution: Catches data mutation or loss between extractData and emit
    - Worked Example: extractData({id:'y',extra:99}) returns {id:'y'} → emittedEvents[0].data is {id:'y'}
    */
    adapter.handleEvent({ id: 'y', extra: 99 });

    expect(notifier.emittedEvents[0]?.data).toEqual({ id: 'y' });
  });
});

// === Concrete adapter tests ===

describe('WorkgraphDomainEventAdapter', () => {
  let notifier: FakeCentralEventNotifier;
  let adapter: WorkgraphDomainEventAdapter;

  beforeEach(() => {
    notifier = new FakeCentralEventNotifier();
    adapter = new WorkgraphDomainEventAdapter(notifier);
  });

  it('A01: handleEvent() emits graph-updated event', () => {
    /*
    Test Doc:
    - Why: AC-05 core bridge — workgraph watcher events must transform to domain events
    - Contract: handleEvent({graphSlug:'g1',...}) → emit('workgraphs', 'graph-updated', {graphSlug:'g1'})
    - Usage Notes: Adapter is subscribed to WorkGraphWatcherAdapter.onGraphChanged()
    - Quality Contribution: Catches broken watcher-to-notifier bridge
    - Worked Example: handleEvent({graphSlug:'g1', worktreePath:'/tmp', workspaceSlug:'ws1', filePath:'', timestamp:Date}) → emittedEvents [{domain:'workgraphs', eventType:'graph-updated', data:{graphSlug:'g1'}}]
    */
    adapter.handleEvent({
      graphSlug: 'g1',
      worktreePath: '/tmp',
      workspaceSlug: 'ws1',
      filePath: '/tmp/.chainglass/data/work-graphs/g1/state.json',
      timestamp: new Date(),
    });

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: 'workgraphs',
      eventType: 'graph-updated',
      data: { graphSlug: 'g1' },
    });
  });

  it('A02: multiple events emit in order', () => {
    /*
    Test Doc:
    - Why: Ordering invariant — events must preserve emission order
    - Contract: handleEvent(A) then handleEvent(B) → emittedEvents[0] is A, [1] is B
    - Usage Notes: Important for UI consistency (events arrive in order)
    - Quality Contribution: Catches reordering bugs in event pipeline
    - Worked Example: handleEvent(g1), handleEvent(g2) → emittedEvents has g1 then g2
    */
    const now = new Date();
    adapter.handleEvent({
      graphSlug: 'g1',
      worktreePath: '/tmp',
      workspaceSlug: 'ws1',
      filePath: '/tmp/.chainglass/data/work-graphs/g1/state.json',
      timestamp: now,
    });
    adapter.handleEvent({
      graphSlug: 'g2',
      worktreePath: '/tmp',
      workspaceSlug: 'ws1',
      filePath: '/tmp/.chainglass/data/work-graphs/g2/state.json',
      timestamp: now,
    });

    expect(notifier.emittedEvents).toHaveLength(2);
    expect(notifier.emittedEvents[0]?.data).toEqual({ graphSlug: 'g1' });
    expect(notifier.emittedEvents[1]?.data).toEqual({ graphSlug: 'g2' });
  });

  it('A03: event data contains only graphSlug (ADR-0007)', () => {
    /*
    Test Doc:
    - Why: ADR-0007 minimal payload — client fetches state via REST, SSE carries only identifiers
    - Contract: event data contains exactly { graphSlug }, no extra fields from WorkGraphChangedEvent
    - Usage Notes: WorkGraphChangedEvent has graphSlug, workspaceSlug, worktreePath, filePath, timestamp — only graphSlug goes to SSE
    - Quality Contribution: Prevents data leakage into SSE payloads
    - Worked Example: handleEvent({graphSlug:'g1', worktreePath:'/tmp', workspaceSlug:'ws1', ...}) → data is exactly {graphSlug:'g1'}
    */
    adapter.handleEvent({
      graphSlug: 'g1',
      worktreePath: '/tmp',
      workspaceSlug: 'ws1',
      filePath: '/tmp/.chainglass/data/work-graphs/g1/state.json',
      timestamp: new Date(),
    });

    const data = notifier.emittedEvents[0]?.data;
    expect(data).toBeDefined();
    expect(data).toEqual({ graphSlug: 'g1' });
    expect(Object.keys(data as Record<string, unknown>)).toEqual(['graphSlug']);
  });
});
