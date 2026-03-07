'use client';

/**
 * Plan 067 Phase 5: Question Popper — Question Card
 *
 * Renders a question with:
 * - Question text (prominent)
 * - Scrollable markdown description (react-markdown + remark-gfm)
 * - Tmux session/window badge (from meta.tmux)
 * - Source badge, time-ago display, status badge
 * - AnswerForm for pending questions
 *
 * AC-20: Question renders text + markdown description + tmux badge
 */

import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { AnswerPayload, QuestionOut } from '@chainglass/shared/question-popper';
import { AnswerForm } from './answer-form';

// ── Time-ago utility (no date-fns in project) ──

function timeAgo(isoDate: string): string {
  const delta = Date.now() - new Date(isoDate).getTime();
  if (delta < 0) return 'just now';
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Status badge colors ──

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  answered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  'needs-clarification': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  dismissed: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400',
};

interface QuestionCardProps {
  question: QuestionOut;
  onAnswer: (id: string, answer: AnswerPayload) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onClarify: (id: string, text: string) => Promise<void>;
}

export function QuestionCard({ question, onAnswer, onDismiss, onClarify }: QuestionCardProps) {
  const tmux = question.meta?.tmux as
    | { session?: string; window?: string; pane?: string }
    | undefined;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-850">
      {/* Header: source + tmux + time + status */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {question.source}
        </span>
        {tmux?.session && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
            tmux:{tmux.session}
            {tmux.window ? `:${tmux.window}` : ''}
          </span>
        )}
        <span className="text-neutral-400">{timeAgo(question.createdAt)}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 font-medium ${STATUS_STYLES[question.status] ?? STATUS_STYLES.pending}`}
        >
          {question.status}
        </span>
      </div>

      {/* Question type badge + text */}
      <div>
        <span className="mr-2 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
          {question.question.questionType}
        </span>
        <p className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {question.question.text}
        </p>
      </div>

      {/* Markdown description (scrollable) */}
      {question.question.description && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-100 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]}>{question.question.description}</Markdown>
          </div>
        </div>
      )}

      {/* Answer form (only for pending questions) */}
      <AnswerForm
        question={question}
        onAnswer={onAnswer}
        onDismiss={onDismiss}
        onClarify={onClarify}
      />
    </div>
  );
}
