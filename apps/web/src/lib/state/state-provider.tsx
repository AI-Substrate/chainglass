'use client';

/**
 * Plan 053: GlobalStateSystem — React Provider
 *
 * Creates GlobalStateSystem once per app mount and provides it via context.
 * Follows SDKProvider pattern (createContext → useState initializer → useContext with throw).
 *
 * Per DYK-18: No try/catch — let errors propagate (AC-31 dropped).
 * Per DYK-20: StateContext exported for test injection.
 */

import { type ReactNode, createContext, useContext, useState } from 'react';

import type { IStateService } from '@chainglass/shared/state';
import { GlobalStateSystem } from './global-state-system';

/**
 * Exported for test injection — wrap tests with
 * `<StateContext.Provider value={fake}>` to inject FakeGlobalStateSystem.
 */
export const StateContext = createContext<IStateService | null>(null);

interface GlobalStateProviderProps {
  children: ReactNode;
}

/**
 * App-level provider that creates a single GlobalStateSystem instance.
 * Mount in providers.tsx after SDKProvider.
 *
 * Per AC-30: System created once via useState initializer.
 */
export function GlobalStateProvider({ children }: GlobalStateProviderProps) {
  const [system] = useState(() => new GlobalStateSystem());

  return <StateContext.Provider value={system}>{children}</StateContext.Provider>;
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
