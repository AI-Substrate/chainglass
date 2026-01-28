'use client';

/**
 * SessionSelector - Sidebar component for selecting agent sessions
 *
 * Features:
 * - Lists all sessions in current workspace
 * - Highlights active session
 * - Click to navigate to session (URL-based per DYK-04)
 * - Inline create form (per DYK-03, server-first)
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Subtask 002: Agent Chat Page - ST003
 */

import { formatAbsoluteTime, useRelativeTime } from '@/hooks/useRelativeTime';
import type { AgentSession } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { MessageSquare, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { Button } from '../ui/button';
import { AgentStatusIndicator } from './agent-status-indicator';

export interface SessionSelectorProps {
  /** List of sessions to display */
  sessions: AgentSession[];
  /** Currently active session ID (or null if none) */
  activeSessionId: string | null;
  /** Workspace slug for URL construction */
  workspaceSlug: string;
  /** Worktree path for URL query param */
  worktreePath?: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Single session item with relative time display.
 */
function SessionItem({
  session,
  isActive,
  onSelect,
}: {
  session: AgentSession;
  isActive: boolean;
  onSelect: () => void;
}) {
  const relativeTime = useRelativeTime(session.lastActiveAt);
  const absoluteTime = formatAbsoluteTime(session.lastActiveAt);

  return (
    <div
      onClick={isActive ? undefined : onSelect}
      onKeyDown={(e) => e.key === 'Enter' && !isActive && onSelect()}
      // biome-ignore lint/a11y/useSemanticElements: Custom styled listbox item requires div
      role="option"
      aria-selected={isActive}
      tabIndex={0}
      className={cn(
        'w-full text-left px-3 py-2.5 transition-colors group',
        !isActive && 'cursor-pointer hover:bg-muted/50',
        'focus:outline-none focus:bg-muted',
        isActive && 'bg-violet-50 dark:bg-violet-950/30 border-l-2 border-violet-500'
      )}
    >
      {/* Row 1: Name + Status icon */}
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
 * Inline create session form.
 */
function CreateSessionInline({
  workspaceSlug,
  worktreePath,
  sessionCount,
}: {
  workspaceSlug: string;
  worktreePath?: string;
  sessionCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(() => {
    setError(null);
    const finalName = `Session ${sessionCount + 1}`;

    startTransition(async () => {
      try {
        const params = new URLSearchParams();
        if (worktreePath) {
          params.set('worktree', worktreePath);
        }
        const url = `/api/workspaces/${workspaceSlug}/agents${params.toString() ? `?${params.toString()}` : ''}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'claude-code',
            name: finalName,
          }),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Failed to create session: ${response.status}`);
        }

        // Refresh page to show new session
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    });
  }, [workspaceSlug, worktreePath, sessionCount, router]);

  return (
    <div className="p-3 border-b">
      <Button
        type="button"
        onClick={handleCreate}
        disabled={isPending}
        variant="outline"
        size="sm"
        className="w-full"
      >
        <Plus className="mr-2 h-4 w-4" />
        {isPending ? 'Creating...' : 'New Session'}
      </Button>
      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

/**
 * Session selector sidebar component.
 *
 * @example
 * <SessionSelector
 *   sessions={allSessions}
 *   activeSessionId={currentSessionId}
 *   workspaceSlug="my-workspace"
 *   worktreePath="/path/to/worktree"
 * />
 */
export function SessionSelector({
  sessions,
  activeSessionId,
  workspaceSlug,
  worktreePath,
  className,
}: SessionSelectorProps) {
  const router = useRouter();

  const handleSelect = useCallback(
    (sessionId: string) => {
      // Per DYK-04: Session switching via URL navigation
      const params = new URLSearchParams();
      if (worktreePath) {
        params.set('worktree', worktreePath);
      }
      const url = `/workspaces/${workspaceSlug}/agents/${sessionId}${params.toString() ? `?${params.toString()}` : ''}`;
      router.push(url);
    },
    [router, workspaceSlug, worktreePath]
  );

  // Sort sessions by lastActiveAt descending
  const sortedSessions = [...sessions].sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  return (
    <aside className={cn('flex flex-col bg-muted/30 border-l', className)}>
      {/* Create session button */}
      <CreateSessionInline
        workspaceSlug={workspaceSlug}
        worktreePath={worktreePath}
        sessionCount={sessions.length}
      />

      {/* Session list */}
      {sessions.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No sessions yet</p>
          <p className="text-xs mt-1">Create your first session to get started</p>
        </div>
      ) : (
        // biome-ignore lint/a11y/useSemanticElements: Custom styled listbox
        <div className="flex-1 overflow-auto divide-y divide-border" role="listbox" tabIndex={0}>
          {sortedSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onSelect={() => handleSelect(session.id)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

export default SessionSelector;
