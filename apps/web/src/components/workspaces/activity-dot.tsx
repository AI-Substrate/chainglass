'use client';

/**
 * ActivityDot — Small colored badge indicating worktree agent activity.
 *
 * Colors: 🟡 amber = waiting_input (questions), 🔴 red = errors, 🔵 blue = working.
 * Priority: questions > errors > working (only highest-priority dot shown).
 * Hidden when no activity.
 *
 * Plan 059 Phase 4 — T003
 */

import { cn } from '@/lib/utils';
import Link from 'next/link';

/** Badge data shape — structurally matches API response, no cross-domain import. */
export interface WorktreeBadgeState {
  hasQuestions: boolean;
  hasErrors: boolean;
  hasWorking: boolean;
  agentCount: number;
}

interface ActivityDotProps {
  badge: WorktreeBadgeState | undefined;
  /** Workspace slug for navigation. */
  workspaceSlug: string;
  /** Worktree path for navigation. */
  worktreePath: string;
}

type BadgeInfo = {
  color: string;
  pulse: string;
  tooltip: string;
};

function getBadgeInfo(badge: WorktreeBadgeState): BadgeInfo | null {
  if (badge.hasQuestions) {
    return {
      color: 'bg-amber-400',
      pulse: 'animate-pulse',
      tooltip: 'Agent waiting for input',
    };
  }
  if (badge.hasErrors) {
    return {
      color: 'bg-red-500',
      pulse: '',
      tooltip: 'Agent error',
    };
  }
  if (badge.hasWorking) {
    return {
      color: 'bg-blue-500',
      pulse: '',
      tooltip: 'Agent working',
    };
  }
  if (badge.agentCount > 0) {
    return {
      color: 'bg-gray-400',
      pulse: '',
      tooltip: `${badge.agentCount} agent${badge.agentCount > 1 ? 's' : ''} idle`,
    };
  }
  return null;
}

export function ActivityDot({ badge, workspaceSlug, worktreePath }: ActivityDotProps) {
  if (!badge) return null;

  const info = getBadgeInfo(badge);
  if (!info) return null;

  return (
    <Link
      href={`/workspaces/${workspaceSlug}/agents?worktree=${encodeURIComponent(worktreePath)}`}
      className="shrink-0 rounded p-0.5"
      title={info.tooltip}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        className={cn('block h-2 w-2 rounded-full', info.color, info.pulse)}
        aria-label={info.tooltip}
      />
    </Link>
  );
}
