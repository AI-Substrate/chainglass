'use client';

/**
 * useUndoRedo — React hook wrapping UndoRedoManager for workflow editor.
 *
 * Provides snapshot capture, undo/redo actions, and stack depth for UI.
 * Integrates with server actions for disk persistence on restore.
 *
 * Phase 5: Q&A + Node Properties Modal + Undo/Redo — Plan 050
 */

import { useCallback, useRef, useState } from 'react';
import { UndoRedoManager } from '../lib/undo-redo-manager';
import type { WorkflowSnapshot } from '../types';

export interface UseUndoRedoOptions {
  onRestore: (snapshot: WorkflowSnapshot) => Promise<void>;
}

export function useUndoRedo({ onRestore }: UseUndoRedoOptions) {
  const managerRef = useRef(new UndoRedoManager());
  const [undoDepth, setUndoDepth] = useState(0);
  const [redoDepth, setRedoDepth] = useState(0);

  const syncDepths = useCallback(() => {
    setUndoDepth(managerRef.current.undoDepth);
    setRedoDepth(managerRef.current.redoDepth);
  }, []);

  const snapshot = useCallback(
    (state: WorkflowSnapshot) => {
      managerRef.current.snapshot(state);
      syncDepths();
    },
    [syncDepths]
  );

  const undo = useCallback(
    async (current: WorkflowSnapshot) => {
      const mgr = managerRef.current;
      const previous = mgr.undo(current);
      if (!previous) return;
      try {
        await onRestore(previous);
        syncDepths();
      } catch {
        // Restore failed — rollback: re-push previous to undo, pop current from redo
        mgr.snapshot(previous);
        mgr.undo(current); // discard the re-pushed one
        syncDepths();
      }
    },
    [onRestore, syncDepths]
  );

  const redo = useCallback(
    async (current: WorkflowSnapshot) => {
      const mgr = managerRef.current;
      const next = mgr.redo(current);
      if (!next) return;
      try {
        await onRestore(next);
        syncDepths();
      } catch {
        // Restore failed — rollback: undo to get back
        mgr.undo(next);
        syncDepths();
      }
    },
    [onRestore, syncDepths]
  );

  const invalidate = useCallback(() => {
    managerRef.current.invalidate();
    syncDepths();
  }, [syncDepths]);

  return {
    snapshot,
    undo,
    redo,
    invalidate,
    undoDepth,
    redoDepth,
    canUndo: undoDepth > 0,
    canRedo: redoDepth > 0,
  };
}
