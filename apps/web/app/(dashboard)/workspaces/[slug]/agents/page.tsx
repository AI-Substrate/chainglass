/**
 * Agents Page - /workspaces/[slug]/agents
 *
 * Part of Plan 019: Agent Manager Refactor (Phase 5: Consolidation & Cleanup)
 * Per Subtask 001: Migrated from Plan 018's IAgentSessionService to AgentManagerService via DI.
 *
 * Server component shell with live-updating client component for agent list.
 * Per DYK-07: No worktree requirement — agents are global entities.
 * Per Discovery 11: Must await params before use (Next.js 16+).
 */

import { Bot } from 'lucide-react';
import Link from 'next/link';
import { AgentListLive } from '../../../../../src/components/agents/agent-list-live';
import { CreateSessionForm } from '../../../../../src/components/agents/create-session-form';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function WorkspaceAgentsPage({ params }: PageProps) {
  const { slug } = await params;

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
            <CreateSessionForm workspaceSlug={slug} sessionCount={0} />
          </div>
        </aside>

        {/* Agent List - live-updating via SSE */}
        <div className="flex-1">
          <AgentListLive workspaceSlug={slug} />
        </div>
      </div>
    </div>
  );
}
