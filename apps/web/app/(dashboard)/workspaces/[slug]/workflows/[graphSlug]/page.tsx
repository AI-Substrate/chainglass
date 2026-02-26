/**
 * Workflow Editor Page — /workspaces/[slug]/workflows/[graphSlug]
 *
 * Server Component that loads graph data via DI and passes to WorkflowEditor client.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import { WorkflowEditor } from '@/features/050-workflow-page/components/workflow-editor';
import { Suspense } from 'react';
import { listWorkUnits, loadWorkflow } from '../../../../../actions/workflow-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string; graphSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WorkflowEditorPage({ params, searchParams }: PageProps) {
  const { slug, graphSlug } = await params;
  const sp = await searchParams;
  const worktreePath = typeof sp.worktree === 'string' ? sp.worktree : undefined;

  const [workflowResult, unitsResult] = await Promise.all([
    loadWorkflow(slug, graphSlug, worktreePath),
    listWorkUnits(slug, worktreePath),
  ]);

  if (
    workflowResult.errors.length > 0 ||
    !workflowResult.definition ||
    !workflowResult.graphStatus
  ) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {workflowResult.errors[0]?.message ?? 'Workflow not found'}
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-4">Loading workflow...</div>}>
      <WorkflowEditor
        graphSlug={graphSlug}
        graphStatus={workflowResult.graphStatus}
        definition={workflowResult.definition}
        units={unitsResult.units}
      />
    </Suspense>
  );
}
