/**
 * useFileFilter — Client-side file search cache with SSE delta updates.
 *
 * Manages a Map<string, CachedFileEntry> populated lazily on first search.
 * SSE file change events apply deltas (add/change/unlink), with full
 * re-fetch when >50 events arrive in a batch (branch switch).
 *
 * Feature 2: File Tree Quick Filter — Plan 049
 * Workshop 001: Cache architecture
 * Workshop 003: UX pivot — results fed to ExplorerPanel/CommandPaletteDropdown
 */

'use client';

import { useFileChanges } from '@/features/045-live-file-events';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  filterFiles,
  hideDotPaths,
  isGlobPattern,
  sortAlpha,
  sortByRecent,
} from '../services/file-filter';

export type SortMode = 'recent' | 'alpha-asc' | 'alpha-desc';

export interface CachedFileEntry {
  path: string;
  mtime: number;
  modified: boolean;
  lastChanged: number | null;
}

export interface UseFileFilterOptions {
  worktreePath: string;
  fetchFileList: (
    worktreePath: string,
    includeHidden: boolean
  ) => Promise<{
    ok: boolean;
    files?: { path: string; mtime: number }[];
    error?: string;
  }>;
}

export interface UseFileFilterReturn {
  /** Filtered + sorted results for current query. null = loading. */
  results: CachedFileEntry[] | null;
  /** Whether the cache is currently loading */
  loading: boolean;
  /** Error message if cache population failed */
  error: string | null;
  /** Current sort mode */
  sortMode: SortMode;
  /** Cycle to next sort mode */
  cycleSortMode: () => void;
  /** Whether hidden/ignored files are shown */
  includeHidden: boolean;
  /** Toggle hidden file visibility */
  toggleIncludeHidden: () => void;
  /** Set the search query (triggers debounced filter) */
  setQuery: (query: string) => void;
  /** Current query value */
  query: string;
}

const SORT_STORAGE_KEY = 'chainglass-file-filter-sort';
const DELTA_THRESHOLD = 50;
const DEBOUNCE_MS = 300;

function getInitialSortMode(): SortMode {
  if (typeof window === 'undefined') return 'recent';
  try {
    const stored = sessionStorage.getItem(SORT_STORAGE_KEY);
    if (stored === 'recent' || stored === 'alpha-asc' || stored === 'alpha-desc') return stored;
  } catch {
    /* SSR or restricted storage */
  }
  return 'recent';
}

function cycleSortModeValue(current: SortMode): SortMode {
  if (current === 'recent') return 'alpha-asc';
  if (current === 'alpha-asc') return 'alpha-desc';
  return 'recent';
}

