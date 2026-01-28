'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '../ui/button';
import { DeleteSessionDialog } from './delete-session-dialog';

interface DeleteSessionButtonProps {
  sessionId: string;
  workspaceSlug: string;
  worktreePath?: string;
}

export function DeleteSessionButton({
  sessionId,
  workspaceSlug,
  worktreePath,
}: DeleteSessionButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = async () => {
    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (worktreePath) {
          params.set('worktree', worktreePath);
        }
        const url = `/api/workspaces/${workspaceSlug}/agents/${sessionId}${params.toString() ? `?${params.toString()}` : ''}`;

        const response = await fetch(url, {
          method: 'DELETE',
        });

        if (!response.ok) {
          throw new Error(`Delete failed: ${response.status}`);
        }

        // Close dialog and navigate back to agents list
        setOpen(false);
        router.push(
          `/workspaces/${workspaceSlug}/agents${worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : ''}`
        );
        router.refresh();
      } catch (error) {
        console.error('Failed to delete session:', error);
        // Keep dialog open on error
      }
    });
  };

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)} disabled={isPending}>
        <Trash2 className="mr-1.5 h-4 w-4" />
        {isPending ? 'Deleting...' : 'Delete'}
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
