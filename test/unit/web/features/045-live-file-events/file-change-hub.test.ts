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
      /**
       * Why: Verifies the most basic subscription pattern — exact path equality.
       * Contract: subscribe(exactPath) dispatches only when path === exactPath.
       * Usage Notes: Used by FileViewerPanel to watch the currently open file.
       * Quality Contribution: Prevents false-positive dispatches to unrelated subscribers.
       * Worked Example: subscribe('src/app.tsx') + dispatch('src/app.tsx') → callback fires once.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/app.tsx' })]);

      expect(received).toHaveLength(1);
      expect(received[0]).toHaveLength(1);
    });

    it('should not match different file path', () => {
      /**
       * Why: Ensures exact-match subscribers ignore unrelated paths.
       * Contract: subscribe('src/app.tsx') must not fire for 'src/index.ts'.
       * Usage Notes: Critical when many panels each watch their own file.
       * Quality Contribution: Guards against substring or prefix false matches.
       * Worked Example: subscribe('src/app.tsx') + dispatch('src/index.ts') → callback never fires.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/index.ts' })]);

      expect(received).toHaveLength(0);
    });

    it('should not match parent directory', () => {
      /**
       * Why: Exact-match subscribers must not trigger on parent directory events.
       * Contract: subscribe('src/app.tsx') ignores dispatch for 'src'.
       * Usage Notes: Directory renames emit events at the directory level, not child files.
       * Quality Contribution: Prevents spurious re-renders when parent directories change.
       * Worked Example: subscribe('src/app.tsx') + dispatch('src') → callback never fires.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src' })]);

      expect(received).toHaveLength(0);
    });
  });

  describe('directory match (non-recursive)', () => {
    it('should match direct children of directory', () => {
      /**
       * Why: Directory subscriptions must deliver events for immediate children.
       * Contract: subscribe('dir/') dispatches when path parent is exactly 'dir/'.
       * Usage Notes: Used by directory listing panels to detect new/changed files.
       * Quality Contribution: Validates single-level directory watching works correctly.
       * Worked Example: subscribe('src/components/') + dispatch('src/components/Button.tsx') → fires.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/components/', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/components/Button.tsx' })]);

      expect(received).toHaveLength(1);
    });

    it('should not match nested children (non-recursive)', () => {
      /**
       * Why: Non-recursive directory match must exclude deeply nested descendants.
       * Contract: subscribe('src/components/') ignores 'src/components/ui/Input.tsx'.
       * Usage Notes: Distinguishes shallow dir watch from recursive '**' pattern.
       * Quality Contribution: Prevents over-notification when only direct children matter.
       * Worked Example: subscribe('src/components/') + dispatch('src/components/ui/Input.tsx') → no fire.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/components/', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/components/ui/Input.tsx' })]);

      expect(received).toHaveLength(0);
    });

    it('should not match the directory itself', () => {
      /**
       * Why: Directory pattern 'dir/' targets children, not the directory entry itself.
       * Contract: subscribe('src/components/') ignores dispatch for 'src/components'.
       * Usage Notes: A directory rename emits the dir path; children subscribers must not trigger.
       * Quality Contribution: Enforces clear semantics between directory-as-container vs directory-as-entry.
       * Worked Example: subscribe('src/components/') + dispatch('src/components') → no fire.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/components/', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src/components' })]);

      expect(received).toHaveLength(0);
    });

    it('should match multiple direct children', () => {
      /**
       * Why: A single dispatch batch may contain several direct children; all must arrive together.
       * Contract: subscribe('src/') receives only direct children, excluding nested paths.
       * Usage Notes: Ensures batched file-save events deliver correct subset per subscriber.
       * Quality Contribution: Validates filtering + batching interaction for directory patterns.
       * Worked Example: dispatch(['src/app.tsx','src/index.ts','src/lib/utils.ts']) → subscriber gets 2 (lib/ is nested).
       */
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
      /**
       * Why: Recursive glob must capture every file under the prefix at any depth.
       * Contract: subscribe('prefix/**') dispatches for all paths starting with 'prefix/'.
       * Usage Notes: Used by project-wide watchers (e.g., tree-view refresh on any src change).
       * Quality Contribution: Ensures deep nesting doesn't break recursive matching.
       * Worked Example: subscribe('src/**') + dispatch 3 files at depths 1-3 → all 3 delivered.
       */
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
      /**
       * Why: Recursive match must be scoped — files outside the prefix are excluded.
       * Contract: subscribe('src/**') ignores paths not starting with 'src/'.
       * Usage Notes: Prevents cross-directory leakage when watching a subtree.
       * Quality Contribution: Guards against overly broad prefix matching logic.
       * Worked Example: subscribe('src/**') + dispatch('test/app.test.tsx') → no fire.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/**', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'test/app.test.tsx' })]);

      expect(received).toHaveLength(0);
    });

    it('should match the prefix directory itself', () => {
      /**
       * Why: Recursive pattern 'dir/**' should include the directory entry itself.
       * Contract: subscribe('src/**') fires when path is exactly 'src'.
       * Usage Notes: Directory deletions emit the dir path; recursive watchers must catch them.
       * Quality Contribution: Covers edge case where the prefix path itself is dispatched.
       * Worked Example: subscribe('src/**') + dispatch('src') → callback fires.
       */
      const received: FileChange[][] = [];
      hub.subscribe('src/**', (changes) => received.push(changes));

      hub.dispatch([makeChange({ path: 'src' })]);

      // src itself matches src/**
      expect(received).toHaveLength(1);
    });
  });

  describe('wildcard match', () => {
    it('should match everything with *', () => {
      /**
       * Why: The '*' wildcard is the catch-all pattern for global listeners.
       * Contract: subscribe('*') receives every dispatched change regardless of path.
       * Usage Notes: Used by debug loggers and activity indicators that monitor all events.
       * Quality Contribution: Validates the universal match escape hatch works for all paths.
       * Worked Example: subscribe('*') + dispatch 3 files at various paths → all 3 delivered.
       */
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
      /**
       * Why: Hub must fan out events to all matching subscribers independently.
       * Contract: N subscribers with overlapping patterns each receive their own filtered batch.
       * Usage Notes: Multiple UI panels (viewer, tree, status bar) subscribe simultaneously.
       * Quality Contribution: Ensures multi-subscriber dispatch doesn't short-circuit.
       * Worked Example: subscribe('src/app.tsx') + subscribe('*') + dispatch('src/app.tsx') → both fire.
       */
      const received1: FileChange[][] = [];
      const received2: FileChange[][] = [];
      hub.subscribe('src/app.tsx', (changes) => received1.push(changes));
      hub.subscribe('*', (changes) => received2.push(changes));

      hub.dispatch([makeChange({ path: 'src/app.tsx' })]);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should unsubscribe when returned function is called', () => {
      /**
       * Why: Subscribers must be able to detach to prevent memory leaks and stale callbacks.
       * Contract: Calling the returned unsubscribe function stops all future dispatches.
       * Usage Notes: React hooks call unsub in useEffect cleanup on unmount.
       * Quality Contribution: Prevents ghost subscribers from accumulating over component lifecycle.
       * Worked Example: unsub = subscribe('*') → unsub() → dispatch → callback never fires.
       */
      const received: FileChange[][] = [];
      const unsub = hub.subscribe('*', (changes) => received.push(changes));
      unsub();

      hub.dispatch([makeChange()]);

      expect(received).toHaveLength(0);
    });

    it('should track subscriber count', () => {
      /**
       * Why: subscriberCount enables SSE connection lifecycle management.
       * Contract: subscriberCount increments on subscribe and decrements on unsubscribe.
       * Usage Notes: Provider uses count === 0 to close idle SSE connections.
       * Quality Contribution: Validates count accuracy across subscribe/unsubscribe sequences.
       * Worked Example: 0 → subscribe → 1 → subscribe → 2 → unsub → 1 → unsub → 0.
       */
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
      /**
       * Why: A failing subscriber must not prevent other subscribers from receiving events.
       * Contract: Errors in one callback are caught; remaining callbacks still execute.
       * Usage Notes: Production subscribers may throw on bad data; hub must be resilient.
       * Quality Contribution: Prevents one broken component from silencing all live updates.
       * Worked Example: sub1 throws Error('boom') + sub2 collects → sub2 still receives changes.
       */
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
      /**
       * Why: Empty dispatch batches should not trigger any subscriber callbacks.
       * Contract: dispatch([]) results in zero callback invocations.
       * Usage Notes: SSE keep-alive or empty diffs may produce empty change arrays.
       * Quality Contribution: Prevents unnecessary re-renders from vacuous events.
       * Worked Example: subscribe('*') + dispatch([]) → callback never fires.
       */
      const received: FileChange[][] = [];
      hub.subscribe('*', (changes) => received.push(changes));

      hub.dispatch([]);

      // No callback because no changes matched (empty input)
      expect(received).toHaveLength(0);
    });

    it('should handle root-level files with directory pattern', () => {
      /**
       * Why: Empty-string pattern is an exact match for '', not a directory wildcard.
       * Contract: subscribe('') only matches path === '', not root-level files.
       * Usage Notes: Edge case ensuring empty pattern doesn't accidentally match everything.
       * Quality Contribution: Prevents misconfigured subscriptions from becoming catch-alls.
       * Worked Example: subscribe('') + dispatch('package.json') → no fire.
       */
      const received: FileChange[][] = [];
      // Empty string prefix = root directory
      hub.subscribe('', (changes) => received.push(changes));

      // This is an exact match for empty string, not a directory match
      hub.dispatch([makeChange({ path: 'package.json' })]);

      expect(received).toHaveLength(0);
    });

    it('should only dispatch matching subset to each subscriber', () => {
      /**
       * Why: Each subscriber must receive only the changes matching its pattern, not the full batch.
       * Contract: dispatch([src/file, test/file]) → src/ subscriber gets 1, test/ subscriber gets 1.
       * Usage Notes: Ensures filtered batches are independent per subscriber.
       * Quality Contribution: Validates cross-subscriber isolation within a single dispatch call.
       * Worked Example: subscribe('src/') + subscribe('test/') + dispatch both → each gets their own file.
       */
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
