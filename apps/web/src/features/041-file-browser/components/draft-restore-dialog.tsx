'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { PendingDraft } from '@/features/041-file-browser/hooks/use-file-navigation';

export interface DraftRestoreDialogProps {
  pending: PendingDraft | null;
  onRestore: () => void;
  onDiscard: () => void;
}

/**
 * Offers a recovered autosave draft back to the user.
 *
 * WHEN THIS APPEARS, which is rarely and by design. Navigating away from a dirty editor
 * writes the real file and clears the draft, so a draft can only survive a session that
 * ended WITHOUT leaving — a crash or a hard tab close. Seeing this dialog means the
 * previous session died mid-edit.
 *
 * RESTORE NEVER WRITES THE TARGET. It loads the draft into the editor and marks it dirty;
 * the next explicit save runs the existing mtime guard against the live disk mtime, so a
 * restore on top of an external edit surfaces the normal conflict dialog rather than
 * silently clobbering (AC-6). That is why this can be a two-button choice instead of a
 * three-way merge.
 *
 * The `editorMtime` advisory below fires when the file changed on disk after the draft was
 * written — the user is choosing between two real edits, and should know it.
 *
 * Not dismissible by overlay or Escape: the choice gates the edit surface, and a stray
 * click that silently kept the disk copy would look identical to a crash that ate the work.
 *
 * Plan 087: Auto-save Editing — AC-4, AC-6, AC-7
 */
export function DraftRestoreDialog({ pending, onRestore, onDiscard }: DraftRestoreDialogProps) {
  if (pending === null) return null;

  const { draft, diskMtime } = pending;
  const diskChangedSinceDraft = draft.editorMtime !== diskMtime;
  const savedAt = new Date(draft.savedAt);
  const savedAtLabel = Number.isNaN(savedAt.getTime())
    ? 'an earlier session'
    : savedAt.toLocaleString();

  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Unsaved changes recovered</DialogTitle>
          <DialogDescription>
            {`An autosaved draft of "${draft.filePath}" from ${savedAtLabel} does not match what is on disk. It was saved automatically while you were editing, but never saved to the file.`}
          </DialogDescription>
        </DialogHeader>

        {diskChangedSinceDraft ? (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            Heads up: the file also changed on disk after this draft was written. Restoring keeps
            the draft in the editor only — you will be warned again if the file has moved on when
            you save.
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onDiscard}>
            Discard draft
          </Button>
          <Button onClick={onRestore}>Restore draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
