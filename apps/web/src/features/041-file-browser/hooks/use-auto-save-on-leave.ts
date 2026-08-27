'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Auto-save the open editor buffer when the user navigates away from it.
 *
 * WHY THIS EXISTS. `handleFileDoubleSelect` already saved before leaving an editor, but
 * only on the double-click-to-preview path. Every other way out of an editor —
 * picking another file in the tree, leaving the page — called `fileNav.handleSelect`
 * or unmounted, and the dirty buffer was dropped on the floor with no prompt and no
 * toast. Jordan, 2026-08-28: "if I'm in rich edit or editing a document ... and I
 * navigate off, it should auto-save."
 *
 * WHAT "NAVIGATE AWAY" MEANS HERE, and what it deliberately does not mean:
 *
 *   covered   picking a different file while the current one is dirty
 *   covered   unmounting the browser page (in-app route change)
 *   covered   the tab being hidden (`visibilitychange`) — a real save, best effort
 *   NOT       a hard tab close / crash mid-edit
 *
 * The last one is not an oversight and must not be "fixed" by adding a `beforeunload`
 * handler that calls a server action: the unload path cannot await a promise, so such a
 * handler reliably fires and reliably fails, which is worse than not having it — it
 * looks like coverage. That case belongs to the draft store (plan 087), which persists
 * on an idle debounce and so has already written before the crash.
 *
 * SAVES THE TARGET, NOT A DRAFT. Jordan chose this explicitly on 2026-08-28 over the
 * draft-only design in the original 087 ask ("won't update target until save"), the
 * reasoning being that navigating away is a deliberate act and should behave like a
 * save. Consequence, accepted at the time: an edit you did not mean to keep reaches
 * disk, and git is the undo.
 */

export interface AutoSaveOnLeaveSnapshot {
  /** The file the editor is currently bound to. */
  filePath: string;
  /** The live editor buffer. */
  content: string;
  /** Whether that buffer differs from what was read off disk. */
  isDirty: boolean;
}

export interface UseAutoSaveOnLeaveOptions {
  /**
   * The CURRENT editor state, re-read on every render. Passed as a value rather than
   * captured, because the flush runs from event handlers and cleanup functions where a
   * captured closure would hold the buffer as it was several keystrokes ago.
   */
  snapshot: AutoSaveOnLeaveSnapshot | null;
  /** The real save. Returns false when the save did not land (conflict, error). */
  save: (content: string) => Promise<boolean>;
  /** Escape hatch for tests and for disabling the behaviour wholesale. */
  enabled?: boolean;
}

/**
 * Is a flush worth attempting? Pure so the decision is testable without a DOM.
 *
 * The in-flight guard is the load-bearing one: selecting a new file fires the flush and
 * React may re-render (and re-run the visibility effect) before the save resolves, which
 * without the guard writes the same buffer twice and races two `saveFile` calls at the
 * same mtime — the second losing to a spurious conflict.
 */
export function shouldFlush(
  snapshot: AutoSaveOnLeaveSnapshot | null,
  inFlight: boolean,
  enabled: boolean
): snapshot is AutoSaveOnLeaveSnapshot {
  return enabled && !inFlight && snapshot !== null && snapshot.isDirty;
}

export function useAutoSaveOnLeave({ snapshot, save, enabled = true }: UseAutoSaveOnLeaveOptions) {
  // Refs, not deps: the flush is called from a cleanup and from a window listener, and
  // both must see the buffer as it is at that instant, not as it was when the effect ran.
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const saveRef = useRef(save);
  saveRef.current = save;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const inFlightRef = useRef(false);

  const flush = useCallback(async (): Promise<boolean> => {
    const current = snapshotRef.current;
    if (!shouldFlush(current, inFlightRef.current, enabledRef.current)) return false;
    inFlightRef.current = true;
    try {
      return await saveRef.current(current.content);
    } catch {
      // A throw here is already surfaced by the save path's own toast. Swallowing it
      // keeps a failed autosave from breaking the navigation the user actually asked
      // for — the edit stays in the buffer, which is the same place it would have been.
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  // Tab hidden — a genuine "I have gone somewhere else", and unlike unload it still has
  // a live event loop, so the save can actually complete.
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [flush]);

  // Unmount — in-app navigation away from the browser page.
  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  return { flush };
}
