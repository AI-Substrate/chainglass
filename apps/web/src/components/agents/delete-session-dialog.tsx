'use client';

/**
 * DeleteSessionDialog - Confirmation dialog for deleting agents.
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per Insight 4: Props renamed (sessionId → agentId), text updated, filename kept.
 */

import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface DeleteSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  agentId: string;
}

export function DeleteSessionDialog({
  open,
  onOpenChange,
  onConfirm,
  agentId,
}: DeleteSessionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Agent</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete agent{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{agentId}</code>?
            <br />
            <br />
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
