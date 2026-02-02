/**
 * Plan 027: Central Domain Event Notification System
 *
 * Integration test: filesystem change → domain event.
 *
 * Exercises the full chain from WorkGraphWatcherAdapter.handleEvent()
 * through WorkgraphDomainEventAdapter to FakeCentralEventNotifier.emittedEvents.
 *
 * Uses fakes at boundaries only (FakeCentralEventNotifier). No vi.mock().
 *
 * Tests verify:
 * - AC-06: Filesystem change to state.json produces graph-updated SSE event
 * - AC-12: Tests use fakes, no vi.mock()
 */

import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkGraphWatcherAdapter } from '@chainglass/workflow';
import { beforeEach, describe, expect, it } from 'vitest';
import { WorkgraphDomainEventAdapter } from '../../../apps/web/src/features/027-central-notify-events/workgraph-domain-event-adapter';

describe('Watcher → Notifier Integration', () => {
  let notifier: FakeCentralEventNotifier;
  let domainAdapter: WorkgraphDomainEventAdapter;
  let watcherAdapter: WorkGraphWatcherAdapter;

  beforeEach(() => {
    notifier = new FakeCentralEventNotifier();
    domainAdapter = new WorkgraphDomainEventAdapter(notifier);
    watcherAdapter = new WorkGraphWatcherAdapter();

    // Subscribe domain adapter to watcher adapter events
    watcherAdapter.onGraphChanged((event) => domainAdapter.handleEvent(event));
  });

  it('I01: filesystem change flows through to domain event', () => {
    /*
    Test Doc:
    - Why: AC-06 full chain — filesystem event must produce a domain event in the notifier
    - Contract: WatcherEvent with state.json path → emittedEvents contains graph-updated event with correct graphSlug
    - Usage Notes: Simulates what CentralWatcherService.dispatchEvent() does in production
    - Quality Contribution: Catches broken wiring between watcher adapter and domain adapter
    - Worked Example: handleEvent({path:'...work-graphs/test-graph/state.json',...}) → emittedEvents [{domain:'workgraphs', eventType:'graph-updated', data:{graphSlug:'test-graph'}}]
    */
    watcherAdapter.handleEvent({
      path: '/ws/.chainglass/data/work-graphs/test-graph/state.json',
      eventType: 'change',
      worktreePath: '/ws',
      workspaceSlug: 'ws1',
    });

    expect(notifier.emittedEvents).toHaveLength(1);
    expect(notifier.emittedEvents[0]).toEqual({
      domain: 'workgraphs',
      eventType: 'graph-updated',
      data: { graphSlug: 'test-graph' },
    });
  });

  it('I02: non-state.json event does not produce domain event', () => {
    /*
    Test Doc:
    - Why: Filter correctness — only state.json changes should produce domain events
    - Contract: WatcherEvent with non-state.json path → emittedEvents is empty
    - Usage Notes: WorkGraphWatcherAdapter filters via regex /work-graphs\/([^/]+)\/state\.json$/
    - Quality Contribution: Catches missing or broken filter in watcher adapter
    - Worked Example: handleEvent({path:'.../some-other-file.json',...}) → emittedEvents is []
    */
    watcherAdapter.handleEvent({
      path: '/ws/.chainglass/data/work-graphs/test-graph/nodes.json',
      eventType: 'change',
      worktreePath: '/ws',
      workspaceSlug: 'ws1',
    });

    expect(notifier.emittedEvents).toHaveLength(0);
  });
});
