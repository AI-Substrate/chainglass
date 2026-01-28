/**
 * Agents Page - /workspaces/[slug]/agents
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 *
 * Server component that shows agent sessions for a workspace's worktree.
 * Uses ?worktree= query param for context selection.
 *
 * Per DYK-02: Uses notFound() for invalid workspace slug.
 * Per Discovery 04: Uses `export const dynamic = 'force-dynamic'` for DI container access.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentSessionService, IWorkspaceService } from '@chainglass/workflow';
import { Bot, Clock, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreateSessionForm } from '../../../../../src/components/agents/create-session-form';
import { WorkspaceSelector } from '../../../../../src/components/workspaces/workspace-selector';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    worktree?: string;
  }>;
}

export default async function WorkspaceAgentsPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { worktree: worktreePath } = await searchParams;

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

  // Load sessions
  const sessions = await sessionService.listSessions(context);

  // Get workspace info for breadcrumb
  const info = await workspaceService.getInfo(slug);

  // Get all workspaces for selector dropdown
  const allWorkspaces = await workspaceService.list();
  const workspaceOptions = allWorkspaces.map((w) => ({ slug: w.slug, name: w.name }));

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb + Workspace Selector */}
      <div className="mb-4 flex items-center justify-between">
        <nav className="text-sm text-muted-foreground">
          <Link href="/workspaces" className="hover:underline">
            Workspaces
          </Link>
          {' / '}
          <Link href={`/workspaces/${slug}`} className="hover:underline">
            {info?.name || slug}
          </Link>
          {' / '}
          <span>Agents</span>
        </nav>
        <WorkspaceSelector
          currentSlug={slug}
          workspaces={workspaceOptions}
          basePath="/workspaces/{slug}/agents"
        />
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Agent Sessions</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4" />
              {context.worktreeBranch || 'main'}
              <span className="text-xs">
                ({context.isMainWorktree ? 'main worktree' : 'linked worktree'})
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Context Info */}
      <div className="mb-6 rounded-lg border bg-muted/50 p-4">
        <div className="text-sm">
          <span className="font-medium">Worktree:</span>{' '}
          <code className="rounded bg-background px-2 py-0.5">{context.worktreePath}</code>
        </div>
      </div>

      {/* Main Content - Sidebar + List */}
      <div className="flex gap-6">
        {/* Sidebar with Create Form */}
        <aside className="w-72 shrink-0">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-semibold text-sm">New Session</h2>
            <CreateSessionForm
              workspaceSlug={slug}
              worktreePath={worktreePath}
              sessionCount={sessions.length}
            />
          </div>
        </aside>

        {/* Session List */}
        <div className="flex-1">
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Bot className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h2 className="mb-2 text-xl font-semibold">No agent sessions yet</h2>
              <p className="text-muted-foreground">Create a session using the form on the left.</p>
            </div>
          ) : (
            <div className="rounded-lg border">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-medium">Session ID</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.map((session) => (
                    <tr key={session.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/workspaces/${slug}/agents/${session.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {session.id.slice(-12)}
                        </Link>
                        <div className="text-xs text-muted-foreground font-mono">{session.id}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <Bot className="h-4 w-4" />
                          {session.type === 'claude-code' ? 'Claude Code' : 'Copilot'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            session.status === 'active'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                              : session.status === 'completed'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}
                        >
                          {session.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {session.createdAt.toLocaleString()}
                        </div>
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
