'use client';

/**
 * Plan 067 Phase 5+6: Question Popper — Question Card
 *
 * Renders a question with:
 * - Question text (prominent)
 * - Scrollable markdown description (react-markdown + remark-gfm)
 * - Tmux session/window badge (from meta.tmux)
 * - Source badge, time-ago display, status badge
 * - Chain indicator + "View Thread" for linked questions (Phase 6, AC-24)
 * - AnswerForm for pending questions
 *
 * AC-20: Question renders text + markdown description + tmux badge
 * AC-24: Chain rendering as conversation thread
 */

import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { AnswerPayload, QuestionOut } from '@chainglass/shared/question-popper';
import type { EventPopperItem } from '../hooks/use-question-popper';
import { isPartOfChain } from '../lib/chain-resolver';
import { AnswerForm } from './answer-form';
import { QuestionChainView } from './question-chain-view';

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
  /** Chain resolution function from hook (DYK-04: cached) */
  getChain?: (id: string) => Promise<QuestionOut[]>;
  /** All items for chain index building */
  allItems?: EventPopperItem[];
}

export function QuestionCard({
  question,
  onAnswer,
  onDismiss,
  onClarify,
  getChain,
  allItems,
}: QuestionCardProps) {
  const [showChain, setShowChain] = useState(false);

  const tmux = question.meta?.tmux as
    | { session?: string; window?: string; pane?: string }
    | undefined;

  // Chain detection (DYK-01: bidirectional — check if part of any chain)
  const questionItems = (allItems ?? []).filter((i): i is QuestionOut => 'questionId' in i);
  const hasChain = isPartOfChain(question.questionId, questionItems);
  const isFollowUp = !!question.question.previousQuestionId;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-850">
      {/* Header: source + tmux + chain + time + status */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {question.source}
        </span>
        {isFollowUp && (
          <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
            ↩ follow-up
          </span>
        )}
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

      {/* Chain indicator + View Thread (AC-24) */}
      {hasChain && getChain && (
        <button
          type="button"
          onClick={() => setShowChain(!showChain)}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <span>{showChain ? '▼' : '▶'}</span>
          <span>{showChain ? 'Hide Thread' : 'View Thread'}</span>
        </button>
      )}

      {/* Chain view (expanded) */}
      {showChain && getChain && (
        <QuestionChainView questionId={question.questionId} getChain={getChain} />
      )}

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
