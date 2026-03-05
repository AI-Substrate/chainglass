'use client';

/**
 * AgentListLive - Live-updating agent list with SSE subscription.
 *
 * Replaces the static server-rendered table on the agents page.
 * Uses useAgentManager hook for real-time status/intent updates.
 * Sorted by most recently active agent first, with relative time display.
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 */

import { useAgentManager } from '@/features/019-agent-manager-refactor';
import { Bot, Clock, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { SessionDeleteButton } from './session-delete-button';

export interface AgentListLiveProps {
  workspaceSlug: string;
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AgentListLive({ workspaceSlug }: AgentListLiveProps) {
  const { agents, isLoading } = useAgentManager({ workspace: workspaceSlug });
  const searchParams = useSearchParams();
  const worktreeParam = searchParams.get('worktree');
  const worktreeSuffix = worktreeParam ? `?worktree=${encodeURIComponent(worktreeParam)}` : '';
  const [, setTick] = useState(0);

  // Re-render every 60s to update relative times
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Sort by most recently updated first
  const sorted = useMemo(() => {
    if (!agents) return [];
    return [...agents].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [agents]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
        <h2 className="mb-2 text-xl font-semibold">No agents yet</h2>
        <p className="text-muted-foreground">Create an agent using the form on the left.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Last Activity</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((agent) => {
            const updatedAt = new Date(agent.updatedAt);
            return (
              <tr key={agent.id} className="hover:bg-muted/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/workspaces/${workspaceSlug}/agents/${agent.id}${worktreeSuffix}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {agent.name}
                  </Link>
                  {agent.intent && (
                    <div className="text-xs text-muted-foreground truncate max-w-48">
                      {agent.intent}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Bot className="h-4 w-4" />
                    {agent.type === 'claude-code' ? 'Claude Code' : 'Copilot'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      agent.status === 'working'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : agent.status === 'stopped'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {agent.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    <span>{updatedAt.toLocaleTimeString()}</span>
                    <span className="text-muted-foreground/60">{timeAgo(updatedAt)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <SessionDeleteButton agentId={agent.id} workspaceSlug={workspaceSlug} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
