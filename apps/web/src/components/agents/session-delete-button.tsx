'use client';

/**
 * SessionDeleteButton - Client component for deleting agent sessions.
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Task T012: Wire delete confirmation dialog to delete button
 *
 * Uses DeleteSessionDialog for confirmation before calling DELETE API.
 */

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/button';
import { DeleteSessionDialog } from './delete-session-dialog';

interface SessionDeleteButtonProps {
  sessionId: string;
  workspaceSlug: string;
  worktreePath?: string;
}

export function SessionDeleteButton({
  sessionId,
  workspaceSlug,
  worktreePath,
}: SessionDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const params = new URLSearchParams();
      if (worktreePath) {
        params.set('worktree', worktreePath);
      }
      const url = `/api/workspaces/${workspaceSlug}/agents/${sessionId}?${params.toString()}`;

      const response = await fetch(url, {
        method: 'DELETE',
      });

      if (response.ok) {
        setOpen(false);
        router.refresh();
      } else {
        console.error('Failed to delete session:', response.status);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isDeleting}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      <DeleteSessionDialog
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleDelete}
        sessionId={sessionId}
      />
    </>
  );
}
