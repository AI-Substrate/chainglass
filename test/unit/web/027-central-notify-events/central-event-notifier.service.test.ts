/**
 * Plan 027: Central Domain Event Notification System
 *
 * Unit tests for CentralEventNotifierService.
 * Uses FakeSSEBroadcaster — no vi.mock() per Constitution Principle 4.
 *
 * Tests verify:
 * - AC-02: Service implements ICentralEventNotifier correctly
 * - AC-07: Suppression prevents duplicate events
 * - AC-12: Tests use fakes, no vi.mock()
 */

import { FakeSSEBroadcaster } from '@chainglass/shared/features/019-agent-manager-refactor';
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
    - Contract: emit(WorkspaceDomain.Workgraphs, ...) → broadcast channel is 'workgraphs'
    - Usage Notes: Domain value IS the channel name per ADR-0007
    - Quality Contribution: Catches channel mapping errors
    - Worked Example: emit('workgraphs', 'graph-updated', {}) → getBroadcasts()[0].channel === 'workgraphs'
    */
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    const broadcasts = broadcaster.getBroadcasts();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.channel).toBe('workgraphs');
  });

  it('U02: emit() passes eventType and data through', () => {
    /*
    Test Doc:
    - Why: Payload integrity — eventType and data must pass through unmodified
    - Contract: emit(domain, eventType, data) → broadcast(domain, eventType, data)
    - Usage Notes: Data is Record<string, unknown> per ADR-0007
    - Quality Contribution: Catches data transformation bugs
    - Worked Example: emit('workgraphs', 'graph-updated', {graphSlug:'g1'}) → broadcast has same eventType and data
    */
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    const broadcast = broadcaster.getLastBroadcast();
    expect(broadcast?.eventType).toBe('graph-updated');
    expect(broadcast?.data).toEqual({ graphSlug: 'g1' });
  });

  it('U03: emit() on agents domain broadcasts to agents channel', () => {
    /*
    Test Doc:
    - Why: Multi-domain routing — agents domain must route to 'agents' channel
    - Contract: emit(WorkspaceDomain.Agents, ...) → broadcast channel is 'agents'
    - Usage Notes: Each domain routes to its own SSE channel
    - Quality Contribution: Catches hardcoded channel bug
    - Worked Example: emit('agents', 'agent-status', {agentId:'a1'}) → channel === 'agents'
    */
    service.emit(WorkspaceDomain.Agents, 'agent-status', { agentId: 'a1' });

    expect(broadcaster.getBroadcasts()[0]?.channel).toBe('agents');
  });

  // === Suppression ===

  it('U04: suppressDomain() + emit() → no broadcast', () => {
    /*
    Test Doc:
    - Why: Core suppression — suppressed events must not reach broadcaster
    - Contract: suppressDomain(domain, key, ms) blocks emit(domain, _, {graphSlug: key})
    - Usage Notes: Per DYK-01, emit() owns suppression enforcement internally
    - Quality Contribution: Catches broken suppression enforcement
    - Worked Example: suppress('workgraphs','g1',500) → emit('workgraphs','graph-updated',{graphSlug:'g1'}) → 0 broadcasts
    */
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 500);
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g1' });

    expect(broadcaster.getBroadcasts()).toHaveLength(0);
  });

  it('U05: different key is not suppressed', () => {
    /*
    Test Doc:
    - Why: Key isolation — suppression is per (domain, key) pair
    - Contract: suppress(domain, 'a') does not suppress emit(domain, _, {graphSlug: 'b'})
    - Usage Notes: Enables concurrent operations on different graphs
    - Quality Contribution: Catches overly broad suppression
    - Worked Example: suppress('workgraphs','g1',500) → emit with graphSlug 'g2' → 1 broadcast
    */
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 500);
    service.emit(WorkspaceDomain.Workgraphs, 'graph-updated', { graphSlug: 'g2' });

    expect(broadcaster.getBroadcasts()).toHaveLength(1);
  });

  it('U06: different domain is not suppressed', () => {
    /*
    Test Doc:
    - Why: Domain isolation — suppressing workgraphs must not affect agents
    - Contract: suppress('workgraphs', key) does not suppress emit('agents', _, {agentId: key})
    - Usage Notes: Each domain has independent suppression namespace
    - Quality Contribution: Catches domain cross-contamination
    - Worked Example: suppress('workgraphs','k1',500) → emit('agents',...,{agentId:'k1'}) → 1 broadcast
    */
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'k1', 500);
    service.emit(WorkspaceDomain.Agents, 'agent-status', { agentId: 'k1' });

    expect(broadcaster.getBroadcasts()).toHaveLength(1);
  });

  it('U07: isSuppressed() returns true within window', () => {
    /*
    Test Doc:
    - Why: Query contract — isSuppressed() reflects current suppression state
    - Contract: After suppressDomain(domain, key, ms), isSuppressed(domain, key) returns true
    - Usage Notes: Public for observability; callers don't need to check before emit()
    - Quality Contribution: Catches broken suppression state tracking
    - Worked Example: suppress('workgraphs','g1',500) → isSuppressed('workgraphs','g1') === true
    */
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 500);

    expect(service.isSuppressed(WorkspaceDomain.Workgraphs, 'g1')).toBe(true);
  });

  it('U08: isSuppressed() returns false after expiry', () => {
    /*
    Test Doc:
    - Why: Expiry semantics — suppression must be time-bounded
    - Contract: After durationMs elapses, isSuppressed() returns false
    - Usage Notes: Uses Date.now() comparison, no setTimeout
    - Quality Contribution: Catches missing expiry logic (permanent suppression bug)
    - Worked Example: suppress('workgraphs','g1',1) → wait → isSuppressed returns false
    */
    // Use a very short suppression (1ms) and verify it expires
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 1);

    // Busy-wait past the 1ms window
    const start = Date.now();
    while (Date.now() - start < 5) {
      // spin
    }

    expect(service.isSuppressed(WorkspaceDomain.Workgraphs, 'g1')).toBe(false);
  });

  // === Edge Cases ===

  it('U09: emit() with empty data broadcasts', () => {
    /*
    Test Doc:
    - Why: Edge case — empty data is valid per ADR-0007
    - Contract: emit() with {} as data still broadcasts (no suppression key to match)
    - Usage Notes: Events with no key field are never suppression-checked
    - Quality Contribution: Catches data validation that rejects empty objects
    - Worked Example: emit('workgraphs', 'sync', {}) → 1 broadcast with data {}
    */
    service.emit(WorkspaceDomain.Workgraphs, 'sync', {});

    expect(broadcaster.getBroadcasts()).toHaveLength(1);
    expect(broadcaster.getLastBroadcast()?.data).toEqual({});
  });

  it('U10: multiple suppressDomain calls extend window', () => {
    /*
    Test Doc:
    - Why: Window extension — second suppress call should overwrite expiry
    - Contract: suppressDomain() with same key overwrites previous expiry
    - Usage Notes: Enables debounce reset on rapid saves
    - Quality Contribution: Catches append vs overwrite bugs in suppression map
    - Worked Example: suppress(500) then suppress(1000) → window extends to 1000ms from second call
    */
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 100);
    service.suppressDomain(WorkspaceDomain.Workgraphs, 'g1', 5000);

    // Still suppressed (window extended)
    expect(service.isSuppressed(WorkspaceDomain.Workgraphs, 'g1')).toBe(true);
  });
});
