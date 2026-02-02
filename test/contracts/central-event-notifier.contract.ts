/**
 * Plan 027: Central Domain Event Notification System
 *
 * Contract tests for ICentralEventNotifier.
 * Defines behavior contracts that BOTH Fake and Real implementations must satisfy.
 *
 * These tests verify:
 * - AC-02 (partial): ICentralEventNotifier interface exists with correct behavior
 * - AC-12: Tests use fakes, no vi.mock()
 *
 * Phase 1: Runs against FakeCentralEventNotifier only.
 * Phase 2: Adds CentralEventNotifierService (real) to the runner.
 * Phase 3: Suppression tests removed — client-side isRefreshing guard is sufficient.
 */

import type { ICentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Factory type for creating notifier implementations under test.
 */
export type NotifierFactory = () => { notifier: ICentralEventNotifier };

/**
 * Contract tests for ICentralEventNotifier.
 *
 * @param name - Implementation name for test descriptions
 * @param factory - Factory function that creates the implementation
 */
export function centralEventNotifierContractTests(name: string, factory: NotifierFactory): void {
  describe(`ICentralEventNotifier Contract: ${name}`, () => {
    let notifier: ICentralEventNotifier;

    beforeEach(() => {
      const harness = factory();
      notifier = harness.notifier;
    });

    // === Domain Value Assertions (DYK-03) ===

    it('C10: WorkspaceDomain.Workgraphs should equal "workgraphs"', () => {
      /*
      Test Doc:
      - Why: SSE channel name invariant — value must match hardcoded channel in sse-broadcast.ts
      - Contract: WorkspaceDomain.Workgraphs === 'workgraphs'
      - Usage Notes: Any mismatch causes silent SSE failure (events go to wrong channel)
      - Quality Contribution: Catches domain const typos that would break SSE routing
      - Worked Example: WorkspaceDomain.Workgraphs → 'workgraphs' (exact match)
      */
      expect(WorkspaceDomain.Workgraphs).toBe('workgraphs');
    });

    it('C11: WorkspaceDomain.Agents should equal "agents"', () => {
      /*
      Test Doc:
      - Why: SSE channel name invariant — value must match agent SSE channel
      - Contract: WorkspaceDomain.Agents === 'agents'
      - Usage Notes: Any mismatch causes silent SSE failure
      - Quality Contribution: Catches domain const typos
      - Worked Example: WorkspaceDomain.Agents → 'agents' (exact match)
      */
      expect(WorkspaceDomain.Agents).toBe('agents');
    });

    // === Core Emission Contract ===

    it('C01: should emit domain events', () => {
      /*
      Test Doc:
      - Why: Core contract — emit() must record/broadcast domain events
      - Contract: emit(domain, eventType, data) records the event for inspection (fake) or broadcasts (real)
      - Usage Notes: Data is Record<string, unknown>, kept minimal per ADR-0007
      - Quality Contribution: Catches broken emission pipeline
      - Worked Example: emit('workgraphs', 'graph-updated', {graphSlug:'g1'}) → emittedEvents[0] matches
      */
      notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', {
        graphSlug: 'my-graph',
      });

      // For FakeCentralEventNotifier, inspect emittedEvents directly
      if (notifier instanceof FakeCentralEventNotifier) {
        expect(notifier.emittedEvents).toHaveLength(1);
        expect(notifier.emittedEvents[0]).toEqual({
          domain: 'workgraphs',
          eventType: 'graph-updated',
          data: { graphSlug: 'my-graph' },
        });
      }
      // Real implementations verify via FakeSSEBroadcaster in their own test runner
    });

    // === Edge Cases ===

    it('C06: should emit with empty data object', () => {
      /*
      Test Doc:
      - Why: Edge case — empty data is valid per ADR-0007 (some events carry no payload)
      - Contract: emit() succeeds with {} as data
      - Usage Notes: Some event types may not need data
      - Quality Contribution: Catches data validation that rejects empty objects
      - Worked Example: emit('workgraphs', 'sync', {}) → emittedEvents[0].data is {}
      */
      notifier.emit(WorkspaceDomain.Workgraphs, 'sync', {});

      if (notifier instanceof FakeCentralEventNotifier) {
        expect(notifier.emittedEvents).toHaveLength(1);
        expect(notifier.emittedEvents[0]?.data).toEqual({});
      }
    });

    // === Ordering ===

    it('C09: should track multiple emissions in order', () => {
      /*
      Test Doc:
      - Why: Ordering invariant — events must preserve insertion order
      - Contract: emittedEvents array reflects emission order
      - Usage Notes: Important for UI consistency (events arrive in order)
      - Quality Contribution: Catches reordering bugs in event storage
      - Worked Example: emit A, emit B → emittedEvents[0] is A, emittedEvents[1] is B
      */
      notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', {
        graphSlug: 'g1',
      });
      notifier.emit(WorkspaceDomain.Agents, 'agent-status', {
        agentId: 'a1',
      });
      notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', {
        graphSlug: 'g2',
      });

      if (notifier instanceof FakeCentralEventNotifier) {
        expect(notifier.emittedEvents).toHaveLength(3);
        expect(notifier.emittedEvents[0]?.domain).toBe('workgraphs');
        expect(notifier.emittedEvents[0]?.data).toEqual({ graphSlug: 'g1' });
        expect(notifier.emittedEvents[1]?.domain).toBe('agents');
        expect(notifier.emittedEvents[2]?.data).toEqual({ graphSlug: 'g2' });
      }
    });
  });
}
