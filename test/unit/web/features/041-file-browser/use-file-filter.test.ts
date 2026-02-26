/**
 * useFileFilter Hook Tests (Plan 049 Feature 2)
 *
 * Tests for the file search cache hook: lazy populate, delta accumulation,
 * threshold re-fetch, debounce, sort cycling, sessionStorage persistence,
 * includeHidden toggle, and error state.
 *
 * vi.mock is used only for useFileChanges (SSE transport infrastructure),
 * consistent with the fakes-only policy.
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseFileChangesReturn } from '@/features/045-live-file-events/use-file-changes';

// --- Mock SSE transport (infrastructure, not business logic) ---

const mockFileChanges: UseFileChangesReturn = {
  changes: [],
  hasChanges: false,
  clearChanges: () => {},
};

vi.mock('@/features/045-live-file-events', () => ({
  useFileChanges: () => mockFileChanges,
}));

// Import after mock setup
import {
  type UseFileFilterOptions,
  useFileFilter,
} from '@/features/041-file-browser/hooks/use-file-filter';

// --- Fake fetch ---

function makeFakeFetch(
  files: { path: string; mtime: number }[] = [
    { path: 'src/app.tsx', mtime: 3000 },
    { path: 'src/lib/utils.ts', mtime: 2000 },
    { path: 'README.md', mtime: 1000 },
  ]
): UseFileFilterOptions['fetchFileList'] & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const fn = async (worktreePath: string, includeHidden: boolean) => {
    calls.push([worktreePath, includeHidden]);
    return { ok: true as const, files };
  };
  (fn as { calls: unknown[][] }).calls = calls;
  return fn as UseFileFilterOptions['fetchFileList'] & { calls: unknown[][] };
}

function makeFakeFetchError(): UseFileFilterOptions['fetchFileList'] & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const fn = async (worktreePath: string, includeHidden: boolean) => {
    calls.push([worktreePath, includeHidden]);
    return { ok: false as const, error: 'fail' };
  };
  (fn as { calls: unknown[][] }).calls = calls;
  return fn as UseFileFilterOptions['fetchFileList'] & { calls: unknown[][] };
}

function makeFakeFetchThrows(): UseFileFilterOptions['fetchFileList'] & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  const fn = async (worktreePath: string, includeHidden: boolean) => {
    calls.push([worktreePath, includeHidden]);
    throw new Error('network');
  };
  (fn as { calls: unknown[][] }).calls = calls;
  return fn as UseFileFilterOptions['fetchFileList'] & { calls: unknown[][] };
}

function makeOptions(overrides?: Partial<UseFileFilterOptions>): UseFileFilterOptions {
  return {
    worktreePath: '/tmp/test-workspace',
    fetchFileList: makeFakeFetch(),
    ...overrides,
  };
}

beforeEach(() => {
  mockFileChanges.changes = [];
  mockFileChanges.hasChanges = false;
  mockFileChanges.clearChanges = () => {};
  // Clear sessionStorage for sort persistence tests
  try {
    sessionStorage.removeItem('chainglass-file-filter-sort');
  } catch {
    /* noop in test env */
  }
});

