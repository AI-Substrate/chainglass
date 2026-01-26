'use client';

/**
 * AgentStatusIndicator - Color-coded status badge
 *
 * Displays the current session status with appropriate color and animation.
 * - idle: gray
 * - running: blue with pulse animation
 * - completed: green
 * - waiting_input: amber
 * - archived: gray (muted)
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import type { SessionStatus } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { Archive, Bot, CheckCircle2, Clock, Loader2 } from 'lucide-react';

export interface AgentStatusIndicatorProps {
  /** Current session status */
  status: SessionStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Status configuration mapping.
 */
const statusConfig: Record<
  SessionStatus,
  { label: string; color: string; bgColor: string; icon: typeof Loader2; animate?: boolean }
> = {
  idle: {
    label: 'Idle',
    color: 'text-zinc-500',
    bgColor: 'bg-zinc-100 dark:bg-zinc-800',
    icon: Bot,
  },
  running: {
    label: 'Running',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/50',
    icon: Loader2,
    animate: true,
  },
  waiting_input: {
    label: 'Waiting',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/50',
    icon: Clock,
  },
  completed: {
    label: 'Completed',
    color: 'text-emerald-600 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
    icon: CheckCircle2,
  },
  archived: {
    label: 'Archived',
    color: 'text-zinc-400',
    bgColor: 'bg-zinc-100 dark:bg-zinc-800',
    icon: Archive,
  },
};

/**
 * Status indicator badge with color and icon.
 *
 * @example
 * <AgentStatusIndicator status="running" />
 * // → Blue badge with spinning loader: "Running"
 */
export function AgentStatusIndicator({ status, className }: AgentStatusIndicatorProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <output
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded',
        config.bgColor,
        config.color,
        className
      )}
    >
      <Icon className={cn('h-3 w-3', config.animate && 'animate-spin')} aria-hidden="true" />
      {config.label}
    </output>
  );
}

export default AgentStatusIndicator;
