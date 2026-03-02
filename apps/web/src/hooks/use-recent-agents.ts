'use client';

/**
 * Plan 059 Phase 3: useRecentAgents — Agent list for chip bar
 *
 * Sources agent list from useAgentManager (REST-backed, full state on mount)
 * and applies recency + priority rules for chip bar display.
 *
 * DYK-P3-01: REST for "who exists", SSE for live updates.
 * Agents run overnight unattended — page load must show full picture.
 *
 * Priority sort: waiting_input → error → working → idle → completed
 * Recency: agents with lastActivityAt > 24h ago and non-protected status are hidden.
 *
 * Test Doc:
 * - Why: Provide sorted, filtered agent list for chip bar display
 * - Contract: useRecentAgents(workspace) → { agents, dismiss, isLoading }
 * - Usage Notes: Wraps useAgentManager; adds priority sort + recency filter + dismiss
 * - Quality Contribution: Correct chip bar ordering and stale entry hiding
 * - Worked Example: 5 agents → sorted by priority → stale idle hidden → 3 shown
 */

import {
  type AgentData,
  useAgentManager,
} from '@/features/019-agent-manager-refactor/useAgentManager';
import { STORAGE_KEYS, readStorage, writeStorage } from '@/lib/agents/constants';
import { useCallback, useMemo, useState } from 'react';

export interface RecentAgent extends AgentData {
  /** Priority rank for sorting (lower = more urgent) */
  priority: number;
}

export interface UseRecentAgentsReturn {
  /** Sorted, filtered agents for display */
  agents: RecentAgent[];
  /** Loading state from REST fetch */
  isLoading: boolean;
  /** Dismiss an agent from the chip bar (persists in localStorage) */
  dismiss: (agentId: string) => void;
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Priority values — lower = more urgent, shown first */
const STATUS_PRIORITY: Record<string, number> = {
  waiting_input: 0,
  error: 1,
  working: 2,
  idle: 3,
  stopped: 3,
  completed: 4,
};

/** Statuses that never get auto-hidden by recency */
const PROTECTED_STATUSES = new Set(['working', 'waiting_input']);

/**
 * Hook providing sorted, filtered agent list for the chip bar.
 *
 * @param workspace - Current workspace slug to filter agents
 * @param worktreeSlug - Worktree slug for localStorage scoping
 */
export function useRecentAgents(workspace?: string, worktreeSlug?: string): UseRecentAgentsReturn {
  const { agents: rawAgents, isLoading } = useAgentManager({
    workspace,
    subscribeToSSE: false,
  });
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (!worktreeSlug) return new Set();
    const stored = readStorage<string[]>(STORAGE_KEYS.dismissed(worktreeSlug), []);
    return new Set(stored);
  });

  const agents = useMemo(() => {
    if (!rawAgents) return [];
    const now = Date.now();

    return rawAgents
      .filter((agent) => {
        // Never show dismissed agents
        if (dismissedIds.has(agent.id)) return false;
        // Protected statuses always show
        if (PROTECTED_STATUSES.has(agent.status)) return true;
        // Hide stale non-protected agents (>24h)
        const age = now - new Date(agent.updatedAt).getTime();
        if (age > TWENTY_FOUR_HOURS_MS) return false;
        return true;
      })
      .map((agent) => ({
        ...agent,
        priority: STATUS_PRIORITY[agent.status] ?? 3,
      }))
      .sort((a, b) => a.priority - b.priority);
  }, [rawAgents, dismissedIds]);

  const dismiss = useCallback(
    (agentId: string) => {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(agentId);
        if (worktreeSlug) {
          writeStorage(STORAGE_KEYS.dismissed(worktreeSlug), Array.from(next));
        }
        return next;
      });
    },
    [worktreeSlug]
  );

  return { agents, isLoading, dismiss };
}
