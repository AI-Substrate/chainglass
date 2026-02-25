'use client';

/**
 * SDKProvider — Global React context that provides IUSDK to all client components.
 *
 * DYK-P2-01: Does NOT accept workspace data as props. Workspace data flows in
 * imperatively via setWorkspaceContext() called by SDKWorkspaceConnector.
 *
 * DYK-P2-05: bootstrapSDK() is wrapped in try/catch. On failure, a no-op stub
 * is returned so the app doesn't crash.
 *
 * Per Plan 047 Phase 2, Tasks T001 + T002.
 */

import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';

import type { IUSDK } from '@chainglass/shared/sdk';

import { MruTracker } from './mru-tracker';
import { bootstrapSDK } from './sdk-bootstrap';

type PersistFn = ((sdkSettings: Record<string, unknown>) => Promise<void>) | null;
type PersistMruFn = ((sdkMru: string[]) => Promise<void>) | null;

// No-op IUSDK stub for bootstrap failure (DYK-P2-05)
function createNoOpSDK(): IUSDK {
  const noop = () => {};
  const noopAsync = async () => {};
  return {
    commands: {
      register: () => ({ dispose: noop }),
      execute: noopAsync,
      list: () => [],
      isAvailable: () => false,
    },
    settings: {
      hydrate: noop,
      contribute: noop,
      get: () => undefined,
      set: noop,
      reset: noop,
      onChange: () => ({ dispose: noop }),
      list: () => [],
      toPersistedRecord: () => ({}),
    },
    context: {
      set: noop,
      get: () => undefined,
      evaluate: () => true,
      onChange: () => ({ dispose: noop }),
    },
    toast: {
      success: noop,
      error: noop,
      info: noop,
      warning: noop,
    },
  };
}

/** Extended context value with workspace connection method */
interface SDKContextValue {
  sdk: IUSDK;
  mru: MruTracker;
  setWorkspaceContext: (
    slug: string,
    sdkSettings: Record<string, unknown>,
    sdkMru: string[]
  ) => void;
  clearWorkspaceContext: () => void;
  persistFn: PersistFn;
  setPersistFn: (fn: PersistFn) => void;
  persistMruFn: PersistMruFn;
  setPersistMruFn: (fn: PersistMruFn) => void;
}

const SDKContext = createContext<SDKContextValue | null>(null);

interface SDKProviderProps {
  children: ReactNode;
}

export function SDKProvider({ children }: SDKProviderProps) {
  const [sdk] = useState<IUSDK>(() => {
    try {
      return bootstrapSDK();
    } catch (error) {
      console.error('[SDKProvider] Bootstrap failed, using no-op stub:', error);
      return createNoOpSDK();
    }
  });

  const workspaceSlugRef = useRef<string | null>(null);
  // FT-001: useState (not useRef) so context consumers see updated persistFn
  const [persistFn, setPersistFnState] = useState<PersistFn>(null);
  const [persistMruFn, setPersistMruFnState] = useState<PersistMruFn>(null);
  const [mru] = useState(() => new MruTracker());

  const setWorkspaceContext = useCallback(
    (slug: string, sdkSettings: Record<string, unknown>, sdkMru: string[]) => {
      workspaceSlugRef.current = slug;
      sdk.settings.hydrate(sdkSettings);
      // Hydrate MRU from workspace preferences
      for (const id of [...sdkMru].reverse()) {
        mru.recordExecution(id);
      }
    },
    [sdk, mru]
  );

  const clearWorkspaceContext = useCallback(() => {
    workspaceSlugRef.current = null;
    setPersistFnState(null);
    setPersistMruFnState(null);
  }, []);

  // Functional updater because fn is itself a function
  const setPersistFn = useCallback((fn: PersistFn) => {
    setPersistFnState(() => fn);
  }, []);

  const setPersistMruFn = useCallback((fn: PersistMruFn) => {
    setPersistMruFnState(() => fn);
  }, []);

  const contextValue: SDKContextValue = {
    sdk,
    mru,
    setWorkspaceContext,
    clearWorkspaceContext,
    persistFn,
    setPersistFn,
    persistMruFn,
    setPersistMruFn,
  };

  return <SDKContext.Provider value={contextValue}>{children}</SDKContext.Provider>;
}

/**
 * useSDK — Access the IUSDK instance from any client component.
 * Throws if called outside SDKProvider.
 */
export function useSDK(): IUSDK {
  const ctx = useContext(SDKContext);
  if (!ctx) {
    throw new Error('useSDK must be used within <SDKProvider>. Ensure SDKProvider wraps your app.');
  }
  return ctx.sdk;
}

/**
 * useSDKPersist — Internal hook for settings persistence.
 * Returns a function that persists settings for the current workspace.
 * Returns null if no workspace context is connected.
 */
export function useSDKPersist(): ((sdkSettings: Record<string, unknown>) => Promise<void>) | null {
  const ctx = useContext(SDKContext);
  if (!ctx) return null;
  // The persist function is set by SDKWorkspaceConnector
  return ctx.persistFn ?? null;
}

/**
 * useSDKMru — Access the MRU tracker from any client component.
 * Returns the MruTracker instance and a recordExecution function that also persists.
 */
export function useSDKMru(): { mru: MruTracker; recordExecution: (commandId: string) => void } {
  const ctx = useContext(SDKContext);
  if (!ctx) {
    throw new Error('useSDKMru must be used within <SDKProvider>.');
  }
  const { mru, persistMruFn } = ctx;
  const recordExecution = useCallback(
    (commandId: string) => {
      mru.recordExecution(commandId);
      persistMruFn?.(mru.toArray());
    },
    [mru, persistMruFn]
  );
  return { mru, recordExecution };
}

/**
 * useSDKInternal — Access the full context value including workspace setters.
 * For internal SDK components only (not exported from public API).
 */
export function useSDKInternal(): SDKContextValue {
  const ctx = useContext(SDKContext);
  if (!ctx) {
    throw new Error('useSDKInternal must be used within <SDKProvider>.');
  }
  return ctx;
}

// Re-export for consumers
export { SDKContext };
export type { MruTracker } from './mru-tracker';
