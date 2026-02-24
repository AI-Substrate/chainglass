/**
 * Tests for FileChangeWatcherAdapter.
 *
 * Per Plan 045: Live File Events - Phase 1 (T004/T007)
 * Full TDD: RED tests first, then implementation.
 *
 * Tests: filtering, absolute→relative path conversion, debounce batching,
 * last-event-wins deduplication, callback-set dispatch, error isolation,
 * flushNow(), and destroy().
 */

import type { WatcherEvent } from '@chainglass/workflow';
import { FileChangeWatcherAdapter } from '@chainglass/workflow';
import type { FileChangeBatchItem } from '@chainglass/workflow';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makeEvent(overrides: Partial<WatcherEvent> = {}): WatcherEvent {
  return {
    path: '/repo/src/app.tsx',
    eventType: 'change',
    worktreePath: '/repo',
    workspaceSlug: 'ws-1',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('FileChangeWatcherAdapter', () => {
  let adapter: FileChangeWatcherAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapter = new FileChangeWatcherAdapter(300);
  });

  afterEach(() => {
    adapter.destroy();
    vi.useRealTimers();
  });

  // ═══════════════════════════════════════════════════════════
  // Filtering
  // ═══════════════════════════════════════════════════════════

  describe('filtering', () => {
    it('should filter out .chainglass/ paths', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(
        makeEvent({ path: '/repo/.chainglass/data/work-graphs/demo/state.json' })
      );
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(0);
    });

    it('should pass through non-.chainglass paths', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/src/app.tsx' }));
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
    });

    it('should filter .chainglass anywhere in path', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/.chainglass/config.json' }));
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Path conversion
  // ═══════════════════════════════════════════════════════════

  describe('path conversion', () => {
    it('should convert absolute paths to relative (from worktree root)', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(
        makeEvent({ path: '/repo/src/components/Button.tsx', worktreePath: '/repo' })
      );
      vi.advanceTimersByTime(300);

      expect(received[0][0].path).toBe('src/components/Button.tsx');
    });

    it('should keep worktreePath as-is (absolute)', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ worktreePath: '/repo' }));
      vi.advanceTimersByTime(300);

      expect(received[0][0].worktreePath).toBe('/repo');
    });

    it('should handle paths that equal worktree root', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo', worktreePath: '/repo' }));
      vi.advanceTimersByTime(300);

      // Root path should become empty string or "."
      expect(received[0][0].path).toBe('');
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Debounce batching
  // ═══════════════════════════════════════════════════════════

  describe('debounce batching', () => {
    it('should batch events within 300ms window', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/a.ts' }));
      vi.advanceTimersByTime(100);
      adapter.handleEvent(makeEvent({ path: '/repo/b.ts' }));
      vi.advanceTimersByTime(100);
      adapter.handleEvent(makeEvent({ path: '/repo/c.ts' }));
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(3);
    });

    it('should emit separate batches for events outside 300ms window', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/a.ts' }));
      vi.advanceTimersByTime(300);
      adapter.handleEvent(makeEvent({ path: '/repo/b.ts' }));
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(2);
    });

    it('should not emit if no events accumulated', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      vi.advanceTimersByTime(1000);

      expect(received).toHaveLength(0);
    });

    it('should reset debounce timer on each new event', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/a.ts' }));
      vi.advanceTimersByTime(200);
      adapter.handleEvent(makeEvent({ path: '/repo/b.ts' }));
      vi.advanceTimersByTime(200);
      // Only 200ms since last event, not yet flushed
      expect(received).toHaveLength(0);

      vi.advanceTimersByTime(100);
      // 300ms since last event now — should flush
      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Deduplication (last-event-wins)
  // ═══════════════════════════════════════════════════════════

  describe('deduplication', () => {
    it('should deduplicate: last-event-wins per worktreePath:path key', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'add' }));
      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'change' }));
      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'unlink' }));
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].eventType).toBe('unlink');
    });

    it('should not deduplicate different paths', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/a.ts', eventType: 'change' }));
      adapter.handleEvent(makeEvent({ path: '/repo/b.ts', eventType: 'change' }));
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(2);
    });

    it('should not deduplicate same path across different worktrees', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(
        makeEvent({ path: '/repo/a.ts', worktreePath: '/repo', eventType: 'change' })
      );
      adapter.handleEvent(
        makeEvent({ path: '/repo-wt/a.ts', worktreePath: '/repo-wt', eventType: 'add' })
      );
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Subscriber dispatch
  // ═══════════════════════════════════════════════════════════

  describe('subscriber dispatch', () => {
    it('should emit to all subscribers', () => {
      const received1: FileChangeBatchItem[][] = [];
      const received2: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received1.push(items));
      adapter.onFilesChanged((items) => received2.push(items));

      adapter.handleEvent(makeEvent());
      vi.advanceTimersByTime(300);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should unsubscribe when returned function is called', () => {
      const received: FileChangeBatchItem[][] = [];
      const unsub = adapter.onFilesChanged((items) => received.push(items));
      unsub();

      adapter.handleEvent(makeEvent());
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(0);
    });

    it('should isolate subscriber errors (throwing subscriber does not block others)', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged(() => {
        throw new Error('boom');
      });
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent());
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // flushNow() and destroy()
  // ═══════════════════════════════════════════════════════════

  describe('flushNow and destroy', () => {
    it('should flush pending events immediately on flushNow()', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent());
      adapter.flushNow();

      expect(received).toHaveLength(1);
    });

    it('should be a no-op if nothing pending on flushNow()', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.flushNow();

      expect(received).toHaveLength(0);
    });

    it('should cancel pending flush on destroy()', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent());
      adapter.destroy();
      vi.advanceTimersByTime(300);

      expect(received).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Event shape
  // ═══════════════════════════════════════════════════════════

  describe('event shape', () => {
    it('should include path, eventType, worktreePath, and timestamp', () => {
      const received: FileChangeBatchItem[][] = [];
      adapter.onFilesChanged((items) => received.push(items));

      adapter.handleEvent(makeEvent({ path: '/repo/src/app.tsx', eventType: 'add' }));
      vi.advanceTimersByTime(300);

      const item = received[0][0];
      expect(item.path).toBe('src/app.tsx');
      expect(item.eventType).toBe('add');
      expect(item.worktreePath).toBe('/repo');
      expect(typeof item.timestamp).toBe('number');
    });
  });
});
