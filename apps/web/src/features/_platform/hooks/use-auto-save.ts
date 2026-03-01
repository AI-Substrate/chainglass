'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
  /** Debounce delay in ms. 0 = immediate. Default: 500. */
  delay?: number;
  /** Callback invoked on successful save. */
  onSaved?: () => void;
}

interface UseAutoSaveReturn {
  status: AutoSaveStatus;
  error: string | null;
  /** Trigger a save with the given value. Debounced by delay. */
  trigger: (value: string) => void;
  /** Force immediate save (bypasses debounce). */
  flush: () => void;
}

/**
 * Reusable auto-save hook with debounce and status tracking.
 *
 * Returns a trigger function that debounces calls to saveFn.
 * Status transitions: idle → saving → saved (or error).
 * "saved" auto-clears back to "idle" after 2s.
 *
 * Plan 058, Phase 2, DYK #3.
 */
export function useAutoSave(
  saveFn: (value: string) => Promise<{ errors: Array<{ message: string }> }>,
  options: UseAutoSaveOptions = {}
): UseAutoSaveReturn {
  const { delay = 500, onSaved } = options;

  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<string | null>(null);
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const doSave = useCallback(async (value: string) => {
    setStatus('saving');
    setError(null);
    try {
      const result = await saveFnRef.current(value);
      if (result.errors.length > 0) {
        setStatus('error');
        setError(result.errors[0].message);
      } else {
        setStatus('saved');
        onSavedRef.current?.();
        // Auto-clear "saved" status after 2s
        savedTimerRef.current = setTimeout(() => setStatus('idle'), 2000);
      }
    } catch (err) {
      setStatus('error');
      setError(String(err));
    }
  }, []);

  const trigger = useCallback(
    (value: string) => {
      pendingValueRef.current = value;
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
        savedTimerRef.current = null;
      }
      if (timerRef.current) clearTimeout(timerRef.current);

      if (delay === 0) {
        doSave(value);
      } else {
        timerRef.current = setTimeout(() => {
          if (pendingValueRef.current !== null) {
            doSave(pendingValueRef.current);
            pendingValueRef.current = null;
          }
        }, delay);
      }
    },
    [delay, doSave]
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingValueRef.current !== null) {
      doSave(pendingValueRef.current);
      pendingValueRef.current = null;
    }
  }, [doSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  return { status, error, trigger, flush };
}
