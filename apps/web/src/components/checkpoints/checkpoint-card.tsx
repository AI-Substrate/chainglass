/**
 * CheckpointCard - Card display for workflow checkpoints
 *
 * Shows checkpoint version, creation date, commit hash, and comment
 * in the checkpoint timeline.
 *
 * @see Plan 011: UI Mockups
 */

import { GitCommit, Calendar, MessageSquare } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { CheckpointMetadataJSON } from '@/data/fixtures/workflows.fixture';

export interface CheckpointCardProps {
  /** Checkpoint metadata */
  checkpoint: CheckpointMetadataJSON;
  /** Whether this is the current/active checkpoint */
  isActive?: boolean;
  /** Callback when View button is clicked */
  onView?: () => void;
  /** Callback when Start Run button is clicked */
  onStartRun?: () => void;
  /** Additional class names */
  className?: string;
}

/**
 * Format date to relative or absolute string
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString();
}

/**
 * CheckpointCard displays a checkpoint in the timeline.
 *
 * @example
 * <CheckpointCard
 *   checkpoint={checkpoint}
 *   isActive={index === 0}
 *   onView={() => handleView(checkpoint)}
 * />
 */
export function CheckpointCard({
  checkpoint,
  isActive = false,
  onView,
  onStartRun,
  className,
}: CheckpointCardProps) {
  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all',
        isActive && 'border-primary bg-primary/5',
        className
      )}
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      )}

      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-mono flex items-center gap-2">
          <GitCommit className="h-4 w-4 text-muted-foreground" />
          {checkpoint.version}
          {isActive && (
            <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              Current
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>{formatDate(checkpoint.createdAt)}</span>
        </div>

        {checkpoint.comment && (
          <div className="flex items-start gap-2 text-sm">
            <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
            <span className="line-clamp-2">{checkpoint.comment}</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {onView && (
            <Button variant="outline" size="sm" onClick={onView} className="flex-1">
              View
            </Button>
          )}
          {onStartRun && (
            <Button variant="outline" size="sm" onClick={onStartRun} className="flex-1">
              Start Run
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
