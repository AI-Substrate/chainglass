'use client';

/**
 * Plan 059 FX005: AgentCard — Rich tile for the expanded agent grid
 *
 * Displays agent identity, status, intent/last-action, and activity time.
 * Click opens the agent overlay panel (no navigation).
 *
 * Status visual mapping:
 * - working: blue dot + pulse, shows live intent, "Active" instead of time
 * - waiting_input: amber dot + pulse, shows question/intent text
 * - error: red dot, shows last intent
 * - idle/stopped: grey dot, shows "Last: <intent>" in muted style
 * - completed: green dot
 *
 * DYK-FX005-04: Inline formatRelativeTime — no new dependency.
 * DYK-FX005-05: "Active" for working agents, relative time for others.
 */

import { useAgentOverlay } from '@/hooks/use-agent-overlay';
import { cn } from '@/lib/utils';
import { Bot, Sparkles, Terminal } from 'lucide-react';

export interface AgentCardProps {
  id: string;
  name: string;
  type: string;
  status: string;
  intent?: string;
  updatedAt: string;
  className?: string;
}

const typeIcons: Record<string, typeof Bot> = {
  'claude-code': Terminal,
  copilot: Sparkles,
  'copilot-cli': Bot,
};

const typeLabels: Record<string, string> = {
  'claude-code': 'Claude Code',
  copilot: 'Copilot',
  'copilot-cli': 'Copilot CLI',
};

const statusDot: Record<string, string> = {
  working: 'bg-blue-500 animate-pulse',
  waiting_input: 'bg-amber-500 animate-pulse',
  error: 'bg-red-500',
  idle: 'bg-zinc-400',
  stopped: 'bg-zinc-400',
  completed: 'bg-emerald-500',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getIntentDisplay(status: string, intent?: string) {
  if (status === 'working' && intent) {
    return { text: intent, className: 'text-foreground', label: null };
  }
  if (status === 'waiting_input' && intent) {
    return { text: intent, className: 'text-amber-600 dark:text-amber-400', label: '⏳' };
  }
  if (intent && (status === 'idle' || status === 'stopped' || status === 'error')) {
    return { text: intent, className: 'text-muted-foreground', label: 'Last:' };
  }
  return null;
}

export function AgentCard({
  id,
  name,
  type,
  status,
  intent,
  updatedAt,
  className,
}: AgentCardProps) {
  const { toggleAgent, activeAgentId } = useAgentOverlay();
  const isActive = activeAgentId === id;
  const TypeIcon = typeIcons[type] ?? Bot;
  const dot = statusDot[status] ?? statusDot.idle;
  const intentDisplay = getIntentDisplay(status, intent);
  const timeDisplay = status === 'working' ? 'Active' : formatRelativeTime(updatedAt);

  return (
    <button
      type="button"
      onClick={() => toggleAgent(id)}
      title={`${name} — ${status}${intent ? `: ${intent}` : ''}`}
      className={cn(
        'flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left',
        'min-h-[100px] w-full transition-all duration-150 cursor-pointer',
        'hover:bg-accent/60 hover:border-foreground/20',
        isActive && 'bg-accent border-primary/40 shadow-sm',
        !isActive && 'bg-card border-border',
        className
      )}
    >
      {/* Row 1: Status dot + name */}
      <div className="flex items-center gap-2 w-full min-w-0">
        <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', dot)} />
        <span className="truncate font-medium text-sm leading-tight">{name}</span>
      </div>

      {/* Row 2: Type icon + label */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TypeIcon className="h-3.5 w-3.5 shrink-0" />
        <span>{typeLabels[type] ?? type}</span>
      </div>

      {/* Row 3: Intent or last action */}
      {intentDisplay && (
        <p className={cn('text-xs leading-relaxed line-clamp-2 w-full', intentDisplay.className)}>
          {intentDisplay.label && <span className="mr-1">{intentDisplay.label}</span>}
          {intentDisplay.text}
        </p>
      )}

      {/* Row 4: Relative time */}
      <span
        className={cn(
          'text-xs mt-auto',
          status === 'working'
            ? 'text-blue-600 dark:text-blue-400 font-medium'
            : 'text-muted-foreground'
        )}
      >
        {timeDisplay}
      </span>
    </button>
  );
}
