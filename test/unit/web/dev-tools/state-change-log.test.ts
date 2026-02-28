/**
 * Plan 056: StateChangeLog Unit Tests
 *
 * Tests for ring buffer accumulation, FIFO eviction, pattern filtering,
 * subscribe/version notification, and clear.
 */

import type { StateChange } from '@chainglass/shared/state';
import { beforeEach, describe, expect, it } from 'vitest';

import { StateChangeLog } from '../../../../apps/web/src/lib/state/state-change-log';

function makeChange(path: string, value: unknown = 'v', previousValue?: unknown): StateChange {
  const segments = path.split(':');
  return {
    path,
    domain: segments[0],
    instanceId: segments.length === 3 ? segments[1] : null,
    property: segments[segments.length - 1],
    value,
    previousValue,
    timestamp: Date.now(),
  };
}

describe('StateChangeLog', () => {
  let log: StateChangeLog;

  beforeEach(() => {
    log = new StateChangeLog(5);
  });

  it('starts empty with size 0 and version 0', () => {
    /**
     * Why: Initial state must be predictable.
     * Contract: New log has size 0 and version 0.
     * Usage Notes: Version starts at 0, increments on mutate.
     * Quality Contribution: Baseline for all other tests.
     * Worked Example: new StateChangeLog(5) → size=0, version=0
     */
    expect(log.size).toBe(0);
    expect(log.version).toBe(0);
  });

  it('appends entries and increments size and version', () => {
    /**
     * Why: Core append operation must track size and version.
     * Contract: Each append increments both size and version by 1.
     * Usage Notes: Version is used by useSyncExternalStore for change detection.
     * Quality Contribution: Proves the fundamental write path.
     * Worked Example: append twice → size=2, version=2
     */
    log.append(makeChange('worktree:slug:branch'));
    expect(log.size).toBe(1);
    expect(log.version).toBe(1);

    log.append(makeChange('worktree:slug:count'));
    expect(log.size).toBe(2);
    expect(log.version).toBe(2);
  });

  it('evicts oldest entries when at cap (FIFO)', () => {
    /**
     * Why: Memory must be bounded — ring buffer evicts oldest.
     * Contract: At cap, oldest entries are dropped, newest kept.
     * Usage Notes: Cap is configurable (default 500).
     * Quality Contribution: Proves memory safety under high volume.
     * Worked Example: cap=5, append 7 → size=5, oldest 2 gone
     */
    for (let i = 0; i < 7; i++) {
      log.append(makeChange(`test:prop${i}`, i));
    }
    expect(log.size).toBe(5);

    const entries = log.getEntries();
    expect(entries[0].value).toBe(2);
    expect(entries[4].value).toBe(6);
  });

  it('getEntries returns all entries when no filter', () => {
    /**
     * Why: Default read path returns everything.
     * Contract: No args → all entries in insertion order.
     * Usage Notes: Used by inspector when no domain filter is set.
     * Quality Contribution: Proves unfiltered read path.
     * Worked Example: append 2 entries → getEntries() returns both
     */
    log.append(makeChange('worktree:slug:branch', 'main'));
    log.append(makeChange('workflow:wf-1:status', 'running'));

    const entries = log.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].path).toBe('worktree:slug:branch');
    expect(entries[1].path).toBe('workflow:wf-1:status');
  });

  it('getEntries filters by pattern', () => {
    /**
     * Why: Domain filter chips need pattern-scoped results.
     * Contract: Pattern arg filters entries via path matcher.
     * Usage Notes: Uses createStateMatcher internally.
     * Quality Contribution: Proves domain-scoped filtering.
     * Worked Example: 2 worktree + 1 workflow → filter 'worktree:**' → 2
     */
    log.append(makeChange('worktree:slug:branch', 'main'));
    log.append(makeChange('workflow:wf-1:status', 'running'));
    log.append(makeChange('worktree:slug:count', 3));

    const worktreeOnly = log.getEntries('worktree:**');
    expect(worktreeOnly).toHaveLength(2);
    expect(worktreeOnly[0].path).toBe('worktree:slug:branch');
    expect(worktreeOnly[1].path).toBe('worktree:slug:count');
  });

  it('getEntries limits results (returns last N)', () => {
    /**
     * Why: Inspector may want only the N most recent entries.
     * Contract: limit returns the last N entries (most recent).
     * Usage Notes: Slices from the end, not the beginning.
     * Quality Contribution: Proves limit scopes to tail.
     * Worked Example: 5 entries, limit 2 → returns entries 3,4
     */
    for (let i = 0; i < 5; i++) {
      log.append(makeChange(`test:prop${i}`, i));
    }

    const last2 = log.getEntries(undefined, 2);
    expect(last2).toHaveLength(2);
    expect(last2[0].value).toBe(3);
    expect(last2[1].value).toBe(4);
  });

  it('getEntries filters by pattern AND limits', () => {
    /**
     * Why: Combined filter + limit for focused views.
     * Contract: Pattern filters first, then limit takes last N.
     * Usage Notes: Used when domain chip + limit are both active.
     * Quality Contribution: Proves composable query parameters.
     * Worked Example: 3 worktree entries, limit 2 → last 2 worktree
     */
    log.append(makeChange('worktree:slug:branch', 'a'));
    log.append(makeChange('workflow:wf-1:status', 'b'));
    log.append(makeChange('worktree:slug:count', 'c'));
    log.append(makeChange('worktree:slug:branch', 'd'));

    const result = log.getEntries('worktree:**', 2);
    expect(result).toHaveLength(2);
    expect(result[0].value).toBe('c');
    expect(result[1].value).toBe('d');
  });

  it('clear resets buffer and increments version', () => {
    /**
     * Why: Clear must wipe entries and signal change to hooks.
     * Contract: After clear, size=0, version incremented, getEntries empty.
     * Usage Notes: Version bump triggers useSyncExternalStore re-render.
     * Quality Contribution: Proves clear is a full reset.
     * Worked Example: append 2, clear → size=0, version=3
     */
    log.append(makeChange('test:prop'));
    log.append(makeChange('test:prop2'));
    expect(log.size).toBe(2);
    const vBefore = log.version;

    log.clear();
    expect(log.size).toBe(0);
    expect(log.version).toBe(vBefore + 1);
    expect(log.getEntries()).toHaveLength(0);
  });

  it('subscribe fires on append', () => {
    /**
     * Why: Hook needs notification when log grows.
     * Contract: Listener called once per append.
     * Usage Notes: useSyncExternalStore uses this to trigger re-render.
     * Quality Contribution: Proves notification mechanism works.
     * Worked Example: subscribe → append twice → listener called 2 times
     */
    let callCount = 0;
    log.subscribe(() => {
      callCount++;
    });

    log.append(makeChange('test:prop'));
    expect(callCount).toBe(1);

    log.append(makeChange('test:prop2'));
    expect(callCount).toBe(2);
  });

  it('subscribe fires on clear', () => {
    /**
     * Why: UI needs to update when log is cleared.
     * Contract: Listener fires on clear in addition to append.
     * Usage Notes: Clear triggers version bump + notification.
     * Quality Contribution: Ensures clear is observable.
     * Worked Example: append + clear → listener called 2 times total
     */
    let callCount = 0;
    log.subscribe(() => {
      callCount++;
    });

    log.append(makeChange('test:prop'));
    log.clear();
    expect(callCount).toBe(2);
  });

  it('unsubscribe stops notifications', () => {
    /**
     * Why: Prevent leaked listeners after component unmount.
     * Contract: After unsubscribe, listener is not called.
     * Usage Notes: Hook cleanup calls the returned unsubscribe function.
     * Quality Contribution: Proves cleanup works.
     * Worked Example: subscribe → append → unsub → append → count stays at 1
     */
    let callCount = 0;
    const unsub = log.subscribe(() => {
      callCount++;
    });

    log.append(makeChange('test:prop'));
    expect(callCount).toBe(1);

    unsub();
    log.append(makeChange('test:prop2'));
    expect(callCount).toBe(1);
  });

  it('capacity returns configured cap', () => {
    /**
     * Why: Diagnostics footer needs to show cap.
     * Contract: capacity returns the constructor arg.
     * Usage Notes: Default is 500 if not specified.
     * Quality Contribution: Proves capacity is exposed.
     * Worked Example: new StateChangeLog(5).capacity → 5
     */
    expect(log.capacity).toBe(5);
    const bigLog = new StateChangeLog(1000);
    expect(bigLog.capacity).toBe(1000);
  });

  it('default cap is 500', () => {
    /**
     * Why: Default must match spec (AC-23: 500 cap).
     * Contract: No-arg constructor uses 500.
     * Usage Notes: Production uses default; tests use small cap.
     * Quality Contribution: Verifies spec-mandated default.
     * Worked Example: new StateChangeLog().capacity → 500
     */
    const defaultLog = new StateChangeLog();
    expect(defaultLog.capacity).toBe(500);
  });
});
