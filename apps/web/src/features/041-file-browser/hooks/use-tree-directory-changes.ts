/**
 * Plan 045: Live File Events — Phase 3 (T001)
 *
 * Hook that watches all file changes and filters to expanded directories.
 * Uses a single useFileChanges('*') subscription to avoid Rules of Hooks
 * violations (DYK #1: cannot call hooks in a loop).
 *
 * Lives in file-browser domain (consumer), imports from events domain (provider).
 */
'use client';

import { useFileChanges } from '@/features/045-live-file-events';
import type { FileChange } from '@/features/045-live-file-events';
import { useMemo } from 'react';

export interface UseTreeDirectoryChangesReturn {
  /** All file changes matching expanded directories */
  changes: FileChange[];
  /** Set of expanded directory paths that have changes */
  changedDirs: Set<string>;
  /** Paths that were added (eventType 'add' or 'addDir') */
  newPaths: Set<string>;
  /** Paths that were removed (eventType 'unlink' or 'unlinkDir') */
  removedPaths: Set<string>;
  /** Whether any expanded directory has changes */
  hasChanges: boolean;
  /** Clear all tracked changes */
  clearAll: () => void;
}

/**
 * Watch file changes in expanded directories.
 *
 * @param expandedDirs - Currently expanded directory paths
 * @returns Changes filtered to expanded dirs with derived sets
 */
export function useTreeDirectoryChanges(expandedDirs: string[]): UseTreeDirectoryChangesReturn {
  // Single subscription for all file changes (DYK #1)
  const { changes, clearChanges } = useFileChanges('*', {
    debounce: 200,
    mode: 'replace',
  });

  // Filter changes to only those in expanded directories (direct children)
  const { filtered, changedDirs, newPaths, removedPaths } = useMemo(() => {
    const dirs = new Set<string>();
    const added = new Set<string>();
    const removed = new Set<string>();
    const matching: FileChange[] = [];

    for (const change of changes) {
      for (const dir of expandedDirs) {
        const prefix = dir === '' ? '' : `${dir}/`;
        if (change.path.startsWith(prefix)) {
          const rest = change.path.slice(prefix.length);
          // Direct child: no further slashes
          if (!rest.includes('/')) {
            matching.push(change);
            dirs.add(dir);
            if (change.eventType === 'add' || change.eventType === 'addDir') {
              added.add(change.path);
            }
            if (change.eventType === 'unlink' || change.eventType === 'unlinkDir') {
              removed.add(change.path);
            }
          }
        }
      }
    }

    return { filtered: matching, changedDirs: dirs, newPaths: added, removedPaths: removed };
  }, [changes, expandedDirs]);

  return {
    changes: filtered,
    changedDirs,
    newPaths,
    removedPaths,
    hasChanges: filtered.length > 0,
    clearAll: clearChanges,
  };
}
