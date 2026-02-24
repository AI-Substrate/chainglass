/**
 * Tests for FileChangeHub.
 *
 * Per Plan 045: Live File Events - Phase 2 (T002/T004)
 * Full TDD: tests first, then implementation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileChangeHub } from '../../../../../apps/web/src/features/045-live-file-events/file-change-hub';
import type { FileChange } from '../../../../../apps/web/src/features/045-live-file-events/file-change.types';

function makeChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/app.tsx',
    eventType: 'change',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('FileChangeHub', () => {
  let hub: FileChangeHub;

  beforeEach(() => {
    hub = new FileChangeHub();
  });

  // ═══════════════════════════════════════════════════════════
  // Pattern matching
  // ═══════════════════════════════════════════════════════════

  describe('exact match', () => {
    it('should match exact file path', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/app.tsx' })]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
    });

    it('should not match different file path', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/index.ts' })]);

      expect(received).toHaveLength(0);
    });

    it('should not match parent directory', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src' })]);

      expect(received).toHaveLength(0);
    });
  });

  describe('directory match (non-recursive)', () => {
    it('should match direct children of directory', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/components/', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/components/Button.tsx' })]);

      expect(received).toHaveLength(1);
    });

    it('should not match nested children (non-recursive)', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/components/', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/components/ui/Input.tsx' })]);

      expect(received).toHaveLength(0);
    });

    it('should not match the directory itself', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/components/', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/components' })]);

      expect(received).toHaveLength(0);
    });

    it('should match multiple direct children', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/', (changes) => received.push(changes));

      hub.dispatch([
        makeChange({ path: 'src/app.tsx' }),
        makeChange({ path: 'src/index.ts' }),
        makeChange({ path: 'src/lib/utils.ts' }), // nested — should NOT match
      ]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(2);
    });
  });

  describe('recursive match', () => {
    it('should match all descendants with **', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/**', (changes) => received.push(changes));

      hub.dispatch([
        makeChange({ path: 'src/app.tsx' }),
        makeChange({ path: 'src/components/Button.tsx' }),
        makeChange({ path: 'src/components/ui/Input.tsx' }),
      ]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(3);
    });

    it('should not match files outside the prefix', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/**', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'test/app.test.tsx' })]);

      expect(received).toHaveLength(0);
    });

    it('should match the prefix directory itself', () => {
      const received: FileChange[][] = [];
      hub.subscribe('src/**', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src' })]);

      // src itself matches src/**
      expect(received).toHaveLength(1);
    });
  });

  describe('wildcard match', () => {
    it('should match everything with *', () => {
      const received: FileChange[][] = [];
      hub.subscribe('*', (changes) => received.push(changes));

      hub.dispatch([
        makeChange({ path: 'src/app.tsx' }),
        makeChange({ path: 'package.json' }),
        makeChange({ path: 'deeply/nested/file.ts' }),
      ]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(3);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Subscriber management
  // ═══════════════════════════════════════════════════════════

  describe('subscriber management', () => {
    it('should dispatch to multiple subscribers', () => {
      const received1: FileChange[][] = [];
      const received2: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received1.push(changes));
      hub.subscribe('*', (changes) => received2.push(changes));

      hub.dispatch([makeChange({ path: 'src/app.tsx' })]);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should unsubscribe when returned function is called', () => {
      const received: FileChange[][] = [];
      const unsub = hub.subscribe('*', (changes) => received.push(changes));
      unsub();

      hub.dispatch([makeChange()]);

      expect(received).toHaveLength(0);
    });

    it('should track subscriber count', () => {
      expect(hub.subscriberCount).toBe(0);

      const unsub1 = hub.subscribe('*', () => {});
      const unsub2 = hub.subscribe('src/', () => {});
      expect(hub.subscriberCount).toBe(2);

      unsub1();
      expect(hub.subscriberCount).toBe(1);

      unsub2();
      expect(hub.subscriberCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Error isolation
  // ═══════════════════════════════════════════════════════════

  describe('error isolation', () => {
    it('should isolate subscriber errors (throwing does not block others)', () => {
      const received: FileChange[][] = [];
      hub.subscribe('*', () => {
        throw new Error('boom');
      });
      hub.subscribe('*', (changes) => received.push(changes));

      hub.dispatch([makeChange()]);

      expect(received).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // Edge cases
  // ═══════════════════════════════════════════════════════════

  describe('edge cases', () => {
    it('should be a no-op when dispatching empty array', () => {
      const received: FileChange[][] = [];
      hub.subscribe('*', (changes) => received.push(changes));

      hub.dispatch([]);

      // No callback because no changes matched (empty input)
      expect(received).toHaveLength(0);
    });

    it('should handle root-level files with directory pattern', () => {
      const received: FileChange[][] = [];
      // Empty string prefix = root directory
      hub.subscribe('', (changes) => received.push(changes));

      // This is an exact match for empty string, not a directory match
      hub.dispatch([makeChange({ path: 'package.json' })]);

      expect(received).toHaveLength(0);
    });

    it('should only dispatch matching subset to each subscriber', () => {
      const srcChanges: FileChange[][] = [];
      const testChanges: FileChange[][] = [];
      hub.subscribe('src/', (changes) => srcChanges.push(changes));
      hub.subscribe('test/', (changes) => testChanges.push(changes));

      hub.dispatch([
        makeChange({ path: 'src/app.tsx' }),
        makeChange({ path: 'test/app.test.tsx' }),
      ]);

      expect(srcChanges[0]).toHaveLength(1);
      expect(srcChanges[0][0].path).toBe('src/app.tsx');
      expect(testChanges[0]).toHaveLength(1);
      expect(testChanges[0][0].path).toBe('test/app.test.tsx');
    });
  });
});
