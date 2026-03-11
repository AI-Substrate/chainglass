/**
 * Tests for useFileChanges hook.
 *
 * Per Plan 045: Live File Events - Phase 2 (T006/T007)
 * Updated Plan 072 Phase 3: Uses MultiplexedSSEProvider with FakeMultiplexedSSE.
 */

import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeFileChangeHub } from '../../../../../apps/web/src/features/045-live-file-events/fake-file-change-hub';
import { FileChangeProvider } from '../../../../../apps/web/src/features/045-live-file-events/file-change-provider';
import type { FileChange } from '../../../../../apps/web/src/features/045-live-file-events/file-change.types';
import { useFileChanges } from '../../../../../apps/web/src/features/045-live-file-events/use-file-changes';
import { MultiplexedSSEProvider } from '../../../../../apps/web/src/lib/sse/multiplexed-sse-provider';
import { createFakeMultiplexedSSEFactory } from '../../../../../test/fakes/fake-multiplexed-sse';

function makeChange(overrides: Partial<FileChange> = {}): FileChange {
  return {
    path: 'src/app.tsx',
    eventType: 'change',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('useFileChanges', () => {
  let fakeMux: ReturnType<typeof createFakeMultiplexedSSEFactory>;

  beforeEach(() => {
    vi.useFakeTimers();
    fakeMux = createFakeMultiplexedSSEFactory();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createWrapper(worktreePath = '/repo') {
    return function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        MultiplexedSSEProvider,
        { channels: ['file-changes'], eventSourceFactory: fakeMux.factory },
        React.createElement(FileChangeProvider, { worktreePath }, children)
      );
    };
  }

  function simulateSSEMessage(
    changes: Array<{ path: string; eventType: string; worktreePath: string; timestamp: number }>
  ) {
    fakeMux.simulateChannelMessage('file-changes', 'file-changed', { changes });
  }

  // No longer needed — SSE simulation goes through FakeMultiplexedSSE

  // ═══════════════════════════════════════════════════════════
  // Basic subscribe/dispatch
  // ═══════════════════════════════════════════════════════════

  it('should start with empty changes', () => {
    /**
     * Why: Hook must initialize in a clean state before any SSE events arrive.
     * Contract: Initial render returns changes=[] and hasChanges=false.
     * Usage Notes: Components rely on hasChanges=false to avoid rendering stale indicators.
     * Quality Contribution: Ensures no phantom changes appear before SSE connection opens.
     * Worked Example: renderHook(useFileChanges('src/app.tsx')) → {changes: [], hasChanges: false}.
     */
    const { result } = renderHook(() => useFileChanges('src/app.tsx'), {
      wrapper: createWrapper(),
    });

    expect(result.current.changes).toEqual([]);
    expect(result.current.hasChanges).toBe(false);
  });

  it('should receive matching changes after debounce', () => {
    /**
     * Why: Verifies end-to-end SSE → hub → hook → state pipeline delivers matching changes.
     * Contract: SSE message with matching path updates hook state after debounce resolves.
     * Usage Notes: Uses debounce=0 to test synchronous delivery path.
     * Quality Contribution: Core smoke test for the entire file-change notification chain.
     * Worked Example: SSE 'src/app.tsx' change → hook returns hasChanges=true, changes[0].path='src/app.tsx'.
     */
    const { result } = renderHook(() => useFileChanges('src/app.tsx', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/app.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    expect(result.current.hasChanges).toBe(true);
    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/app.tsx');
  });

  it('should debounce changes (default 100ms)', () => {
    /**
     * Why: Rapid file saves must be coalesced to avoid render storms.
     * Contract: Changes are withheld until debounce window (100ms default) elapses.
     * Usage Notes: Components see hasChanges=false until debounce fires, then true.
     * Quality Contribution: Prevents per-keystroke re-renders during rapid file edits.
     * Worked Example: SSE event → hasChanges=false → advance 100ms → hasChanges=true.
     */
    const { result } = renderHook(() => useFileChanges('*'), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    // Not yet — debounce pending
    expect(result.current.hasChanges).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Now it should arrive
    expect(result.current.hasChanges).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════
  // Modes
  // ═══════════════════════════════════════════════════════════

  it('should replace changes in replace mode (default)', () => {
    /**
     * Why: Default mode replaces stale changes with the latest batch for freshness.
     * Contract: Each dispatch overwrites previous changes; only newest batch is retained.
     * Usage Notes: File viewer panels want current state, not history of all changes.
     * Quality Contribution: Validates replace semantics don't accidentally accumulate.
     * Worked Example: dispatch('a.tsx') → dispatch('b.tsx') → changes=[b.tsx] (a.tsx gone).
     */
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/a.tsx', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    expect(result.current.changes).toHaveLength(1);

    act(() => {
      simulateSSEMessage([
        { path: 'src/b.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 2000 },
      ]);
    });

    // Replaced — only the second batch
    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/b.tsx');
  });

  it('should accumulate changes in accumulate mode', () => {
    /**
     * Why: Some consumers need the full history of changes since last clear.
     * Contract: mode='accumulate' appends each dispatch batch to the existing array.
     * Usage Notes: Used by diff-summary panels that show all changes since last review.
     * Quality Contribution: Validates accumulation doesn't drop earlier batches.
     * Worked Example: dispatch('a.tsx') → dispatch('b.tsx') → changes=[a.tsx, b.tsx].
     */
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0, mode: 'accumulate' }), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/a.tsx', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    act(() => {
      simulateSSEMessage([
        { path: 'src/b.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 2000 },
      ]);
    });

    // Accumulated — both batches
    expect(result.current.changes).toHaveLength(2);
  });

  it('should accumulate changes across debounce resets (FT-002 regression)', () => {
    /**
     * Why: FT-002 regression — debounce resets must not discard buffered changes in accumulate mode.
     * Contract: Multiple dispatches within one debounce window are all preserved after timer fires.
     * Usage Notes: Rapid saves within 100ms must all appear once debounce resolves.
     * Quality Contribution: Guards against a specific bug where debounce reset dropped the first batch.
     * Worked Example: dispatch('a.tsx') + dispatch('b.tsx') within 100ms → advance → changes=[a.tsx, b.tsx].
     */
    const { result } = renderHook(
      () => useFileChanges('*', { debounce: 100, mode: 'accumulate' }),
      { wrapper: createWrapper() }
    );

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/a.tsx', eventType: 'add', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    // Second batch within debounce window
    act(() => {
      simulateSSEMessage([
        { path: 'src/b.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 2000 },
      ]);
    });

    // Not yet — debounce pending
    expect(result.current.hasChanges).toBe(false);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Both batches should be accumulated (not just the second)
    expect(result.current.changes).toHaveLength(2);
    expect(result.current.changes[0].path).toBe('src/a.tsx');
    expect(result.current.changes[1].path).toBe('src/b.tsx');
  });

  // ═══════════════════════════════════════════════════════════
  // clearChanges
  // ═══════════════════════════════════════════════════════════

  it('should clear changes and reset hasChanges', () => {
    /**
     * Why: Consumers must be able to acknowledge changes and reset to a clean state.
     * Contract: clearChanges() sets changes=[] and hasChanges=false immediately.
     * Usage Notes: Called after a component processes changes (e.g., refreshes file content).
     * Quality Contribution: Ensures clear is synchronous and complete — no partial reset.
     * Worked Example: receive changes → clearChanges() → hasChanges=false, changes=[].
     */
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
      ]);
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.clearChanges();
    });

    expect(result.current.hasChanges).toBe(false);
    expect(result.current.changes).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════
  // worktreePath filtering (DYK #1)
  // ═══════════════════════════════════════════════════════════

  it('should filter out changes from other worktrees', () => {
    /**
     * Why: Multi-worktree setups must isolate events to the active worktree.
     * Contract: Only changes with matching worktreePath are delivered to the hook.
     * Usage Notes: Provider injects worktreePath; hook filters at the SSE→hub boundary.
     * Quality Contribution: Prevents cross-repo contamination in multi-root workspaces.
     * Worked Example: provider('/repo') + SSE['/repo' + '/other-repo'] → hook sees only '/repo' change.
     */
    const { result } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper('/repo'),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
        { path: 'src/a.tsx', eventType: 'change', worktreePath: '/other-repo', timestamp: 1001 },
      ]);
    });

    // Only /repo changes should arrive
    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/a.tsx');
  });

  // ═══════════════════════════════════════════════════════════
  // Pattern filtering
  // ═══════════════════════════════════════════════════════════

  it('should only receive changes matching the pattern', () => {
    /**
     * Why: Hook pattern filtering must pass through to the hub's subscription mechanism.
     * Contract: useFileChanges('src/') only receives direct children of src/, not other dirs.
     * Usage Notes: Each component passes its own pattern; hub handles the filtering.
     * Quality Contribution: End-to-end validation that pattern propagates from hook to hub.
     * Worked Example: useFileChanges('src/') + SSE['src/app.tsx','test/app.test.tsx'] → only src/app.tsx.
     */
    const { result } = renderHook(() => useFileChanges('src/', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
      simulateSSEMessage([
        { path: 'src/app.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1000 },
        { path: 'test/app.test.tsx', eventType: 'change', worktreePath: '/repo', timestamp: 1001 },
      ]);
    });

    expect(result.current.changes).toHaveLength(1);
    expect(result.current.changes[0].path).toBe('src/app.tsx');
  });

  // ═══════════════════════════════════════════════════════════
  // Error handling
  // ═══════════════════════════════════════════════════════════

  it('should throw when used outside FileChangeProvider', () => {
    /**
     * Why: Hook requires context from FileChangeProvider; missing context must fail fast.
     * Contract: Calling useFileChanges without a parent Provider throws a descriptive error.
     * Usage Notes: Developer-facing guard — catches misconfigured component trees early.
     * Quality Contribution: Fail-fast prevents silent null-reference bugs in production.
     * Worked Example: renderHook(useFileChanges('*')) without Provider → throws 'must be used within'.
     */
    expect(() => {
      renderHook(() => useFileChanges('*'));
    }).toThrow('useFileChangeHub must be used within a FileChangeProvider');
  });

  // ═══════════════════════════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════════════════════════

  it('should close EventSource on unmount', () => {
    /**
     * Why: Unmounted components must release SSE connections to avoid resource leaks.
     * Contract: unmount() closes the EventSource (readyState transitions to CLOSED=2).
     * Usage Notes: React strict-mode double-mount/unmount exercises this path.
     * Quality Contribution: Prevents orphaned SSE connections from accumulating in dev/prod.
     * Worked Example: renderHook → unmount → fakeMux.instance.readyState === 2 (CLOSED).
     */
    const { unmount } = renderHook(() => useFileChanges('*', { debounce: 0 }), {
      wrapper: createWrapper(),
    });

    act(() => {
      fakeMux.simulateOpen();
    });

    unmount();

    // EventSource cleanup is now handled by MultiplexedSSEProvider
    expect(fakeMux.instance?.readyState).toBe(2); // CLOSED
  });
});
