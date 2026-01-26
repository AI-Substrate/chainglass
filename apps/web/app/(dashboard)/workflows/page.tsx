/**
 * All Workflows Page
 *
 * Displays a grid of workflow cards with status indicators and run counts.
 * Sorted by activity (blocked/active first, then by name).
 *
 * @see Plan 011: UI Mockups (AC-01)
 */

import { WorkflowCard } from '@/components/workflows/workflow-card';
import { WorkflowBreadcrumb } from '@/components/ui/workflow-breadcrumb';
import { DEMO_WORKFLOWS } from '@/data/fixtures/workflows.fixture';
import { DEMO_RUN_SUMMARIES, DEMO_CHECKPOINTS } from '@/data/fixtures/runs.fixture';

export default function WorkflowsPage() {
  // Get run summaries grouped by workflow
  const runsByWorkflow = DEMO_RUN_SUMMARIES.reduce(
    (acc, run) => {
      if (!acc[run.workflowSlug]) {
        acc[run.workflowSlug] = [];
      }
      acc[run.workflowSlug].push(run);
      return acc;
    },
    {} as Record<string, typeof DEMO_RUN_SUMMARIES>
  );

  // Sort workflows: blocked first, then active, then by name
  const sortedWorkflows = [...DEMO_WORKFLOWS].sort((a, b) => {
    const aRuns = runsByWorkflow[a.slug] ?? [];
    const bRuns = runsByWorkflow[b.slug] ?? [];

    const aHasBlocked = aRuns.some((r) => r.hasBlockedPhase);
    const bHasBlocked = bRuns.some((r) => r.hasBlockedPhase);
    const aHasActive = aRuns.some((r) => r.status === 'active');
    const bHasActive = bRuns.some((r) => r.status === 'active');

    if (aHasBlocked !== bHasBlocked) return aHasBlocked ? -1 : 1;
    if (aHasActive !== bHasActive) return aHasActive ? -1 : 1;
    return a.slug.localeCompare(b.slug);
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <WorkflowBreadcrumb />

      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
        <p className="text-muted-foreground">
          Browse and manage your workflow templates and runs
        </p>
      </div>

      {/* Workflow grid - responsive columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedWorkflows.map((workflow) => (
          <WorkflowCard
            key={workflow.slug}
            workflow={workflow}
            runs={runsByWorkflow[workflow.slug]}
            checkpointCount={DEMO_CHECKPOINTS.length}
          />
        ))}
      </div>

      {sortedWorkflows.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No workflows found</p>
          <p className="text-sm mt-1">Create a new workflow to get started</p>
        </div>
      )}
    </div>
  );
}
