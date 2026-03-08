'use client';

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

export interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  itemType: 'file' | 'directory';
  onConfirm: () => void;
  /** When set, shows a "too large" message instead of the normal prompt */
  tooLargeCount?: number;
}

/**
 * VS Code-style delete confirmation dialog.
 *
 * - Files: "Delete 'name'?"
 * - Folders: "Delete 'name' and all its contents?"
 * - Too-large folders: shows item count error instead
 *
 * Plan 068 Phase 2
 */
export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  itemName,
  itemType,
  onConfirm,
  tooLargeCount,
}: DeleteConfirmationDialogProps) {
  if (tooLargeCount !== undefined) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot Delete</DialogTitle>
            <DialogDescription>
              Folder has too many items ({tooLargeCount.toLocaleString()}) to delete from the
              browser.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {itemType === 'directory' ? 'Folder' : 'File'}</DialogTitle>
          <DialogDescription>
            {itemType === 'directory'
              ? `Delete "${itemName}" and all its contents?`
              : `Delete "${itemName}"?`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
