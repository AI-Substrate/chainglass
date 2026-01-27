/**
 * Samples Page - /workspaces/[slug]/samples
 *
 * Part of Plan 014: Workspaces - Phase 6: Web UI
 *
 * Server component that shows samples for a workspace's worktree.
 * Uses ?worktree= query param for context selection (T010).
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { ISampleService, IWorkspaceService } from '@chainglass/workflow';
import { FileText, GitBranch, Plus } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SampleCreateForm } from '../../../../../src/components/workspaces/sample-create-form';
import { SampleDeleteButton } from '../../../../../src/components/workspaces/sample-delete-button';
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

export default async function SamplesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { worktree: worktreePath } = await searchParams;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const sampleService = container.resolve<ISampleService>(WORKSPACE_DI_TOKENS.SAMPLE_SERVICE);

  // Resolve context
  const context = await workspaceService.resolveContextFromParams(slug, worktreePath);

  if (!context) {
    notFound();
  }

  // Load samples
  const samples = await sampleService.list(context);

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
        <span>Samples</span>
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="h-8 w-8" />
          <div>
            <h1 className="text-3xl font-bold">Samples</h1>
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

      {/* Add Sample Form */}
      <div className="mb-8 rounded-lg border p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Plus className="h-5 w-5" />
          Add Sample
        </h2>
        <SampleCreateForm
          workspaceSlug={context.workspaceSlug}
          worktreePath={context.worktreePath}
        />
      </div>

      {/* Sample List */}
      {samples.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="mb-2 text-xl font-semibold">No samples yet</h2>
          <p className="text-muted-foreground">Add a sample above to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Name</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Description</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
                <th className="px-4 py-3 text-right text-sm font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {samples.map((sample) => (
                <tr key={sample.slug} className="hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <div className="font-medium">{sample.name}</div>
                    <div className="text-xs text-muted-foreground">{sample.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {sample.description || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {sample.createdAt.toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <SampleDeleteButton
                      sampleSlug={sample.slug}
                      sampleName={sample.name}
                      workspaceSlug={context.workspaceSlug}
                      worktreePath={context.worktreePath}
                    />
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
