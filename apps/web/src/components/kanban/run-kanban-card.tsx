'use client';

/**
 * RunKanbanCard - Enhanced card for workflow runs
 *
 * Shows run details including:
 * - Current phase and progress
 * - Blocked indicator with icon
 * - Inline question input for blocked runs
 * - Dialog for full question view
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Expand,
  MessageSquareWarning,
  Play,
  Send,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

import type { RunCard } from '@/data/fixtures/runs-board.fixture';

export interface RunKanbanCardProps {
  card: RunCard;
  /** Enable drag-drop (default true) */
  draggable?: boolean;
  /** Callback when answer is submitted */
  onSubmit?: (runId: string, questionId: string, answer: string | string[] | boolean) => void;
}

const phaseStatusIcons: Record<string, typeof Play> = {
  active: Play,
  blocked: MessageSquareWarning,
  complete: CheckCircle2,
  pending: Clock,
  failed: XCircle,
};

const phaseStatusColors: Record<string, string> = {
  active: 'text-blue-500',
  blocked: 'text-amber-500',
  complete: 'text-green-500',
  pending: 'text-muted-foreground',
  failed: 'text-red-500',
};

/**
 * RunKanbanCard displays a workflow run in kanban format.
 */
export function RunKanbanCard({ card, draggable = true, onSubmit }: RunKanbanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [answer, setAnswer] = useState<string | string[] | boolean>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Determine border color based on status
  let borderColor = 'border-l-blue-500'; // active
  if (card.hasBlockedPhase) {
    borderColor = 'border-l-amber-500';
  } else if (card.priority === 'high') {
    borderColor = 'border-l-red-500';
  } else if (card.priority === 'low') {
    borderColor = 'border-l-green-500';
  }

  const StatusIcon = card.currentPhaseStatus
    ? (phaseStatusIcons[card.currentPhaseStatus] ?? Clock)
    : CheckCircle2;

  const statusColor = card.currentPhaseStatus
    ? (phaseStatusColors[card.currentPhaseStatus] ?? 'text-muted-foreground')
    : 'text-green-500';

  const hasQuestion = card.question && card.hasBlockedPhase;

  const handleSubmit = () => {
    if (!card.question || !onSubmit) return;
    setIsSubmitting(true);
    onSubmit(card.runId, card.question.id, answer);
    // In a real app, we'd wait for the response
    setTimeout(() => {
      setIsSubmitting(false);
      setDialogOpen(false);
    }, 1000);
  };

  const cardContent = (
    <Card
      ref={setNodeRef}
      style={style}
      data-sortable="true"
      data-dragging={isDragging}
      className={cn(
        'border-l-4 transition-shadow',
        borderColor,
        draggable && 'cursor-grab',
        isDragging && 'opacity-50 shadow-lg cursor-grabbing',
        'hover:shadow-md focus:ring-2 focus:ring-primary focus:outline-none'
      )}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <StatusIcon className={cn('h-4 w-4', statusColor)} />
          <span className="flex-1">{card.runId}</span>
          {hasQuestion && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2">
        {/* Phase info */}
        {card.currentPhase && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Phase:</span>
            <span className="font-medium">{card.currentPhase}</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className={cn(
              'h-1.5 rounded-full transition-all',
              card.hasBlockedPhase
                ? 'bg-amber-500'
                : card.completedPhases === card.totalPhases
                  ? 'bg-green-500'
                  : 'bg-blue-500'
            )}
            style={{ width: `${(card.completedPhases / card.totalPhases) * 100}%` }}
          />
        </div>

        {/* Labels */}
        <div className="flex flex-wrap gap-1">
          <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full">
            {card.completedPhases}/{card.totalPhases} phases
          </span>
          {card.hasBlockedPhase && (
            <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 rounded-full flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Needs Input
            </span>
          )}
          <span className="text-xs px-1.5 py-0.5 bg-muted rounded-full">{card.triggeredBy}</span>
        </div>

        {/* Inline Question Preview (when expanded) */}
        {hasQuestion && expanded && card.question && (
          <section
            className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800 space-y-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Question preview"
          >
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {card.question.prompt.length > 100
                ? `${card.question.prompt.slice(0, 100)}...`
                : card.question.prompt}
            </p>

            {/* Quick actions for simple questions */}
            {card.question.type === 'confirm' && (
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={answer === true ? 'default' : 'outline'}
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    setAnswer(true);
                    if (onSubmit && card.question) {
                      setIsSubmitting(true);
                      onSubmit(card.runId, card.question.id, true);
                      setTimeout(() => setIsSubmitting(false), 1000);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  Yes
                </Button>
                <Button
                  size="sm"
                  variant={answer === false ? 'default' : 'outline'}
                  className="h-7 flex-1 text-xs"
                  onClick={() => {
                    setAnswer(false);
                    if (onSubmit && card.question) {
                      setIsSubmitting(true);
                      onSubmit(card.runId, card.question.id, false);
                      setTimeout(() => setIsSubmitting(false), 1000);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  No
                </Button>
              </div>
            )}

            {/* Show "View full details" button for complex questions */}
            {card.question.type !== 'confirm' && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDialogOpen(true);
                }}
              >
                <Expand className="h-3 w-3 mr-1" />
                View full question & respond
              </Button>
            )}

            {/* Link to run detail page */}
            <Link
              href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}
              className="text-xs text-muted-foreground hover:text-primary hover:underline block text-center"
              onClick={(e) => e.stopPropagation()}
            >
              Go to run details →
            </Link>
          </section>
        )}
      </CardContent>
    </Card>
  );

  // Question Dialog
  const questionDialog = hasQuestion && card.question && (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareWarning className="h-5 w-5 text-amber-500" />
            Input Required
          </DialogTitle>
          <DialogDescription>
            Run: {card.runId} • Phase: {card.currentPhase}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Full question prompt */}
          <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-md border border-amber-200 dark:border-amber-800">
            <p className="text-sm whitespace-pre-wrap">{card.question.prompt}</p>
          </div>

          {/* Full input controls */}
          {card.question.type === 'free_text' && (
            <Textarea
              placeholder="Enter your response..."
              className="min-h-[100px]"
              value={answer as string}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          {card.question.type === 'single_choice' && card.question.choices && (
            <RadioGroup value={answer as string} onValueChange={setAnswer} className="space-y-2">
              {card.question.choices.map((choice) => (
                <div key={choice} className="flex items-center space-x-3">
                  <RadioGroupItem value={choice} id={`dialog-${card.runId}-${choice}`} />
                  <Label
                    htmlFor={`dialog-${card.runId}-${choice}`}
                    className="text-sm cursor-pointer"
                  >
                    {choice}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}

          {card.question.type === 'multi_choice' && card.question.choices && (
            <div className="space-y-2">
              {card.question.choices.map((choice) => (
                <div key={choice} className="flex items-center space-x-3">
                  <Checkbox
                    id={`dialog-${card.runId}-mc-${choice}`}
                    checked={(answer as string[]).includes?.(choice)}
                    onCheckedChange={(checked) => {
                      const current = Array.isArray(answer) ? answer : [];
                      if (checked) {
                        setAnswer([...current, choice]);
                      } else {
                        setAnswer(current.filter((c) => c !== choice));
                      }
                    }}
                  />
                  <Label
                    htmlFor={`dialog-${card.runId}-mc-${choice}`}
                    className="text-sm cursor-pointer"
                  >
                    {choice}
                  </Label>
                </div>
              ))}
            </div>
          )}

          {card.question.type === 'confirm' && (
            <div className="flex gap-2">
              <Button
                variant={answer === true ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setAnswer(true)}
              >
                Yes
              </Button>
              <Button
                variant={answer === false ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setAnswer(false)}
              >
                No
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Link
            href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}
            className="text-sm text-muted-foreground hover:text-primary hover:underline"
          >
            Go to run details
          </Link>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="min-w-[100px]">
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Wrap in link only if not draggable and no question
  if (!draggable && !hasQuestion) {
    return <Link href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}>{cardContent}</Link>;
  }

  return (
    <>
      {cardContent}
      {questionDialog}
    </>
  );
}
