/**
 * Workflow List Page — /workspaces/[slug]/workflows
 *
 * Server Component that lists all workflows in the workspace.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import { WorkflowList } from '@/features/050-workflow-page/components/workflow-list';
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
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <h1 className="text-lg font-semibold">Workflows</h1>
        <div className="flex gap-2">
          <button
            type="button"
            disabled
            className="px-3 py-1.5 text-xs rounded border text-muted-foreground cursor-not-allowed"
            title="Coming in Phase 3"
          >
            New Blank
          </button>
          <button
            type="button"
            disabled
            className="px-3 py-1.5 text-xs rounded border text-muted-foreground cursor-not-allowed"
            title="Coming in Phase 3"
          >
            New from Template
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        <Suspense fallback={<div className="p-4">Loading...</div>}>
          <WorkflowList slug={slug} workflows={result.workflows} worktreePath={worktreePath} />
        </Suspense>
      </div>
    </div>
  );
}
