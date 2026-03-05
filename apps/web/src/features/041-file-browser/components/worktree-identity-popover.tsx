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
import { Monitor, Moon, Settings2, Sun } from 'lucide-react';
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
  const currentTerminalTheme = wsCtx?.worktreeIdentity?.terminalTheme || 'dark';

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

  const handleTerminalThemeSelect = async (theme: 'dark' | 'light' | 'system') => {
    const result = await updateWorktreePreferences(slug, worktreePath, { terminalTheme: theme });
    if (result.success) {
      toast.success('Terminal theme updated');
      router.refresh();
    } else {
      toast.error(result.errors?._form?.[0] ?? 'Failed to update terminal theme');
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
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Terminal Theme</div>
              <div className="flex gap-1">
                {(
                  [
                    { value: 'dark', icon: Moon, label: 'Dark' },
                    { value: 'light', icon: Sun, label: 'Light' },
                    { value: 'system', icon: Monitor, label: 'System' },
                  ] as const
                ).map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleTerminalThemeSelect(value)}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                      currentTerminalTheme === value
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                    title={label}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
