/**
 * WorkflowCard - Card display for workflows in grid view
 *
 * Shows workflow summary with status indicators, run counts,
 * and waiting/blocked indicator for the All Workflows page.
 *
 * @see Plan 011: UI Mockups (AC-01)
 */

import { AlertTriangle, Clock, GitBranch, Play } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

import type { RunSummary } from '@/data/fixtures/runs.fixture';
import type { WorkflowJSON } from '@/data/fixtures/workflows.fixture';

export interface WorkflowCardProps {
  /** Workflow data */
  workflow: WorkflowJSON;
  /** Run summaries for this workflow (for counts) */
  runs?: RunSummary[];
  /** Checkpoint count */
  checkpointCount?: number;
  /** Additional class names */
  className?: string;
}

/**
 * WorkflowCard displays a workflow in the grid with key metrics.
 *
 * @example
 * <WorkflowCard
 *   workflow={workflow}
 *   runs={workflowRuns}
 *   checkpointCount={3}
 * />
 */
export function WorkflowCard({
  workflow,
  runs = [],
  checkpointCount = 0,
  className,
}: WorkflowCardProps) {
  // Calculate run statistics
  const activeRuns = runs.filter((r) => r.status === 'active');
  const blockedRuns = runs.filter((r) => r.hasBlockedPhase);
  const hasBlockedRun = blockedRuns.length > 0;
  const hasActiveRun = activeRuns.length > 0;

  // Determine card state
  const cardState = hasBlockedRun ? 'blocked' : hasActiveRun ? 'active' : 'idle';

  return (
    <Link href={`/workflows/${workflow.slug}`} className="block">
      <Card
        className={cn(
          'h-full transition-all hover:shadow-md hover:border-primary/50',
          'relative overflow-hidden',
          cardState === 'blocked' && 'border-orange-300 dark:border-orange-700',
          cardState === 'active' && 'border-blue-300 dark:border-blue-700',
          className
        )}
      >
        {/* Status indicator bar at left edge */}
        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1',
            cardState === 'blocked' && 'bg-orange-500',
            cardState === 'active' && 'bg-blue-500',
            cardState === 'idle' && 'bg-gray-300 dark:bg-gray-700'
          )}
        />

        <CardHeader className="pl-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold truncate">{workflow.slug}</CardTitle>
              {workflow.description && (
                <CardDescription className="mt-1 line-clamp-2 text-sm">
                  {workflow.description}
                </CardDescription>
              )}
            </div>

            {/* Waiting indicator */}
            {hasBlockedRun && (
              <div className="flex items-center gap-1 text-orange-600 dark:text-orange-400 shrink-0">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs font-medium">Waiting</span>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="pl-4">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {/* Phase count */}
            <div className="flex items-center gap-1.5" title="Phases">
              <GitBranch className="h-4 w-4" />
              <span>{workflow.phases.length}</span>
            </div>

            {/* Checkpoint count */}
            <div className="flex items-center gap-1.5" title="Checkpoints">
              <Clock className="h-4 w-4" />
              <span>{checkpointCount}</span>
            </div>

            {/* Run count */}
            <div className="flex items-center gap-1.5" title="Total runs">
              <Play className="h-4 w-4" />
              <span>{runs.length}</span>
            </div>

            {/* Active runs indicator */}
            {activeRuns.length > 0 && (
              <StatusBadge status="active" size="sm" showIcon className="ml-auto" />
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
