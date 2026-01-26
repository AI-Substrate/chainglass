/**
 * RunRow - Table row for run list display
 *
 * Shows run summary with status badge, current phase,
 * timing info, and navigation to run detail.
 *
 * @see Plan 011: UI Mockups (AC-04)
 */

import Link from 'next/link';
import { Clock, User } from 'lucide-react';

import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';

import type { RunSummary } from '@/data/fixtures/runs.fixture';

export interface RunRowProps {
  /** Run summary data */
  run: RunSummary;
  /** Workflow slug for navigation */
  workflowSlug: string;
}

/**
 * Format duration in seconds to human-readable string
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Format timestamp to relative or absolute time
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * RunRow displays a single run in the runs table.
 *
 * @example
 * <Table>
 *   <TableBody>
 *     {runs.map(run => (
 *       <RunRow key={run.runId} run={run} workflowSlug="my-workflow" />
 *     ))}
 *   </TableBody>
 * </Table>
 */
export function RunRow({ run, workflowSlug }: RunRowProps) {
  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="font-mono text-sm">
        <Link
          href={`/workflows/${workflowSlug}/runs/${run.runId}`}
          className="text-primary hover:underline"
        >
          {run.runId}
        </Link>
      </TableCell>

      <TableCell>
        <StatusBadge status={run.status} size="sm" showIcon />
      </TableCell>

      <TableCell className="text-sm">
        {run.currentPhase ? (
          <div className="flex items-center gap-2">
            <span>{run.currentPhase}</span>
            {run.currentPhaseStatus && (
              <StatusBadge status={run.currentPhaseStatus} size="sm" dotOnly />
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <span>
            {run.completedPhases}/{run.totalPhases}
          </span>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatTime(run.startedAt)}</span>
        </div>
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        {formatDuration(run.duration)}
      </TableCell>

      <TableCell className="text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          <span className="truncate max-w-[120px]">{run.triggeredBy}</span>
        </div>
      </TableCell>
    </TableRow>
  );
}
