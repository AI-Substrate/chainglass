/**
 * Agent Session Chat Page - /workspaces/[slug]/agents/[id]
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Subtask 002: Agent Chat Page - Replaces raw JSON detail with interactive chat
 *
 * Server component wrapper that:
 * - Fetches current session and all sessions (for sidebar selector)
 * - Renders AgentChatView client component for interactive chat
 * - Renders SessionSelector for switching between sessions
 *
 * Per DYK-02: Uses notFound() for invalid workspace or session.
 * Per Discovery 04: Uses `export const dynamic = 'force-dynamic'` for DI container access.
 * Per Discovery 11: Must await params before use (Next.js 16+).
 * Per DYK Insight #2: Replaces detail page with chat UI (no separate /chat route).
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentSessionService, IWorkspaceService } from '@chainglass/workflow';
import { ArrowLeft, Bot, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AgentChatView } from '../../../../../../src/components/agents/agent-chat-view';
import { DeleteSessionButton } from '../../../../../../src/components/agents/delete-session-button';
import { SessionSelector } from '../../../../../../src/components/agents/session-selector';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
    id: string;
  }>;
  searchParams: Promise<{
    worktree?: string;
  }>;
}

export default async function AgentSessionChatPage({ params, searchParams }: PageProps) {
  const { slug, id } = await params;
  const { worktree: worktreePath } = await searchParams;

  // Redirect to workspace detail if no worktree specified (per DYK-02)
  if (!worktreePath) {
    redirect(`/workspaces/${slug}`);
  }

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );

  // Resolve context - per DYK-02: use notFound() for invalid slug
  const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

  if (!context) {
    notFound();
  }

  // Load current session
  const session = await sessionService.getSession(context, id);

  if (!session) {
    notFound();
  }

  // Load all sessions for the sidebar selector
  const allSessions = await sessionService.listSessions(context);

  // Convert AgentSession entities to serializable props for client component
  // Backend status: 'active' | 'completed' | 'terminated'
  // UI status: 'idle' | 'running' | 'completed' | 'error'
  // Note: 'active' means session is open (can receive messages), NOT that agent is running
  const sessionsForSelector = allSessions.map((s) => ({
    id: s.id,
    name: `Session ${s.id.slice(-8)}`,
    agentType: s.type,
    status: s.status === 'completed' ? ('completed' as const) : ('idle' as const),
    messages: [],
    createdAt: s.createdAt.getTime(),
    lastActiveAt: s.updatedAt.getTime(),
  }));

  // Get workspace info for breadcrumb
  const info = await workspaceService.getInfo(slug);

  // Build back link to worktree landing or agents list
  const agentsListUrl = `/workspaces/${slug}/agents?worktree=${encodeURIComponent(worktreePath)}`;
  const worktreeUrl = `/workspaces/${slug}/worktree?worktree=${encodeURIComponent(worktreePath)}`;

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with breadcrumb and session info */}
        <header className="shrink-0 border-b bg-background">
          {/* Breadcrumb */}
          <nav className="px-4 py-2 text-sm text-muted-foreground border-b">
            <Link href="/workspaces" className="hover:underline">
              Workspaces
            </Link>
            {' / '}
            <Link href={`/workspaces/${slug}`} className="hover:underline">
              {info?.name || slug}
            </Link>
            {' / '}
            <Link href={worktreeUrl} className="hover:underline">
              {context.worktreeBranch || 'worktree'}
            </Link>
            {' / '}
            <Link href={agentsListUrl} className="hover:underline">
              Agents
            </Link>
            {' / '}
            <span className="font-mono">{session.id.slice(-12)}</span>
          </nav>

          {/* Session header */}
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href={agentsListUrl}
                className="p-1 -ml-1 rounded hover:bg-muted transition-colors"
                title="Back to sessions"
              >
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
              </Link>
              <Bot className="h-6 w-6 text-muted-foreground" />
              <div>
                <h1 className="font-semibold">Session {session.id.slice(-8)}</h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  {context.worktreeBranch || 'main'}
                  <span>•</span>
                  <span>{session.type === 'claude-code' ? 'Claude Code' : 'Copilot'}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  session.status === 'active'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                    : session.status === 'completed'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                }`}
              >
                {session.status}
              </span>
              <DeleteSessionButton
                sessionId={session.id}
                workspaceSlug={slug}
                worktreePath={worktreePath}
              />
            </div>
          </div>
        </header>

        {/* Chat view - client component */}
        <AgentChatView
          sessionId={session.id}
          workspaceSlug={slug}
          worktreePath={worktreePath}
          agentType={session.type}
          isRunning={false}
          className="flex-1 min-h-0"
        />
      </div>

      {/* Session selector sidebar */}
      <SessionSelector
        sessions={sessionsForSelector}
        activeSessionId={session.id}
        workspaceSlug={slug}
        worktreePath={worktreePath}
        className="w-64 shrink-0 hidden lg:flex"
      />
    </div>
  );
}
