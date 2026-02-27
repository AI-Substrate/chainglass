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
      registerMultiDomain(svc);
      const obj = { nested: true };
      svc.publish('test-domain:wf-1:status', obj);
      const a = svc.get('test-domain:wf-1:status');
      const b = svc.get('test-domain:wf-1:status');
      expect(a).toBe(b); // Object.is equality
    });

    it('throws on unregistered domain (AC-08)', () => {
      expect(() => svc.publish('unknown:wf-1:status', 'val')).toThrow(/unknown|unregistered/i);
    });
  });

  // ═══════════════════════════════════════════════
  // Singleton / Multi-instance Validation
  // ═══════════════════════════════════════════════

  describe('singleton/multi-instance validation', () => {
    it('singleton rejects path with instance ID (AC-13)', () => {
      registerSingletonDomain(svc);
      expect(() => svc.publish('singleton:inst-1:active-file', 'x')).toThrow();
    });

    it('singleton accepts 2-segment path', () => {
      registerSingletonDomain(svc);
      svc.publish('singleton:active-file', '/src/app.tsx');
      expect(svc.get('singleton:active-file')).toBe('/src/app.tsx');
    });

    it('multi-instance rejects 2-segment path (AC-14)', () => {
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
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');

      const a = svc.list('test-domain:**');
      const b = svc.list('test-domain:**');
      expect(a).toBe(b); // Same reference
    });

    it('returns new array after publish invalidates cache', () => {
      registerMultiDomain(svc);
      svc.publish('test-domain:wf-1:status', 'running');

      const before = svc.list('test-domain:**');
      svc.publish('test-domain:wf-1:progress', 50);
      const after = svc.list('test-domain:**');

      expect(before).not.toBe(after);
      expect(after).toHaveLength(2);
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
});
