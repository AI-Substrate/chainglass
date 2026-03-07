'use client';

/**
 * Plan 067 Phase 5: Question Popper — Overlay Panel
 *
 * Fixed-position panel that shows outstanding questions/alerts.
 * When no outstanding items, shows recent history.
 * Close button + Escape key to dismiss.
 *
 * AC-18: Newest outstanding item shown first
 * AC-19: Doesn't take over page, participates in mutual exclusion
 * AC-28: Real-time updates via SSE
 * AC-29: New items appear in real time when open
 * AC-32: Dismissed questions visible with "dismissed" status
 */

import { useEffect } from 'react';

import {
  type EventPopperItem,
  isAlertItem,
  isQuestionItem,
  useQuestionPopper,
} from '../hooks/use-question-popper';
import { AlertCard } from './alert-card';
import { QuestionCard } from './question-card';

export function QuestionPopperOverlayPanel() {
  const {
    items,
    outstandingItems,
    outstandingCount,
    isOverlayOpen,
    closeOverlay,
    answerQuestion,
    dismissQuestion,
    requestClarification,
    acknowledgeAlert,
    isConnected,
  } = useQuestionPopper();

  // Close on Escape key
  useEffect(() => {
    if (!isOverlayOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeOverlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOverlayOpen, closeOverlay]);

  if (!isOverlayOpen) return null;

  // Show outstanding items if any, otherwise show all history
  const displayItems: EventPopperItem[] = outstandingItems.length > 0 ? outstandingItems : items;

  const isShowingHistory = outstandingItems.length === 0;

  return (
    <section
      className="fixed bottom-4 right-4 z-45 flex max-h-[80vh] w-[420px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      aria-label="Question Popper"
      aria-modal="false"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {isShowingHistory ? 'Question History' : 'Outstanding Questions'}
          </h2>
          {outstandingCount > 0 && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
              {outstandingCount}
            </span>
          )}
          {!isConnected && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
              disconnected
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={closeOverlay}
          aria-label="Close question popper"
          className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {/* Item list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {displayItems.length === 0 ? (
          <div className="py-8 text-center text-sm text-neutral-400">
            {isShowingHistory ? 'No questions or alerts yet.' : 'No outstanding items.'}
          </div>
        ) : (
          <>
            {isShowingHistory && (
              <div className="mb-2 text-xs text-neutral-400">Showing all past items</div>
            )}
            {displayItems.map((item) => {
              if (isQuestionItem(item)) {
                return (
                  <QuestionCard
                    key={item.questionId}
                    question={item}
                    onAnswer={answerQuestion}
                    onDismiss={dismissQuestion}
                    onClarify={requestClarification}
                  />
                );
              }
              if (isAlertItem(item)) {
                return (
                  <AlertCard key={item.alertId} alert={item} onAcknowledge={acknowledgeAlert} />
                );
              }
              return null;
            })}
          </>
        )}
      </div>
    </section>
  );
}
