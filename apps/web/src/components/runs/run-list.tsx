/**
 * RunList - Table of runs for a workflow
 *
 * Displays runs sorted by createdAt descending (newest first)
 * with status badges, current phase, and timing info.
 *
 * @see Plan 011: UI Mockups (AC-04)
 */

import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RunRow } from './run-row';

import type { RunSummary } from '@/data/fixtures/runs.fixture';

export interface RunListProps {
  /** Run summaries to display */
  runs: RunSummary[];
  /** Workflow slug for navigation */
  workflowSlug: string;
  /** Additional class names */
  className?: string;
}

/**
 * RunList displays a table of runs sorted by creation date.
 *
 * @example
 * <RunList
 *   runs={workflowRuns}
 *   workflowSlug="my-workflow"
 * />
 */
export function RunList({ runs, workflowSlug, className }: RunListProps) {
  // Sort by startedAt descending (newest first)
  const sortedRuns = [...runs].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  if (sortedRuns.length === 0) {
    return (
      <div className={`text-center py-8 text-muted-foreground ${className ?? ''}`}>
        <p>No runs yet</p>
        <p className="text-sm mt-1">Start a new run from the workflow page</p>
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto ${className ?? ''}`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Run ID</TableHead>
            <TableHead className="w-[120px]">Status</TableHead>
            <TableHead className="w-[150px]">Current Phase</TableHead>
            <TableHead className="w-[100px]">Progress</TableHead>
            <TableHead className="w-[120px]">Started</TableHead>
            <TableHead className="w-[100px]">Duration</TableHead>
            <TableHead>Triggered By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRuns.map((run) => (
            <RunRow key={run.runId} run={run} workflowSlug={workflowSlug} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
