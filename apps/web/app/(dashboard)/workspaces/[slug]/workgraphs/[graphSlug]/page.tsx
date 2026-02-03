/**
 * WorkGraph Detail Page - /workspaces/[slug]/workgraphs/[graphSlug]
 *
 * Part of Plan 022: WorkGraph UI - Phase 2
 *
 * Server component that fetches graph data and passes to client component.
 * Per DYK#1: Routes under /workspaces/[slug]/workgraphs/...
 * Per DYK#3: Server Component fetches, Client child renders React Flow
 */

import { WORKGRAPH_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import type { IWorkGraphService, IWorkUnitService, WorkUnit } from '@chainglass/workgraph';
import { ArrowLeft, GitBranch, Network } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { IWorkGraphUIService } from '../../../../../../src/features/022-workgraph-ui';
import type {
  NodePortDeclaration,
  WorkGraphFlowData,
} from '../../../../../../src/features/022-workgraph-ui/use-workgraph-flow';
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
  const workUnitService = container.resolve<IWorkUnitService>(WORKGRAPH_DI_TOKENS.WORKUNIT_SERVICE);
  const workGraphBackend = container.resolve<IWorkGraphService>(
    WORKGRAPH_DI_TOKENS.WORKGRAPH_SERVICE
  );

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

    // Get status result to map node IDs to unit slugs
    // (instance cache may not have unit set on older instances)
    const statusResult = await workGraphBackend.status(context, graphSlug);
    const nodeUnitSlugs = new Map<string, string>();
    for (const entry of statusResult.nodes) {
      if (entry.unit) nodeUnitSlugs.set(entry.id, entry.unit);
    }

    // Collect unique unit slugs and load their metadata
    const unitSlugs = new Set<string>();
    for (const unitSlug of nodeUnitSlugs.values()) {
      unitSlugs.add(unitSlug);
    }

    const unitMap = new Map<string, WorkUnit>();
    const unitLoadResults = await Promise.all(
      [...unitSlugs].map((slug) => workUnitService.load(context, slug))
    );
    for (const result of unitLoadResults) {
      if (result.unit) {
        unitMap.set(result.unit.slug, result.unit);
      }
    }

    // Helper to extract serializable port declarations
    const toPorts = (
      declarations: { name: string; type: 'data' | 'file'; dataType?: string }[]
    ): NodePortDeclaration[] =>
      declarations.map((d) => ({
        name: d.name,
        type: d.type,
        dataType: d.dataType as NodePortDeclaration['dataType'],
      }));

    // Serialize nodes from Map to array for JSON transfer
    const nodes: WorkGraphFlowData['nodes'] = [];
    let nodeIndex = 0;
    for (const node of instance.nodes.values()) {
      const unitSlug = node.unit ?? nodeUnitSlugs.get(node.id);
      const unit = unitSlug ? unitMap.get(unitSlug) : undefined;
      nodes.push({
        id: node.id,
        status: node.status,
        position: { x: node.position.x, y: nodeIndex * 250 },
        unit: unitSlug,
        type: node.type,
        unitType: unit?.type,
        unitDescription: unit?.description,
        outputs: unit?.outputs ? toPorts(unit.outputs) : undefined,
        inputs: unit?.inputs ? toPorts(unit.inputs) : undefined,
        questionId: node.questionId,
        errorMessage: node.errorMessage,
      });
      nodeIndex++;
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
        <WorkGraphDetailClient
          data={graphData}
          workspaceSlug={slug}
          graphSlug={graphSlug}
          worktreePath={worktreePath}
        />
      </div>
    </div>
  );
}
