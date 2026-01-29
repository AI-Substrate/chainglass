/**
 * WorkGraph Detail Page - /workspaces/[slug]/workgraphs/[graphSlug]
 *
 * Part of Plan 022: WorkGraph UI - Phase 2
 *
 * Server component that fetches graph data and passes to client component.
 * Per DYK#1: Routes under /workspaces/[slug]/workgraphs/...
 * Per DYK#3: Server Component fetches, Client child renders React Flow
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { ArrowLeft, GitBranch, Network } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type {
  IWorkGraphUIService,
  UINodeState,
} from '../../../../../../src/features/022-workgraph-ui';
import type { WorkGraphFlowData } from '../../../../../../src/features/022-workgraph-ui/use-workgraph-flow';
import { getContainer } from '../../../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../../../src/lib/di-container';
import { WorkGraphDetailClient } from './workgraph-detail-client';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
    graphSlug: string;
  }>;
  searchParams: Promise<{
    worktree?: string;
  }>;
}

export default async function WorkGraphDetailPage({ params, searchParams }: PageProps) {
  const { slug, graphSlug } = await params;
  const { worktree: worktreePath } = await searchParams;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const workgraphService = container.resolve<IWorkGraphUIService>(DI_TOKENS.WORKGRAPH_UI_SERVICE);

  // Resolve context
  const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

  if (!context) {
    notFound();
  }

  // Get workspace info for breadcrumb
  const info = await workspaceService.getInfo(slug);

  // Load graph instance
  let graphData: WorkGraphFlowData;
  try {
    const instance = await workgraphService.getInstance(context, graphSlug);

    // Serialize nodes from Map to array for JSON transfer
    const nodes: WorkGraphFlowData['nodes'] = [];
    for (const node of instance.nodes.values()) {
      nodes.push({
        id: node.id,
        status: node.status,
        position: node.position,
        unit: node.unit,
        type: node.type,
        questionId: node.questionId,
        errorMessage: node.errorMessage,
      });
    }

    graphData = {
      nodes,
      edges: instance.edges,
    };
  } catch (error) {
    // Graph not found
    notFound();
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {/* Breadcrumb */}
        <nav className="mb-2 text-sm text-muted-foreground">
          <Link href="/workspaces" className="hover:underline">
            Workspaces
          </Link>
          {' / '}
          <Link href={`/workspaces/${slug}`} className="hover:underline">
            {info?.name || slug}
          </Link>
          {' / '}
          <Link
            href={`/workspaces/${slug}/workgraphs${worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : ''}`}
            className="hover:underline"
          >
            WorkGraphs
          </Link>
          {' / '}
          <span>{graphSlug}</span>
        </nav>

        {/* Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/workspaces/${slug}/workgraphs${worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : ''}`}
              className="rounded-md p-1 hover:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Network className="h-6 w-6" />
            <div>
              <h1 className="text-xl font-bold">{graphSlug}</h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                {context.worktreeBranch || 'main'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas (Client Component) */}
      <div className="flex-1">
        <WorkGraphDetailClient data={graphData} />
      </div>
    </div>
  );
}
