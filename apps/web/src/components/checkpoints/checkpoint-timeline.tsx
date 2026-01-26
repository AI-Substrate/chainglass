/**
 * CheckpointTimeline - Vertical timeline of workflow checkpoints
 *
 * Displays checkpoints in chronological order with View/Start Run actions.
 * For mockup phase, restore action is view-only (not functional).
 *
 * @see Plan 011: UI Mockups
 */

import { History } from 'lucide-react';

import { CheckpointCard } from './checkpoint-card';
import { cn } from '@/lib/utils';

import type { CheckpointMetadataJSON } from '@/data/fixtures/workflows.fixture';

export interface CheckpointTimelineProps {
  /** Checkpoints to display (should be sorted newest first) */
  checkpoints: CheckpointMetadataJSON[];
  /** Callback when View is clicked */
  onView?: (checkpoint: CheckpointMetadataJSON) => void;
  /** Callback when Start Run is clicked */
  onStartRun?: (checkpoint: CheckpointMetadataJSON) => void;
  /** Additional class names */
  className?: string;
}

/**
 * CheckpointTimeline displays a vertical list of checkpoints.
 *
 * @example
 * <CheckpointTimeline
 *   checkpoints={checkpoints}
 *   onView={(cp) => router.push(`/workflows/${slug}/checkpoints/${cp.version}`)}
 * />
 */
export function CheckpointTimeline({
  checkpoints,
  onView,
  onStartRun,
  className,
}: CheckpointTimelineProps) {
  if (checkpoints.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No checkpoints yet</p>
        <p className="text-sm mt-1">Checkpoints are created when you save workflow changes</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
        <History className="h-4 w-4" />
        <span>{checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border" />

        <div className="space-y-4">
          {checkpoints.map((checkpoint, index) => (
            <div key={checkpoint.version} className="relative pl-8">
              {/* Timeline dot */}
              <div
                className={cn(
                  'absolute left-[10px] top-4 w-[11px] h-[11px] rounded-full border-2 bg-background',
                  index === 0
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/50'
                )}
              />

              <CheckpointCard
                checkpoint={checkpoint}
                isActive={index === 0}
                onView={onView ? () => onView(checkpoint) : undefined}
                onStartRun={onStartRun ? () => onStartRun(checkpoint) : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
