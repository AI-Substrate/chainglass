'use client';

/**
 * Plan 067 Phase 6: Question Popper — Chain View
 *
 * Renders a conversation chain as a vertical timeline of turns.
 * Each turn shows question text, answer (if resolved), status, time-ago.
 * Current question is highlighted. Loading state while resolving (DYK-05).
 *
 * AC-24: Chain renders as conversation thread with sequential turns.
 * DYK-02: Purpose-built UI, not QuestionCard reuse.
 */

import { useCallback, useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { QuestionOut } from '@chainglass/shared/question-popper';

// ── Time-ago (shared pattern from question-card) ──

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

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-400',
  answered: 'bg-green-400',
  'needs-clarification': 'bg-purple-400',
  dismissed: 'bg-neutral-400',
};

interface QuestionChainViewProps {
  questionId: string;
  getChain: (id: string) => Promise<QuestionOut[]>;
}

export function QuestionChainView({ questionId, getChain }: QuestionChainViewProps) {
  const [chain, setChain] = useState<QuestionOut[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadChain = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getChain(questionId);
      setChain(result);
    } catch {
      setChain(null);
    } finally {
      setIsLoading(false);
    }
  }, [questionId, getChain]);

  useEffect(() => {
    loadChain();
  }, [loadChain]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-neutral-400">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-500" />
        Loading conversation...
      </div>
    );
  }

  if (!chain || chain.length <= 1) {
    return null; // Single question or failed — nothing to show
  }

  return (
    <div className="space-y-0 border-l-2 border-blue-200 pl-3 dark:border-blue-800">
      {chain.map((turn, i) => {
        const isCurrent = turn.questionId === questionId;
        const isLast = i === chain.length - 1;

        return (
          <div
            key={turn.questionId}
            className={`relative pb-3 ${isCurrent ? 'opacity-100' : 'opacity-70'}`}
          >
            {/* Timeline dot */}
            <div
              className={`absolute -left-[calc(0.75rem+5px)] top-1 h-2.5 w-2.5 rounded-full ${STATUS_COLORS[turn.status] ?? 'bg-neutral-400'} ${isCurrent ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-neutral-900' : ''}`}
            />

            {/* Turn content */}
            <div
              className={`rounded-md p-2 text-xs ${isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
            >
              {/* Header */}
              <div className="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400">
                <span className="font-medium">{turn.source}</span>
                <span>·</span>
                <span>{timeAgo(turn.createdAt)}</span>
                <span
                  className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                    turn.status === 'pending'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                      : turn.status === 'answered'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400'
                  }`}
                >
                  {turn.status}
                </span>
              </div>

              {/* Question text */}
              <p
                className={`mt-1 ${isCurrent ? 'font-medium text-neutral-900 dark:text-neutral-100' : 'text-neutral-700 dark:text-neutral-300'}`}
              >
                {turn.question.text}
              </p>

              {/* Description (collapsed for non-current turns) */}
              {isCurrent && turn.question.description && (
                <div className="mt-1.5 max-h-24 overflow-y-auto rounded border border-neutral-100 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-800">
                  <div className="prose prose-xs prose-neutral max-w-none dark:prose-invert">
                    <Markdown remarkPlugins={[remarkGfm]}>{turn.question.description}</Markdown>
                  </div>
                </div>
              )}

              {/* Answer (if resolved) */}
              {turn.answer && (
                <div className="mt-1.5 rounded bg-green-50 px-2 py-1 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                  Answer: <code className="text-[10px]">{JSON.stringify(turn.answer.answer)}</code>
                  {turn.answer.text && (
                    <span className="ml-1 text-neutral-500">— {turn.answer.text}</span>
                  )}
                </div>
              )}

              {/* Clarification */}
              {turn.clarification && (
                <div className="mt-1.5 rounded bg-purple-50 px-2 py-1 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                  Clarification needed: {turn.clarification.text}
                </div>
              )}
            </div>

            {/* Connector arrow (not on last item) */}
            {!isLast && (
              <div className="ml-0.5 mt-0 text-[10px] text-neutral-300 dark:text-neutral-600">
                ↓
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
