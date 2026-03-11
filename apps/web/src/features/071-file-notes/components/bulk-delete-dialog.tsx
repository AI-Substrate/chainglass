'use client';

/**
 * BulkDeleteDialog — Type-to-confirm dialog requiring "YEES" for note deletion.
 *
 * Supports two scopes:
 * - 'file': delete all notes for a specific file
 * - 'all': delete all notes in the worktree
 *
 * Plan 071: PR View & File Notes — Phase 2, T007
 */

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const CONFIRMATION_WORD = 'YEES';

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: 'file' | 'all';
  /** Only when scope === 'file' */
  fileName?: string;
  noteCount: number;
  onConfirm: () => void;
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  scope,
  fileName,
  noteCount,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [confirmation, setConfirmation] = useState('');
  const isConfirmed = confirmation === CONFIRMATION_WORD;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (v: boolean) => {
    setConfirmation('');
    onOpenChange(v);
  };

  // Focus confirmation input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete {scope === 'all' ? 'All Notes' : `Notes for ${fileName}`}
          </DialogTitle>
          <DialogDescription>
            This will permanently delete {noteCount} note{noteCount !== 1 ? 's' : ''}
            {scope === 'file' ? ` for ${fileName}` : ' in this worktree'}. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label htmlFor="bulk-delete-confirm" className="text-sm font-medium">
            Type <code className="px-1 py-0.5 rounded bg-muted font-mono">{CONFIRMATION_WORD}</code>{' '}
            to confirm:
          </label>
          <input
            id="bulk-delete-confirm"
            ref={inputRef}
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRMATION_WORD}
            className="w-full rounded-md border px-3 py-2 text-sm
                       focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!isConfirmed}
            onClick={() => {
              onConfirm();
              handleOpenChange(false);
            }}
          >
            Delete {scope === 'all' ? 'All' : 'File'} Notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
