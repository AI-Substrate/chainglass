'use client';

/**
 * WorktreeSwitcher — explorer-bar dropdown that changes which worktree the file
 * browser shows, in the same tab. The terminal stays on the worktree it started
 * in (the caller keeps it there), so you can browse a worktree and come back
 * without leaving the agents running in main.
 */

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronDown, GitBranch } from 'lucide-react';
import { useState } from 'react';
import { type WorktreeItem, WorktreePicker } from './worktree-picker';

export interface WorktreeSwitcherProps {
  /** Already sorted: main first, then most recently updated. */
  worktrees: WorktreeItem[];
  currentWorktree: string;
  onSwitch: (worktreePath: string) => void;
}

export function WorktreeSwitcher({ worktrees, currentWorktree, onSwitch }: WorktreeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const current = worktrees.find((w) => w.path === currentWorktree);
  const label = current?.branch || currentWorktree.split('/').pop() || currentWorktree;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex max-w-56 items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Worktree: ${label}`}
          title="Browse another worktree's files in this tab (the terminal stays put)"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <WorktreePicker
          worktrees={worktrees}
          currentWorktree={currentWorktree}
          ordered
          onSelect={(path) => {
            setOpen(false);
            if (path !== currentWorktree) onSwitch(path);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
