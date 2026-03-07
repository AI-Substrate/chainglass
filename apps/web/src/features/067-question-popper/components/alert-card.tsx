'use client';

/**
 * Plan 067 Phase 5: Question Popper — Alert Card
 *
 * Renders an alert with:
 * - Alert text (prominent)
 * - Scrollable markdown description (react-markdown + remark-gfm)
 * - Tmux session/window badge (from meta.tmux)
 * - Source badge, time-ago display, status badge
 * - "Mark Read" button for unread alerts
 *
 * AC-20: Alert renders text + markdown description + tmux badge
 * AC-23: "Mark Read" button calls acknowledge API
 */

import { useCallback, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { AlertOut } from '@chainglass/shared/question-popper';

// ── Time-ago utility (shared with question-card) ──

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

interface AlertCardProps {
  alert: AlertOut;
  onAcknowledge: (id: string) => Promise<void>;
}

export function AlertCard({ alert, onAcknowledge }: AlertCardProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tmux = alert.meta?.tmux as { session?: string; window?: string; pane?: string } | undefined;

  const handleAcknowledge = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onAcknowledge(alert.alertId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to acknowledge');
    } finally {
      setIsSubmitting(false);
    }
  }, [onAcknowledge, alert.alertId]);

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-850">
      {/* Header: source + tmux + time + status */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-orange-100 px-2 py-0.5 font-medium text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">
          {alert.source}
        </span>
        {tmux?.session && (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
            tmux:{tmux.session}
            {tmux.window ? `:${tmux.window}` : ''}
          </span>
        )}
        <span className="text-neutral-400">{timeAgo(alert.createdAt)}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 font-medium ${
            alert.status === 'unread'
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
              : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          }`}
        >
          {alert.status === 'unread' ? 'unread' : 'read'}
        </span>
      </div>

      {/* Alert type badge + text */}
      <div>
        <span className="mr-2 inline-block rounded bg-orange-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:bg-orange-900/40 dark:text-orange-400">
          alert
        </span>
        <p className="mt-1 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {alert.alert.text}
        </p>
      </div>

      {/* Markdown description (scrollable) */}
      {alert.alert.description && (
        <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-100 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          <div className="prose prose-sm prose-neutral max-w-none dark:prose-invert">
            <Markdown remarkPlugins={[remarkGfm]}>{alert.alert.description}</Markdown>
          </div>
        </div>
      )}

      {/* Mark Read button (only for unread) */}
      {alert.status === 'unread' && (
        <div className="border-t border-neutral-200 pt-3 dark:border-neutral-700">
          {error && (
            <div className="mb-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={isSubmitting}
            className="rounded-md bg-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-300 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
          >
            {isSubmitting ? 'Marking...' : 'Mark Read'}
          </button>
        </div>
      )}

      {/* Acknowledged info */}
      {alert.status === 'acknowledged' && alert.acknowledgedAt && (
        <div className="text-xs text-neutral-400">Acknowledged {timeAgo(alert.acknowledgedAt)}</div>
      )}
    </div>
  );
}
