/**
 * Agents Page - /workspaces/[slug]/agents
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per Subtask 001: Migrated from Plan 018's IAgentSessionService to AgentManagerService via DI.
 *
 * Server component that lists agents for a workspace.
 * Per DYK-06: Uses AgentManagerService via DI directly (matching chat page pattern).
 * Per DYK-07: No worktree requirement — agents are global entities.
 * Per Discovery 11: Must await params before use (Next.js 16+).
 */

import { SHARED_DI_TOKENS } from '@chainglass/shared';
import type { IAgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
import { Bot, Clock, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { CreateSessionForm } from '../../../../../src/components/agents/create-session-form';
import { SessionDeleteButton } from '../../../../../src/components/agents/session-delete-button';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function WorkspaceAgentsPage({ params }: PageProps) {
  const { slug } = await params;

  const container = getContainer();
  const agentManager = container.resolve<IAgentManagerService>(
    SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
  );

  // Ensure initialized (loads from storage)
  await agentManager.initialize();

  // Get agents filtered by workspace slug
  const agents = agentManager.getAgents({ workspace: slug });

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link href="/workspaces" className="hover:underline">
          Workspaces
        </Link>
        {' / '}
        <Link href={`/workspaces/${slug}`} className="hover:underline">
          {slug}
        </Link>
        {' / '}
        <span>Agents</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Agents</h1>
          </div>
        </div>
      </div>

      {/* Main Content - Sidebar + List */}
      <div className="flex gap-6">
        {/* Sidebar with Create Form */}
        <aside className="w-72 shrink-0">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-semibold text-sm">New Agent</h2>
            <CreateSessionForm workspaceSlug={slug} sessionCount={agents.length} />
          </div>
        </aside>

        {/* Agent List */}
        <div className="flex-1">
          {agents.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-xl font-semibold">No agents yet</h2>
              <p className="text-muted-foreground">Create an agent using the form on the left.</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                    <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {agents.map((agent) => (
                    <tr key={agent.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/workspaces/${slug}/agents/${agent.id}`}
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
                          {agent.createdAt.toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <SessionDeleteButton agentId={agent.id} workspaceSlug={slug} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
