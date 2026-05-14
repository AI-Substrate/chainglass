/**
 * FeedCard — type-agnostic card shell for the Recent Changes Feed.
 *
 * Header strip (icon · filename · path · actions) + meta line (relative time
 * · size · event badge) + preview slot. Type-specific previews (image, video,
 * markdown excerpt, code excerpt, etc.) plug in as children — see workshop §2.
 *
 * Plan recent-changes-feed T007.
 */

'use client';

import { FileIcon } from '@/features/_platform/themes';
import { cn } from '@/lib/utils';
import { type ReactNode, useId } from 'react';
import type { FeedEventType, FeedItem } from './types';

export interface FeedCardProps {
  item: FeedItem;
  /** Absolute filesystem path shown as a tooltip on the path label (workshop §2 — D2). */
  absolutePathTooltip?: string;
  /** Optional actions strip (typically a configured `<CardActions />`). Rendered top-right, hover-revealed. */
  actions?: ReactNode;
  /** Click anywhere on the card body opens the file (typically `onOpen` in the feed actions hook). */
  onActivate?: () => void;
  /** Preview slot — type-specific renderer. */
  children?: ReactNode;
  className?: string;
}

const EVENT_BADGE_CLASS: Record<FeedEventType, string> = {
  added: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30',
  changed: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30',
  deleted: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
};

const EVENT_BADGE_LABEL: Record<FeedEventType, string> = {
  added: 'added',
  changed: 'changed',
  deleted: 'deleted',
};

/**
 * Format a millisecond epoch as a short relative-time label
 * (e.g., "now", "12s ago", "2m ago", "1h ago", "3d ago").
 *
 * Kept intentionally lightweight — no Intl.RelativeTimeFormat — so the feed
 * remains cheap to render hundreds of cards. If we later need locale-aware
 * formatting, swap this single call site.
 */
export function formatRelativeTime(epochMs: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - epochMs);
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/**
 * Format a byte count as a short human label (e.g., "142 KB", "3.2 MB").
 * Returns "—" for negative or non-finite inputs.
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

export function FeedCard({
  item,
  absolutePathTooltip,
  actions,
  onActivate,
  children,
  className,
}: FeedCardProps) {
  // F002 fix: file paths can contain spaces and other characters that are
  // illegal in an HTML id (and break aria-labelledby IDREF tokenization, which
  // is space-separated). React's useId returns a stable, valid id token —
  // path-independent — that we use as the title's id and as the article's
  // aria-labelledby reference.
  const titleId = `feed-card-title-${useId()}`;
  const dirPart = (() => {
    const idx = item.path.lastIndexOf('/');
    return idx === -1 ? '' : item.path.slice(0, idx);
  })();

  const isDeleted = item.eventType === 'deleted';

  return (
    <article
      // biome-ignore lint/a11y/useSemanticElements: complex card surface; <article> + role="article" set explicitly for the feed-level a11y contract (T027 — H1).
      role="article"
      aria-labelledby={titleId}
      // T026: tabIndex + data-feed-card-path enable roving-focus keyboard nav.
      tabIndex={0}
      data-feed-card-path={item.path}
      className={cn(
        'group relative rounded-xl border border-border bg-card overflow-hidden',
        'shadow-sm transition-all duration-200',
        'hover:shadow-md hover:border-ring',
        'focus:outline-2 focus:outline-ring focus:outline-offset-2',
        'focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-2',
        // T027: prefers-reduced-motion disables hover lift/scale; only opacity flash remains.
        'motion-reduce:transition-none',
        isDeleted && 'opacity-70',
        className
      )}
    >
      {/* Header strip: icon · title · path · meta · actions */}
      <header className="flex items-start gap-2 p-3 pr-12 border-b border-border">
        <FileIcon filename={item.name} className="h-4 w-4 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <button
              type="button"
              id={titleId}
              onClick={onActivate}
              className={cn(
                'text-sm font-semibold truncate text-card-foreground text-left',
                'hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm',
                isDeleted && 'line-through'
              )}
              title={item.name}
            >
              {item.name}
            </button>
          </div>
          {dirPart && (
            <div
              // The path label tooltips the absolute path (workshop §2 D2; AC E6 — click does NOT navigate).
              title={absolutePathTooltip ?? item.absolutePath}
              dir="rtl"
              className="text-xs text-muted-foreground truncate text-left"
            >
              {/* dir="rtl" + bdo locks character order so paths visually truncate from
                  the left (trailing segments stay visible) while still reading L-to-R. */}
              <bdo dir="ltr">{dirPart}/</bdo>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{formatRelativeTime(item.changedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatFileSize(item.size)}</span>
            <span aria-hidden="true">·</span>
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
                EVENT_BADGE_CLASS[item.eventType]
              )}
            >
              {EVENT_BADGE_LABEL[item.eventType]}
            </span>
          </div>
        </div>
        {actions}
      </header>

      {/* Preview slot (type-specific) */}
      {children && <div className="bg-muted/30">{children}</div>}
    </article>
  );
}
