/**
 * RecentFeedList — virtualized vertical list using `content-visibility: auto`.
 *
 * Browsers natively skip layout/paint for cards outside the viewport when
 * `content-visibility: auto` is paired with a `contain-intrinsic-size` hint.
 * This is the cheapest virtualization for variable-height media cards
 * (per Finding 05) — no react-window, no row-height measurement, no
 * scroll-anchor jank. Idle cards release their decoded media via the
 * preview-level `useLazyLoad` hooks (Finding 14).
 *
 * Plan recent-changes-feed T009.
 */

'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';
import type { FeedItem } from './types';

export interface RecentFeedListProps {
  items: FeedItem[];
  renderItem: (item: FeedItem) => ReactNode;
  /**
   * Intrinsic-size hint per card — pixels. Browsers use this to reserve
   * space for off-screen cards so the scroll thumb is stable. The default
   * (480px) matches a typical media-card height (header strip + 60vh-bounded
   * preview); the orchestrator can tune per-kind if needed.
   */
  intrinsicHeight?: number;
  className?: string;
}

export function RecentFeedList({
  items,
  renderItem,
  intrinsicHeight = 480,
  className,
}: RecentFeedListProps) {
  return (
    <div
      // The feed-level role is set on the orchestrator (T012/T027), not here —
      // keeps the list a pure container. T027 wires role="feed" + aria-busy.
      className={cn('flex flex-col gap-3 px-3 pb-6', className)}
    >
      {items.map((item) => (
        <div
          key={item.path}
          style={{
            contentVisibility: 'auto',
            // CSS shorthand `contain-intrinsic-size: <inline> <block>`. Width is
            // 'auto' so the card fills its column; block defaults to the hint.
            containIntrinsicSize: `auto ${intrinsicHeight}px`,
          }}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
