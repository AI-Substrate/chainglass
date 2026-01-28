'use client';

/**
 * SessionSelector - Sidebar component for selecting agent sessions
 *
 * Features:
 * - Lists all sessions in current workspace
 * - Highlights active session
 * - Click to navigate to session (URL-based per DYK-04)
 * - Modal for creating sessions with name and type selection
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Subtask 002: Agent Chat Page - ST003
 */

import { formatAbsoluteTime, useRelativeTime } from '@/hooks/useRelativeTime';
import type { AgentSession } from '@/lib/schemas/agent-session.schema';
import { cn } from '@/lib/utils';
import { Bot, MessageSquare, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
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
      {/* suppressHydrationWarning due to locale differences between server/client */}
      <div className="text-xs text-muted-foreground mt-0.5" suppressHydrationWarning>
        {absoluteTime} ({relativeTime})
      </div>
    </div>
  );
}

/**
 * Agent type options for the create modal.
 */
const AGENT_TYPES = [
  {
    value: 'claude-code' as const,
    label: 'Claude Code',
    description: 'Anthropic Claude for coding tasks',
  },
  {
    value: 'copilot' as const,
    label: 'GitHub Copilot',
    description: 'GitHub Copilot assistant',
  },
] as const;

type AgentType = (typeof AGENT_TYPES)[number]['value'];

/**
 * Modal dialog for creating a new session with name and type selection.
 */
function CreateSessionModal({
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
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('claude-code');

  // Reset form when modal opens
  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (open) {
        setName(`Session ${sessionCount + 1}`);
        setAgentType('claude-code');
        setError(null);
      }
    },
    [sessionCount]
  );

  const handleCreate = useCallback(() => {
    if (!name.trim()) {
      setError('Please enter a session name');
      return;
    }

    setError(null);
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
            type: agentType,
            name: name.trim(),
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `Failed to create session: ${response.status}`);
        }

        // Get the created session ID from response (API returns { ok: true, session: { id, ... } })
        const sessionId = data.session?.id;
        if (!sessionId) {
          throw new Error('No session ID returned from server');
        }

        // Close modal and navigate to the new session
        setIsOpen(false);
        const sessionUrl = `/workspaces/${workspaceSlug}/agents/${sessionId}${params.toString() ? `?${params.toString()}` : ''}`;
        router.push(sessionUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    });
  }, [workspaceSlug, worktreePath, name, agentType, router]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <div className="p-3 border-b">
          <Button type="button" variant="outline" size="sm" className="w-full">
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Agent Session</DialogTitle>
          <DialogDescription>
            Start a new agent session for this worktree. Choose a name and agent type.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Session name input */}
          <div className="space-y-2">
            <label htmlFor="session-name" className="text-sm font-medium">
              Session Name
            </label>
            <input
              id="session-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter session name..."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Agent type selection */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Agent Type</span>
            <div className="space-y-2" role="radiogroup" aria-label="Agent Type">
              {AGENT_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    agentType === type.value
                      ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/30'
                      : 'border-border hover:bg-muted/50'
                  )}
                >
                  <input
                    type="radio"
                    name="agent-type"
                    value={type.value}
                    checked={agentType === type.value}
                    onChange={(e) => setAgentType(e.target.value as AgentType)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span className="font-medium text-sm">{type.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{type.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Error message */}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleCreate} disabled={isPending}>
            {isPending ? 'Creating...' : 'Create Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      {/* Create session button with modal */}
      <CreateSessionModal
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
