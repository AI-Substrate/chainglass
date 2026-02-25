'use client';

/**
 * useSDKContext — Set a context key on mount, clear on unmount.
 *
 * Used by domain components to declare state to the SDK (e.g., "file is open").
 * Commands and shortcuts can then use when-clauses to check availability.
 *
 * DYK-P2-03: In React strict mode (dev only), useEffect double-fires:
 * set → clear → set. This briefly clears the context key between runs.
 * This is expected React behavior and does NOT occur in production.
 *
 * Per Plan 047 Phase 2, Task T004. Per Workshop 001 §6.3.
 */

import { useEffect } from 'react';

import { useSDK } from './sdk-provider';

export function useSDKContext(key: string, value: unknown): void {
  const sdk = useSDK();

  useEffect(() => {
    sdk.context.set(key, value);
    return () => {
      sdk.context.set(key, undefined);
    };
  }, [sdk, key, value]);
}
