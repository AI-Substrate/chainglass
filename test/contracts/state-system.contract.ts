/**
 * Plan 053: GlobalStateSystem — Contract Tests
 *
 * Contract test factory for IStateService. Both GlobalStateSystem (real)
 * and FakeGlobalStateSystem (fake) must pass this suite.
 *
 * Per DYK-07: C06 must call get() inside subscriber callback.
 * Per DYK-08: Every test that calls publish() must first registerDomain().
 * Per DYK-09: C15 tests list() stable array reference.
 */

import type { IStateService } from '@chainglass/shared/state';
import type { StateChange } from '@chainglass/shared/state';
import { beforeEach, describe, expect, it } from 'vitest';

export type StateServiceFactory = () => IStateService;

function registerTestDomain(service: IStateService, multi = true): void {
  service.registerDomain({
    domain: 'test-domain',
    description: 'Test domain for contract tests',
    multiInstance: multi,
    properties: [
      { key: 'status', description: 'Status', typeHint: 'string' },
      { key: 'progress', description: 'Progress', typeHint: 'number' },
      { key: 'label', description: 'Label', typeHint: 'string' },
    ],
  });
}

function registerSingletonDomain(service: IStateService): void {
  service.registerDomain({
    domain: 'singleton-domain',
    description: 'Singleton test domain',
    multiInstance: false,
    properties: [
      { key: 'active-file', description: 'Active file', typeHint: 'string' },
      { key: 'count', description: 'Count', typeHint: 'number' },
    ],
  });
}

