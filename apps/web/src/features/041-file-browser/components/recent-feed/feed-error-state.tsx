/**
 * FeedErrorState — Shown when seed fails (non-git workspace, missing .git,
 * etc.). Live updates still arrive over the existing SSE channel even when
 * the seed is unavailable, so the copy emphasises that the feed is partially
 * functional rather than broken.
 *
 * Plan recent-changes-feed T011 — covers AC B3 (non-git fallback).
 */

'use client';

import { AlertCircle } from 'lucide-react';

export interface FeedErrorStateProps {
  /** Short, user-facing error message. */
  message: string;
  /** Optional second-line elaboration (e.g., "This workspace is not a git repo."). */
  detail?: string;
  /** Optional retry callback — surfaces a Retry button when provided. */
  onRetry?: () => void;
}

export function FeedErrorState({ message, detail, onRetry }: FeedErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <AlertCircle className="h-10 w-10 text-amber-500/70" aria-hidden="true" />
      <div className="text-sm font-medium text-card-foreground">{message}</div>
      {detail && <div className="text-xs text-muted-foreground max-w-sm">{detail}</div>}
      <div className="text-[11px] text-muted-foreground/80 max-w-sm">
        Live file changes will still appear here as they happen.
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-card-foreground hover:bg-accent transition-colors"
        >
          Retry seed
        </button>
      )}
    </div>
  );
}
