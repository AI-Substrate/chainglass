/**
 * Plan 056: StateChangeLog Unit Tests
 *
 * Tests for ring buffer accumulation, FIFO eviction, pattern filtering,
 * subscribe/version notification, and clear.
 */

import type { StateChange } from '@chainglass/shared/state';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(log.size).toBe(0);
    expect(log.version).toBe(0);
  });

  it('appends entries and increments size and version', () => {
    log.append(makeChange('worktree:slug:branch'));
    expect(log.size).toBe(1);
    expect(log.version).toBe(1);

    log.append(makeChange('worktree:slug:count'));
    expect(log.size).toBe(2);
    expect(log.version).toBe(2);
  });

  it('evicts oldest entries when at cap (FIFO)', () => {
    for (let i = 0; i < 7; i++) {
      log.append(makeChange(`test:prop${i}`, i));
    }
    expect(log.size).toBe(5);

    const entries = log.getEntries();
    expect(entries[0].value).toBe(2);
    expect(entries[4].value).toBe(6);
  });

  it('getEntries returns all entries when no filter', () => {
    log.append(makeChange('worktree:slug:branch', 'main'));
    log.append(makeChange('workflow:wf-1:status', 'running'));

    const entries = log.getEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0].path).toBe('worktree:slug:branch');
    expect(entries[1].path).toBe('workflow:wf-1:status');
  });

  it('getEntries filters by pattern', () => {
    log.append(makeChange('worktree:slug:branch', 'main'));
    log.append(makeChange('workflow:wf-1:status', 'running'));
    log.append(makeChange('worktree:slug:count', 3));

    const worktreeOnly = log.getEntries('worktree:**');
    expect(worktreeOnly).toHaveLength(2);
    expect(worktreeOnly[0].path).toBe('worktree:slug:branch');
    expect(worktreeOnly[1].path).toBe('worktree:slug:count');
  });

  it('getEntries limits results (returns last N)', () => {
    for (let i = 0; i < 5; i++) {
      log.append(makeChange(`test:prop${i}`, i));
    }

    const last2 = log.getEntries(undefined, 2);
    expect(last2).toHaveLength(2);
    expect(last2[0].value).toBe(3);
    expect(last2[1].value).toBe(4);
  });

  it('getEntries filters by pattern AND limits', () => {
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
    const listener = vi.fn();
    log.subscribe(listener);

    log.append(makeChange('test:prop'));
    expect(listener).toHaveBeenCalledTimes(1);

    log.append(makeChange('test:prop2'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('subscribe fires on clear', () => {
    const listener = vi.fn();
    log.subscribe(listener);

    log.append(makeChange('test:prop'));
    log.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops notifications', () => {
    const listener = vi.fn();
    const unsub = log.subscribe(listener);

    log.append(makeChange('test:prop'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    log.append(makeChange('test:prop2'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('capacity returns configured cap', () => {
    expect(log.capacity).toBe(5);
    const bigLog = new StateChangeLog(1000);
    expect(bigLog.capacity).toBe(1000);
  });

  it('default cap is 500', () => {
    const defaultLog = new StateChangeLog();
    expect(defaultLog.capacity).toBe(500);
  });
});
