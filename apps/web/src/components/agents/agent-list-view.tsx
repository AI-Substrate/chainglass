'use client';

/**
 * AgentListView - List of agent sessions with selection
 *
 * Displays all agent sessions with:
 * - Session name
 * - Status indicator
 * - Active session highlighting
 * - Click-to-select behavior
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import type { AgentSession } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { Bot, MessageSquare } from 'lucide-react';
import { AgentStatusIndicator } from './agent-status-indicator';

export interface AgentListViewProps {
  /** List of sessions to display */
  sessions: AgentSession[];
  /** Currently active session ID (or null if none) */
  activeSessionId: string | null;
  /** Callback when session is selected */
  onSelect: (sessionId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * List view showing all agent sessions.
 *
 * @example
 * <AgentListView
 *   sessions={allSessions}
 *   activeSessionId={currentSession.id}
 *   onSelect={(id) => setCurrentSession(id)}
 * />
 */
export function AgentListView({
  sessions,
  activeSessionId,
  onSelect,
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
    <ul className={cn('divide-y divide-border', className)}>
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;

        return (
          <li key={session.id}>
            <button
              type="button"
              onClick={() => onSelect(session.id)}
              aria-selected={isActive}
              className={cn(
                'w-full text-left px-3 py-2 transition-colors',
                'hover:bg-muted/50',
                'focus:outline-none focus:bg-muted',
                isActive && 'bg-violet-50 dark:bg-violet-950/30 border-l-2 border-violet-500'
              )}
            >
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium truncate',
                      isActive && 'text-violet-700 dark:text-violet-300'
                    )}
                  >
                    {session.name}
                  </p>
                </div>
                <AgentStatusIndicator status={session.status} className="shrink-0" />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default AgentListView;
