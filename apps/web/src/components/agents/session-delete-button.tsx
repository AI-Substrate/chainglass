'use client';

/**
 * SessionDeleteButton - Client component for deleting agents.
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per DYK-06: Client components use fetch for mutations.
 * Per Insight 4: Props renamed (sessionId → agentId), filename kept.
 *
 * Uses DeleteSessionDialog for confirmation before calling DELETE /api/agents/[id].
 */

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '../ui/button';
import { DeleteSessionDialog } from './delete-session-dialog';

interface SessionDeleteButtonProps {
  agentId: string;
  workspaceSlug: string;
}

export function SessionDeleteButton({ agentId, workspaceSlug }: SessionDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/agents/${agentId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setOpen(false);
        router.refresh();
      } else {
        console.error('Failed to delete agent:', response.status);
      }
    } catch (error) {
      console.error('Error deleting agent:', error);
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
        agentId={agentId}
      />
    </>
  );
}
