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
import { compareWorktreeBranches } from '../../../lib/sort-worktrees';

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
  onToggleStar?: (worktreePath: string, starred: boolean) => void;
}

export function WorktreePicker({
  worktrees,
  currentWorktree,
  starredPaths = [],
  onSelect,
  onToggleStar,
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

    // Sort: starred first, then by descending numeric prefix
    return [...matching].sort((a, b) => {
      const aStarred = starredSet.has(a.path);
      const bStarred = starredSet.has(b.path);
      if (aStarred !== bStarred) return aStarred ? -1 : 1;
      return compareWorktreeBranches(a.branch, b.branch);
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
            <div
              key={wt.path}
              className={`flex items-center gap-1 rounded-md transition-colors hover:bg-accent ${
                isSelected ? 'bg-accent font-medium' : ''
              }`}
            >
              {onToggleStar && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(wt.path, !isStarred);
                  }}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:text-yellow-500"
                  aria-label={isStarred ? `Unstar ${wt.branch}` : `Star ${wt.branch}`}
                >
                  <Star
                    className={`h-3 w-3 ${isStarred ? 'fill-yellow-500 text-yellow-500' : ''}`}
                  />
                </button>
              )}
              {!onToggleStar && isStarred && (
                <Star className="ml-2 h-3 w-3 shrink-0 fill-yellow-500 text-yellow-500" />
              )}
              <button
                type="button"
                data-selected={isSelected || undefined}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(wt.path)}
                className="flex-1 truncate px-2 py-1.5 text-left text-sm"
              >
                {wt.branch}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
