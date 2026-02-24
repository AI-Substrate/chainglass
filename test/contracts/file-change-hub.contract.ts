/**
 * Plan 045: Live File Events
 *
 * Contract tests for FileChangeHub. Both real and fake must pass.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type {
  FileChange,
  FileChangeCallback,
} from '../../../apps/web/src/features/045-live-file-events/file-change.types';

export interface HubUnderTest {
  subscribe(pattern: string, callback: FileChangeCallback): () => void;
  dispatch(changes: FileChange[]): void;
  readonly subscriberCount: number;
}

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
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (c) => received.push(c));

      hub.dispatch([makeChange('src/app.tsx'), makeChange('src/index.ts')]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].path).toBe('src/app.tsx');
    });

    it('C02: directory match dispatches direct children only', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/', (c) => received.push(c));

      hub.dispatch([makeChange('src/app.tsx'), makeChange('src/lib/utils.ts')]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].path).toBe('src/app.tsx');
    });

    it('C03: recursive match dispatches all descendants', () => {
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
      const received: FileChange[][] = [];
      hub.subscribe('*', (c) => received.push(c));

      hub.dispatch([makeChange('any/path.ts')]);

      expect(received).toHaveLength(1);
    });

    it('C05: unsubscribe stops dispatch', () => {
      const received: FileChange[][] = [];
      const unsub = hub.subscribe('*', (c) => received.push(c));
      unsub();

      hub.dispatch([makeChange('file.ts')]);

      expect(received).toHaveLength(0);
    });

    it('C06: error isolation — throwing subscriber does not block others', () => {
      const received: FileChange[][] = [];
      hub.subscribe('*', () => {
        throw new Error('boom');
      });
      hub.subscribe('*', (c) => received.push(c));

      hub.dispatch([makeChange('file.ts')]);

      expect(received).toHaveLength(1);
    });

    it('C07: empty dispatch is no-op', () => {
      const received: FileChange[][] = [];
      hub.subscribe('*', (c) => received.push(c));

      hub.dispatch([]);

      expect(received).toHaveLength(0);
    });

    it('C08: subscriberCount tracks active subscriptions', () => {
      expect(hub.subscriberCount).toBe(0);
      const unsub = hub.subscribe('*', () => {});
      expect(hub.subscriberCount).toBe(1);
      unsub();
      expect(hub.subscriberCount).toBe(0);
    });
  });
}
