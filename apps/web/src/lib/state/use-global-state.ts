'use client';

/**
 * Plan 053: GlobalStateSystem — useGlobalState Hook
 *
 * Single-value subscription hook for reading state from GlobalStateSystem.
 * Uses useSyncExternalStore for concurrent-safe subscriptions.
 *
 * Per DYK-16: Default value pinned with useRef to prevent infinite re-renders.
 * Per DYK-19: subscribe and getSnapshot wrapped in useCallback for stable identity.
 * Per Workshop 002: Returns T (read-only), not a tuple. Consumers never write.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';

import { useStateSystem } from './state-provider';

/**
 * Read a single state value by path. Re-renders when the value changes.
 *
 * @param path - State path (e.g., 'workflow:wf-1:status')
 * @param defaultValue - Value returned when no state is published at the path
 * @returns Current value at path, or defaultValue if not published
 *
 * @example
 * const status = useGlobalState<string>('workflow:wf-1:status', 'idle');
 */
export function useGlobalState<T>(path: string, defaultValue?: T): T | undefined {
  const system = useStateSystem();
  const pinnedDefault = useRef(defaultValue).current;

  const subscribe = useCallback(
    (onStoreChange: () => void) => system.subscribe(path, onStoreChange),
    [system, path]
  );

  const getSnapshot = useCallback(
    () => system.get<T>(path) ?? pinnedDefault,
    [system, path, pinnedDefault]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
