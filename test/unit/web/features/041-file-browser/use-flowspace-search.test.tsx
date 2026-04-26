/**
 * useFlowspaceSearch Hook Tests
 *
 * FX002-1 (AC-FX02-1): regression guard for the rapid-query-supersedence
 * edge case. Before the fix, a `fetchInProgressRef` early-out in the
 * search effect could swallow the user's *next* debounced query while a
 * prior poll/search was still settling. After the fix, the hook-side
 * epoch counter (`queryEpochRef`) plus the per-effect `cancelled` flag
 * are sufficient — and the test below proves it.
 *
 * Doctrine note: `vi.mock` is used here for module-level *infrastructure*
 * replacement (the server action is a Next.js Server Action that can't
 * run unmodified in vitest's Node environment), not for business-logic
 * mocking. The fake action is a real implementation backed by a hoisted
 * response queue — semantically identical to the InMemoryTransport
 * approach used in `flowspace-mcp-client.test.ts`. Mirrors the established
 * pattern in `use-file-filter.test.ts` (vi.mock for SSE infrastructure).
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CodeSearchAvailability,
  FlowSpaceSearchResult,
} from '@/features/_platform/panel-layout/types';

type SearchResponse =
  | { kind: 'spawning' }
  | { kind: 'ok'; results: FlowSpaceSearchResult[]; folders: Record<string, number> }
  | { kind: 'error'; error: string };

const { responseQueue, searchCalls } = vi.hoisted(() => ({
  responseQueue: [] as SearchResponse[],
  searchCalls: [] as Array<{ query: string; mode: string; cwd: string }>,
}));

vi.mock('@/lib/server/flowspace-search-action', () => ({
  checkFlowspaceAvailability: async () => ({
    availability: 'available' as CodeSearchAvailability,
    graphMtime: Date.now(),
  }),
  flowspaceSearch: async (query: string, mode: string, cwd: string): Promise<SearchResponse> => {
    searchCalls.push({ query, mode, cwd });
    const next = responseQueue.shift();
    if (!next) {
      throw new Error(
        `useFlowspaceSearch test: response queue empty for query="${query}" mode=${mode}`
      );
    }
    return next;
  },
  restartFlowspaceAction: async () => ({ ok: true as const }),
}));

import { useFlowspaceSearch } from '@/features/041-file-browser/hooks/use-flowspace-search';

function makeResult(name: string): FlowSpaceSearchResult {
  return {
    kind: 'flowspace',
    nodeId: `callable:apps/web/src/x.ts:${name}`,
    name,
    category: 'callable',
    filePath: 'apps/web/src/x.ts',
    startLine: 1,
    endLine: 5,
    smartContent: null,
    snippet: '',
    score: 0.9,
    matchField: 'content',
  };
}

describe('useFlowspaceSearch — rapid query supersedence (FX002-1, AC-FX02-1)', () => {
  beforeEach(() => {
    responseQueue.length = 0;
    searchCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a second query during the first query's spawning poll wins", async () => {
    // Queue layout:
    //   foo's first call → spawning (forces polling for foo)
    //   bar's first call → ok with bar's results
    // Pre-fix bug: foo's polling would block bar's effect via fetchInProgressRef.
    // Post-fix: epoch counter cancels foo's loop when bar's effect bumps the epoch.
    responseQueue.push({ kind: 'spawning' });
    responseQueue.push({ kind: 'ok', results: [makeResult('bar-result')], folders: {} });

    vi.useFakeTimers();
    const { result } = renderHook(() => useFlowspaceSearch('/fake/cwd'));

    // Trigger query "foo".
    act(() => {
      result.current.setQuery('foo', 'semantic');
    });
    // Advance past the 300 ms debounce → foo's effect kicks off → first call returns 'spawning'.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    // While foo's poll is in its 1 s sleep, the user types "bar".
    act(() => {
      result.current.setQuery('bar', 'semantic');
    });
    // Advance past bar's debounce → bar's effect kicks off → returns 'ok' with barResults.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    // Drain remaining timers (e.g., foo's leftover 1 s poll, which the epoch
    // counter must cancel without overwriting bar's state).
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    expect(result.current.results).not.toBeNull();
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results?.[0].name).toBe('bar-result');

    // Both queries must have been dispatched. Pre-fix, bar would have been swallowed.
    const dispatchedQueries = searchCalls.map((c) => c.query);
    expect(dispatchedQueries).toContain('bar');
  });

  it('handles a clean single-query flow with one spawning poll then ok', async () => {
    responseQueue.push({ kind: 'spawning' });
    responseQueue.push({ kind: 'ok', results: [makeResult('foo-result')], folders: {} });

    vi.useFakeTimers();
    const { result } = renderHook(() => useFlowspaceSearch('/fake/cwd'));

    act(() => {
      result.current.setQuery('foo', 'semantic');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    // Foo's first call returned 'spawning'. The 1 s poll delay is now armed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    vi.useRealTimers();

    expect(result.current.results).not.toBeNull();
    expect(result.current.results?.[0].name).toBe('foo-result');
    expect(searchCalls.filter((c) => c.query === 'foo').length).toBeGreaterThanOrEqual(2);
  });
});
