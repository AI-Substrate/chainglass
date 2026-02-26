/**
 * Workflow List Page — /workspaces/[slug]/workflows
 *
 * Server Component that lists all workflows in the workspace.
 *
 * Phase 2+3 — Plan 050
 */

import { WorkflowListClient } from '@/features/050-workflow-page/components/workflow-list-client';
import { Suspense } from 'react';
import { listWorkflows } from '../../../../actions/workflow-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkflowListPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const worktreePath = typeof sp.worktree === 'string' ? sp.worktree : undefined;
  const result = await listWorkflows(slug, worktreePath);

  if (result.errors.length > 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {result.errors[0]?.message ?? 'Failed to load workflows'}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Suspense fallback={<div className="p-4">Loading...</div>}>
        <WorkflowListClient slug={slug} workflows={result.workflows} worktreePath={worktreePath} />
      </Suspense>
    </div>
  );
}
