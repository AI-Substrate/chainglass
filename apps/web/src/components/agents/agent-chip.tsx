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

import { useAgentOverlay } from '@/hooks/useAgentOverlay';
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
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        'transition-colors cursor-pointer select-none',
        'hover:bg-accent hover:text-accent-foreground',
        isActive && 'bg-accent ring-2 ring-primary/30',
        !isActive && 'bg-background',
        className
      )}
    >
      {/* Status dot */}
      <span className={cn('h-2 w-2 rounded-full shrink-0', style.dot, style.ring)} />

      {/* Type icon */}
      <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />

      {!compact && (
        <>
          {/* Name */}
          <span className="truncate max-w-[100px]">{name}</span>

          {/* Intent snippet */}
          {intent && <span className="truncate max-w-[120px] text-muted-foreground">{intent}</span>}
        </>
      )}

      {/* Question indicator */}
      {isWaiting && <HelpCircle className="h-3 w-3 shrink-0 text-amber-500" />}
    </button>
  );
}
