'use client';

/**
 * usePRViewData — Data hook for PR View overlay.
 *
 * Fetches PRViewData from server action, caches for 10s, provides
 * mark/unmark/clear actions with optimistic cache mutation (DYK-03),
 * and manages collapsed/expanded state for diff sections.
 *
 * Plan 071: PR View & File Notes — Phase 5, T002
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { ComparisonMode, PRViewData, PRViewFile } from '../types';

interface UsePRViewDataReturn {
  data: PRViewData | null;
  loading: boolean;
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
}

const CACHE_TTL_MS = 10_000;

export function usePRViewData(worktreePath: string | null): UsePRViewDataReturn {
  const [data, setData] = useState<PRViewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [mode] = useState<ComparisonMode>('working');

  const lastFetchTime = useRef(0);
  const isMounted = useRef(true);

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

      setLoading(true);
      setError(null);

      try {
        const { fetchPRViewData } = await import('../../../../app/actions/pr-view-actions');
        const result = await fetchPRViewData(worktreePath, mode);
        if (!isMounted.current) return;

        if (result.ok) {
          setData(result.data);
          lastFetchTime.current = Date.now();
        } else {
          setError(result.error);
        }
      } catch (err) {
        if (!isMounted.current) return;
        setError(`Failed to fetch PR View data: ${err}`);
      } finally {
        if (isMounted.current) setLoading(false);
      }
    },
    [worktreePath, mode, data]
  );

  const refresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

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
      // Optimistic update
      updateFileInCache(filePath, (f) => ({
        ...f,
        reviewed: true,
        previouslyReviewed: false,
        reviewedAt: new Date().toISOString(),
      }));
      // Collapse on review
      setCollapsedFiles((prev) => new Set([...prev, filePath]));
      // Fire server action (no await — fire-and-forget with error logging)
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
      // Expand on unmark
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

  // Collapsed state management
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
    loading,
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
  };
}
