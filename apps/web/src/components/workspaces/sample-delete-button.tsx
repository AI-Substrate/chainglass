'use client';

/**
 * SampleDeleteButton - Button with confirmation for deleting samples.
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Uses Server Actions with confirmation dialog.
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ActionState, deleteSample } from '../../../app/actions/workspace-actions';

interface SampleDeleteButtonProps {
  sampleSlug: string;
  sampleName: string;
  workspaceSlug: string;
  worktreePath: string;
}

const initialState: ActionState = {
  success: false,
};

function DeleteButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? 'Deleting...' : 'Delete Sample'}
    </Button>
  );
}

export function SampleDeleteButton({
  sampleSlug,
  sampleName,
  workspaceSlug,
  worktreePath,
}: SampleDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(deleteSample, initialState);

  // Close dialog on success
  if (state.success && open) {
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Delete {sampleName}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Sample</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{sampleName}</strong>? This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <input type="hidden" name="sampleSlug" value={sampleSlug} />
          <input type="hidden" name="workspaceSlug" value={workspaceSlug} />
          <input type="hidden" name="worktreePath" value={worktreePath} />

          {state.errors?._form && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {state.errors._form.map((error, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Error messages have no unique ID
                <p key={i}>{error}</p>
              ))}
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <DeleteButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
