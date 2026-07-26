/**
 * Plan 027: Central Domain Event Notification System
 *
 * Unit tests for CentralEventNotifierService.
 * Uses FakeSSEBroadcaster — no vi.mock() per Constitution Principle 4.
 *
 * Tests verify:
 * - AC-02: Service implements ICentralEventNotifier correctly
 * - AC-12: Tests use fakes, no vi.mock()
 *
 * Phase 3: Suppression tests U04-U08 removed — client-side isRefreshing guard is sufficient.
 */

import { FakeSSEBroadcaster } from '@chainglass/shared/fakes';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events';
import { beforeEach, describe, expect, it } from 'vitest';
import { CentralEventNotifierService } from '../../../../apps/web/src/features/027-central-notify-events/central-event-notifier.service';

describe('CentralEventNotifierService', () => {
  let broadcaster: FakeSSEBroadcaster;
  let service: CentralEventNotifierService;

  beforeEach(() => {
    broadcaster = new FakeSSEBroadcaster();
    service = new CentralEventNotifierService(broadcaster);
  });

  // === Core Emission ===

  it('U01: emit() broadcasts to correct SSE channel', () => {
    /*
    Test Doc:
    - Why: Core contract — domain value must map to SSE channel name
    - Contract: emit(WorkspaceDomain.Workflows, ...) → broadcast channel is 'workflows'
    - Usage Notes: Domain value IS the channel name per ADR-0007
    - Quality Contribution: Catches channel mapping errors
    - Worked Example: emit('workflows', 'workflow-changed', {}) → getBroadcasts()[0].channel === 'workflows'
    */
    service.emit(WorkspaceDomain.Workflows, 'workflow-changed', { graphSlug: 'g1' });

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.channel).toBe('workflows');
  });

  it('U02: emit() passes eventType and data through', () => {
    /*
    Test Doc:
    - Why: Payload integrity — eventType and data must pass through unmodified
    - Contract: emit(domain, eventType, data) → broadcast(domain, eventType, data)
    - Usage Notes: Data is Record<string, unknown> per ADR-0007
    - Quality Contribution: Catches data transformation bugs
    - Worked Example: emit('workflows', 'workflow-changed', {graphSlug:'g1'}) → broadcast has same eventType and data
    */
    service.emit(WorkspaceDomain.Workflows, 'workflow-changed', { graphSlug: 'g1' });

    const broadcast = broadcaster.getLastBroadcast();
    expect(broadcast?.eventType).toBe('workflow-changed');
    expect(broadcast?.data).toEqual({ graphSlug: 'g1' });
  });

  it('U03: emit() on work-unit-state domain broadcasts to work-unit-state channel', () => {
    /*
    Test Doc:
    - Why: Multi-domain routing — a second domain must route to its own channel
    - Contract: emit(WorkspaceDomain.WorkUnitState, ...) → broadcast channel is 'work-unit-state'
    - Usage Notes: Each domain routes to its own SSE channel
    - Quality Contribution: Catches hardcoded channel bug — U01 alone cannot, since a
      channel hardcoded to 'workflows' would still pass it
    - Worked Example: emit('work-unit-state', 'status-changed', {id:'u1'}) → channel === 'work-unit-state'
    */
    service.emit(WorkspaceDomain.WorkUnitState, 'status-changed', { id: 'u1' });

    expect(broadcaster.getBroadcasts()[0]?.channel).toBe('work-unit-state');
  });

  // === Edge Cases ===

  it('U09: emit() with empty data broadcasts', () => {
    /*
    Test Doc:
    - Why: Edge case — empty data is valid per ADR-0007
    - Contract: emit() with {} as data still broadcasts
    - Usage Notes: Events with no payload are valid
    - Quality Contribution: Catches data validation that rejects empty objects
    - Worked Example: emit('workflows', 'sync', {}) → 1 broadcast with data {}
    */
    service.emit(WorkspaceDomain.Workflows, 'sync', {});

    expect(broadcaster.getBroadcasts()).toHaveLength(1);
    expect(broadcaster.getLastBroadcast()?.data).toEqual({});
  });
});