export function useFileFilter({
  worktreePath,
  fetchFileList,
}: UseFileFilterOptions): UseFileFilterReturn {
  const [query, setQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>(getInitialSortMode);
  const [includeHidden, setIncludeHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // FT-001: Cache version counter — increment after SSE deltas to trigger useMemo recompute
  const [cacheVersion, setCacheVersion] = useState(0);

  const cacheRef = useRef<Map<string, CachedFileEntry>>(new Map());
  const cachePopulatedRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  // Tracks the includeHidden value used for the in-flight fetch
  const fetchIncludeHiddenRef = useRef(includeHidden);
  // Always reflects the latest render value (for stale-fetch detection)
  const latestIncludeHiddenRef = useRef(includeHidden);
  latestIncludeHiddenRef.current = includeHidden;

  // SSE file change events for delta updates
  const fileChanges = useFileChanges('*', { debounce: 500, mode: 'accumulate' });

  // Debounce the query
  useEffect(() => {
    if (!query) {
      setDebouncedQuery('');
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Populate cache on first query
  const populateCache = useCallback(async () => {
    if (fetchInProgressRef.current) return;
    fetchInProgressRef.current = true;
    fetchIncludeHiddenRef.current = includeHidden;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchFileList(worktreePath, includeHidden);
      if (result.ok && result.files) {
        const newCache = new Map<string, CachedFileEntry>();
        for (const file of result.files) {
          newCache.set(file.path, {
            path: file.path,
            mtime: file.mtime,
            modified: false,
            lastChanged: null,
          });
        }
        cacheRef.current = newCache;
        cachePopulatedRef.current = true;
        setCacheVersion((v) => v + 1);
      } else {
        setError('Could not scan files');
      }
    } catch {
      setError('Could not scan files');
    } finally {
      setLoading(false);
      fetchInProgressRef.current = false;
      // If includeHidden changed during this fetch, invalidate so the
      // useEffect([includeHidden]) re-fetch picks up the new value.
      if (fetchIncludeHiddenRef.current !== latestIncludeHiddenRef.current) {
        cachePopulatedRef.current = false;
      }
    }
  }, [worktreePath, includeHidden, fetchFileList]);

  // Lazy populate: trigger on first non-empty query
  useEffect(() => {
    if (query && !cachePopulatedRef.current && !fetchInProgressRef.current) {
      populateCache();
    }
  }, [query, populateCache]);

  // Re-fetch cache when includeHidden toggles (different git flags)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — only re-fetch on toggle change
  useEffect(() => {
    if (cachePopulatedRef.current) {
      cachePopulatedRef.current = false;
      populateCache();
    }
  }, [includeHidden]);

  // Apply SSE deltas to cache
  useEffect(() => {
    if (!fileChanges.hasChanges || !cachePopulatedRef.current) return;

    const changes = fileChanges.changes;
    if (changes.length > DELTA_THRESHOLD) {
      // Too many changes (branch switch) — full re-fetch
      cachePopulatedRef.current = false;
      populateCache();
    } else {
      const cache = cacheRef.current;
      for (const change of changes) {
        const relativePath = change.path;
        if (change.eventType === 'unlink') {
          cache.delete(relativePath);
        } else if (change.eventType === 'add') {
          cache.set(relativePath, {
            path: relativePath,
            mtime: Date.now(),
            modified: true,
            lastChanged: Date.now(),
          });
        } else {
          // change
          const existing = cache.get(relativePath);
          if (existing) {
            existing.modified = true;
            existing.lastChanged = Date.now();
          } else {
            cache.set(relativePath, {
              path: relativePath,
              mtime: Date.now(),
              modified: true,
              lastChanged: Date.now(),
            });
          }
        }
      }
      // FT-001: Trigger useMemo recompute after delta mutations
      setCacheVersion((v) => v + 1);
    }
    fileChanges.clearChanges();
  }, [fileChanges.hasChanges, fileChanges.changes, fileChanges.clearChanges, populateCache]);

  // Compute filtered + sorted results (sync path for substring queries)
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheVersion intentionally triggers recompute after SSE deltas
  const results = useMemo(() => {
    if (!cachePopulatedRef.current || loading) return null;
    if (!debouncedQuery) return null;
    // FT-009: Glob patterns handled by async useEffect below
    if (isGlobPattern(debouncedQuery)) return null;

    let files = Array.from(cacheRef.current.values());
    if (!includeHidden) {
      files = hideDotPaths(files);
    }

    const filtered = filterFiles(files, debouncedQuery) as CachedFileEntry[];

    if (sortMode === 'recent') return sortByRecent(filtered);
    return sortAlpha(filtered, sortMode === 'alpha-asc' ? 'asc' : 'desc');
    // FT-001: cacheVersion triggers recompute after SSE deltas
  }, [debouncedQuery, sortMode, includeHidden, loading, cacheVersion]);

  // Handle async glob filtering
  const [asyncResults, setAsyncResults] = useState<CachedFileEntry[] | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheVersion intentionally triggers recompute after SSE deltas
  useEffect(() => {
    if (!cachePopulatedRef.current || loading || !debouncedQuery) {
      setAsyncResults(null);
      return;
    }
    // FT-010: Only run async path for glob patterns
    if (!isGlobPattern(debouncedQuery)) {
      setAsyncResults(null);
      return;
    }

    let files = Array.from(cacheRef.current.values());
    if (!includeHidden) {
      files = hideDotPaths(files);
    }

    let cancelled = false;
    const promise = filterFiles(files, debouncedQuery) as Promise<CachedFileEntry[]>;
    promise
      .then((result) => {
        if (cancelled) return;
        let sorted: CachedFileEntry[];
        if (sortMode === 'recent') sorted = sortByRecent(result);
        else sorted = sortAlpha(result, sortMode === 'alpha-asc' ? 'asc' : 'desc');
        setAsyncResults(sorted);
      })
      .catch(() => {
        if (!cancelled) setAsyncResults(null);
      });
    return () => {
      cancelled = true;
    };
    // FT-001: cacheVersion triggers recompute after SSE deltas
  }, [debouncedQuery, sortMode, includeHidden, loading, cacheVersion]);

  // Sort mode persistence
  const cycleSortModeHandler = useCallback(() => {
    setSortMode((prev) => {
      const next = cycleSortModeValue(prev);
      try {
        sessionStorage.setItem(SORT_STORAGE_KEY, next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const toggleIncludeHidden = useCallback(() => {
    setIncludeHidden((prev) => !prev);
  }, []);

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
  }, []);

  // Use sync results when available, fall back to async
  const finalResults = results ?? asyncResults;

  return {
    results: finalResults,
    loading,
    error,
    sortMode,
    cycleSortMode: cycleSortModeHandler,
    includeHidden,
    toggleIncludeHidden,
    setQuery,
    query,
  };
}
