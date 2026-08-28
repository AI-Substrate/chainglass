'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useAutoSave } from '@/features/_platform/hooks/use-auto-save';

/**
 * Idle-debounced autosave of the open editor buffer to its DRAFT — never the target.
 *
 * This is the crash-protection half of plan 087. The other half already shipped:
 * `useAutoSaveOnLeave` writes the real file when the user leaves it. The split is
 * deliberate and was Jordan's call on 2026-08-28 — leaving is a deliberate act and
 * behaves like a save; pausing mid-sentence is not, and must not put a half-finished
 * thought on disk.
 *
 * WHY THIS CANNOT USE `flush()` ON A FILE SWITCH, and why `cancel()` exists.
 * The leave path writes the target and then deletes the draft. A draft-debounce still
 * pending at that moment would fire AFTER the delete and write the draft back —
 * an orphan that offers a spurious "restore?" prompt on the next load, which is exactly
 * the "reopen, no prompt" behaviour the navigate-away design promises. `flush()` is worse
 * than useless here: it writes the very draft that is about to be deleted. So the hook
 * exposes `cancel`, and the caller cancels before the leave-save.
 *
 * AC-10 (no cross-file leak): the target path is captured in a ref at TRIGGER time, not
 * read at fire time, and any pending write is cancelled when `filePath` changes. Without
 * both, a debounce armed while editing file A can land under file B's path.
 *
 * Plan 087: Auto-save Editing — AC-1, AC-9, AC-10
 */

/** Idle time after the last keystroke before the draft is written. */
const DRAFT_DEBOUNCE_MS = 1000;

export interface UseDraftAutoSaveOptions {
  slug: string;
  worktreePath: string;
  /** Worktree-relative path of the file being edited, or null when none is open. */
  filePath: string | null;
  /** Current editor buffer. */
  content: string;
  /** Whether the buffer differs from what is on disk. */
  isDirty: boolean;
  /** Disk mtime at load — stored on the draft so a restore can warn about drift. */
  editorMtime: string | null;
  /**
   * False for binary and oversized files (AC-9) and whenever no editable file is open.
   * A disabled hook never triggers and never writes.
   */
  enabled: boolean;
  saveDraft: (
    slug: string,
    worktreePath: string,
    filePath: string,
    content: string,
    editorMtime: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function useDraftAutoSave({
  slug,
  worktreePath,
  filePath,
  content,
  isDirty,
  editorMtime,
  enabled,
  saveDraft,
}: UseDraftAutoSaveOptions) {
  // Captured at trigger time. Reading `filePath` inside saveFn would read whatever file is
  // open when the timer fires, which is the cross-file leak AC-10 forbids.
  const armedPathRef = useRef<string | null>(null);
  const armedMtimeRef = useRef<string>('');

  const saveFn = useCallback(
    async (value: string) => {
      const target = armedPathRef.current;
      if (target === null) return { errors: [] };
      const result = await saveDraft(slug, worktreePath, target, value, armedMtimeRef.current);
      return result.ok ? { errors: [] } : { errors: [{ message: result.error }] };
    },
    [slug, worktreePath, saveDraft]
  );

  const autoSave = useAutoSave(saveFn, { delay: DRAFT_DEBOUNCE_MS });
  const { trigger, cancel } = autoSave;

  // Switching files drops any pending write for the file being left. Declared before the
  // trigger effect so it runs first on a render where both fire.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset on path change only
  useEffect(() => {
    cancel();
    armedPathRef.current = null;
  }, [filePath, cancel]);

  useEffect(() => {
    if (!enabled || !isDirty || filePath === null) return;
    armedPathRef.current = filePath;
    armedMtimeRef.current = editorMtime ?? '';
    trigger(content);
  }, [enabled, isDirty, filePath, content, editorMtime, trigger]);

  return {
    status: autoSave.status,
    error: autoSave.error,
    /** Drop the pending draft write. Call before a save that writes the target. */
    cancel,
  };
}
