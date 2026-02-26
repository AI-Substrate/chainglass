'use client';

/**
 * useGitGrepSearch — React hook for git grep content search.
 *
 * Debounces queries and calls the git grep server action.
 * Zero dependencies beyond git.
 *
 * Plan 052: Built-in Content Search
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { GrepSearchResult } from '@/features/_platform/panel-layout/types';
import { gitGrepSearch } from '@/lib/server/git-grep-action';

const DEBOUNCE_MS = 300;

export interface UseGitGrepSearchReturn {
  results: GrepSearchResult[] | null;
  loading: boolean;
  error: string | null;
  setQuery: (query: string) => void;
}

export function useGitGrepSearch(worktreePath: string): UseGitGrepSearchReturn {
  const [results, setResults] = useState<GrepSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQueryRaw] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const fetchInProgressRef = useRef(false);

  // Debounce the query
  useEffect(() => {
    if (!query) {
      setDebouncedQuery('');
      setResults(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search on debounced query change
  useEffect(() => {
    if (!debouncedQuery) return;
    if (fetchInProgressRef.current) return;

    fetchInProgressRef.current = true;
    setLoading(true);
    setError(null);

    gitGrepSearch(debouncedQuery, worktreePath)
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
          setResults(null);
        } else {
          setResults(result.results);
          setError(null);
        }
      })
      .catch(() => {
        setError('Search failed');
        setResults(null);
      })
      .finally(() => {
        setLoading(false);
        fetchInProgressRef.current = false;
      });
  }, [debouncedQuery, worktreePath]);

  const setQuery = useCallback((q: string) => {
    setQueryRaw(q);
  }, []);

  return { results, loading, error, setQuery };
}
