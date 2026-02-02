/**
 * Plan 027: Central Domain Event Notification System
 *
 * Contract test runner for ICentralEventNotifier.
 *
 * Phase 1: Runs against FakeCentralEventNotifier.
 * Phase 2: Adds CentralEventNotifierService (real) + companion B01-B04 broadcaster tests.
 *
 * DYK Insight #5: Contract tests C01/C06/C08/C09 are vacuous for the real service
 * (pass with no assertions due to `instanceof FakeCentralEventNotifier` branching).
 * Companion B01-B04 tests provide actual broadcast verification for these cases.
 */

import { FakeSSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { CentralEventNotifierService } from '../../apps/web/src/features/027-central-notify-events/central-event-notifier.service';
import { centralEventNotifierContractTests } from './central-event-notifier.contract.js';

// === Phase 1: FakeCentralEventNotifier ===

centralEventNotifierContractTests('FakeCentralEventNotifier', () => {
  const fake = new FakeCentralEventNotifier();
  return {
    notifier: fake,
    advanceTime: (ms: number) => fake.advanceTime(ms),
  };
});

// === Phase 2: CentralEventNotifierService (real) ===

centralEventNotifierContractTests('CentralEventNotifierService', () => {
  const broadcaster = new FakeSSEBroadcaster();
  const service = new CentralEventNotifierService(broadcaster);
  return {
    notifier: service,
    // Real service has no advanceTime — C05 will be skipped per DYK-02
    advanceTime: undefined,
  };
});

// === Phase 2: Companion Broadcaster Tests (B01-B04) ===
// These cover the C01/C06/C08/C09 gap where contract tests are vacuous for real service.

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
    - Worked Example: emit('workgraphs', 'graph-updated', {graphSlug:'g1'}) → broadcast channel 'workgraphs', eventType 'graph-updated'
    */
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.channel).toBe('workgraphs');
    expect(broadcasts[0]?.eventType).toBe('graph-updated');
    expect(broadcasts[0]?.data).toEqual({ graphSlug: 'g1' });
  });

  it('B02: emit() with empty data delivers to broadcaster', () => {
    /*
    Test Doc:
    - Why: Companion to C06 — verifies empty data passes through to broadcast
    - Contract: emit(domain, eventType, {}) → broadcast receives {}
    - Usage Notes: C06 is vacuous for real service; this test makes the assertion
    - Quality Contribution: Catches empty data rejection in broadcast path
    - Worked Example: emit('workgraphs', 'sync', {}) → broadcast data is {}
    */
    service.emit(WorkspaceDomain.Workgraphs, 'sync', {});

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.data).toEqual({});
  });

  it('B03: suppressed emit produces no broadcast', () => {
    /*
    Test Doc:
    - Why: Companion to C08 — verifies suppression blocks broadcast for real service
    - Contract: suppressDomain() + emit() for same key → 0 broadcasts
    - Usage Notes: C08 is vacuous for real service; this test makes the assertion
    - Quality Contribution: Core integration — suppression actually blocks broadcast
    - Worked Example: suppress('workgraphs','g1',500) → emit('workgraphs','graph-updated',{graphSlug:'g1'}) → 0 broadcasts
    */
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 500);
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    expect(broadcaster.getBroadcasts()).toHaveLength(0);
  });

  it('B04: multiple emissions produce ordered broadcasts', () => {
    /*
    Test Doc:
    - Why: Companion to C09 — verifies broadcast ordering for real service
    - Contract: emit A then emit B → broadcasts[0] is A, broadcasts[1] is B
    - Usage Notes: C09 is vacuous for real service; this test makes the assertion
    - Quality Contribution: Catches broadcast reordering bugs
    - Worked Example: emit workgraphs, emit agents, emit workgraphs → 3 broadcasts in order
    */
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });
    service.emit(WorkspaceDomain.Agents, 'agent-status', { agentId: 'a1' });
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g2' });

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(3);
    expect(broadcasts[0]?.channel).toBe('workgraphs');
    expect(broadcasts[0]?.data).toEqual({ graphSlug: 'g1' });
    expect(broadcasts[1]?.channel).toBe('agents');
    expect(broadcasts[1]?.data).toEqual({ agentId: 'a1' });
    expect(broadcasts[2]?.data).toEqual({ graphSlug: 'g2' });
  });
});
