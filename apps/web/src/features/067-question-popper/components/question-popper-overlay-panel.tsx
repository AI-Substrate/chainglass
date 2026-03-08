'use client';

/**
 * Plan 067 Phase 5+6: Question Popper — Overlay Panel
 *
 * Fixed-position panel with tabbed interface:
 * - Outstanding tab: actionable items (pending questions + unread alerts)
 * - History tab: all past items with expand/collapse (AC-26, AC-27)
 *
 * DYK-03: Smart tab default — Outstanding if items pending, else preserve last tab.
 * AC-18: Newest outstanding item shown first
 * AC-19: Doesn't take over page, participates in mutual exclusion
 */

import { useEffect, useRef, useState } from 'react';

import {
  type EventPopperItem,
  isAlertItem,
  isQuestionItem,
  useQuestionPopper,
} from '../hooks/use-question-popper';
import { AlertCard } from './alert-card';
import { QuestionCard } from './question-card';
import { QuestionHistoryList } from './question-history-list';

type TabId = 'outstanding' | 'history';

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
    getChain,
  } = useQuestionPopper();

  // DYK-03: Smart tab default — Outstanding if pending, else preserve last
  const lastTabRef = useRef<TabId>('outstanding');
  const [activeTab, setActiveTab] = useState<TabId>('outstanding');

  // When overlay opens, pick smart default
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (isOverlayOpen && !prevOpenRef.current) {
      // Just opened — pick smart tab
      setActiveTab(outstandingCount > 0 ? 'outstanding' : lastTabRef.current);
    }
    prevOpenRef.current = isOverlayOpen;
  }, [isOverlayOpen, outstandingCount]);

  // Track last manually-selected tab
  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    lastTabRef.current = tab;
  };

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

  return (
    <section
      className="fixed bottom-4 right-4 z-45 flex max-h-[80vh] w-[420px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
      aria-label="Question Popper"
      aria-modal="false"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5 dark:border-neutral-700">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Questions
          </h2>
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

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => handleTabChange('outstanding')}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'outstanding'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'
          }`}
        >
          Outstanding
          {outstandingCount > 0 && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-800 dark:bg-green-900/30 dark:text-green-400">
              {outstandingCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange('history')}
          className={`flex flex-1 items-center justify-center px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
              : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300'
          }`}
        >
          History
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'outstanding' && (
          <div className="space-y-3">
            {outstandingItems.length === 0 ? (
              <div className="py-8 text-center text-sm text-neutral-400">No outstanding items.</div>
            ) : (
              outstandingItems.map((item) => {
                if (isQuestionItem(item)) {
                  return (
                    <QuestionCard
                      key={item.questionId}
                      question={item}
                      onAnswer={answerQuestion}
                      onDismiss={dismissQuestion}
                      onClarify={requestClarification}
                      getChain={getChain}
                      allItems={items}
                    />
                  );
                }
                if (isAlertItem(item)) {
                  return (
                    <AlertCard key={item.alertId} alert={item} onAcknowledge={acknowledgeAlert} />
                  );
                }
                return null;
              })
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <QuestionHistoryList
            items={items}
            onAnswer={answerQuestion}
            onDismiss={dismissQuestion}
            onClarify={requestClarification}
            onAcknowledge={acknowledgeAlert}
            getChain={getChain}
          />
        )}
      </div>
    </section>
  );
}
