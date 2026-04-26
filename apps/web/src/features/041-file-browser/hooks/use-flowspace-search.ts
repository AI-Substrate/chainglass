'use client';

/**
 * useFlowspaceSearch — React hook for FlowSpace code search.
 *
 * Plan 084: the server action returns a discriminated union. When the long-
 * lived `fs2 mcp` child for the current worktree is being spawned, the action
 * returns `{ kind: 'spawning' }` immediately — the hook flips its `spawning`
 * flag and re-calls every 1 s until the action returns results, errors, or the
 * 30 s polling ceiling is hit.
 *
 * On warm hits the dropdown shows "Searching…"; on the cold first call it
 * shows "Loading FlowSpace, please wait…" (rendered by the dropdown based on
 * `spawning`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  CodeSearchAvailability,
  CodeSearchMode,
  FlowSpaceSearchResult,
} from '@/features/_platform/panel-layout/types';
import { checkFlowspaceAvailability, flowspaceSearch } from '@/lib/server/flowspace-search-action';

const DEBOUNCE_MS = 300;
const SPAWN_POLL_MS = 1_000;
const SPAWN_POLL_CEILING_MS = 30_000;

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
  /** True while the long-lived fs2 mcp child is being spawned (cold first call). */
  spawning: boolean;
  error: string | null;
  availability: CodeSearchAvailability;
  graphAge: string | null;
  folders: Record<string, number> | null;
  setQuery: (query: string, mode: CodeSearchMode) => void;
}

export function useFlowspaceSearch(worktreePath: string): UseFlowspaceSearchReturn {
  const [results, setResults] = useState<FlowSpaceSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [spawning, setSpawning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<CodeSearchAvailability>('available');
  const [graphAge, setGraphAge] = useState<string | null>(null);
  const [folders, setFolders] = useState<Record<string, number> | null>(null);
  const [query, setQueryRaw] = useState('');
  const [mode, setMode] = useState<CodeSearchMode>('grep');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const availabilityCheckedRef = useRef(false);
  // Bumps every time the query/mode changes — used to invalidate in-flight polls.
  const queryEpochRef = useRef(0);

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
      setSpawning(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search on debounced query change. If the server reports `spawning`,
  // poll every SPAWN_POLL_MS until results, error, or ceiling.
  //
  // FX002-1: dropped the `fetchInProgressRef` early-out. The hook-side epoch
  // counter (`queryEpochRef`) plus the per-effect `cancelled` flag together
  // ensure stale polls don't update state when a new query supersedes them;
  // server-side dedup of overlapping `flowspaceSearch` calls is handled by
  // `getOrSpawn`'s synchronous `pool.get → pool.set` prefix in
  // `flowspace-mcp-client.ts`. The early-out had become redundant and could
  // drop the user's *next* query while the prior loop was still settling.
  useEffect(() => {
    if (!debouncedQuery || availability !== 'available') return;

    const epoch = ++queryEpochRef.current;
    setLoading(true);
    setError(null);

    const startMs = Date.now();
    let cancelled = false;

    async function run() {
      while (!cancelled && epoch === queryEpochRef.current) {
        const result = await flowspaceSearch(debouncedQuery, mode, worktreePath);
        if (cancelled || epoch !== queryEpochRef.current) return;

        if (result.kind === 'spawning') {
          setSpawning(true);
          if (Date.now() - startMs >= SPAWN_POLL_CEILING_MS) {
            setSpawning(false);
            setError('FlowSpace did not start in time. Try again in a moment.');
            setResults(null);
            setFolders(null);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, SPAWN_POLL_MS));
          continue;
        }

        if (result.kind === 'error') {
          setSpawning(false);
          setError(result.error);
          setResults(null);
          setFolders(null);
          return;
        }

        // kind === 'ok'
        setSpawning(false);
        setResults(result.results);
        setFolders(result.folders);
        setError(null);
        return;
      }
    }

    run()
      .catch(() => {
        if (cancelled || epoch !== queryEpochRef.current) return;
        setSpawning(false);
        setError('Search failed');
        setResults(null);
        setFolders(null);
      })
      .finally(() => {
        if (epoch === queryEpochRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, mode, availability, worktreePath]);

  const setQuery = useCallback((q: string, m: CodeSearchMode) => {
    setQueryRaw(q);
    setMode(m);
  }, []);

  return {
    results,
    loading,
    spawning,
    error,
    availability,
    graphAge,
    folders,
    setQuery,
  };
}
