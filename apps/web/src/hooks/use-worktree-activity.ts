'use client';

/**
 * useWorktreeActivity — Cross-worktree activity polling hook.
 *
 * Polls GET /api/worktree-activity every 30s with known worktree paths
 * (DYK-P4-03: client passes paths to avoid server re-enumeration).
 *
 * Accepts optional excludeWorktree to filter out the current worktree
 * (DYK-P4-04: null = show all, e.g. on workspace root pages).
 *
 * Plan 059 Phase 4 — T002
 */

import { useQuery } from '@tanstack/react-query';

const WORKTREE_ACTIVITY_KEY = 'worktree-activity';
const POLL_INTERVAL_MS = 30_000;

export interface WorktreeActivity {
  worktreePath: string;
  hasQuestions: boolean;
  hasErrors: boolean;
  hasWorking: boolean;
  agentCount: number;
}

interface UseWorktreeActivityOptions {
  /** All known worktree paths to query. */
  worktreePaths: string[];
  /** Worktree path to exclude from results (null = show all). */
  excludeWorktree?: string | null;
}

interface UseWorktreeActivityReturn {
  activities: WorktreeActivity[];
  isLoading: boolean;
}

export function useWorktreeActivity({
  worktreePaths,
  excludeWorktree,
}: UseWorktreeActivityOptions): UseWorktreeActivityReturn {
  const { data, isLoading } = useQuery<{ activities: WorktreeActivity[] }>({
    queryKey: [WORKTREE_ACTIVITY_KEY, ...worktreePaths],
    queryFn: async () => {
      if (worktreePaths.length === 0) {
        return { activities: [] };
      }
      const params = new URLSearchParams();
      params.set('paths', worktreePaths.join(','));
      const response = await fetch(`/api/worktree-activity?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch worktree activity: ${response.statusText}`);
      }
      return response.json();
    },
    refetchInterval: POLL_INTERVAL_MS,
    enabled: worktreePaths.length > 0,
  });

  const allActivities = data?.activities ?? [];

  const activities = excludeWorktree
    ? allActivities.filter((a) => a.worktreePath !== excludeWorktree)
    : allActivities;

  return { activities, isLoading };
}