export function globalStateContractTests(name: string, factory: StateServiceFactory): void {
  describe(`IStateService Contract: ${name}`, () => {
    let service: IStateService;

    beforeEach(() => {
      service = factory();
    });

    // ═══════════════════════════════════════════════
    // C01: publish/get round-trip
    // ═══════════════════════════════════════════════

    it('C01: publish stores value retrievable via get', () => {
      /**
       * Why: Foundational contract — publish/get round-trip is the core state operation.
       * Contract: publish(path, value) followed by get(path) returns value.
       * Usage Notes: Both real and fake must satisfy this for any state interaction to work.
       * Quality Contribution: Anchor contract that all other tests build upon.
       * Worked Example: publish('test-domain:wf-1:status', 'running') → get() → 'running'
       */
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'running');
      expect(service.get('test-domain:wf-1:status')).toBe('running');
    });

    // ═══════════════════════════════════════════════
    // C02: get returns undefined for unpublished
    // ═══════════════════════════════════════════════

    it('C02: get returns undefined for unpublished path', () => {
      registerTestDomain(service);
      expect(service.get('test-domain:wf-1:status')).toBeUndefined();
    });

    // ═══════════════════════════════════════════════
    // C03: subscribe notified on publish
    // ═══════════════════════════════════════════════

    it('C03: subscribe receives notification on publish', () => {
      registerTestDomain(service);
      const changes: StateChange[] = [];
      service.subscribe('test-domain:wf-1:status', (change) => changes.push(change));
      service.publish('test-domain:wf-1:status', 'running');

      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('test-domain:wf-1:status');
      expect(changes[0].value).toBe('running');
      expect(changes[0].domain).toBe('test-domain');
      expect(changes[0].instanceId).toBe('wf-1');
      expect(changes[0].property).toBe('status');
      expect(changes[0].previousValue).toBeUndefined();
      expect(changes[0].timestamp).toBeTypeOf('number');
    });

    // ═══════════════════════════════════════════════
    // C04: unsubscribe stops notifications
    // ═══════════════════════════════════════════════

    it('C04: unsubscribe prevents further notifications', () => {
      registerTestDomain(service);
      const changes: StateChange[] = [];
      const unsubscribe = service.subscribe('test-domain:wf-1:status', (change) =>
        changes.push(change)
      );

      service.publish('test-domain:wf-1:status', 'running');
      expect(changes).toHaveLength(1);

      unsubscribe();
      service.publish('test-domain:wf-1:status', 'complete');
      expect(changes).toHaveLength(1); // no new notification
    });

    // ═══════════════════════════════════════════════
    // C05: error isolation
    // ═══════════════════════════════════════════════

    it('C05: throwing subscriber does not block other subscribers', () => {
      /**
       * Why: Per PL-07, error isolation prevents one bad subscriber from silencing others.
       * Contract: Throwing subscriber is called (throwerCalled), non-throwing still receives.
       * Usage Notes: Implementation must wrap each callback in try/catch.
       * Quality Contribution: Prevents cascading failures in production from buggy subscribers.
       * Worked Example: subscriber1 throws → subscriber2 still receives 'running'
       */
      registerTestDomain(service);
      const received: string[] = [];
      let throwerCalled = false;

      service.subscribe('test-domain:wf-1:status', () => {
        throwerCalled = true;
        throw new Error('subscriber explosion');
      });
      service.subscribe('test-domain:wf-1:status', (change) => {
        received.push(change.value as string);
      });

      service.publish('test-domain:wf-1:status', 'running');
      expect(throwerCalled).toBe(true);
      expect(received).toEqual(['running']);
    });

    // ═══════════════════════════════════════════════
    // C06: store-first ordering (DYK-07)
    // ═══════════════════════════════════════════════

    it('C06: value is readable in subscriber callback (store-first)', () => {
      /**
       * Why: Per PL-01, store-first ordering is architecturally critical — prevents stale reads.
       * Contract: get() inside subscriber callback returns the just-published value.
       * Usage Notes: If implementation notifies before storing, this test catches it.
       * Quality Contribution: Validates the most important ordering invariant in the system.
       * Worked Example: subscribe → publish('running') → get() in callback → 'running'
       */
      registerTestDomain(service);
      let readInCallback: unknown;

      service.subscribe('test-domain:wf-1:status', () => {
        readInCallback = service.get('test-domain:wf-1:status');
      });

      service.publish('test-domain:wf-1:status', 'running');
      expect(readInCallback).toBe('running');
    });

    // ═══════════════════════════════════════════════
    // C07: remove notifies with removed flag
    // ═══════════════════════════════════════════════

    it('C07: remove notifies subscribers with removed flag', () => {
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'running');

      const changes: StateChange[] = [];
      service.subscribe('test-domain:wf-1:status', (change) => changes.push(change));

      service.remove('test-domain:wf-1:status');

      expect(changes).toHaveLength(1);
      expect(changes[0].removed).toBe(true);
      expect(changes[0].previousValue).toBe('running');
      expect(service.get('test-domain:wf-1:status')).toBeUndefined();
    });

    // ═══════════════════════════════════════════════
    // C08: removeInstance removes all entries
    // ═══════════════════════════════════════════════

    it('C08: removeInstance removes all instance entries and notifies', () => {
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'running');
      service.publish('test-domain:wf-1:progress', 50);

      const removals: StateChange[] = [];
      service.subscribe('test-domain:wf-1:*', (change) => removals.push(change));

      service.removeInstance('test-domain', 'wf-1');

      expect(removals).toHaveLength(2);
      expect(removals.every((c) => c.removed === true)).toBe(true);
      expect(service.get('test-domain:wf-1:status')).toBeUndefined();
      expect(service.get('test-domain:wf-1:progress')).toBeUndefined();
    });

    // ═══════════════════════════════════════════════
    // C09: registerDomain + listDomains
    // ═══════════════════════════════════════════════

    it('C09: registerDomain is retrievable via listDomains', () => {
      registerTestDomain(service);
      const domains = service.listDomains();
      expect(domains).toHaveLength(1);
      expect(domains[0].domain).toBe('test-domain');
      expect(domains[0].multiInstance).toBe(true);
    });

    it('C09b: duplicate registerDomain throws', () => {
      registerTestDomain(service);
      expect(() => registerTestDomain(service)).toThrow();
    });

    // ═══════════════════════════════════════════════
    // C10: listInstances returns IDs
    // ═══════════════════════════════════════════════

    it('C10: listInstances returns known instance IDs', () => {
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'running');
      service.publish('test-domain:wf-2:status', 'pending');

      const instances = service.listInstances('test-domain');
      expect(instances).toContain('wf-1');
      expect(instances).toContain('wf-2');
      expect(instances).toHaveLength(2);
    });

    // ═══════════════════════════════════════════════
    // C11: publish to unregistered domain throws
    // ═══════════════════════════════════════════════

    it('C11: publish to unregistered domain throws', () => {
      expect(() => service.publish('unknown:wf-1:status', 'val')).toThrow(/unknown|unregistered/i);
    });

    // ═══════════════════════════════════════════════
    // C12: subscriberCount / entryCount diagnostics
    // ═══════════════════════════════════════════════

    it('C12: subscriberCount tracks active subscriptions', () => {
      registerTestDomain(service);
      expect(service.subscriberCount).toBe(0);

      const unsub1 = service.subscribe('test-domain:**', () => {});
      expect(service.subscriberCount).toBe(1);

      const unsub2 = service.subscribe('test-domain:wf-1:status', () => {});
      expect(service.subscriberCount).toBe(2);

      unsub1();
      expect(service.subscriberCount).toBe(1);

      unsub2();
      expect(service.subscriberCount).toBe(0);
    });

    it('C12b: entryCount tracks stored entries', () => {
      registerTestDomain(service);
      expect(service.entryCount).toBe(0);

      service.publish('test-domain:wf-1:status', 'running');
      expect(service.entryCount).toBe(1);

      service.publish('test-domain:wf-1:progress', 50);
      expect(service.entryCount).toBe(2);

      service.remove('test-domain:wf-1:status');
      expect(service.entryCount).toBe(1);
    });

    // ═══════════════════════════════════════════════
    // C13: list returns matching entries
    // ═══════════════════════════════════════════════

    it('C13: list returns entries matching pattern', () => {
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'running');
      service.publish('test-domain:wf-1:progress', 50);
      service.publish('test-domain:wf-2:status', 'pending');

      const allWf1 = service.list('test-domain:wf-1:*');
      expect(allWf1).toHaveLength(2);

      const allStatuses = service.list('test-domain:*:status');
      expect(allStatuses).toHaveLength(2);

      const everything = service.list('test-domain:**');
      expect(everything).toHaveLength(3);
    });

    // ═══════════════════════════════════════════════
    // C14: stable get reference (Object.is)
    // ═══════════════════════════════════════════════

    it('C14: consecutive get() returns Object.is-equal reference', () => {
      registerTestDomain(service);
      const obj = { nested: true };
      service.publish('test-domain:wf-1:status', obj);

      const first = service.get('test-domain:wf-1:status');
      const second = service.get('test-domain:wf-1:status');
      expect(first).toBe(second); // Object.is equality
    });

    // ═══════════════════════════════════════════════
    // C15: stable list reference (DYK-09)
    // ═══════════════════════════════════════════════

    it('C15: list returns same array reference when values unchanged', () => {
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'running');

      const first = service.list('test-domain:**');
      const second = service.list('test-domain:**');
      expect(first).toBe(second); // Same array reference
    });

    // ═══════════════════════════════════════════════
    // C16: singleton domain path validation
    // ═══════════════════════════════════════════════

    it('C16: singleton domain rejects path with instance ID', () => {
      registerSingletonDomain(service);
      expect(() => service.publish('singleton-domain:inst-1:active-file', 'x')).toThrow();
    });

    it('C16b: singleton domain accepts 2-segment path', () => {
      registerSingletonDomain(service);
      service.publish('singleton-domain:active-file', '/src/app.tsx');
      expect(service.get('singleton-domain:active-file')).toBe('/src/app.tsx');
    });

    // ═══════════════════════════════════════════════
    // C17: multi-instance domain rejects 2-segment path
    // ═══════════════════════════════════════════════

    it('C17: multi-instance domain rejects path without instance ID', () => {
      registerTestDomain(service);
      expect(() => service.publish('test-domain:status', 'val')).toThrow();
    });

    // ═══════════════════════════════════════════════
    // C18: previousValue tracking
    // ═══════════════════════════════════════════════

    it('C18: publish includes previousValue in change notification', () => {
      registerTestDomain(service);
      service.publish('test-domain:wf-1:status', 'pending');

      const changes: StateChange[] = [];
      service.subscribe('test-domain:wf-1:status', (change) => changes.push(change));
      service.publish('test-domain:wf-1:status', 'running');

      expect(changes[0].previousValue).toBe('pending');
      expect(changes[0].value).toBe('running');
    });

    // ═══════════════════════════════════════════════
    // C19: pattern subscriptions work
    // ═══════════════════════════════════════════════

    it('C19: domain wildcard subscription receives matching changes', () => {
      registerTestDomain(service);
      const changes: StateChange[] = [];
      service.subscribe('test-domain:*:status', (change) => changes.push(change));

      service.publish('test-domain:wf-1:status', 'running');
      service.publish('test-domain:wf-2:status', 'pending');
      service.publish('test-domain:wf-1:progress', 50); // should NOT match

      expect(changes).toHaveLength(2);
      expect(changes[0].instanceId).toBe('wf-1');
      expect(changes[1].instanceId).toBe('wf-2');
    });
  });
}
