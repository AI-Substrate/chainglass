'use client';

/**
 * useSDKSetting — Subscribe to an SDK setting with auto re-render on change.
 *
 * Uses useSyncExternalStore for concurrent-safe reads.
 * DYK-02: Relies on SettingsStore.get() returning stable references.
 *
 * Per Plan 047 Phase 2, Task T003. Per Workshop 001 §6.2.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { useSDK } from './sdk-provider';
import { useSDKInternal } from './sdk-provider';

// DYK-P5-04: Shared debounce timer across all settings — prevents concurrent persist races
// FT-006: Scoped via ref so cleanup is possible
const PERSIST_DEBOUNCE_MS = 300;

export function useSDKSetting<T>(key: string): [T, (value: T) => Promise<void>] {
  const sdk = useSDK();
  const { persistFn } = useSDKInternal();
  const persistFnRef = useRef(persistFn);
  persistFnRef.current = persistFn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const { dispose } = sdk.settings.onChange(key, onStoreChange);
      return dispose;
    },
    [sdk, key]
  );

  const getSnapshot = useCallback(() => sdk.settings.get(key) as T, [sdk, key]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setValue = useCallback(
    async (newValue: T) => {
      sdk.settings.set(key, newValue);
      // DYK-P5-04: Debounce persistence to prevent concurrent write races
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const fn = persistFnRef.current;
        if (fn) {
          const record = sdk.settings.toPersistedRecord();
          fn(record);
        }
        timerRef.current = null;
      }, PERSIST_DEBOUNCE_MS);
    },
    [sdk, key]
  );

  return [value, setValue];
}
