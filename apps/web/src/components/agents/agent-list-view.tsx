'use client';

/**
 * AgentListView - List of agent sessions with selection
 *
 * Displays all agent sessions with:
 * - Session name
 * - Status indicator
 * - Last active time (auto-updating)
 * - Delete button
 * - Active session highlighting
 * - Click-to-select behavior
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 * Enhanced in Plan 015: Better Agents - Session Management
 */

import { formatAbsoluteTime, useRelativeTime } from '@/hooks/useRelativeTime';
import type { AgentSession } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { MessageSquare, Trash2 } from 'lucide-react';
import { AgentStatusIndicator } from './agent-status-indicator';

export interface AgentListViewProps {
  /** List of sessions to display */
  sessions: AgentSession[];
  /** Currently active session ID (or null if none) */
  activeSessionId: string | null;
  /** Callback when session is selected */
  onSelect: (sessionId: string) => void;
  /** Callback when session is deleted */
  onDelete?: (sessionId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Single session item with relative time display.
 * Separated to use the useRelativeTime hook per-item.
 */
function SessionItem({
  session,
  isActive,
  onSelect,
  onDelete,
}: {
  session: AgentSession;
  isActive: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const relativeTime = useRelativeTime(session.lastActiveAt);
  const absoluteTime = formatAbsoluteTime(session.lastActiveAt);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && window.confirm(`Delete session "${session.name}"?`)) {
      onDelete();
    }
  };

  return (
    <div
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      // biome-ignore lint/a11y/useSemanticElements: Custom styled listbox item requires div with role="option" (native <option> cannot be styled)
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      className={cn(
        'w-full text-left px-3 py-2.5 transition-colors group cursor-pointer',
        'hover:bg-muted/50',
        'focus:outline-none focus:bg-muted',
        isActive && 'bg-violet-50 dark:bg-violet-950/30 border-l-2 border-violet-500'
      )}
    >
      {/* Row 1: Name + Status icon + Delete */}
      <div className="flex items-center gap-2">
        <p
          className={cn(
            'flex-1 text-sm font-medium truncate',
            isActive && 'text-violet-700 dark:text-violet-300'
          )}
        >
          {session.name}
        </p>
        <div className="flex items-center gap-1.5 shrink-0">
          {onDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-950/50 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-all"
              title="Delete session"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <AgentStatusIndicator status={session.status} compact />
        </div>
      </div>
      {/* Row 2: Agent type */}
      <div className="text-xs text-muted-foreground mt-0.5">
        {session.agentType === 'claude-code' ? 'Claude Code' : 'GitHub Copilot'}
      </div>
      {/* Row 3: Time - absolute + relative */}
      <div className="text-xs text-muted-foreground mt-0.5">
        {absoluteTime} ({relativeTime})
      </div>
    </div>
  );
}

/**
 * List view showing all agent sessions.
 *
 * @example
 * <AgentListView
 *   sessions={allSessions}
 *   activeSessionId={currentSession.id}
 *   onSelect={(id) => setCurrentSession(id)}
 *   onDelete={(id) => deleteSession(id)}
 * />
 */
export function AgentListView({
  sessions,
  activeSessionId,
  onSelect,
  onDelete,
  className,
}: AgentListViewProps) {
  if (sessions.length === 0) {
    return (
      <div className={cn('p-4 text-center text-muted-foreground', className)}>
        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No sessions yet</p>
        <p className="text-xs mt-1">Create your first session to get started</p>
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: Custom styled listbox requires div with role="listbox" (native <select> cannot be styled)
    <div className={cn('divide-y divide-border', className)} role="listbox" tabIndex={0}>
      {sessions.map((session) => (
        <SessionItem
          key={session.id}
          session={session}
          isActive={session.id === activeSessionId}
          onSelect={() => onSelect(session.id)}
          onDelete={onDelete ? () => onDelete(session.id) : undefined}
        />
      ))}
    </div>
  );
}

export default AgentListView;
