/**
 * Plan 027: Central Domain Event Notification System
 *
 * Contract tests for ICentralEventNotifier.
 * Defines behavior contracts that BOTH Fake and Real implementations must satisfy.
 *
 * Per DYK-02: Factory returns `{ notifier, advanceTime? }` — time control protocol.
 * Per DYK-05: Stub enables true RED phase (tests run and fail with assertion/throw errors).
 *
 * These tests verify:
 * - AC-02 (partial): ICentralEventNotifier interface exists with correct behavior
 * - AC-07 (foundation): Suppression prevents duplicate events
 * - AC-12: Tests use fakes, no vi.mock()
 *
 * Phase 1: Runs against FakeCentralEventNotifier only.
 * Phase 2: Will add CentralEventNotifierService (real) to the runner.
 */

import type {
  DomainEvent,
  ICentralEventNotifier,
} from '@chainglass/shared/features/027-central-notify-events/central-event-notifier.interface';
import { FakeCentralEventNotifier } from '@chainglass/shared/features/027-central-notify-events/fake-central-event-notifier';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Per DYK-02: Time control protocol.
 * Factory returns notifier + optional advanceTime for deterministic expiry testing.
 * Phase 2 real service returns `{ notifier, advanceTime: undefined }`.
 */
export interface NotifierTestHarness {
  notifier: ICentralEventNotifier;
  advanceTime?: (ms: number) => void;
}

/**
 * Factory type for creating notifier implementations under test.
 */
export type NotifierFactory = () => NotifierTestHarness;

/**
 * Contract tests for ICentralEventNotifier.
 *
 * @param name - Implementation name for test descriptions
 * @param factory - Factory function that creates the implementation
 */
export function centralEventNotifierContractTests(name: string, factory: NotifierFactory): void {
  describe(`ICentralEventNotifier Contract: ${name}`, () => {
    let notifier: ICentralEventNotifier;
    let advanceTime: ((ms: number) => void) | undefined;

    beforeEach(() => {
      const harness = factory();
      notifier = harness.notifier;
      advanceTime = harness.advanceTime;
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

    // === Suppression Contract ===

    it('C02: should suppress events after suppressDomain()', () => {
      /*
      Test Doc:
      - Why: Debounce contract — prevent duplicate events from UI-initiated saves (AC-07 foundation)
      - Contract: isSuppressed() returns true within the suppression window
      - Usage Notes: Key is typically graphSlug; duration in ms
      - Quality Contribution: Prevents duplicate SSE events
      - Worked Example: suppress('workgraphs', 'g1', 500) → isSuppressed('workgraphs', 'g1') returns true
      */
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'my-graph', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'my-graph')).toBe(true);
    });

    it('C03: should not suppress events for different keys', () => {
      /*
      Test Doc:
      - Why: Suppression is per (domain, key) pair — different keys are independent
      - Contract: suppressDomain(domain, 'a', ...) does not suppress (domain, 'b')
      - Usage Notes: Enables concurrent operations on different graphs
      - Quality Contribution: Catches overly broad suppression bugs
      - Worked Example: suppress('workgraphs', 'graph-a', 500) → isSuppressed('workgraphs', 'graph-b') returns false
      */
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'graph-a', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'graph-b')).toBe(false);
    });

    it('C04: should not suppress events for different domains', () => {
      /*
      Test Doc:
      - Why: Cross-domain independence — suppressing workgraphs must not affect agents
      - Contract: suppressDomain(domainA, key, ...) does not suppress (domainB, key)
      - Usage Notes: Each domain has its own suppression namespace
      - Quality Contribution: Catches domain cross-contamination bugs
      - Worked Example: suppress('workgraphs', 'k1', 500) → isSuppressed('agents', 'k1') returns false
      */
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'my-key', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Agents, 'my-key')).toBe(false);
    });

    // === Time-Sensitive Tests (conditional on advanceTime) ===

    it('C05: should allow events after suppression expires', () => {
      /*
      Test Doc:
      - Why: Expiry semantics — suppression must be time-bounded, not permanent
      - Contract: After durationMs elapses, isSuppressed() returns false
      - Usage Notes: Per DYK-02, uses advanceTime() for deterministic control. Skips if advanceTime unavailable.
      - Quality Contribution: Catches missing expiry logic (permanent suppression bug)
      - Worked Example: suppress('workgraphs','g1',500) → advanceTime(600) → isSuppressed returns false
      */
      if (!advanceTime) {
        // Real service doesn't expose time control — skip this test
        return;
      }

      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'my-graph', 500);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'my-graph')).toBe(true);

      advanceTime(600);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'my-graph')).toBe(false);
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

    it('C07: should handle 0ms suppression duration', () => {
      /*
      Test Doc:
      - Why: Edge case — 0ms suppression means immediate expiry
      - Contract: suppressDomain with 0ms → isSuppressed() returns false immediately
      - Usage Notes: Degenerate case that should not break
      - Quality Contribution: Catches off-by-one in expiry calculation
      - Worked Example: suppress('workgraphs', 'g1', 0) → isSuppressed returns false
      */
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 0);
      expect(notifier.isSuppressed(WorkspaceDomain.Workgraphs, 'g1')).toBe(false);
    });

    // === Integration: emit + suppression ===

    it('C08: should not emit when suppressed', () => {
      /*
      Test Doc:
      - Why: DYK-01 — emit() owns suppression enforcement; suppressed events are silently dropped
      - Contract: After suppressDomain(), emit() for same key does NOT record/broadcast
      - Usage Notes: Callers never need to check isSuppressed() before emit()
      - Quality Contribution: Core integration test — suppression actually blocks emission
      - Worked Example: suppress('workgraphs','g1',500) → emit('workgraphs','graph-updated',{graphSlug:'g1'}) → emittedEvents is empty
      */
      notifier.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 500);
      notifier.emit(WorkspaceDomain.Workgraphs, 'graph-updated', {
        graphSlug: 'g1',
      });

      if (notifier instanceof FakeCentralEventNotifier) {
        expect(notifier.emittedEvents).toHaveLength(0);
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