describe('useFileFilter', () => {
  it('does not fetch until a non-empty query is set', async () => {
    const fetchFileList = makeFakeFetch();
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    // No query yet — should not have fetched
    expect(fetchFileList.calls).toHaveLength(0);
    expect(result.current.results).toBeNull();

    // Set a query
    await act(async () => {
      result.current.setQuery('app');
    });

    // After debounce, fetch should have been called
    await vi.waitFor(() => {
      expect(fetchFileList.calls).toHaveLength(1);
    });
  });

  it('returns filtered results after cache populate and debounce', async () => {
    const fetchFileList = makeFakeFetch();
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    await act(async () => {
      result.current.setQuery('app');
    });

    // Wait for debounce + fetch + filter
    await vi.waitFor(() => {
      expect(result.current.results).not.toBeNull();
    });

    // Should find src/app.tsx (contains 'app')
    const paths = result.current.results?.map((r) => r.path) ?? [];
    expect(paths).toContain('src/app.tsx');
    // README.md should not match 'app'
    expect(paths).not.toContain('README.md');
  });

  it('applies SSE deltas to cache (add/change/unlink)', async () => {
    const fetchFileList = makeFakeFetch([
      { path: 'src/a.ts', mtime: 1000 },
      { path: 'src/b.ts', mtime: 2000 },
    ]);
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    // Populate cache
    await act(async () => {
      result.current.setQuery('src');
    });
    await vi.waitFor(() => {
      expect(result.current.results).not.toBeNull();
    });

    expect(result.current.results?.map((r) => r.path) ?? []).toContain('src/b.ts');

    // Simulate SSE: unlink src/b.ts, add src/c.ts
    await act(async () => {
      mockFileChanges.changes = [
        { eventType: 'unlink', path: 'src/b.ts', timestamp: Date.now() },
        { eventType: 'add', path: 'src/c.ts', timestamp: Date.now() },
      ];
      mockFileChanges.hasChanges = true;
    });

    // Trigger the SSE effect by re-rendering
    const { rerender } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));
    rerender();

    // Give effects time to run
    await vi.waitFor(() => {
      const paths = result.current.results?.map((r) => r.path) ?? [];
      // After delta: b.ts removed, c.ts added
      return paths.includes('src/c.ts') && !paths.includes('src/b.ts');
    });
  });

  it('triggers full re-fetch when delta count exceeds threshold (>50)', async () => {
    const fetchFileList = makeFakeFetch([{ path: 'src/a.ts', mtime: 1000 }]);
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    // Populate cache
    await act(async () => {
      result.current.setQuery('src');
    });
    await vi.waitFor(() => {
      expect(fetchFileList.calls).toHaveLength(1);
    });

    // Simulate >50 SSE changes (branch switch scenario)
    const manyChanges = Array.from({ length: 51 }, (_, i) => ({
      eventType: 'change' as const,
      path: `src/file-${i}.ts`,
      timestamp: Date.now(),
    }));

    await act(async () => {
      mockFileChanges.changes = manyChanges;
      mockFileChanges.hasChanges = true;
    });

    // Should trigger another full fetch
    await vi.waitFor(() => {
      expect(fetchFileList.calls).toHaveLength(2);
    });
  });

  it('cycles sort mode: recent -> alpha-asc -> alpha-desc -> recent', async () => {
    const { result } = renderHook(() => useFileFilter(makeOptions()));

    expect(result.current.sortMode).toBe('recent');

    act(() => result.current.cycleSortMode());
    expect(result.current.sortMode).toBe('alpha-asc');

    act(() => result.current.cycleSortMode());
    expect(result.current.sortMode).toBe('alpha-desc');

    act(() => result.current.cycleSortMode());
    expect(result.current.sortMode).toBe('recent');
  });

  it('persists sort mode to sessionStorage', () => {
    const { result } = renderHook(() => useFileFilter(makeOptions()));

    act(() => result.current.cycleSortMode());
    expect(result.current.sortMode).toBe('alpha-asc');

    const stored = sessionStorage.getItem('chainglass-file-filter-sort');
    expect(stored).toBe('alpha-asc');
  });

  it('restores sort mode from sessionStorage on mount', () => {
    sessionStorage.setItem('chainglass-file-filter-sort', 'alpha-desc');

    const { result } = renderHook(() => useFileFilter(makeOptions()));

    expect(result.current.sortMode).toBe('alpha-desc');
  });

  it('toggles includeHidden and triggers re-fetch', async () => {
    const fetchFileList = makeFakeFetch();
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    // Populate cache first
    await act(async () => {
      result.current.setQuery('app');
    });
    await vi.waitFor(() => {
      expect(fetchFileList.calls).toHaveLength(1);
    });

    // Toggle includeHidden
    await act(async () => {
      result.current.toggleIncludeHidden();
    });

    expect(result.current.includeHidden).toBe(true);

    // Should trigger re-fetch with new includeHidden value
    await vi.waitFor(() => {
      expect(fetchFileList.calls).toHaveLength(2);
    });

    // Second call should have includeHidden=true
    expect(fetchFileList.calls[fetchFileList.calls.length - 1]).toEqual([
      '/tmp/test-workspace',
      true,
    ]);
  });

  it('sets error state when fetchFileList returns { ok: false }', async () => {
    const fetchFileList = makeFakeFetchError();
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    await act(async () => {
      result.current.setQuery('app');
    });

    await vi.waitFor(() => {
      expect(result.current.error).toBe('Could not scan files');
    });

    expect(result.current.results).toBeNull();
  });

  it('sets error state when fetchFileList throws', async () => {
    const fetchFileList = makeFakeFetchThrows();
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    await act(async () => {
      result.current.setQuery('app');
    });

    await vi.waitFor(() => {
      expect(result.current.error).toBe('Could not scan files');
    });
  });

  it('debounces query changes (300ms)', async () => {
    vi.useFakeTimers();
    const fetchFileList = makeFakeFetch();
    const { result } = renderHook(() => useFileFilter(makeOptions({ fetchFileList })));

    // Set query — triggers lazy cache populate immediately (first query)
    act(() => {
      result.current.setQuery('app');
    });

    // Wait for lazy populate to fire
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    // Cache populate fires on first non-empty query (not debounced)
    expect(fetchFileList.calls).toHaveLength(1);

    // Change query — debounce timer resets for filtering
    act(() => {
      result.current.setQuery('utils');
    });

    // Advance less than debounce
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Debounced query hasn't fired yet — results still null
    expect(result.current.results).toBeNull();

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    // Now the debounced query resolves — no extra fetch needed (cache populated)
    expect(fetchFileList.calls).toHaveLength(1);

    vi.useRealTimers();
  });
});
