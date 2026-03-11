'use client';

/**
 * Plan 067 Phase 5: Question Popper — Indicator
 *
 * Round question mark icon in the top-right corner:
 * - Large + green glow + badge when outstanding > 0
 * - Small + gray when no outstanding items
 * - Click toggles overlay panel
 *
 * AC-16: Question mark indicator with glow state
 * AC-17: Badge count includes unanswered questions + unread alerts
 * AC-18: Click opens overlay
 */

import { useQuestionPopper } from '../hooks/use-question-popper';

export function QuestionPopperIndicator() {
  const { outstandingCount, toggleOverlay, isOverlayOpen } = useQuestionPopper();
  const hasOutstanding = outstandingCount > 0;

  return (
    <button
      type="button"
      onClick={toggleOverlay}
      aria-label={
        hasOutstanding
          ? `${outstandingCount} outstanding question${outstandingCount === 1 ? '' : 's'} — click to open`
          : 'No outstanding questions — click to view history'
      }
      aria-expanded={isOverlayOpen}
      className={`
        relative flex items-center justify-center rounded-full transition-all duration-300
        focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0
        ${
          hasOutstanding
            ? 'h-8 w-8 bg-green-500 text-white shadow-md shadow-green-500/40 hover:bg-green-600 hover:shadow-green-500/60'
            : 'h-7 w-7 bg-neutral-300 text-neutral-500 hover:bg-neutral-400 hover:text-neutral-600 dark:bg-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-500'
        }
      `}
    >
      {/* Question mark icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={hasOutstanding ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5'}
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </svg>

      {/* Badge count */}
      {hasOutstanding && (
        <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
          {outstandingCount > 99 ? '99+' : outstandingCount}
        </span>
      )}

      {/* Glow animation ring */}
      {hasOutstanding && (
        <span className="absolute inset-0 animate-ping rounded-full bg-green-400 opacity-30" />
      )}
    </button>
  );
}
