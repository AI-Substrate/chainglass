/**
 * Worktree Landing Page - /workspaces/[slug]/worktree
 *
 * Part of Plan 018: Agent Workspace Data Model Migration (Phase 3)
 * Subtask 001: Worktree Landing Page & Agents Page Restructure
 *
 * Server component showing worktree info with feature cards.
 * Uses ?worktree= query param for context selection.
 *
 * Per Discovery 04: Uses `export const dynamic = 'force-dynamic'` for DI container access.
 * Per Discovery 11: Async params pattern (await params, await searchParams).
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IAgentSessionService, ISampleService, IWorkspaceService } from '@chainglass/workflow';
import { Bot, FileText, GitBranch, LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
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

export default async function WorktreeLandingPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { worktree: worktreePath } = await searchParams;

  // Redirect to workspace detail if no worktree specified
  if (!worktreePath) {
    redirect(`/workspaces/${slug}`);
  }

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sampleService = container.resolve<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE);
  const sessionService = container.resolve<IAgentSessionService>(
    WORKSPACE_DI_TOKENS.AGENT_SESSION_SERVICE
  );

  // Resolve context
  const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

  if (!context) {
    notFound();
  }

  // Get workspace info for breadcrumb
  const info = await workspaceService.getInfo(slug);

  // Get counts for feature cards
  const [samples, sessions] = await Promise.all([
    sampleService.list(context),
    sessionService.listSessions(context),
  ]);

  // Build URLs with worktree param
  const agentsUrl = `/workspaces/${slug}/agents?worktree=${encodeURIComponent(worktreePath)}`;
  const samplesUrl = `/workspaces/${slug}/samples?worktree=${encodeURIComponent(worktreePath)}`;

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
        <span>{context.worktreeBranch || 'worktree'}</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <LayoutDashboard className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold">{context.worktreeBranch || 'Worktree'}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            {context.isMainWorktree ? 'main worktree' : 'linked worktree'}
          </div>
        </div>
      </div>

      {/* Worktree Info */}
      <div className="mb-6 rounded-lg border bg-muted/50 p-4">
        <div className="text-sm">
          <span className="font-medium">Path:</span>{' '}
          <code className="rounded bg-background px-2 py-0.5">{context.worktreePath}</code>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Agents Card */}
        <Link
          href={agentsUrl}
          className="group rounded-lg border p-6 transition-colors hover:bg-muted/50"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold group-hover:text-primary">Agent Sessions</h2>
              <p className="text-sm text-muted-foreground">
                {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            View and manage AI agent sessions for this worktree.
          </p>
        </Link>

        {/* Samples Card */}
        <Link
          href={samplesUrl}
          className="group rounded-lg border p-6 transition-colors hover:bg-muted/50"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold group-hover:text-primary">Samples</h2>
              <p className="text-sm text-muted-foreground">
                {samples.length} {samples.length === 1 ? 'sample' : 'samples'}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Browse and manage code samples for this worktree.
          </p>
        </Link>
      </div>
    </div>
  );
}
