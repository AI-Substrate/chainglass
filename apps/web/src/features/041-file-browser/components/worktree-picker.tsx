'use client';

/**
 * WorktreePicker — Searchable worktree selection component.
 *
 * Pure presentational (DYK-P3-04): receives worktrees as props,
 * fires onSelect callback. workspace-nav.tsx handles data fetching.
 *
 * Phase 3: UI Overhaul — Plan 041: File Browser
 */

import { Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface WorktreeItem {
  path: string;
  branch: string;
  isDetached: boolean;
}

export interface WorktreePickerProps {
  worktrees: WorktreeItem[];
  currentWorktree: string;
  starredPaths?: string[];
  onSelect: (worktreePath: string) => void;
}

export function WorktreePicker({
  worktrees,
  currentWorktree,
  starredPaths = [],
  onSelect,
}: WorktreePickerProps) {
  const [filter, setFilter] = useState('');

  const starredSet = useMemo(() => new Set(starredPaths), [starredPaths]);

  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    const matching = term
      ? worktrees.filter(
          (wt) => wt.branch.toLowerCase().includes(term) || wt.path.toLowerCase().includes(term)
        )
      : worktrees;

    // Sort: starred first, then alphabetically by branch
    return [...matching].sort((a, b) => {
      const aStarred = starredSet.has(a.path);
      const bStarred = starredSet.has(b.path);
      if (aStarred !== bStarred) return aStarred ? -1 : 1;
      return a.branch.localeCompare(b.branch);
    });
  }, [worktrees, filter, starredSet]);

  return (
    <div className="flex flex-col gap-1">
      <div className="relative">
        <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter worktrees..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full rounded-md border bg-transparent py-1.5 pl-8 pr-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {filtered.map((wt) => {
          const isSelected = wt.path === currentWorktree;
          const isStarred = starredSet.has(wt.path);

          return (
            <button
              type="button"
              key={wt.path}
              data-selected={isSelected || undefined}
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => onSelect(wt.path)}
              className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
                isSelected ? 'bg-accent font-medium' : ''
              }`}
            >
              {isStarred && <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />}
              <span className="truncate">{wt.branch}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
