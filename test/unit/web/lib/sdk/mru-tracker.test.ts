/**
 * MRU Tracker Tests
 *
 * Tests for the MruTracker class used for command palette ordering.
 * Per Plan 047 Phase 3, Task T004.
 */

import { describe, expect, it } from 'vitest';

import { MruTracker } from '../../../../../apps/web/src/lib/sdk/mru-tracker';

describe('MruTracker', () => {
  it('starts with empty order', () => {
    const tracker = new MruTracker();
    expect(tracker.getOrder()).toEqual([]);
  });

  it('hydrates from initial data', () => {
    const tracker = new MruTracker(['a', 'b', 'c']);
    expect(tracker.getOrder()).toEqual(['a', 'b', 'c']);
  });

  it('records execution at front', () => {
    const tracker = new MruTracker(['a', 'b']);
    tracker.recordExecution('c');
    expect(tracker.getOrder()).toEqual(['c', 'a', 'b']);
  });

  it('deduplicates on record — moves existing to front', () => {
    const tracker = new MruTracker(['a', 'b', 'c']);
    tracker.recordExecution('b');
    expect(tracker.getOrder()).toEqual(['b', 'a', 'c']);
  });

  it('caps at 20 items', () => {
    const items = Array.from({ length: 25 }, (_, i) => `cmd-${i}`);
    const tracker = new MruTracker(items);
    expect(tracker.getOrder()).toHaveLength(20);
    expect(tracker.getOrder()[0]).toBe('cmd-0');
  });

  it('caps on recordExecution when at limit', () => {
    const items = Array.from({ length: 20 }, (_, i) => `cmd-${i}`);
    const tracker = new MruTracker(items);
    tracker.recordExecution('new-cmd');
    expect(tracker.getOrder()).toHaveLength(20);
    expect(tracker.getOrder()[0]).toBe('new-cmd');
    expect(tracker.getOrder()).not.toContain('cmd-19');
  });

  it('toArray returns a copy', () => {
    const tracker = new MruTracker(['a', 'b']);
    const arr = tracker.toArray();
    arr.push('c');
    expect(tracker.getOrder()).toEqual(['a', 'b']);
  });
});
