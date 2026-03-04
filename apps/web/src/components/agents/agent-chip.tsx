'use client';

/**
 * Plan 059 Phase 3: AgentChip — Individual agent status chip
 *
 * Compact interactive chip for the top bar. Shows type icon, name,
 * status indicator, and optional intent snippet. Clicking toggles
 * the agent overlay.
 *
 * Status states:
 * - working: blue pulse dot
 * - idle/stopped: grey dot
 * - waiting_input: amber pulse dot + ❓
 * - error: red dot
 * - completed: green dot
 */

import { useAgentOverlay } from '@/hooks/use-agent-overlay';
import { cn } from '@/lib/utils';
import { Bot, CircleAlert, HelpCircle, Loader2, Sparkles, Terminal } from 'lucide-react';

export interface AgentChipProps {
  id: string;
  name: string;
  type: string;
  status: string;
  intent?: string;
  /** Compact mode: icon + initials only */
  compact?: boolean;
  className?: string;
}

const typeIcons: Record<string, typeof Bot> = {
  'claude-code': Terminal,
  copilot: Sparkles,
  'copilot-cli': Bot,
};

const statusStyles: Record<string, { dot: string; ring?: string }> = {
  working: {
    dot: 'bg-blue-500',
    ring: 'animate-pulse ring-2 ring-blue-400/50',
  },
  idle: { dot: 'bg-zinc-400' },
  stopped: { dot: 'bg-zinc-400' },
  waiting_input: {
    dot: 'bg-amber-500',
    ring: 'animate-pulse ring-2 ring-amber-400/50',
  },
  error: { dot: 'bg-red-500' },
  completed: { dot: 'bg-emerald-500' },
};

export function AgentChip({
  id,
  name,
  type,
  status,
  intent,
  compact = false,
  className,
}: AgentChipProps) {
  const { toggleAgent, activeAgentId } = useAgentOverlay();
  const isActive = activeAgentId === id;
  const TypeIcon = typeIcons[type] ?? Bot;
  const style = statusStyles[status] ?? statusStyles.idle;
  const isWaiting = status === 'waiting_input';

  return (
    <button
      type="button"
      onClick={() => toggleAgent(id)}
      title={`${name} — ${status}${intent ? `: ${intent}` : ''}`}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
        'transition-all duration-150 cursor-pointer select-none',
        'hover:bg-accent/60 hover:shadow-sm',
        isActive && 'bg-accent shadow-sm ring-1 ring-primary/20',
        !isActive && 'bg-card',
        className
      )}
    >
      {/* Status indicator */}
      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', style.dot, style.ring)} />

      {/* Type icon */}
      <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />

      {!compact && (
        <div className="flex flex-col items-start min-w-0">
          {/* Name */}
          <span className="truncate max-w-[140px] font-medium leading-tight">{name}</span>

          {/* Intent snippet */}
          {intent && (
            <span className="truncate max-w-[140px] text-xs text-muted-foreground leading-tight">
              {intent}
            </span>
          )}
        </div>
      )}

      {/* Question indicator */}
      {isWaiting && <HelpCircle className="h-4 w-4 shrink-0 text-amber-500" />}
    </button>
  );
}
