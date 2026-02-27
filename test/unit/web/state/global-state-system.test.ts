/**
 * Plan 053: GlobalStateSystem — Unit Tests
 *
 * TDD RED tests for GlobalStateSystem store operations.
 * Written before the implementation exists.
 *
 * Tests cover: publish/get, subscribe/unsubscribe, error isolation,
 * store-first ordering, remove, removeInstance, registerDomain,
 * listDomains, listInstances, singleton/multi-instance validation,
 * list with patterns, stable references, diagnostics.
 */

import type { StateChange } from '@chainglass/shared/state';
import { beforeEach, describe, expect, it } from 'vitest';
import { GlobalStateSystem } from '../../../../apps/web/src/lib/state/global-state-system';
import { FakeGlobalStateSystem } from '../../../../packages/shared/src/fakes/fake-state-system';

function registerMultiDomain(svc: GlobalStateSystem): void {
  svc.registerDomain({
    domain: 'test-domain',
    description: 'Multi-instance test domain',
    multiInstance: true,
    properties: [
      { key: 'status', description: 'Status', typeHint: 'string' },
      { key: 'progress', description: 'Progress', typeHint: 'number' },
      { key: 'label', description: 'Label', typeHint: 'string' },
    ],
  });
}

function registerSingletonDomain(svc: GlobalStateSystem): void {
  svc.registerDomain({
    domain: 'singleton',
    description: 'Singleton test domain',
    multiInstance: false,
    properties: [
      { key: 'active-file', description: 'Active file', typeHint: 'string' },
      { key: 'count', description: 'Count', typeHint: 'number' },
    ],
  });
}

