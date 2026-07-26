/**
 * Plan 027: Central Domain Event Notification System
 *
 * Contract test runner for ICentralEventNotifier.
 *
 * Phase 1: Runs against FakeCentralEventNotifier.
 * Phase 2: Adds CentralEventNotifierService (real) + companion B01/B04 broadcaster tests.
 * Phase 3: Suppression tests removed — client-side isRefreshing guard is sufficient.
 */

import { FakeSSEBroadcaster } from '@chainglass/shared/fakes';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CentralEventNotifierService } from '../../apps/web/src/features/027-central-notify-events/central-event-notifier.service';
import { centralEventNotifierContractTests } from './central-event-notifier.contract.js';

// === Phase 1: FakeCentralEventNotifier ===

centralEventNotifierContractTests('FakeCentralEventNotifier', () => {
  const fake = new FakeCentralEventNotifier();
  return { notifier: fake };
});

// === Phase 2: CentralEventNotifierService (real) ===

centralEventNotifierContractTests('CentralEventNotifierService', () => {
  const broadcaster = new FakeSSEBroadcaster();
  const service = new CentralEventNotifierService(broadcaster);
  return { notifier: service };
});

// === Phase 2: Companion Broadcaster Tests (B01, B04) ===
// These cover the C01/C06/C09 gap where contract tests are vacuous for real service.

describe('CentralEventNotifierService — Broadcaster Assertions', () => {
  let broadcaster: FakeSSEBroadcaster;
  let service: CentralEventNotifierService;

  beforeEach(() => {
    broadcaster = new FakeSSEBroadcaster();
    service = new CentralEventNotifierService(broadcaster);
  });

  it('B01: emit() delivers correct channel and eventType to broadcaster', () => {
    /*
    Test Doc:
    - Why: Companion to C01 — verifies emit→broadcast mapping for real service
    - Contract: emit(domain, eventType, data) → broadcast(domain, eventType, data)
    - Usage Notes: C01 is vacuous for real service; this test makes the assertion
    - Quality Contribution: Catches broadcast delegation failures
    - Worked Example: emit('workflows', 'workflow-changed', {graphSlug:'g1'}) → broadcast channel 'workflows', eventType 'workflow-changed'
    */
    service.emit(WorkspaceDomain.Workflows, 'workflow-changed', { graphSlug: 'g1' });

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.channel).toBe('workflows');
    expect(broadcasts[0]?.eventType).toBe('workflow-changed');
    expect(broadcasts[0]?.data).toEqual({ graphSlug: 'g1' });
  });

  it('B04: multiple emissions produce ordered broadcasts', () => {
    /*
    Test Doc:
    - Why: Companion to C09 — verifies broadcast ordering for real service
    - Contract: emit A then emit B → broadcasts[0] is A, broadcasts[1] is B
    - Usage Notes: C09 is vacuous for real service; this test makes the assertion
    - Quality Contribution: Catches broadcast reordering bugs
    - Worked Example: emit workflows, emit work-unit-state, emit workflows → 3 broadcasts in order
    - KEEP TWO DISTINCT DOMAINS HERE, as in C09: this is also the case that catches a
      channel hardcoded on the real service, which it can only do while the channels
      differ. Retarget on a future domain removal; do not collapse onto one domain.
    */
    service.emit(WorkspaceDomain.Workflows, 'workflow-changed', { graphSlug: 'g1' });
    service.emit(WorkspaceDomain.WorkUnitState, 'status-changed', { id: 'u1' });
    service.emit(WorkspaceDomain.Workflows, 'workflow-changed', { graphSlug: 'g2' });

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(3);
    expect(broadcasts[0]?.channel).toBe('workflows');
    expect(broadcasts[0]?.data).toEqual({ graphSlug: 'g1' });
    expect(broadcasts[1]?.channel).toBe('work-unit-state');
    expect(broadcasts[1]?.data).toEqual({ id: 'u1' });
    expect(broadcasts[2]?.data).toEqual({ graphSlug: 'g2' });
  });
});
