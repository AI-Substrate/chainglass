'use client';

/**
 * usePRViewData — Data hook for PR View overlay.
 *
 * Fetches PRViewData from server action, caches for 10s, provides
 * mark/unmark/clear actions with optimistic cache mutation (DYK-03),
 * manages collapsed/expanded state for diff sections, and supports
 * Working/Branch mode switching (Phase 6).
 *
 * DYK-01 (Phase 6): Split loading into initialLoading + refreshing
 * DYK-02 (Phase 6): Fetch generation counter prevents stale response race
 * DYK-05 (Phase 6): Reset collapsed state on mode switch
 *
 * Plan 071: PR View & File Notes — Phase 5 T002, Phase 6 T001
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ComparisonMode, PRViewData, PRViewFile } from '../types';

interface UsePRViewDataReturn {
  data: PRViewData | null;
  /** True only on first fetch (no existing data). Shows full-screen loader. */
  initialLoading: boolean;
  /** True on background refresh (has existing data). Shows subtle indicator. */
  refreshing: boolean;
  error: string | null;
  refresh: () => void;
  /** Mark a file as reviewed — optimistic update + server action */
  markReviewed: (filePath: string) => void;
  /** Unmark a file — optimistic update + server action */
  unmarkReviewed: (filePath: string) => void;
  /** Toggle reviewed state for a file */
  toggleReviewed: (filePath: string) => void;
  /** Clear all reviewed state */
  clearAllReviewed: () => void;
  /** Set of collapsed file paths */
  collapsedFiles: Set<string>;
  /** Toggle collapsed state for one file */
  toggleCollapsed: (filePath: string) => void;
  /** Expand all files */
  expandAll: () => void;
  /** Collapse all files */
  collapseAll: () => void;
  /** Active comparison mode */
  mode: ComparisonMode;
  /** Switch comparison mode — force-refreshes data */
  switchMode: (newMode: ComparisonMode) => void;
}

const CACHE_TTL_MS = 10_000;

export function usePRViewData(worktreePath: string | null): UsePRViewDataReturn {
  const [data, setData] = useState<PRViewData | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ComparisonMode>('working');

  const lastFetchTime = useRef(0);
  const isMounted = useRef(true);
  // DYK-02 (Phase 6): Generation counter prevents stale fetch race conditions
  const fetchGenRef = useRef(0);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const fetchData = useCallback(
    async (force = false) => {
      if (!worktreePath) return;

      // 10s cache — skip fetch if recent (unless forced)
      const now = Date.now();
      if (!force && data && now - lastFetchTime.current < CACHE_TTL_MS) return;

      // DYK-01 (Phase 6): Split loading — initial vs refresh
      const isInitial = !data;
      if (isInitial) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      // DYK-02: Capture generation before async work
      fetchGenRef.current++;
      const gen = fetchGenRef.current;

      try {
        const { fetchPRViewData } = await import('../../../../app/actions/pr-view-actions');
        const result = await fetchPRViewData(worktreePath, mode);
        if (!isMounted.current) return;
        // DYK-02: Discard stale response if generation changed
        if (gen !== fetchGenRef.current) return;

        if (result.ok) {
          setData(result.data);
          lastFetchTime.current = Date.now();
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (!isMounted.current) return;
        if (gen !== fetchGenRef.current) return;
        setError(`Failed to fetch PR View data: ${err}`);
      } finally {
        if (isMounted.current && gen === fetchGenRef.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }
    },
    [worktreePath, mode, data]
  );

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  // DYK-05 (Phase 6): switchMode resets collapsed + force-refreshes
  const switchMode = useCallback(
    (newMode: ComparisonMode) => {
      if (newMode === mode) return;
      setMode(newMode);
      setCollapsedFiles(new Set());
      lastFetchTime.current = 0; // Invalidate cache
    },
    [mode]
  );

  // Re-fetch when mode changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode triggers re-fetch
  useEffect(() => {
    if (worktreePath && data) {
      fetchData(true);
    }
  }, [mode]);

  // DYK-03: Mutate cached state directly on mark/unmark
  const updateFileInCache = useCallback(
    (filePath: string, updater: (file: PRViewFile) => PRViewFile) => {
      setData((prev) => {
        if (!prev) return prev;
        const newFiles = prev.files.map((f) => (f.path === filePath ? updater(f) : f));
        const reviewedCount = newFiles.filter((f) => f.reviewed).length;
        return {
          ...prev,
          files: newFiles,
          stats: { ...prev.stats, reviewedCount },
        };
      });
    },
    []
  );

  const markReviewed = useCallback(
    (filePath: string) => {
      updateFileInCache(filePath, (f) => ({
        ...f,
        reviewed: true,
        previouslyReviewed: false,
        reviewedAt: new Date().toISOString(),
      }));
      setCollapsedFiles((prev) => new Set([...prev, filePath]));
      if (worktreePath) {
        import('../../../../app/actions/pr-view-actions')
          .then(({ markFileAsReviewed }) => markFileAsReviewed(worktreePath, filePath))
          .then((result) => {
            if (!result.ok) console.error('[pr-view] markReviewed failed:', result.error);
          })
          .catch((err) => console.error('[pr-view] markReviewed error:', err));
      }
    },
    [worktreePath, updateFileInCache]
  );

  const unmarkReviewed = useCallback(
    (filePath: string) => {
      updateFileInCache(filePath, (f) => ({
        ...f,
        reviewed: false,
        previouslyReviewed: false,
        reviewedAt: undefined,
      }));
      setCollapsedFiles((prev) => {
        const next = new Set(prev);
        next.delete(filePath);
        return next;
      });
      if (worktreePath) {
        import('../../../../app/actions/pr-view-actions')
          .then(({ unmarkFileAsReviewed }) => unmarkFileAsReviewed(worktreePath, filePath))
          .then((result) => {
            if (!result.ok) console.error('[pr-view] unmarkReviewed failed:', result.error);
          })
          .catch((err) => console.error('[pr-view] unmarkReviewed error:', err));
      }
    },
    [worktreePath, updateFileInCache]
  );

  const toggleReviewed = useCallback(
    (filePath: string) => {
      const file = data?.files.find((f) => f.path === filePath);
      if (!file) return;
      if (file.reviewed) {
        unmarkReviewed(filePath);
      } else {
        markReviewed(filePath);
      }
    },
    [data, markReviewed, unmarkReviewed]
  );

  const clearAllReviewed = useCallback(() => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map((f) => ({
          ...f,
          reviewed: false,
          previouslyReviewed: false,
          reviewedAt: undefined,
        })),
        stats: { ...prev.stats, reviewedCount: 0 },
      };
    });
    setCollapsedFiles(new Set());
    if (worktreePath) {
      import('../../../../app/actions/pr-view-actions')
        .then(({ clearAllReviewedState }) => clearAllReviewedState(worktreePath))
        .then((result) => {
          if (!result.ok) console.error('[pr-view] clearAll failed:', result.error);
        })
        .catch((err) => console.error('[pr-view] clearAll error:', err));
    }
  }, [worktreePath]);

  const toggleCollapsed = useCallback((filePath: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedFiles(new Set());
  }, []);

  const collapseAll = useCallback(() => {
    if (!data) return;
    setCollapsedFiles(new Set(data.files.map((f) => f.path)));
  }, [data]);

  return {
    data,
    initialLoading,
    refreshing,
    error,
    refresh,
    markReviewed,
    unmarkReviewed,
    toggleReviewed,
    clearAllReviewed,
    collapsedFiles,
    toggleCollapsed,
    expandAll,
    collapseAll,
    mode,
    switchMode,
  };
}
