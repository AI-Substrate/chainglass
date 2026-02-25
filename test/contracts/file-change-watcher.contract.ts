/**
 * Plan 045: Live File Events
 *
 * Contract tests for file change watcher adapters.
 * Both FileChangeWatcherAdapter (real) and FakeFileChangeWatcherAdapter (fake)
 * must satisfy these contracts.
 *
 * Tests: .chainglass filtering, callback dispatch, error isolation, deduplication.
 */

import type { WatcherEvent } from '@chainglass/workflow';
import type { FileChangeBatchItem } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Adapter under test must expose these methods.
 */
export interface FileChangeAdapterUnderTest {
  readonly name: string;
  handleEvent(event: WatcherEvent): void;
  onFilesChanged(callback: (changes: FileChangeBatchItem[]) => void): () => void;
  flushNow(): void;
  destroy(): void;
}

export type AdapterFactory = () => FileChangeAdapterUnderTest;

function makeEvent(overrides: Partial<WatcherEvent> = {}): WatcherEvent {
  return {
    path: '/repo/src/app.tsx',
    eventType: 'change',
    worktreePath: '/repo',
    workspaceSlug: 'ws-1',
    ...overrides,
  };
}

/**
 * Shared contract tests that both real and fake must pass.
 */
export function fileChangeWatcherContractTests(name: string, factory: AdapterFactory): void {
  describe(`FileChangeWatcher Contract: ${name}`, () => {
    let adapter: FileChangeAdapterUnderTest;

    beforeEach(() => {
      vi.useFakeTimers();
      adapter = factory();
    });

    afterEach(() => {
      adapter.destroy();
      vi.useRealTimers();
    });

    it('C01: should filter .chainglass/ paths', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(
        makeEvent({ path: '/repo/.chainglass/data/work-graphs/demo/state.json' })
      );
      adapter.flushNow();

      expect(received).toHaveLength(0);
    });

    it('C02: should pass through non-.chainglass paths', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/src/app.tsx' }));
      adapter.flushNow();

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
    });

    it('C03: should convert absolute paths to relative', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(
        makeEvent({ path: '/repo/src/components/Button.tsx', worktreePath: '/repo' })
      );
      adapter.flushNow();

      expect(received[0][0].path).toBe('src/components/Button.tsx');
    });

    it('C04: should dispatch to all subscribers', () => {
      const received1: FileChangeBatchItem[][] = [];
      const received2: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received1.push(items));
      adapter.onFilesChanged((items) => received2.push(items));

      adapter.handleEvent(makeEvent());
      adapter.flushNow();

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('C05: should isolate subscriber errors', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged(() => {
        throw new Error('boom');
      });
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent());
      adapter.flushNow();

      expect(received).toHaveLength(1);
    });

    it('C06: should deduplicate (last-event-wins per worktreePath:path)', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'add' }));
      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'change' }));
      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'unlink' }));
      adapter.flushNow();

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].eventType).toBe('unlink');
    });

    it('C07: should unsubscribe when returned function is called', () => {
      const received: FileChangeBatchItem[][] = [];
      const unsub = adapter.onFilesChanged((items) => received.push(items));
      unsub();

      adapter.handleEvent(makeEvent());
      adapter.flushNow();

      expect(received).toHaveLength(0);
    });

    it('C08: flushNow should be no-op when nothing pending', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.flushNow();

      expect(received).toHaveLength(0);
    });
  });
}
