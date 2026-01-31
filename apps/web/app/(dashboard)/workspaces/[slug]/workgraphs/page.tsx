/**
 * WorkGraphs List Page - /workspaces/[slug]/workgraphs
 *
 * Part of Plan 022: WorkGraph UI - Phase 2
 *
 * Server component that shows workgraphs for a workspace's worktree.
 * Per DYK#1: Routes under /workspaces/[slug]/workgraphs/...
 * Per DYK#5: listGraphs() returns [] - show helpful empty state
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { GitBranch, Network, Terminal } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { IWorkGraphUIService } from '../../../../../src/features/022-workgraph-ui';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';
import { DI_TOKENS } from '../../../../../src/lib/di-container';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    worktree?: string;
  }>;
}

export default async function WorkGraphsPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
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

  // Load graphs
  const result = await workgraphService.listGraphs(context);
  const graphSlugs = result.errors.length === 0 ? result.graphSlugs : [];

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
        <span>WorkGraphs</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">WorkGraphs</h1>
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

      {/* Graph List or Empty State */}
      {graphSlugs.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <Network className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold">No WorkGraphs Found</h2>
          <p className="mb-4 text-muted-foreground">
            Create a workgraph using the CLI to get started.
          </p>

          {/* CLI guidance per DYK#5 */}
          <div className="mx-auto max-w-md rounded-lg bg-muted p-4 text-left">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Terminal className="h-4 w-4" />
              Create via CLI
            </div>
            <code className="block rounded bg-background px-3 py-2 text-sm">
              wg create my-graph
            </code>
          </div>

          {/* Direct navigation input */}
          <div className="mx-auto mt-6 max-w-md">
            <p className="mb-2 text-sm text-muted-foreground">
              Or open an existing graph directly:
            </p>
            <form action={`/workspaces/${slug}/workgraphs`} method="get" className="flex gap-2">
              <input
                type="text"
                name="open"
                placeholder="graph-slug"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90"
              >
                Open
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Graph</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {graphSlugs.map((graphSlug) => (
                <tr key={graphSlug} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/workspaces/${slug}/workgraphs/${graphSlug}${worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : ''}`}
                      className="font-medium hover:underline"
                    >
                      {graphSlug}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/workspaces/${slug}/workgraphs/${graphSlug}${worktreePath ? `?worktree=${encodeURIComponent(worktreePath)}` : ''}`}
                      className="text-sm text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
