/**
 * New Worktree Page - /workspaces/[slug]/new-worktree
 *
 * Part of Plan 069: New Worktree Creation Flow - Phase 3
 *
 * Server Component that loads workspace context and initial preview,
 * then renders the NewWorktreeForm client component.
 *
 * Per DYK D1: Calls IWorkspaceService.previewCreateWorktree() directly
 * during server render — no preview server action needed.
 */

import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NewWorktreeForm } from '../../../../../src/components/workspaces/new-worktree-form';
import { getContainer } from '../../../../../src/lib/bootstrap-singleton';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function NewWorktreePage({ params }: PageProps) {
  const { slug } = await params;

  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );

  const info = await workspaceService.getInfo(slug);
  if (!info) {
    notFound();
  }

  // Load initial preview with empty name to show the next available ordinal
  let initialPreview = undefined;
  try {
    initialPreview = await workspaceService.previewCreateWorktree({
      workspaceSlug: slug,
      requestedName: 'new-worktree',
    });
  } catch {
    // Preview is best-effort — form still works without it
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/workspaces/${slug}`}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {info.name}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">New Worktree</h1>
        <p className="text-muted-foreground mt-1">
          Create a new git worktree from the canonical main branch.
        </p>
      </div>

      <NewWorktreeForm
        workspaceSlug={slug}
        workspaceName={info.name}
        mainRepoPath={info.path}
        initialPreview={initialPreview ?? undefined}
      />
    </div>
  );
}
