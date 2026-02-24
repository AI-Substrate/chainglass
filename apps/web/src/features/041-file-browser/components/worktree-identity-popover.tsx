'use client';

/**
 * WorktreeIdentityPopover — Inline emoji + color picker for the current worktree.
 *
 * Gear icon opens a popover with EmojiPicker + ColorPicker.
 * Saves via updateWorktreePreferences server action, then router.refresh().
 *
 * Phase 5 Subtask 001: Worktree Identity & Tab Titles (DYK-ST-03)
 */

import { ColorPicker } from '@/features/041-file-browser/components/color-picker';
import { EmojiPicker } from '@/features/041-file-browser/components/emoji-picker';
import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { Settings2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { updateWorktreePreferences } from '../../../../app/actions/workspace-actions';

interface Props {
  slug: string;
  worktreePath: string;
}

export function WorktreeIdentityPopover({ slug, worktreePath }: Props) {
  const router = useRouter();
  const wsCtx = useWorkspaceContext();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click-outside-to-close (F002)
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const currentEmoji = wsCtx?.worktreeIdentity?.emoji || '';
  const currentColor = wsCtx?.worktreeIdentity?.color || '';

  const handleEmojiSelect = async (emoji: string) => {
    setOpen(false);
    const result = await updateWorktreePreferences(slug, worktreePath, { emoji });
    if (result.success) {
      toast.success('Worktree emoji updated');
      router.refresh();
    } else {
      toast.error(result.errors?._form?.[0] ?? 'Failed to update emoji');
    }
  };

  const handleColorSelect = async (color: string) => {
    setOpen(false);
    const result = await updateWorktreePreferences(slug, worktreePath, { color });
    if (result.success) {
      toast.success('Worktree color updated');
      router.refresh();
    } else {
      toast.error(result.errors?._form?.[0] ?? 'Failed to update color');
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="rounded p-1 text-muted-foreground hover:text-foreground"
        aria-label="Worktree identity settings"
      >
        <Settings2 className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border bg-popover p-4 shadow-lg">
          <div className="mb-3 text-xs font-medium text-muted-foreground">Worktree Identity</div>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Emoji</div>
              <EmojiPicker current={currentEmoji} onSelect={handleEmojiSelect} />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Color</div>
              <ColorPicker current={currentColor} onSelect={handleColorSelect} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
