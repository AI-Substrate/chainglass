'use client';

/**
 * CreateSessionForm - Form for creating agents via Plan 019 API
 *
 * Client component that POSTs to /api/agents
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per DYK-06: Client components use fetch for mutations.
 * Per Insight 3: Workspace value comes from URL [slug] param.
 */

import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useCallback, useState, useTransition } from 'react';
import { Button } from '../ui/button';

export interface CreateSessionFormProps {
  /** Workspace slug for API calls */
  workspaceSlug: string;
  /** Current number of agents (for auto-generating ordinal names) */
  sessionCount?: number;
  /** Additional CSS classes */
  className?: string;
}

type AgentType = 'claude-code' | 'copilot' | 'copilot-cli';

const AGENT_TYPE_OPTIONS: Array<{ value: AgentType; label: string }> = [
  { value: 'copilot', label: 'GitHub Copilot' },
  { value: 'claude-code', label: 'Claude Code' },
  { value: 'copilot-cli', label: 'Copilot CLI (tmux)' },
];

export function CreateSessionForm({
  workspaceSlug,
  sessionCount = 0,
  className,
}: CreateSessionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('copilot');
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [tmuxWindow, setTmuxWindow] = useState('');
  const [tmuxPane, setTmuxPane] = useState('');

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      setError(null);

      const trimmed = name.trim();
      const finalName = trimmed || `Agent ${sessionCount + 1}`;

      startTransition(async () => {
        try {
          const response = await fetch('/api/agents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: finalName,
              type: agentType,
              workspace: workspaceSlug,
              ...(agentType === 'copilot-cli' && {
                sessionId: sessionId.trim() || undefined,
                tmuxWindow: tmuxWindow.trim() || undefined,
                tmuxPane: tmuxPane.trim() || undefined,
              }),
            }),
          });

          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Failed to create agent: ${response.status}`);
          }

          const agent = await response.json();

          // Navigate to the new agent's chat view
          router.push(`/workspaces/${workspaceSlug}/agents/${agent.id}`);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      });
    },
    [name, agentType, workspaceSlug, sessionCount, router, sessionId, tmuxWindow, tmuxPane]
  );

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-3', className)}>
      <div className="space-y-1">
        <label htmlFor="session-name" className="text-sm font-medium text-foreground">
          Agent Name
        </label>
        <input
          id="session-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Agent name (optional)"
          disabled={isPending}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'bg-background',
            'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="agent-type" className="text-sm font-medium text-foreground">
          Agent Type
        </label>
        <select
          id="agent-type"
          value={agentType}
          onChange={(e) => setAgentType(e.target.value as AgentType)}
          disabled={isPending}
          className={cn(
            'w-full px-3 py-2 text-sm rounded-md border',
            'bg-background',
            'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {AGENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {agentType === 'copilot-cli' && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="space-y-1">
            <label htmlFor="session-id" className="text-sm font-medium text-foreground">
              Session ID <span className="text-muted-foreground">(required)</span>
            </label>
            <input
              id="session-id"
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="e.g. abc123-def456"
              disabled={isPending}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'bg-background',
                'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tmux-window" className="text-sm font-medium text-foreground">
              tmux Window <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="tmux-window"
              type="text"
              value={tmuxWindow}
              onChange={(e) => setTmuxWindow(e.target.value)}
              placeholder="e.g. studio"
              disabled={isPending}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'bg-background',
                'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="tmux-pane" className="text-sm font-medium text-foreground">
              tmux Pane <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="tmux-pane"
              type="text"
              value={tmuxPane}
              onChange={(e) => setTmuxPane(e.target.value)}
              placeholder="e.g. 1.0"
              disabled={isPending}
              className={cn(
                'w-full px-3 py-2 text-sm rounded-md border',
                'bg-background',
                'focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <Button type="submit" disabled={isPending} className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        {isPending ? 'Creating...' : 'Create Agent'}
      </Button>
    </form>
  );
}
