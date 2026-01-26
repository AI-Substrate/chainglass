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
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Expand,
  HelpCircle,
  MessageSquareWarning,
  Play,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { AgentSessionDialog } from '@/components/agents';
import { getAgentSessionByRunId } from '@/data/fixtures/agent-sessions.fixture';

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
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [answer, setAnswer] = useState<string | string[] | boolean>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get agent session for this run (if available)
  const agentSession = getAgentSessionByRunId(card.runId);
  const showAgentButton =
    agentSession && (card.hasBlockedPhase || card.currentPhaseStatus === 'active');

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
        'border-l-4 transition-all duration-200',
        borderColor,
        draggable && 'cursor-grab',
        isDragging && 'opacity-50 shadow-xl cursor-grabbing scale-105',
        'hover:shadow-lg hover:border-l-[6px] focus:ring-2 focus:ring-primary focus:outline-none',
        'bg-card/80 backdrop-blur-sm',
        // Add glow effect for blocked cards that need input
        hasQuestion && 'ring-2 ring-amber-400/30 shadow-amber-500/20 shadow-lg'
      )}
      {...(draggable ? { ...attributes, ...listeners } : {})}
    >
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-3">
          <div
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              card.hasBlockedPhase
                ? 'bg-amber-500/15'
                : card.currentPhaseStatus === 'complete'
                  ? 'bg-emerald-500/15'
                  : card.currentPhaseStatus === 'failed'
                    ? 'bg-red-500/15'
                    : 'bg-blue-500/15'
            )}
          >
            <StatusIcon className={cn('h-4 w-4', statusColor)} />
          </div>
          <span className="flex-1 font-mono text-sm">{card.runId}</span>
          {hasQuestion && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'h-8 w-8 p-0 transition-all duration-300',
                expanded
                  ? 'bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-900/50'
                  : 'hover:bg-amber-100 dark:hover:bg-amber-900/30 animate-pulse'
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4 text-amber-600" />
              ) : (
                <ChevronDown className="h-4 w-4 text-amber-600" />
              )}
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-3">
        {/* Phase info */}
        {card.currentPhase && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Phase:</span>
            <span className="font-medium capitalize">{card.currentPhase}</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span className="font-medium tabular-nums">
              {card.completedPhases}/{card.totalPhases}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className={cn(
                'h-2 rounded-full transition-all duration-500',
                card.hasBlockedPhase
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                  : card.completedPhases === card.totalPhases
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                    : 'bg-gradient-to-r from-blue-500 to-indigo-500'
              )}
              style={{ width: `${(card.completedPhases / card.totalPhases) * 100}%` }}
            />
          </div>
        </div>

        {/* Labels */}
        <div className="flex flex-wrap gap-2 pt-1">
          {card.hasBlockedPhase && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-md border border-amber-500/20">
              <AlertCircle className="h-3.5 w-3.5" />
              Needs Input
            </span>
          )}
          <span className="text-xs px-2.5 py-1 bg-muted/80 rounded-md font-medium">
            {card.triggeredBy}
          </span>
        </div>

        {/* Agent Session Button */}
        {showAgentButton && (
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'w-full mt-3 h-9 text-xs font-medium gap-2 rounded-lg transition-all duration-200',
              'border-2 border-violet-300 dark:border-violet-700',
              'bg-violet-50 dark:bg-violet-950/30',
              'text-violet-700 dark:text-violet-300',
              'hover:bg-violet-100 dark:hover:bg-violet-900/50',
              'hover:border-violet-400 dark:hover:border-violet-600',
              'hover:shadow-md hover:shadow-violet-500/10',
              agentSession.status === 'running' && 'animate-pulse'
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setAgentDialogOpen(true);
            }}
          >
            <Bot className="h-4 w-4" />
            {agentSession.status === 'running' ? 'View Running Agent' : 'Open Agent Session'}
          </Button>
        )}

        {/* Inline Question Input (when expanded) */}
        {hasQuestion && expanded && card.question && (
          <section
            className="mt-4 pt-4 border-t-2 border-amber-300/60 dark:border-amber-700/60 space-y-4 animate-in slide-in-from-top-2 duration-200"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            aria-label="Question input"
          >
            {/* Question header with icon and pulsing indicator */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className="relative">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30">
                  <HelpCircle className="h-4 w-4" />
                </div>
                {/* Pulsing ring */}
                <div className="absolute inset-0 rounded-full bg-amber-400 animate-ping opacity-30" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Input Required
                </span>
                <span className="text-[10px] text-amber-600/70 dark:text-amber-400/70">
                  Workflow paused - awaiting your response
                </span>
              </div>
            </div>

            {/* Question prompt with enhanced styling and glow */}
            <div className="relative bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50 dark:from-amber-950/50 dark:via-orange-950/40 dark:to-amber-950/50 p-4 rounded-xl border border-amber-300/80 dark:border-amber-700/80 shadow-lg shadow-amber-500/10">
              {/* Decorative elements */}
              <div className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-400 opacity-25 blur-sm" />
              <div className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full bg-gradient-to-br from-orange-400 to-amber-400 opacity-20 blur-sm" />
              {/* Question icon */}
              <div className="absolute -top-2.5 left-3 px-2 py-0.5 bg-white dark:bg-gray-900 rounded text-[10px] font-semibold text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                Question
              </div>
              <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed font-medium pt-1">
                {card.question.prompt}
              </p>
            </div>

            {/* Inline input for free_text - Enhanced */}
            {card.question.type === 'free_text' && (
              <div className="space-y-3">
                <div className="relative group">
                  <Textarea
                    placeholder="Type your response here..."
                    className={cn(
                      'min-h-[100px] text-sm resize-none rounded-xl pr-16',
                      'bg-white dark:bg-gray-900/50',
                      'border-2 border-gray-200 dark:border-gray-700',
                      'focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20',
                      'placeholder:text-gray-400 dark:placeholder:text-gray-500',
                      'transition-all duration-300',
                      'shadow-inner hover:shadow-md hover:border-amber-300'
                    )}
                    value={answer as string}
                    onChange={(e) => setAnswer(e.target.value)}
                  />
                  {/* Character count with color coding */}
                  <div
                    className={cn(
                      'absolute bottom-2.5 right-3 text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors',
                      (answer as string).length > 0
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                        : 'text-gray-400'
                    )}
                  >
                    {(answer as string).length > 0
                      ? `${(answer as string).length} chars`
                      : 'Start typing...'}
                  </div>
                </div>
                <Button
                  size="sm"
                  className={cn(
                    'h-10 w-full font-semibold text-sm rounded-xl',
                    'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_100%]',
                    'hover:bg-[position:100%_0] transition-all duration-500',
                    'text-white border-0',
                    'shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50',
                    'disabled:opacity-50 disabled:shadow-none',
                    'flex items-center justify-center gap-2'
                  )}
                  onClick={handleSubmit}
                  disabled={isSubmitting || !(answer as string).trim()}
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Response
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Inline input for single_choice - Enhanced */}
            {card.question.type === 'single_choice' && card.question.choices && (
              <div className="space-y-3">
                <RadioGroup
                  value={answer as string}
                  onValueChange={setAnswer}
                  className="space-y-2"
                >
                  {card.question.choices.map((choice, idx) => (
                    <div
                      key={choice}
                      className={cn(
                        'group flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer',
                        'transition-all duration-200 ease-out',
                        answer === choice
                          ? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 shadow-md shadow-amber-500/20 scale-[1.02]'
                          : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 hover:shadow-sm'
                      )}
                    >
                      <RadioGroupItem
                        value={choice}
                        id={`inline-${card.runId}-${idx}`}
                        className={cn(
                          'h-5 w-5 border-2',
                          answer === choice
                            ? 'border-amber-500 text-amber-600'
                            : 'border-gray-300 dark:border-gray-600'
                        )}
                      />
                      <Label
                        htmlFor={`inline-${card.runId}-${idx}`}
                        className={cn(
                          'text-sm cursor-pointer flex-1 leading-snug font-medium',
                          answer === choice
                            ? 'text-amber-900 dark:text-amber-100'
                            : 'text-gray-700 dark:text-gray-300'
                        )}
                      >
                        {choice}
                      </Label>
                      {answer === choice && (
                        <CheckCircle2 className="h-4 w-4 text-amber-500 animate-in zoom-in duration-200" />
                      )}
                    </div>
                  ))}
                </RadioGroup>
                <Button
                  size="sm"
                  className={cn(
                    'h-10 w-full font-semibold text-sm rounded-xl',
                    'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_100%]',
                    'hover:bg-[position:100%_0] transition-all duration-500',
                    'text-white border-0',
                    'shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50',
                    'disabled:opacity-50 disabled:shadow-none',
                    'flex items-center justify-center gap-2'
                  )}
                  onClick={handleSubmit}
                  disabled={isSubmitting || !answer}
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit Selection
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Inline input for multi_choice - Enhanced */}
            {card.question.type === 'multi_choice' && card.question.choices && (
              <div className="space-y-3">
                <div className="space-y-2">
                  {card.question.choices.map((choice, idx) => {
                    const isChecked = Array.isArray(answer) && answer.includes(choice);
                    return (
                      <label
                        key={choice}
                        htmlFor={`inline-mc-${card.runId}-${idx}`}
                        className={cn(
                          'group flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer',
                          'transition-all duration-200 ease-out',
                          isChecked
                            ? 'border-amber-500 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 shadow-md shadow-amber-500/20 scale-[1.02]'
                            : 'border-gray-200 dark:border-gray-700 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 hover:shadow-sm'
                        )}
                      >
                        <Checkbox
                          id={`inline-mc-${card.runId}-${idx}`}
                          checked={isChecked}
                          className={cn(
                            'h-5 w-5 rounded-md border-2 transition-all',
                            isChecked
                              ? 'border-amber-500 bg-amber-500 text-white'
                              : 'border-gray-300 dark:border-gray-600'
                          )}
                          onCheckedChange={(checked) => {
                            const current = Array.isArray(answer) ? answer : [];
                            if (checked) {
                              setAnswer([...current, choice]);
                            } else {
                              setAnswer(current.filter((c) => c !== choice));
                            }
                          }}
                        />
                        <span
                          className={cn(
                            'text-sm flex-1 leading-snug font-medium',
                            isChecked
                              ? 'text-amber-900 dark:text-amber-100'
                              : 'text-gray-700 dark:text-gray-300'
                          )}
                        >
                          {choice}
                        </span>
                        {isChecked && (
                          <CheckCircle2 className="h-4 w-4 text-amber-500 animate-in zoom-in duration-200" />
                        )}
                      </label>
                    );
                  })}
                </div>
                {/* Selection count indicator */}
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-gray-500">
                    {Array.isArray(answer) && answer.length > 0 ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">
                        {answer.length} selected
                      </span>
                    ) : (
                      'Select one or more'
                    )}
                  </span>
                </div>
                <Button
                  size="sm"
                  className={cn(
                    'h-10 w-full font-semibold text-sm rounded-xl',
                    'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 bg-[length:200%_100%]',
                    'hover:bg-[position:100%_0] transition-all duration-500',
                    'text-white border-0',
                    'shadow-lg shadow-amber-500/30 hover:shadow-amber-500/50',
                    'disabled:opacity-50 disabled:shadow-none',
                    'flex items-center justify-center gap-2'
                  )}
                  onClick={handleSubmit}
                  disabled={isSubmitting || !Array.isArray(answer) || answer.length === 0}
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles className="h-4 w-4 animate-pulse" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Submit ({Array.isArray(answer) ? answer.length : 0})
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Inline input for confirm - Enhanced */}
            {card.question.type === 'confirm' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    size="sm"
                    variant={answer === true ? 'default' : 'outline'}
                    className={cn(
                      'h-12 font-semibold text-sm rounded-xl transition-all duration-300',
                      answer === true
                        ? 'bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white border-0 shadow-lg shadow-emerald-500/40 scale-105'
                        : 'border-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-400'
                    )}
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
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Yes, proceed
                  </Button>
                  <Button
                    size="sm"
                    variant={answer === false ? 'default' : 'outline'}
                    className={cn(
                      'h-12 font-semibold text-sm rounded-xl transition-all duration-300',
                      answer === false
                        ? 'bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white border-0 shadow-lg shadow-red-500/40 scale-105'
                        : 'border-2 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:border-red-400'
                    )}
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
                    <XCircle className="h-4 w-4 mr-2" />
                    No, cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Expand to dialog for long prompts */}
            {card.question.prompt.length > 200 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 w-full text-xs text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDialogOpen(true);
                }}
              >
                <Expand className="h-3.5 w-3.5 mr-1.5" />
                Expand to full view
              </Button>
            )}

            {/* Link to run detail page */}
            <Link
              href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}
              className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors py-2"
              onClick={(e) => e.stopPropagation()}
            >
              <span>View run details</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </section>
        )}
      </CardContent>
    </Card>
  );

  // Question Dialog
  const questionDialog = hasQuestion && card.question && (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25">
              <MessageSquareWarning className="h-5 w-5" />
            </div>
            <div>
              <span className="block">Input Required</span>
              <span className="text-sm font-normal text-muted-foreground">
                Run: {card.runId} • Phase: {card.currentPhase}
              </span>
            </div>
          </DialogTitle>
          <DialogDescription className="sr-only">
            The workflow run requires your input to continue. Please respond to the question below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Full question prompt */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/40 p-4 rounded-xl border border-amber-200/50 dark:border-amber-800/50">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{card.question.prompt}</p>
          </div>

          {/* Full input controls */}
          {card.question.type === 'free_text' && (
            <Textarea
              placeholder="Enter your response..."
              className="min-h-[120px] resize-none"
              value={answer as string}
              onChange={(e) => setAnswer(e.target.value)}
            />
          )}

          {card.question.type === 'single_choice' && card.question.choices && (
            <RadioGroup value={answer as string} onValueChange={setAnswer} className="space-y-3">
              {card.question.choices.map((choice) => (
                <div
                  key={choice}
                  className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                >
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
            <div className="space-y-3">
              {card.question.choices.map((choice) => (
                <div
                  key={choice}
                  className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                >
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
                    className="text-sm cursor-pointer flex-1"
                  >
                    {choice}
                  </Label>
                </div>
              ))}
            </div>
          )}

          {card.question.type === 'confirm' && (
            <div className="flex gap-4">
              <Button
                variant={answer === true ? 'default' : 'outline'}
                className="flex-1 h-12 text-base"
                onClick={() => setAnswer(true)}
              >
                Yes
              </Button>
              <Button
                variant={answer === false ? 'default' : 'outline'}
                className="flex-1 h-12 text-base"
                onClick={() => setAnswer(false)}
              >
                No
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3 pt-4 border-t">
          <Link
            href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <span>View run details</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="min-w-[140px] h-11 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 font-medium shadow-lg shadow-amber-500/25"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Response'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Wrap in link only if not draggable, no question, and no agent button
  if (!draggable && !hasQuestion && !showAgentButton) {
    return <Link href={`/workflows/${card.workflowSlug}/runs/${card.runId}`}>{cardContent}</Link>;
  }

  return (
    <>
      {cardContent}
      {questionDialog}
      {agentSession && (
        <AgentSessionDialog
          session={agentSession}
          open={agentDialogOpen}
          onOpenChange={setAgentDialogOpen}
          workflowSlug={card.workflowSlug}
          onSendMessage={(sessionId, message) => {
            // In a real implementation, this would send to the agent service
            console.log('Send message to agent:', sessionId, message);
          }}
        />
      )}
    </>
  );
}
