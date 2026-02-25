/**
 * Plan 045: Live File Events
 *
 * Contract tests for FileChangeHub. Both real and fake must pass.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { IFileChangeHub } from '../../../apps/web/src/features/045-live-file-events/file-change.types';
import type { FileChange } from '../../../apps/web/src/features/045-live-file-events/file-change.types';

export type HubUnderTest = IFileChangeHub;

export type HubFactory = () => HubUnderTest;

function makeChange(path: string, eventType: FileChange['eventType'] = 'change'): FileChange {
  return { path, eventType, timestamp: Date.now() };
}

export function fileChangeHubContractTests(name: string, factory: HubFactory): void {
  describe(`FileChangeHub Contract: ${name}`, () => {
    let hub: HubUnderTest;

    beforeEach(() => {
      hub = factory();
    });

    it('C01: exact match dispatches only to matching subscriber', () => {
      /**
       * Why: Foundational contract — exact path subscription must filter to that path only.
       * Contract: subscribe(path) receives only changes where change.path === path.
       * Usage Notes: Both real FileChangeHub and FakeFileChangeHub must satisfy this.
       * Quality Contribution: Anchor contract that all other pattern tests build upon.
       * Worked Example: subscribe('src/app.tsx') + dispatch(['src/app.tsx','src/index.ts']) → gets only app.tsx.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (c) => received.push(c));

      hub.dispatch([makeChange('src/app.tsx'), makeChange('src/index.ts')]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].path).toBe('src/app.tsx');
    });

    it('C02: directory match dispatches direct children only', () => {
      /**
       * Why: Directory pattern must be shallow — only immediate children, not nested.
       * Contract: subscribe('dir/') delivers changes whose parent dir matches exactly.
       * Usage Notes: Ensures real and fake hubs agree on directory-depth semantics.
       * Quality Contribution: Prevents fake from over-matching, which would mask real-hub bugs.
       * Worked Example: subscribe('src/') + dispatch(['src/app.tsx','src/lib/utils.ts']) → only app.tsx.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/', (c) => received.push(c));

      hub.dispatch([makeChange('src/app.tsx'), makeChange('src/lib/utils.ts')]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].path).toBe('src/app.tsx');
    });

    it('C03: recursive match dispatches all descendants', () => {
      /**
       * Why: '**' pattern must capture every file at any depth under the prefix.
       * Contract: subscribe('prefix/**') delivers all changes starting with 'prefix/'.
       * Usage Notes: Contract ensures fake hub's recursive logic mirrors the real implementation.
       * Quality Contribution: Validates depth-agnostic matching for both implementations.
       * Worked Example: subscribe('src/**') + dispatch 3 paths (2 under src/) → receives 2.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/**', (c) => received.push(c));

      hub.dispatch([
        makeChange('src/app.tsx'),
        makeChange('src/lib/utils.ts'),
        makeChange('test/other.ts'),
      ]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(2);
    });

    it('C04: wildcard dispatches everything', () => {
      /**
       * Why: '*' is the catch-all pattern; both implementations must accept all paths.
       * Contract: subscribe('*') receives every dispatched change regardless of path.
       * Usage Notes: Used by global listeners; contract ensures consistent catch-all behavior.
       * Quality Contribution: Simplest positive case — any failure here indicates a fundamental break.
       * Worked Example: subscribe('*') + dispatch('any/path.ts') → callback fires.
       */
      const received: FileChange[][] = [];
      hub.subscribe('*', (c) => received.push(c));

      hub.dispatch([makeChange('any/path.ts')]);

      expect(received).toHaveLength(1);
    });

    it('C05: unsubscribe stops dispatch', () => {
      /**
       * Why: Unsubscribe must completely detach the callback from future dispatches.
       * Contract: After unsub(), dispatch produces zero invocations of the former callback.
       * Usage Notes: Both implementations must clean up subscriber references identically.
       * Quality Contribution: Prevents memory leaks and ghost callbacks in either implementation.
       * Worked Example: unsub = subscribe('*') → unsub() → dispatch('file.ts') → no callback.
       */
      const received: FileChange[][] = [];
      const unsub = hub.subscribe('*', (c) => received.push(c));
      unsub();

      hub.dispatch([makeChange('file.ts')]);

      expect(received).toHaveLength(0);
    });

    it('C06: error isolation — throwing subscriber does not block others', () => {
      /**
       * Why: Both implementations must catch subscriber errors to maintain dispatch reliability.
       * Contract: A throwing callback does not prevent subsequent subscribers from executing.
       * Usage Notes: Contract guarantees error isolation is not an implementation accident.
       * Quality Contribution: Ensures the fake doesn't silently skip error-handling logic.
       * Worked Example: sub1 throws + sub2 collects → sub2 receives changes normally.
       */
      const received: FileChange[][] = [];
      hub.subscribe('*', () => {
        throw new Error('boom');
      });
      hub.subscribe('*', (c) => received.push(c));

      hub.dispatch([makeChange('file.ts')]);

      expect(received).toHaveLength(1);
    });

    it('C07: empty dispatch is no-op', () => {
      /**
       * Why: Empty arrays must not trigger callbacks in either implementation.
       * Contract: dispatch([]) results in zero subscriber invocations.
       * Usage Notes: Protects against SSE heartbeats or empty batches triggering work.
       * Quality Contribution: Ensures both real and fake hubs handle vacuous input identically.
       * Worked Example: subscribe('*') + dispatch([]) → callback count remains 0.
       */
      const received: FileChange[][] = [];
      hub.subscribe('*', (c) => received.push(c));

      hub.dispatch([]);

      expect(received).toHaveLength(0);
    });

    it('C08: subscriberCount tracks active subscriptions', () => {
      /**
       * Why: subscriberCount drives SSE connection lifecycle; both implementations must track it.
       * Contract: subscriberCount increments on subscribe and decrements on unsubscribe, reaching 0 when empty.
       * Usage Notes: Provider uses count to decide when to open/close the EventSource.
       * Quality Contribution: Ensures fake hub's bookkeeping matches real hub for accurate testing.
       * Worked Example: 0 → subscribe → 1 → unsub → 0.
       */
      expect(hub.subscriberCount).toBe(0);
      const unsub = hub.subscribe('*', () => {});
      expect(hub.subscriberCount).toBe(1);
      unsub();
      expect(hub.subscriberCount).toBe(0);
    });
  });
}
