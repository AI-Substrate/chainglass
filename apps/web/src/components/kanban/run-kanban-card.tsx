'use client';

/**
 * RunKanbanCard - Enhanced card for workflow runs
 *
 * Shows run details including:
 * - Current phase and progress
 * - Blocked indicator with icon
 * - Inline question input for blocked runs
 * - Link to drill into run details
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
    setTimeout(() => setIsSubmitting(false), 1000);
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

        {/* Inline Question Input (when expanded) */}
        {hasQuestion && expanded && card.question && (
          <section
            className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800 space-y-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Question input"
          >
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
              {card.question.prompt.length > 100
                ? `${card.question.prompt.slice(0, 100)}...`
                : card.question.prompt}
            </p>

            {/* Compact input based on question type */}
            {card.question.type === 'free_text' && (
              <div className="flex gap-1">
                <Input
                  placeholder="Type your answer..."
                  className="h-8 text-xs"
                  value={answer as string}
                  onChange={(e) => setAnswer(e.target.value)}
                />
                <Button
                  size="sm"
                  className="h-8 px-2"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  <Send className="h-3 w-3" />
                </Button>
              </div>
            )}

            {card.question.type === 'single_choice' && card.question.choices && (
              <div className="space-y-1">
                <RadioGroup
                  value={answer as string}
                  onValueChange={setAnswer}
                  className="space-y-1"
                >
                  {card.question.choices.slice(0, 3).map((choice) => (
                    <div key={choice} className="flex items-center space-x-2">
                      <RadioGroupItem value={choice} id={`${card.runId}-${choice}`} />
                      <Label htmlFor={`${card.runId}-${choice}`} className="text-xs cursor-pointer">
                        {choice.length > 30 ? `${choice.slice(0, 30)}...` : choice}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
                {card.question.choices.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{card.question.choices.length - 3} more options
                  </p>
                )}
                <Button
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !answer}
                >
                  Submit
                </Button>
              </div>
            )}

            {card.question.type === 'multi_choice' && card.question.choices && (
              <div className="space-y-1">
                {card.question.choices.slice(0, 3).map((choice) => (
                  <div key={choice} className="flex items-center space-x-2">
                    <Checkbox
                      id={`${card.runId}-mc-${choice}`}
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
                      htmlFor={`${card.runId}-mc-${choice}`}
                      className="text-xs cursor-pointer"
                    >
                      {choice.length > 30 ? `${choice.slice(0, 30)}...` : choice}
                    </Label>
                  </div>
                ))}
                {card.question.choices.length > 3 && (
                  <p className="text-xs text-muted-foreground">
                    +{card.question.choices.length - 3} more options
                  </p>
                )}
                <Button
                  size="sm"
                  className="h-7 w-full text-xs"
                  onClick={handleSubmit}
                  disabled={isSubmitting || (answer as string[]).length === 0}
                >
                  Submit
                </Button>
              </div>
            )}

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

            {/* Link to full view */}
            <Link
              href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}
              className="text-xs text-primary hover:underline block text-center"
              onClick={(e) => e.stopPropagation()}
            >
              View full details →
            </Link>
          </section>
        )}
      </CardContent>
    </Card>
  );

  // Wrap in link only if not draggable and no question
  if (!draggable && !hasQuestion) {
    return <Link href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}>{cardContent}</Link>;
  }

  return cardContent;
}
