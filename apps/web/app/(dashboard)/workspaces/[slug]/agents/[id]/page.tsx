/**
 * Agent Session Detail Page - /workspaces/[slug]/agents/[id]
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 *
 * Server component that shows details and events for a specific agent session.
 *
 * Per DYK-02: Uses notFound() for invalid workspace or session.
 * Per Discovery 04: Uses `export const dynamic = 'force-dynamic'` for DI container access.
 * Per DYK-04: Client components can use useServerSession with workspaceSlug for real-time events.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type {
  IAgentEventAdapter,
  IAgentSessionService,
  IWorkspaceService,
} from '@chainglass/workflow';
import { ArrowLeft, Bot, Calendar, Clock, GitBranch, Zap } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DeleteSessionButton } from '../../../../../../src/components/agents/delete-session-button';
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

export default async function AgentSessionDetailPage({ params, searchParams }: PageProps) {
  const { slug, id } = await params;
  const { worktree: worktreePath } = await searchParams;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );
  const eventAdapter = container.resolve<IAgentEventAdapter>(
    WORKSPACE_DI_TOKENS.AGENT_EVENT_ADAPTER
  );

  // Resolve context - per DYK-02: use notFound() for invalid slug
  const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

  if (!context) {
    notFound();
  }

  // Load session
  const session = await sessionService.getSession(context, id);

  if (!session) {
    notFound();
  }

  // Load events (if any exist)
  let events: Array<{ id: string; type: string; timestamp: string; data: unknown }> = [];
  try {
    const hasEvents = await eventAdapter.exists(context, id);
    if (hasEvents) {
      const rawEvents = await eventAdapter.getAll(context, id);
      events = rawEvents.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: e.timestamp,
        data: e.data,
      }));
    }
  } catch {
    // Events may not exist yet - that's ok
  }

  // Get workspace info for breadcrumb
  const info = await workspaceService.getInfo(slug);

  return (
    <div className="container mx-auto py-6">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-muted-foreground">
        <Link href="/workspaces" className="hover:underline">
          Workspaces
        </Link>
        {' / '}
        <Link href={`/workspaces/${slug}`} className="hover:underline">
          {info?.name || slug}
        </Link>
        {' / '}
        <Link href={`/workspaces/${slug}/agents`} className="hover:underline">
          Agents
        </Link>
        {' / '}
        <span>{session.id.slice(-12)}</span>
      </nav>

      {/* Back Link */}
      <Link
        href={`/workspaces/${slug}/agents`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sessions
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold font-mono">{session.id}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4" />
              {context.worktreeBranch || 'main'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              session.status === 'active'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                : session.status === 'completed'
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
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

      {/* Session Info */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" />
            Type
          </div>
          <div className="mt-1 text-lg font-medium">
            {session.type === 'claude-code' ? 'Claude Code' : 'Copilot'}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            Created
          </div>
          <div className="mt-1 text-lg font-medium">{session.createdAt.toLocaleDateString()}</div>
          <div className="text-sm text-muted-foreground">
            {session.createdAt.toLocaleTimeString()}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Updated
          </div>
          <div className="mt-1 text-lg font-medium">{session.updatedAt.toLocaleDateString()}</div>
          <div className="text-sm text-muted-foreground">
            {session.updatedAt.toLocaleTimeString()}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4" />
            Events
          </div>
          <div className="mt-1 text-lg font-medium">{events.length}</div>
        </div>
      </div>

      {/* Events List */}
      <div className="rounded-lg border">
        <div className="border-b bg-muted/50 px-4 py-3">
          <h2 className="font-semibold">Event Log</h2>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Zap className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>No events recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y max-h-[500px] overflow-auto">
            {events.map((event) => (
              <div key={event.id} className="px-4 py-3 hover:bg-muted/50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {event.type}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">{event.id}</span>
                    </div>
                    <pre className="mt-2 text-xs bg-muted/50 rounded p-2 overflow-auto max-w-full">
                      {JSON.stringify(event.data, null, 2)}
                    </pre>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
