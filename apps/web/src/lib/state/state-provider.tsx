'use client';

/**
 * Plan 053: GlobalStateSystem — React Provider
 * Plan 056: Added StateChangeLog accumulation from boot.
 *
 * Creates GlobalStateSystem once per app mount and provides it via context.
 * Follows SDKProvider pattern (createContext → useState initializer → useContext with throw).
 *
 * Per DYK-18: No try/catch — let errors propagate (AC-31 dropped).
 * Per DYK-20: StateContext exported for test injection.
 * Per DYK-31: StateChangeLog lives in _platform/state domain.
 * Per DYK-32: Log has own subscribe/version for useSyncExternalStore.
 */

import { type ReactNode, createContext, useContext, useState } from 'react';

import type { IStateService } from '@chainglass/shared/state';
import { GlobalStateSystem } from './global-state-system';
import { StateChangeLog } from './state-change-log';

/**
 * Exported for test injection — wrap tests with
 * `<StateContext.Provider value={fake}>` to inject FakeGlobalStateSystem.
 */
export const StateContext = createContext<IStateService | null>(null);

/**
 * Exported for test injection and dev-tools consumption.
 * StateChangeLog accumulates all state changes from boot.
 */
export const StateChangeLogContext = createContext<StateChangeLog | null>(null);

interface GlobalStateProviderProps {
  children: ReactNode;
}

/**
 * App-level provider that creates a single GlobalStateSystem instance
 * and a StateChangeLog that captures all state changes from boot.
 *
 * Per AC-30: System created once via useState initializer.
 * Per AC-26: Log mounted and subscribed synchronously at first render.
 */
export function GlobalStateProvider({ children }: GlobalStateProviderProps) {
  const [{ system, log }] = useState(() => {
    const s = new GlobalStateSystem();
    const l = new StateChangeLog();
    s.subscribe('*', (change) => l.append(change));
    return { system: s, log: l };
  });

  return (
    <StateContext.Provider value={system}>
      <StateChangeLogContext.Provider value={log}>{children}</StateChangeLogContext.Provider>
    </StateContext.Provider>
  );
}

/**
 * Access the IStateService from context.
 * Throws if used outside GlobalStateProvider (AC-32).
 */
export function useStateSystem(): IStateService {
  const ctx = useContext(StateContext);
  if (!ctx) {
    throw new Error(
      'useStateSystem must be used within <GlobalStateProvider>. Ensure GlobalStateProvider wraps your app.'
    );
  }
  return ctx;
}
