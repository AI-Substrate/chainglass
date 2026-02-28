'use client';

/**
 * Plan 056: useStateChangeLog Hook
 *
 * Reads state change history from StateChangeLogContext.
 * Uses useSyncExternalStore with the log's own subscribe/version (DYK-32).
 * Does NOT subscribe to GlobalStateSystem '*' pattern (DYK-17).
 *
 * Caches getEntries result by version to prevent infinite re-renders
 * (getEntries returns a new array on each call when pattern/limit are used).
 */

import { useCallback, useContext, useRef, useSyncExternalStore } from 'react';

import { StateChangeLogContext } from '@/lib/state';
import type { StateChange } from '@chainglass/shared/state';

const EMPTY: StateChange[] = [];

/**
 * Read state change history from the StateChangeLog.
 *
 * @param pattern - Optional path pattern to filter entries (e.g., 'worktree:**')
 * @param limit - Optional max number of entries to return (most recent)
 * @returns Array of StateChange entries, re-renders when log updates
 */
export function useStateChangeLog(pattern?: string, limit?: number): StateChange[] {
  const log = useContext(StateChangeLogContext);
  const cacheRef = useRef<{
    version: number;
    pattern?: string;
    limit?: number;
    result: StateChange[];
  }>({
    version: -1,
    result: EMPTY,
  });

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!log) return () => {};
      return log.subscribe(onStoreChange);
    },
    [log]
  );

  const getSnapshot = useCallback(() => {
    if (!log) return EMPTY;
    const cache = cacheRef.current;
    if (cache.version === log.version && cache.pattern === pattern && cache.limit === limit) {
      return cache.result;
    }
    const result = log.getEntries(pattern, limit);
    cacheRef.current = { version: log.version, pattern, limit, result };
    return result;
  }, [log, pattern, limit]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
