/**
 * RunHeader - Run status summary header
 *
 * Displays run ID, overall status, started time, and duration
 * at the top of the Single Run View.
 *
 * @see Plan 011: UI Mockups
 */

import { Clock, Play, User } from 'lucide-react';

import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

import type { RunSummary } from '@/data/fixtures/runs.fixture';

export interface RunHeaderProps {
  /** Run summary data */
  run: RunSummary;
  /** Additional class names */
  className?: string;
}

/**
 * Format duration to human readable
 */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'In progress';
  if (seconds < 60) return `${seconds} seconds`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

/**
 * Format timestamp to readable date/time
 */
function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

/**
 * RunHeader displays summary information about a workflow run.
 *
 * @example
 * <RunHeader run={runSummary} />
 */
export function RunHeader({ run, className }: RunHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg',
        'bg-muted/50 border',
        className
      )}
    >
      <div className="flex items-center gap-4">
        {/* Run ID */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Run</p>
          <p className="font-mono font-medium">{run.runId}</p>
        </div>

        {/* Status Badge */}
        <StatusBadge status={run.status} size="lg" showIcon />
      </div>

      <div className="flex items-center gap-6 text-sm text-muted-foreground">
        {/* Started time */}
        <div className="flex items-center gap-2">
          <Play className="h-4 w-4" />
          <div>
            <p className="text-xs uppercase tracking-wider">Started</p>
            <p className="text-foreground">{formatTimestamp(run.startedAt)}</p>
          </div>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          <div>
            <p className="text-xs uppercase tracking-wider">Duration</p>
            <p className="text-foreground">{formatDuration(run.duration)}</p>
          </div>
        </div>

        {/* Triggered by */}
        <div className="flex items-center gap-2">
          <User className="h-4 w-4" />
          <div>
            <p className="text-xs uppercase tracking-wider">Triggered by</p>
            <p className="text-foreground truncate max-w-[150px]">{run.triggeredBy}</p>
          </div>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Progress:</span>
        <span className="font-medium">
          {run.completedPhases} / {run.totalPhases} phases
        </span>
        {run.hasBlockedPhase && (
          <span className="text-orange-500 font-medium">(Waiting for input)</span>
        )}
      </div>
    </div>
  );
}
