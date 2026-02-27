'use client';

/**
 * Plan 053: GlobalStateSystem — useGlobalStateList Hook
 *
 * Multi-value pattern subscription hook for reading state entries.
 * Uses useSyncExternalStore for concurrent-safe subscriptions.
 *
 * Per DYK-17: Subscribe with the actual pattern, not '*'.
 * Per DYK-19: subscribe and getSnapshot wrapped in useCallback.
 * list() already returns stable array refs (Phase 3 cache).
 */

import { useCallback, useSyncExternalStore } from 'react';

import type { StateEntry } from '@chainglass/shared/state';
import { useStateSystem } from './state-provider';

const EMPTY: StateEntry[] = [];

/**
 * Read all state entries matching a pattern. Re-renders when any matching value changes.
 *
 * @param pattern - Pattern to match (e.g., 'workflow:**', 'workflow:*:status')
 * @returns Array of matching StateEntry objects (stable ref when unchanged)
 *
 * @example
 * const entries = useGlobalStateList('workflow:*:status');
 */
export function useGlobalStateList(pattern: string): StateEntry[] {
  const system = useStateSystem();

  const subscribe = useCallback(
    (onStoreChange: () => void) => system.subscribe(pattern, onStoreChange),
    [system, pattern]
  );

  const getSnapshot = useCallback(() => system.list(pattern) ?? EMPTY, [system, pattern]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
