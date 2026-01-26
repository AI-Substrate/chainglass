import Link from 'next/link';

import { RunsKanbanContent } from '@/components/kanban';
import { Button } from '@/components/ui/button';
import { DEMO_RUNS_BOARD } from '@/data/fixtures';

/**
 * KanbanPage - Workflow Runs Kanban Board
 *
 * Shows all workflow runs organized by status:
 * - Active: Currently running
 * - Blocked: Waiting for user input
 * - Complete: Finished successfully
 * - Failed: Errored out
 *
 * Each card links to the run detail page.
 */
export default function KanbanPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflow Runs</h1>
          <p className="text-muted-foreground mt-2">
            Monitor all workflow runs. Click a run to see details and respond to questions.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/workflows">View Workflows</Link>
        </Button>
      </div>

      <RunsKanbanContent board={DEMO_RUNS_BOARD} />
    </div>
  );
}
