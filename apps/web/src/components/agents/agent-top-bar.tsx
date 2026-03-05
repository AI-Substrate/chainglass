'use client';

/**
 * Plan 059 FX005: AgentTopBar — Summary strip + expandable agent grid
 *
 * Two-mode component replacing the old AgentChipBar:
 * - Collapsed (default): slim summary strip (~28px) with aggregate status counts
 * - Expanded: CSS Grid of AgentCards sorted by urgency
 *
 * Background tints by dominant status:
 * - amber: any agent waiting_input
 * - red: any agent in error
 * - blue: any agent working
 * - muted: all idle
 *
 * Workshop 009 design. DYK-FX005-03: reuses chipBarExpanded storage key.
 */

import { useRecentAgents } from '@/hooks/use-recent-agents';
import { STORAGE_KEYS, Z_INDEX, readStorage, writeStorage } from '@/lib/agents/constants';
import { cn } from '@/lib/utils';
import { Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AgentCard } from './agent-card';

interface AgentTopBarProps {
  workspace?: string;
  worktreeSlug?: string;
  className?: string;
}

interface AgentSummary {
  total: number;
  working: number;
  waiting: number;
  error: number;
  idle: number;
}

function computeSummary(agents: { status: string }[]): AgentSummary {
  let working = 0;
  let waiting = 0;
  let error = 0;
  let idle = 0;

  for (const a of agents) {
    switch (a.status) {
      case 'working':
        working++;
        break;
      case 'waiting_input':
        waiting++;
        break;
      case 'error':
        error++;
        break;
      default:
        idle++;
        break;
    }
  }

  return { total: agents.length, working, waiting, error, idle };
}

function getStripTint(summary: AgentSummary): string {
  if (summary.waiting > 0) return 'bg-amber-50/50 dark:bg-amber-950/20';
  if (summary.error > 0) return 'bg-red-50/50 dark:bg-red-950/20';
  if (summary.working > 0) return 'bg-blue-50/50 dark:bg-blue-950/20';
  return 'bg-card/80';
}

export function AgentTopBar({ workspace, worktreeSlug, className }: AgentTopBarProps) {
  const { agents, isLoading } = useRecentAgents(workspace, worktreeSlug);
  const [isExpanded, setIsExpanded] = useState(() =>
    readStorage(STORAGE_KEYS.chipBarExpanded, false)
  );

  const summary = useMemo(() => computeSummary(agents), [agents]);
  const stripTint = useMemo(() => getStripTint(summary), [summary]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev: boolean) => {
      const next = !prev;
      writeStorage(STORAGE_KEYS.chipBarExpanded, next);
      return next;
    });
  }, []);

  if (isLoading || agents.length === 0) return null;

  return (
    <div
      className={cn('border-b', className)}
      style={{ zIndex: Z_INDEX.TOP_BAR, position: 'relative' }}
    >
      {/* Summary Strip — always visible */}
      <button
        type="button"
        onClick={toggleExpanded}
        className={cn(
          'flex items-center gap-3 w-full px-4 py-1.5 text-xs transition-colors',
          'hover:bg-accent/40 cursor-pointer select-none',
          stripTint
        )}
      >
        {/* Agent icon + count */}
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
          <Bot className="h-3.5 w-3.5" />
          <span>
            {summary.total} agent{summary.total !== 1 ? 's' : ''}
          </span>
        </span>

        {/* Status breakdown */}
        <div className="flex items-center gap-3">
          {summary.working > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-muted-foreground">{summary.working} working</span>
            </span>
          )}
          {summary.waiting > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {summary.waiting} waiting
              </span>
            </span>
          )}
          {summary.error > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              <span className="text-red-600 dark:text-red-400">{summary.error} error</span>
            </span>
          )}
          {summary.idle > 0 && (
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-zinc-400" />
              <span className="text-muted-foreground">{summary.idle} idle</span>
            </span>
          )}
        </div>

        {/* Expand/collapse chevron */}
        <span className="ml-auto text-muted-foreground">
          {isExpanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </span>
      </button>

      {/* Expanded Grid */}
      {isExpanded && (
        <div
          className={cn(
            'border-t bg-card/60 backdrop-blur-sm px-4 py-3',
            'max-h-[50vh] overflow-y-auto',
            'animate-in slide-in-from-top duration-200'
          )}
        >
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {agents.map((agent) => (
              <AgentCard
                key={agent.id}
                id={agent.id}
                name={agent.name}
                type={agent.type}
                status={agent.status}
                intent={agent.intent}
                updatedAt={agent.updatedAt}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
