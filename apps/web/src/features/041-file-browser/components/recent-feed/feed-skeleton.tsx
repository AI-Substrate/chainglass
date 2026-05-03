/**
 * FeedSkeleton — Vertical-stack loading state for the Recent Changes Feed.
 *
 * Reuses the gallery's `CardSkeleton` (Finding 13 — no fork) but stacks the
 * skeletons vertically with a stagger to mirror the feed's layout.
 *
 * Plan recent-changes-feed T011.
 */

'use client';

import { CardSkeleton } from '@/features/041-file-browser/components/preview-cards/card-skeleton';

export interface FeedSkeletonProps {
  /** Number of placeholder cards to render. Default 5 — enough to fill a typical viewport. */
  count?: number;
}

export function FeedSkeleton({ count = 5 }: FeedSkeletonProps) {
  return (
    <div className="flex flex-col gap-3 px-3 pt-3 pb-6">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton
          // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
          key={i}
          className="animate-in fade-in-0"
          style={{ animationDelay: `${i * 60}ms` } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