describe('GlobalStateSystem', () => {
  let svc: GlobalStateSystem;

  beforeEach(() => {
    svc = new GlobalStateSystem();
  });

  // ═══════════════════════════════════════════════
  // Domain Registration
  // ═══════════════════════════════════════════════

  describe('registerDomain', () => {
    it('registers a domain descriptor (AC-06)', () => {
      registerMultiDomain(svc);
      const domains = svc.listDomains();
      expect(domains).toHaveLength(1);
      expect(domains[0].domain).toBe('test-domain');
    });

    it('throws on duplicate registration (AC-07)', () => {
      registerMultiDomain(svc);
      expect(() => registerMultiDomain(svc)).toThrow();
    });

    it('lists multiple registered domains (AC-09)', () => {
      registerMultiDomain(svc);
      registerSingletonDomain(svc);
      const domains = svc.listDomains();
      expect(domains).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════
  // Publish / Get
  // ═══════════════════════════════════════════════

  describe('publish/get', () => {
    it('stores and retrieves value (AC-01)', () => {
      /**
       * Why: Foundational contract — publish/get round-trip is the core state operation.
       * Contract: publish(path, value) followed by get(path) returns the value.
       * Usage Notes: Domain must be registered before publish.
       * Quality Contribution: Anchor test all other tests build upon.
       * Worked Example: publish('test-domain:wf-1:status', 'running') → get() → 'running'
       */
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');
      expect(svc.get('test-domain:wf-1:status')).toBe('running');
    });

    it('returns undefined for unpublished path (AC-02)', () => {
      registerMultiDomain(svc);
      expect(svc.get('test-domain:wf-1:status')).toBeUndefined();
    });

    it('overwrites existing value', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'pending');
      svc.publish('test-domain:wf-1:status', 'running');
      expect(svc.get('test-domain:wf-1:status')).toBe('running');
    });

    it('returns stable object reference (AC-03)', () => {
      /**
       * Why: useSyncExternalStore requires Object.is stability to avoid re-renders.
       * Contract: Consecutive get() calls without intervening publish return same reference.
       * Usage Notes: Implementation must not clone/copy values in get().
       * Quality Contribution: Prevents subtle React render loops from defensive copies.
       * Worked Example: publish(obj) → get() === get() via Object.is
       */
      registerMultiDomain(svc);
      const obj = { nested: true };
      svc.publish('test-domain:wf-1:status', obj);
      const a = svc.get('test-domain:wf-1:status');
      const b = svc.get('test-domain:wf-1:status');
      expect(a).toBe(b); // Object.is equality
    });

    it('throws on unregistered domain (AC-08)', () => {
      /**
       * Why: Fail-fast prevents silent publishing to typo'd domain names.
       * Contract: publish to unregistered domain throws with descriptive message.
       * Usage Notes: registerDomain() must be called before any publish.
       * Quality Contribution: Catches wiring errors at dev time rather than silently dropping state.
       * Worked Example: publish('unknown:wf-1:status', val) → throws /unregistered/i
       */
      expect(() => svc.publish('unknown:wf-1:status', 'val')).toThrow(/unknown|unregistered/i);
    });
  });

  // ═══════════════════════════════════════════════
  // Singleton / Multi-instance Validation
  // ═══════════════════════════════════════════════

  describe('singleton/multi-instance validation', () => {
    it('singleton rejects path with instance ID (AC-13)', () => {
      /**
       * Why: Singleton domains must not accept instance IDs — enforces domain model.
       * Contract: publish('singleton:inst:prop') throws for singleton domain.
       * Usage Notes: Singletons use 2-segment paths (domain:property).
       * Quality Contribution: Prevents accidental multi-instance usage of singleton domains.
       * Worked Example: registerDomain({multiInstance:false}) + publish('s:id:prop') → throws
       */
      registerSingletonDomain(svc);
      expect(() => svc.publish('singleton:inst-1:active-file', 'x')).toThrow();
    });

    it('singleton accepts 2-segment path', () => {
      registerSingletonDomain(svc);
      svc.publish('singleton:active-file', '/src/app.tsx');
      expect(svc.get('singleton:active-file')).toBe('/src/app.tsx');
    });

    it('multi-instance rejects 2-segment path (AC-14)', () => {
      /**
       * Why: Multi-instance domains require instance IDs to disambiguate entries.
       * Contract: publish('domain:property') throws for multi-instance domain.
       * Usage Notes: Multi-instance domains use 3-segment paths (domain:id:property).
       * Quality Contribution: Catches missing instance ID at publish time.
       * Worked Example: registerDomain({multiInstance:true}) + publish('d:prop') → throws
       */
      registerMultiDomain(svc);
      expect(() => svc.publish('test-domain:status', 'val')).toThrow();
    });

    it('multi-instance accepts 3-segment path', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');
      expect(svc.get('test-domain:wf-1:status')).toBe('running');
    });
  });

  // ═══════════════════════════════════════════════
  // Subscribe / Unsubscribe
  // ═══════════════════════════════════════════════

  describe('subscribe', () => {
    it('receives notification on publish (AC-21)', () => {
      registerMultiDomain(svc);
      const changes: StateChange[] = [];
      svc.subscribe('test-domain:wf-1:status', (c) => changes.push(c));
      svc.publish('test-domain:wf-1:status', 'running');

      expect(changes).toHaveLength(1);
      expect(changes[0].path).toBe('test-domain:wf-1:status');
      expect(changes[0].value).toBe('running');
      expect(changes[0].domain).toBe('test-domain');
      expect(changes[0].instanceId).toBe('wf-1');
      expect(changes[0].property).toBe('status');
    });

    it('returns unsubscribe function (AC-21)', () => {
      registerMultiDomain(svc);
      const changes: StateChange[] = [];
      const unsub = svc.subscribe('test-domain:wf-1:status', (c) => changes.push(c));

      svc.publish('test-domain:wf-1:status', 'running');
      expect(changes).toHaveLength(1);

      unsub();
      svc.publish('test-domain:wf-1:status', 'done');
      expect(changes).toHaveLength(1);
    });

    it('provides StateChange shape (AC-23)', () => {
      registerMultiDomain(svc);
      const changes: StateChange[] = [];
      svc.subscribe('test-domain:wf-1:status', (c) => changes.push(c));
      svc.publish('test-domain:wf-1:status', 'running');

      const change = changes[0];
      expect(change.path).toBe('test-domain:wf-1:status');
      expect(change.domain).toBe('test-domain');
      expect(change.instanceId).toBe('wf-1');
      expect(change.property).toBe('status');
      expect(change.value).toBe('running');
      expect(change.previousValue).toBeUndefined();
      expect(change.timestamp).toBeTypeOf('number');
      expect(change.removed).toBeUndefined();
    });

    it('tracks previousValue (AC-23)', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'pending');

      const changes: StateChange[] = [];
      svc.subscribe('test-domain:wf-1:status', (c) => changes.push(c));
      svc.publish('test-domain:wf-1:status', 'running');

      expect(changes[0].previousValue).toBe('pending');
      expect(changes[0].value).toBe('running');
    });

    it('pattern subscription receives matching changes (AC-21)', () => {
      registerMultiDomain(svc);
      const changes: StateChange[] = [];
      svc.subscribe('test-domain:*:status', (c) => changes.push(c));

      svc.publish('test-domain:wf-1:status', 'running');
      svc.publish('test-domain:wf-2:status', 'pending');
      svc.publish('test-domain:wf-1:progress', 50); // should NOT match

      expect(changes).toHaveLength(2);
    });

    it('domain-all subscription receives all domain changes', () => {
      registerMultiDomain(svc);
      const changes: StateChange[] = [];
      svc.subscribe('test-domain:**', (c) => changes.push(c));

      svc.publish('test-domain:wf-1:status', 'running');
      svc.publish('test-domain:wf-1:progress', 50);

      expect(changes).toHaveLength(2);
    });

    it('global subscription receives everything', () => {
      registerMultiDomain(svc);
      registerSingletonDomain(svc);
      const changes: StateChange[] = [];
      svc.subscribe('*', (c) => changes.push(c));

      svc.publish('test-domain:wf-1:status', 'running');
      svc.publish('singleton:active-file', '/src/app.tsx');

      expect(changes).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════
  // Error Isolation (PL-07, AC-22)
  // ═══════════════════════════════════════════════

  describe('error isolation', () => {
    it('throwing subscriber does not block other subscribers (AC-22)', () => {
      /**
       * Why: Per PL-07, error isolation prevents one bad subscriber from silencing others.
       * Contract: Throwing subscriber is called, non-throwing subscriber still receives.
       * Usage Notes: Implementation must wrap each callback in try/catch.
       * Quality Contribution: Prevents cascading failures in production.
       * Worked Example: subscriber1 throws → subscriber2 still receives 'running'
       */
      registerMultiDomain(svc);
      const received: string[] = [];
      let throwerCalled = false;

      svc.subscribe('test-domain:wf-1:status', () => {
        throwerCalled = true;
        throw new Error('subscriber explosion');
      });
      svc.subscribe('test-domain:wf-1:status', (c) => {
        received.push(c.value as string);
      });

      svc.publish('test-domain:wf-1:status', 'running');
      expect(throwerCalled).toBe(true);
      expect(received).toEqual(['running']);
    });
  });

  // ═══════════════════════════════════════════════
  // Store-First Ordering (PL-01, AC-24)
  // ═══════════════════════════════════════════════

  describe('store-first ordering', () => {
    it('value is readable in subscriber callback (AC-24)', () => {
      /**
       * Why: Per PL-01, store-first ordering prevents stale reads inside callbacks.
       * Contract: get() inside subscriber callback returns the just-published value.
       * Usage Notes: If implementation notifies before storing, this test catches it.
       * Quality Contribution: Validates the most critical ordering invariant.
       * Worked Example: subscribe → publish('running') → get() in callback → 'running'
       */
      registerMultiDomain(svc);
      let readInCallback: unknown;

      svc.subscribe('test-domain:wf-1:status', () => {
        readInCallback = svc.get('test-domain:wf-1:status');
      });

      svc.publish('test-domain:wf-1:status', 'running');
      expect(readInCallback).toBe('running');
    });
  });

  // ═══════════════════════════════════════════════
  // Remove
  // ═══════════════════════════════════════════════

  describe('remove', () => {
    it('notifies with removed flag (AC-04)', () => {
      /**
       * Why: Consumers must know when state is removed vs updated.
       * Contract: remove() notifies with removed:true and previousValue.
       * Usage Notes: After remove, get() returns undefined.
       * Quality Contribution: Ensures cleanup signals propagate correctly.
       * Worked Example: publish then remove → subscriber gets {removed:true, previousValue}
       */
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');

      const changes: StateChange[] = [];
      svc.subscribe('test-domain:wf-1:status', (c) => changes.push(c));
      svc.remove('test-domain:wf-1:status');

      expect(changes).toHaveLength(1);
      expect(changes[0].removed).toBe(true);
      expect(changes[0].previousValue).toBe('running');
      expect(svc.get('test-domain:wf-1:status')).toBeUndefined();
    });

    it('is a no-op for non-existent path', () => {
      registerMultiDomain(svc);
      expect(() => svc.remove('test-domain:wf-1:status')).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════
  // RemoveInstance
  // ═══════════════════════════════════════════════

  describe('removeInstance', () => {
    it('removes all instance entries and notifies (AC-05)', () => {
      /**
       * Why: Instance cleanup must remove all properties and notify subscribers.
       * Contract: removeInstance removes all entries for domain:instanceId:* and notifies each.
       * Usage Notes: Used when a workflow instance is disposed.
       * Quality Contribution: Prevents orphaned state entries after instance teardown.
       * Worked Example: removeInstance('test-domain','wf-1') → all wf-1 entries gone, subscribers notified
       */
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');
      svc.publish('test-domain:wf-1:progress', 50);

      const removals: StateChange[] = [];
      svc.subscribe('test-domain:wf-1:*', (c) => removals.push(c));
      svc.removeInstance('test-domain', 'wf-1');

      expect(removals).toHaveLength(2);
      expect(removals.every((c) => c.removed === true)).toBe(true);
      expect(svc.get('test-domain:wf-1:status')).toBeUndefined();
      expect(svc.get('test-domain:wf-1:progress')).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════
  // listInstances
  // ═══════════════════════════════════════════════

  describe('listInstances', () => {
    it('returns known instance IDs (AC-10)', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');
      svc.publish('test-domain:wf-2:status', 'pending');

      const instances = svc.listInstances('test-domain');
      expect(instances).toContain('wf-1');
      expect(instances).toContain('wf-2');
      expect(instances).toHaveLength(2);
    });

    it('returns empty array for domain with no state', () => {
      registerMultiDomain(svc);
      expect(svc.listInstances('test-domain')).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════
  // list
  // ═══════════════════════════════════════════════

  describe('list', () => {
    it('returns matching entries (AC-25)', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');
      svc.publish('test-domain:wf-1:progress', 50);
      svc.publish('test-domain:wf-2:status', 'pending');

      const wf1 = svc.list('test-domain:wf-1:*');
      expect(wf1).toHaveLength(2);

      const statuses = svc.list('test-domain:*:status');
      expect(statuses).toHaveLength(2);

      const all = svc.list('test-domain:**');
      expect(all).toHaveLength(3);
    });

    it('returns stable array reference when unchanged (AC-26)', () => {
      /**
       * Why: useSyncExternalStore requires stable references to avoid infinite re-renders.
       * Contract: Consecutive list() calls with no intervening publish return same array ref.
       * Usage Notes: Critical for React integration — unstable refs cause render loops.
       * Quality Contribution: Pins the caching contract that AC-26 specifies.
       * Worked Example: list('test-domain:**') twice → Object.is(a, b) === true
       */
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');

      const a = svc.list('test-domain:**');
      const b = svc.list('test-domain:**');
      expect(a).toBe(b); // Same reference
    });

    it('returns new array after matching publish invalidates cache', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');

      const before = svc.list('test-domain:**');
      svc.publish('test-domain:wf-1:progress', 50);
      const after = svc.list('test-domain:**');

      expect(before).not.toBe(after);
      expect(after).toHaveLength(2);
    });

    it('preserves stable ref when non-matching publish occurs (AC-26)', () => {
      /**
       * Why: Pattern-scoped invalidation ensures unrelated publishes don't break caches.
       * Contract: list() for pattern A is unaffected by publish to path not matching A.
       * Usage Notes: Without this, every publish would invalidate all list() caches globally.
       * Quality Contribution: Validates pattern-scoped cache invalidation per AC-26.
       * Worked Example: list('test-domain:wf-1:*') stable after publish to wf-2
       */
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');

      const before = svc.list('test-domain:wf-1:*');
      svc.publish('test-domain:wf-2:status', 'pending'); // non-matching pattern
      const after = svc.list('test-domain:wf-1:*');

      expect(before).toBe(after); // Same ref — wf-2 publish doesn't affect wf-1 cache
    });
  });

  // ═══════════════════════════════════════════════
  // Diagnostics
  // ═══════════════════════════════════════════════

  describe('diagnostics', () => {
    it('subscriberCount tracks active subscriptions (AC-36)', () => {
      registerMultiDomain(svc);
      expect(svc.subscriberCount).toBe(0);

      const unsub1 = svc.subscribe('test-domain:**', () => {});
      expect(svc.subscriberCount).toBe(1);

      const unsub2 = svc.subscribe('test-domain:wf-1:status', () => {});
      expect(svc.subscriberCount).toBe(2);

      unsub1();
      expect(svc.subscriberCount).toBe(1);

      unsub2();
      expect(svc.subscriberCount).toBe(0);
    });

    it('entryCount tracks stored entries (AC-37)', () => {
      registerMultiDomain(svc);
      expect(svc.entryCount).toBe(0);

      svc.publish('test-domain:wf-1:status', 'running');
      expect(svc.entryCount).toBe(1);

      svc.publish('test-domain:wf-1:progress', 50);
      expect(svc.entryCount).toBe(2);

      svc.remove('test-domain:wf-1:status');
      expect(svc.entryCount).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════
  // Synchronous Notification (FT-007)
  // ═══════════════════════════════════════════════

  describe('synchronous notification', () => {
    it('publish notifies subscribers synchronously', () => {
      /**
       * Why: Synchronous dispatch is architecturally required — no microtask deferral.
       * Contract: Subscriber side effect is visible immediately after publish() returns.
       * Usage Notes: Ensures predictable ordering for imperative publisher code.
       * Quality Contribution: Pins synchronous dispatch guarantee explicitly.
       * Worked Example: subscribe → publish → called===true immediately (no await)
       */
      registerMultiDomain(svc);
      let called = false;
      svc.subscribe('test-domain:wf-1:status', () => {
        called = true;
      });
      svc.publish('test-domain:wf-1:status', 'running');
      expect(called).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════
// FakeGlobalStateSystem Inspection Methods (AC-33)
// ═══════════════════════════════════════════════

describe('FakeGlobalStateSystem inspection methods (AC-33)', () => {
  let fake: FakeGlobalStateSystem;

  beforeEach(() => {
    fake = new FakeGlobalStateSystem();
    fake.registerDomain({
      domain: 'test-domain',
      description: 'Test domain',
      multiInstance: true,
      properties: [{ key: 'status', description: 'Status', typeHint: 'string' }],
    });
  });

  it('getPublished returns stored entry', () => {
    /**
     * Why: Test harnesses need to inspect what was published without subscribing.
     * Contract: getPublished(path) returns StateEntry after publish, undefined before.
     * Usage Notes: Used in integration tests to verify domain publishers.
     * Quality Contribution: Validates the primary fake inspection method.
     * Worked Example: publish('test-domain:wf-1:status','ok') → getPublished(...).value === 'ok'
     */
    expect(fake.getPublished('test-domain:wf-1:status')).toBeUndefined();
    fake.publish('test-domain:wf-1:status', 'running');
    const entry = fake.getPublished('test-domain:wf-1:status');
    expect(entry).toBeDefined();
    expect(entry?.value).toBe('running');
  });

  it('getSubscribers returns active patterns', () => {
    /**
     * Why: Tests need to verify subscription wiring without triggering publishes.
     * Contract: getSubscribers() returns array of active subscription patterns.
     * Usage Notes: Useful for asserting that component setup wired correct patterns.
     * Quality Contribution: Validates subscription tracking inspection.
     * Worked Example: subscribe('test-domain:**') → getSubscribers() includes 'test-domain:**'
     */
    expect(fake.getSubscribers()).toEqual([]);
    fake.subscribe('test-domain:**', () => {});
    fake.subscribe('test-domain:wf-1:status', () => {});
    expect(fake.getSubscribers()).toEqual(['test-domain:**', 'test-domain:wf-1:status']);
  });

  it('wasPublishedWith checks value match', () => {
    /**
     * Why: Shorthand assertion for verifying publish calls in integration tests.
     * Contract: wasPublishedWith(path, value) returns true iff current value matches.
     * Usage Notes: Uses Object.is equality — works for primitives and reference checks.
     * Quality Contribution: Validates the convenience assertion method.
     * Worked Example: publish(path, 'ok') → wasPublishedWith(path, 'ok') === true
     */
    expect(fake.wasPublishedWith('test-domain:wf-1:status', 'running')).toBe(false);
    fake.publish('test-domain:wf-1:status', 'running');
    expect(fake.wasPublishedWith('test-domain:wf-1:status', 'running')).toBe(true);
    expect(fake.wasPublishedWith('test-domain:wf-1:status', 'wrong')).toBe(false);
  });

  it('reset clears all state', () => {
    /**
     * Why: Test isolation requires full reset between tests.
     * Contract: reset() clears store, domains, subscriptions — returns to pristine state.
     * Usage Notes: Called in beforeEach or between test scenarios.
     * Quality Contribution: Validates reset lifecycle for test double.
     * Worked Example: publish → subscribe → reset() → entryCount===0, subscriberCount===0
     */
    fake.publish('test-domain:wf-1:status', 'running');
    fake.subscribe('test-domain:**', () => {});
    expect(fake.entryCount).toBe(1);
    expect(fake.subscriberCount).toBe(1);

    fake.reset();
    expect(fake.entryCount).toBe(0);
    expect(fake.subscriberCount).toBe(0);
    expect(fake.getPublished('test-domain:wf-1:status')).toBeUndefined();
    expect(fake.getSubscribers()).toEqual([]);
  });
});
