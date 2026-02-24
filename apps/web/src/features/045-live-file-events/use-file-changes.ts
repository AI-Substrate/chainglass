/**
 * Plan 045: Live File Events
 *
 * Hook for subscribing to file changes matching a path pattern.
 * The "SDK For Us" one-liner API.
 *
 * Per Workshop 01: Debounce configurable (100ms default), replace/accumulate modes.
 * Per DYK #5: Replace mode drops intermediate batches; accumulate grows unbounded.
 *
 * @example
 * // Watch a specific file (for "changed externally" banner)
 * const { hasChanges } = useFileChanges('src/App.tsx');
 *
 * // Watch a directory (for tree view updates)
 * const { changes } = useFileChanges('src/components/');
 *
 * // Watch everything (for changes sidebar)
 * const { changes } = useFileChanges('*');
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFileChangeHub } from './file-change-provider';
import type { FileChange } from './file-change.types';

export interface UseFileChangesOptions {
  /** Debounce window in ms (default: 100). Set to 0 for immediate. */
  debounce?: number;
  /**
   * How to handle new changes:
   * - `'replace'` (default): New batch replaces previous changes
   * - `'accumulate'`: New changes append to existing (call clearChanges to reset)
   */
  mode?: 'accumulate' | 'replace';
}

export interface UseFileChangesReturn {
  /** Current changes matching the pattern */
  changes: FileChange[];
  /** Whether any changes have occurred since last clear */
  hasChanges: boolean;
  /** Clear accumulated changes */
  clearChanges: () => void;
}

export function useFileChanges(
  pattern: string,
  options: UseFileChangesOptions = {}
): UseFileChangesReturn {
  const { debounce = 100, mode = 'replace' } = options;
  const hub = useFileChangeHub();
  const [changes, setChanges] = useState<FileChange[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const bufferRef = useRef<FileChange[]>([]);

  useEffect(() => {
    const unsubscribe = hub.subscribe(pattern, (incoming) => {
      if (timerRef.current) clearTimeout(timerRef.current);

      // Buffer incoming changes so debounce resets don't lose prior batches
      if (mode === 'accumulate') {
        bufferRef.current.push(...incoming);
      } else {
        bufferRef.current = [...incoming];
      }

      if (debounce === 0) {
        // Capture buffer before clearing — React state updates are async
        const snapshot = bufferRef.current;
        bufferRef.current = [];
        setChanges((prev) => (mode === 'accumulate' ? [...prev, ...snapshot] : snapshot));
      } else {
        timerRef.current = setTimeout(() => {
          const snapshot = bufferRef.current;
          bufferRef.current = [];
          setChanges((prev) => (mode === 'accumulate' ? [...prev, ...snapshot] : snapshot));
        }, debounce);
      }
    });

    return () => {
      unsubscribe();
      if (timerRef.current) clearTimeout(timerRef.current);
      bufferRef.current = [];
    };
  }, [hub, pattern, debounce, mode]);

  const clearChanges = useCallback(() => setChanges([]), []);

  return {
    changes,
    hasChanges: changes.length > 0,
    clearChanges,
  };
}
