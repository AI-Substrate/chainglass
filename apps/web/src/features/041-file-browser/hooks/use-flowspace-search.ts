'use client';

/**
 * useFlowspaceSearch — React hook for FlowSpace code search.
 *
 * Debounces queries and calls the server action to search via fs2 CLI.
 * Manages loading/error/results state. Checks availability on mount.
 *
 * Plan 051: FlowSpace Code Search
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  FlowSpaceAvailability,
  FlowSpaceSearchMode,
  FlowSpaceSearchResult,
} from '@/features/_platform/panel-layout/types';
import { checkFlowspaceAvailability, flowspaceSearch } from '@/lib/server/flowspace-search-action';

const DEBOUNCE_MS = 300;

/** Compute a human-friendly relative time string from a timestamp. */
function relativeTime(mtimeMs: number): string {
  const diffMs = Date.now() - mtimeMs;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export interface UseFlowspaceSearchReturn {
  results: FlowSpaceSearchResult[] | null;
  loading: boolean;
  error: string | null;
  availability: FlowSpaceAvailability;
  graphAge: string | null;
  folders: Record<string, number> | null;
  setQuery: (query: string, mode: FlowSpaceSearchMode) => void;
}

export function useFlowspaceSearch(worktreePath: string): UseFlowspaceSearchReturn {
  const [results, setResults] = useState<FlowSpaceSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<FlowSpaceAvailability>('available');
  const [graphAge, setGraphAge] = useState<string | null>(null);
  const [folders, setFolders] = useState<Record<string, number> | null>(null);
  const [query, setQueryRaw] = useState('');
  const [mode, setMode] = useState<FlowSpaceSearchMode>('text');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const fetchInProgressRef = useRef(false);
  const availabilityCheckedRef = useRef(false);

  // Check availability on mount
  useEffect(() => {
    if (availabilityCheckedRef.current) return;
    availabilityCheckedRef.current = true;

    checkFlowspaceAvailability(worktreePath).then((result) => {
      setAvailability(result.availability);
      if (result.graphMtime) {
        setGraphAge(relativeTime(result.graphMtime));
      }
    });
  }, [worktreePath]);

  // Debounce the query
  useEffect(() => {
    if (!query) {
      setDebouncedQuery('');
      setResults(null);
      setFolders(null);
      setError(null);
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search on debounced query change
  useEffect(() => {
    if (!debouncedQuery || availability !== 'available') return;
    if (fetchInProgressRef.current) return;

    fetchInProgressRef.current = true;
    setLoading(true);
    setError(null);

    flowspaceSearch(debouncedQuery, mode, worktreePath)
      .then((result) => {
        if ('error' in result) {
          setError(result.error);
          setResults(null);
          setFolders(null);
        } else {
          setResults(result.results);
          setFolders(result.folders);
          setError(null);
        }
      })
      .catch(() => {
        setError('Search failed');
        setResults(null);
        setFolders(null);
      })
      .finally(() => {
        setLoading(false);
        fetchInProgressRef.current = false;
      });
  }, [debouncedQuery, mode, availability, worktreePath]);

  const setQuery = useCallback((q: string, m: FlowSpaceSearchMode) => {
    setQueryRaw(q);
    setMode(m);
  }, []);

  return {
    results,
    loading,
    error,
    availability,
    graphAge,
    folders,
    setQuery,
  };
}
