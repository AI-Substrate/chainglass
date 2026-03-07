/**
 * Tests for useTreeDirectoryChanges hook.
 *
 * Per Plan 045: Live File Events - Phase 3 (T001)
 * Uses FakeEventSource via FileChangeProvider for controlled SSE.
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTreeDirectoryChanges } from '../../../../../apps/web/src/features/041-file-browser/hooks/use-tree-directory-changes';
import { FileChangeProvider } from '../../../../../apps/web/src/features/045-live-file-events/file-change-provider';
import {
  type FakeEventSource,
  createFakeEventSourceFactory,
} from '../../../../../test/fakes/fake-event-source';

describe('useTreeDirectoryChanges', () => {
  let fakeESFactory: ReturnType<typeof createFakeEventSourceFactory>;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeESFactory = createFakeEventSourceFactory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createWrapper(worktreePath = '/repo') {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(FileChangeProvider, {
        worktreePath,
        eventSourceFactory: fakeESFactory.create as unknown as (url: string) => EventSource,
        children,
      });
    };
  }

  function getLastES(): FakeEventSource {
    const es = fakeESFactory.lastInstance;
    if (!es) throw new Error('No EventSource created');
    return es;
  }

  function simulateSSE(
    fakeES: FakeEventSource,
    changes: Array<{ path: string; eventType: string; worktreePath: string; timestamp: number }>
  ) {
    fakeES.simulateMessage(JSON.stringify({ type: 'file-changed', changes }));
  }

  it('should detect changes in expanded directories', () => {
    /**
     * Why: Core behavior — changes in expanded dirs should be detected.
     * Contract: File added in expanded dir → changedDirs includes that dir.
     * Usage Notes: expandedDirs is an array of dir paths without trailing slash.
     * Quality Contribution: Validates the filtering logic from '**' to expanded dirs.
     * Worked Example: expanded=['src'], file added at 'src/new.ts' → changedDirs has 'src'.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'src/new.ts', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.hasChanges).toBe(true);
    expect(result.current.changedDirs.has('src')).toBe(true);
  });

  it('should ignore changes in non-expanded directories', () => {
    /**
     * Why: Only expanded dirs should trigger updates — collapsed dirs are not visible.
     * Contract: File added in non-expanded dir → changedDirs does NOT include it.
     * Usage Notes: Collapsed dirs are simply not in the expandedDirs array.
     * Quality Contribution: Prevents unnecessary re-fetches for hidden directories.
     * Worked Example: expanded=['src'], file added at 'test/new.ts' → changedDirs empty.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'test/new.ts', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.hasChanges).toBe(false);
    expect(result.current.changedDirs.size).toBe(0);
  });

  it('should only match direct children, not nested', () => {
    /**
     * Why: Directory pattern matches direct children only — nested changes belong to subdirs.
     * Contract: File added at 'src/lib/utils.ts' with expanded=['src'] → NOT matched.
     * Usage Notes: Nested paths contain additional '/' after the dir prefix.
     * Quality Contribution: Prevents double-counting when parent and child dirs are both expanded.
     * Worked Example: expanded=['src'], change at 'src/lib/utils.ts' → not a direct child of src/.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'src/lib/utils.ts', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.hasChanges).toBe(false);
  });

  it('should populate glowPaths for add events', () => {
    /**
     * Why: glowPaths enables green glow animation for created/modified files.
     * Contract: 'add' eventType → path in glowPaths set.
     * Usage Notes: Used by FileTree's glowingPaths prop via BrowserClient.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'src/new.ts', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.glowPaths.has('src/new.ts')).toBe(true);
  });

  it('should populate glowPaths for change events', () => {
    /**
     * Why: Modified files should also glow green in the tree view.
     * Contract: 'change' eventType → path in glowPaths set.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'src/modified.ts', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.glowPaths.has('src/modified.ts')).toBe(true);
  });

  it('should populate removedPaths for unlink events', () => {
    /**
     * Why: removedPaths enables instant entry removal from the tree.
     * Contract: 'unlink' eventType → path in removedPaths set.
     * Usage Notes: Deleted entries vanish immediately (no fade-out animation).
     * Quality Contribution: Ensures removal logic only targets actual deletions.
     * Worked Example: 'unlink' event for 'src/old.ts' → removedPaths contains 'src/old.ts'.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'src/old.ts', eventType: 'unlink', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.removedPaths.has('src/old.ts')).toBe(true);
  });

  it('should reset on clearAll', () => {
    /**
     * Why: After handling changes, state must be reset to detect next batch.
     * Contract: clearAll() resets changes, changedDirs, glowPaths, removedPaths.
     * Usage Notes: Called after re-fetching directory contents.
     * Quality Contribution: Prevents stale change state from triggering duplicate re-fetches.
     * Worked Example: Receive changes → clearAll() → hasChanges is false.
     */
    const { result } = renderHook(() => useTreeDirectoryChanges(['src']), {
      wrapper: createWrapper(),
    });

    const fakeES = getLastES();
    act(() => {
      fakeES.simulateOpen();
      simulateSSE(fakeES, [
        { path: 'src/new.ts', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
      vi.advanceTimersByTime(300);
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.hasChanges).toBe(false);
  });
});
