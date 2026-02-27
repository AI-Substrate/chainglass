'use client';

/**
 * Plan 053 Phase 5: WorktreeStateSubtitle
 *
 * Consumer component that reads worktree state via useGlobalState
 * and renders branch name + file change count for the LeftPanel subtitle.
 *
 * Per DYK-21: Reads multi-instance paths `worktree:{slug}:*`.
 * Styled to match existing diffStatsSubtitle pattern (text-xs, text-muted-foreground).
 */

import { useGlobalState } from '@/lib/state';

interface WorktreeStateSubtitleProps {
  slug: string;
}

export function WorktreeStateSubtitle({ slug }: WorktreeStateSubtitleProps) {
  const branch = useGlobalState<string>(`worktree:${slug}:branch`, '');
  const changedFileCount = useGlobalState<number>(`worktree:${slug}:changed-file-count`, 0);

  if (!branch && !changedFileCount) return null;

  return (
    <span className="text-xs flex items-center gap-1.5">
      {branch && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{branch}</span>
        </>
      )}
      {changedFileCount !== undefined && changedFileCount > 0 && (
        <>
          <span className="text-muted-foreground">·</span>
          <span className="text-amber-500">{changedFileCount} unsaved</span>
        </>
      )}
    </span>
  );
}
