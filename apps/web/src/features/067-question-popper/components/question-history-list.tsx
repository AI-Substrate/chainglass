'use client';

/**
 * Plan 067 Phase 6: Question Popper — History List
 *
 * Compact, scannable list of all past questions and alerts.
 * Each item is a one-line row that expands on click to show full detail.
 *
 * DYK-02: Purpose-built compact rows, not QuestionCard reuse.
 * AC-26: All past items, sorted newest-first, source/text/type/status/age.
 * AC-27: Click expands to show full detail including conversation chain.
 */

import { useCallback, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { AlertOut, AnswerPayload, QuestionOut } from '@chainglass/shared/question-popper';

import { type EventPopperItem, isAlertItem, isQuestionItem } from '../hooks/use-question-popper';
import { AnswerForm } from './answer-form';
import { QuestionChainView } from './question-chain-view';

// ── Time-ago ──

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

// ── Status styling ──

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-amber-400',
  answered: 'bg-green-400',
  'needs-clarification': 'bg-purple-400',
  dismissed: 'bg-neutral-400',
  unread: 'bg-amber-400',
  acknowledged: 'bg-green-400',
};

// ── Props ──

interface QuestionHistoryListProps {
  items: EventPopperItem[];
  onAnswer: (id: string, answer: AnswerPayload) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onClarify: (id: string, text: string) => Promise<void>;
  onAcknowledge: (id: string) => Promise<void>;
  getChain: (questionId: string) => Promise<QuestionOut[]>;
}

export function QuestionHistoryList({
  items,
  onAnswer,
  onDismiss,
  onClarify,
  onAcknowledge,
  getChain,
}: QuestionHistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-neutral-400">No questions or alerts yet.</div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => {
        const id = isQuestionItem(item) ? item.questionId : isAlertItem(item) ? item.alertId : '';
        const isExpanded = expandedId === id;

        return (
          <div key={id}>
            <HistoryItemRow item={item} isExpanded={isExpanded} onToggle={() => toggleExpand(id)} />
            {isExpanded && (
              <HistoryItemDetail
                item={item}
                onAnswer={onAnswer}
                onDismiss={onDismiss}
                onClarify={onClarify}
                onAcknowledge={onAcknowledge}
                getChain={getChain}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Compact Row (DYK-02) ──

function HistoryItemRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: EventPopperItem;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isQuestion = isQuestionItem(item);
  const source = isQuestion ? item.source : isAlertItem(item) ? item.source : '';
  const text = isQuestion ? item.question.text : isAlertItem(item) ? item.alert.text : '';
  const status = isQuestion ? item.status : isAlertItem(item) ? item.status : '';
  const createdAt = isQuestion ? item.createdAt : isAlertItem(item) ? item.createdAt : '';
  const type = isQuestion ? 'question' : 'alert';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        isExpanded
          ? 'bg-blue-50 dark:bg-blue-900/20'
          : 'hover:bg-neutral-50 dark:hover:bg-neutral-800'
      }`}
      aria-expanded={isExpanded}
    >
      {/* Status dot */}
      <span
        className={`h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[status] ?? 'bg-neutral-300'}`}
      />

      {/* Type pill */}
      <span
        className={`flex-shrink-0 rounded px-1 py-0.5 text-[10px] font-semibold uppercase ${
          type === 'question'
            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
            : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
        }`}
      >
        {type === 'question' ? 'Q' : 'A'}
      </span>

      {/* Source */}
      <span
        className="flex-shrink-0 truncate font-medium text-neutral-600 dark:text-neutral-400"
        style={{ maxWidth: '80px' }}
      >
        {source}
      </span>

      {/* Truncated text */}
      <span className="min-w-0 flex-1 truncate text-neutral-700 dark:text-neutral-300">{text}</span>

      {/* Time-ago */}
      <span className="flex-shrink-0 text-neutral-400">{timeAgo(createdAt)}</span>

      {/* Expand chevron */}
      <span
        className={`flex-shrink-0 text-neutral-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
      >
        ›
      </span>
    </button>
  );
}

// ── Expanded Detail (AC-27) ──

function HistoryItemDetail({
  item,
  onAnswer,
  onDismiss,
  onClarify,
  onAcknowledge,
  getChain,
}: {
  item: EventPopperItem;
  onAnswer: (id: string, answer: AnswerPayload) => Promise<void>;
  onDismiss: (id: string) => Promise<void>;
  onClarify: (id: string, text: string) => Promise<void>;
  onAcknowledge: (id: string) => Promise<void>;
  getChain: (questionId: string) => Promise<QuestionOut[]>;
}) {
  if (isQuestionItem(item)) {
    return (
      <div className="mb-2 ml-4 space-y-2 rounded-md border border-neutral-100 bg-white p-3 text-xs dark:border-neutral-700 dark:bg-neutral-850">
        {/* Full question text */}
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {item.question.text}
        </p>

        {/* Markdown description */}
        {item.question.description && (
          <div className="max-h-32 overflow-y-auto rounded border border-neutral-100 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="prose prose-xs prose-neutral max-w-none dark:prose-invert">
              <Markdown remarkPlugins={[remarkGfm]}>{item.question.description}</Markdown>
            </div>
          </div>
        )}

        {/* Chain view — always rendered; returns null for standalone questions (FT-001) */}
        <QuestionChainView questionId={item.questionId} getChain={getChain} />

        {/* Answer form or resolved status */}
        {item.status === 'pending' ? (
          <AnswerForm
            question={item}
            onAnswer={onAnswer}
            onDismiss={onDismiss}
            onClarify={onClarify}
          />
        ) : (
          <div className="rounded bg-neutral-50 px-2 py-1.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {item.status === 'answered' && (
              <>
                Answered: <code>{JSON.stringify(item.answer?.answer)}</code>
              </>
            )}
            {item.status === 'needs-clarification' && (
              <>Clarification: {item.clarification?.text}</>
            )}
            {item.status === 'dismissed' && 'Dismissed'}
          </div>
        )}
      </div>
    );
  }

  if (isAlertItem(item)) {
    return (
      <div className="mb-2 ml-4 space-y-2 rounded-md border border-neutral-100 bg-white p-3 text-xs dark:border-neutral-700 dark:bg-neutral-850">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {item.alert.text}
        </p>

        {item.alert.description && (
          <div className="max-h-32 overflow-y-auto rounded border border-neutral-100 bg-neutral-50 p-2 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="prose prose-xs prose-neutral max-w-none dark:prose-invert">
              <Markdown remarkPlugins={[remarkGfm]}>{item.alert.description}</Markdown>
            </div>
          </div>
        )}

        {item.status === 'unread' && (
          <button
            type="button"
            onClick={() => onAcknowledge(item.alertId)}
            className="rounded bg-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          >
            Mark Read
          </button>
        )}

        {item.status === 'acknowledged' && item.acknowledgedAt && (
          <div className="text-neutral-400">Acknowledged {timeAgo(item.acknowledgedAt)}</div>
        )}
      </div>
    );
  }

  return null;
}
