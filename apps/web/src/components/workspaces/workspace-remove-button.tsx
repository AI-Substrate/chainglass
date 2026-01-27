'use client';

/**
 * WorkspaceRemoveButton - Button with confirmation for removing workspaces.
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
import { type ActionState, removeWorkspace } from '../../../app/actions/workspace-actions';

interface WorkspaceRemoveButtonProps {
  slug: string;
  name: string;
}

const initialState: ActionState = {
  success: false,
};

function RemoveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? 'Removing...' : 'Remove Workspace'}
    </Button>
  );
}

export function WorkspaceRemoveButton({ slug, name }: WorkspaceRemoveButtonProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(removeWorkspace, initialState);

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
          <span className="sr-only">Remove {name}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Workspace</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{name}</strong>? This will unregister the
            workspace but will not delete any files.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction}>
          <input type="hidden" name="slug" value={slug} />

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
            <RemoveButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
