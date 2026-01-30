/**
 * Agent Chat Page - /workspaces/[slug]/agents/[id]
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per DYK-03: URL param [id] now represents agentId (UUID), not sessionId.
 *
 * Server component wrapper that:
 * - Loads agent metadata via AgentManagerService
 * - Renders AgentChatView client component for interactive chat
 * - Renders agent list sidebar for switching between agents
 *
 * Per DYK-01: Props changed from sessionId/workspaceSlug/agentType to just agentId.
 * Per Discovery 11: Must await params before use (Next.js 16+).
 */

import { SHARED_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentManagerService } from '@chainglass/shared/features/019-agent-manager-refactor/agent-manager.interface';
import type { IWorkspaceService } from '@chainglass/workflow';
import { ArrowLeft, Bot, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AgentChatView } from '../../../../../../src/components/agents/agent-chat-view';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
    id: string;
  }>;
}

export default async function AgentChatPage({ params }: PageProps) {
  const { slug: workspaceSlug, id: agentId } = await params;

  const container = getContainer();
  const agentManager = container.resolve<IAgentManagerService>(
    SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE
  );

  // Ensure initialized (loads from storage)
  await agentManager.initialize();

  // Get the agent by ID
  const agent = agentManager.getAgent(agentId);

  if (!agent) {
    notFound();
  }

  // Resolve workspace slug to filesystem path for agent cwd
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workspaceInfo = await workspaceService.getInfo(workspaceSlug);
  const workspacePath = workspaceInfo?.path ?? undefined;

  // Get all agents for sidebar (filter by workspace if needed)
  const allAgents = agentManager.getAgents();

  // Build navigation URLs
  const agentsListUrl = `/workspaces/${workspaceSlug}/agents`;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with breadcrumb and agent info */}
        <header className="shrink-0 border-b bg-background">
          {/* Breadcrumb */}
          <nav className="px-4 py-2 text-sm text-muted-foreground border-b">
            <Link href="/workspaces" className="hover:underline">
              Workspaces
            </Link>
            {' / '}
            <Link href={`/workspaces/${workspaceSlug}`} className="hover:underline">
              {workspaceSlug}
            </Link>
            {' / '}
            <Link href={agentsListUrl} className="hover:underline">
              Agents
            </Link>
            {' / '}
            <span className="font-medium">{agent.name}</span>
          </nav>

          {/* Agent header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={agentsListUrl}
                className="p-1 -ml-1 rounded hover:bg-muted transition-colors"
                title="Back to agents"
              >
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
              </Link>
              <Bot className="h-6 w-6 text-muted-foreground" />
              <div>
                <h1 className="font-semibold">{agent.name}</h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{agent.type === 'claude-code' ? 'Claude Code' : 'Copilot'}</span>
                  {agent.intent && (
                    <>
                      <span>•</span>
                      <span className="truncate max-w-48">{agent.intent}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  agent.status === 'working'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : agent.status === 'stopped'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {agent.status}
              </span>
            </div>
          </div>
        </header>

        {/* Chat view - client component */}
        <AgentChatView agentId={agentId} workspacePath={workspacePath} className="flex-1 min-h-0" />
      </div>

      {/* Agent list sidebar */}
      <aside className="w-64 shrink-0 hidden lg:flex flex-col border-l bg-muted/30">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-medium text-muted-foreground">Agents</h2>
        </div>
        <div className="flex-1 overflow-auto">
          {allAgents.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No agents</p>
          ) : (
            <ul className="divide-y">
              {allAgents.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/workspaces/${workspaceSlug}/agents/${a.id}`}
                    className={`block px-4 py-3 hover:bg-muted/50 transition-colors ${
                      a.id === agentId ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium truncate">{a.name}</span>
                      <span
                        className={`text-xs ${
                          a.status === 'working'
                            ? 'text-blue-600'
                            : a.status === 'error'
                              ? 'text-red-600'
                              : 'text-muted-foreground'
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {a.type === 'claude-code' ? 'Claude' : 'Copilot'}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
