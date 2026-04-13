'use client';

import type { ReactNode } from 'react';
import { useCallback, useState } from 'react';
import { MobileSwipeStrip } from './mobile-swipe-strip';
import { MobileView } from './mobile-view';

export interface MobilePanelShellView {
  label: string;
  icon: ReactNode;
  content: ReactNode;
  /** Whether this view should receive data-terminal-overlay-anchor */
  isTerminal?: boolean;
  /** When true, view content mounts only on first activation (preserves after) */
  lazy?: boolean;
}

export interface MobilePanelShellProps {
  views: MobilePanelShellView[];
  /** Called when the active view changes */
  onViewChange?: (index: number) => void;
  /** Optional action slot for the swipe strip (e.g. search icon) */
  rightAction?: ReactNode;
  /** Initial active view index (default 0). Clamped to valid range. */
  initialActiveIndex?: number;
}

/**
 * MobilePanelShell — swipeable full-screen view container for phone viewports.
 *
 * Composes MobileSwipeStrip (segmented control) with MobileView wrappers.
 * Views are positioned via CSS transform: translateX and animated with a
 * 350ms cubic-bezier transition. Off-screen views remain mounted but are
 * hidden with visibility: hidden + pointer-events: none.
 *
 * Supports lazy views that mount only on first activation (e.g. terminal
 * with WebSocket — avoid allocating resources until the user swipes to it).
 *
 * Plan 078: Mobile Experience — FX002
 */
export function MobilePanelShell({
  views,
  onViewChange,
  rightAction,
  initialActiveIndex,
}: MobilePanelShellProps) {
  const clampedInitial =
    initialActiveIndex != null && Number.isFinite(initialActiveIndex)
      ? Math.max(0, Math.min(Math.floor(initialActiveIndex), views.length - 1))
      : 0;

  const [activeIndex, setActiveIndex] = useState(clampedInitial);

  const [activatedViews, setActivatedViews] = useState<Set<number>>(() => {
    const s = new Set<number>();
    views.forEach((v, i) => {
      if (!v.lazy) s.add(i);
    });
    s.add(clampedInitial);
    return s;
  });

  const handleViewChange = useCallback(
    (index: number) => {
      setActiveIndex(index);
      setActivatedViews((prev) => {
        if (prev.has(index)) return prev;
        const next = new Set(prev);
        next.add(index);
        return next;
      });
      onViewChange?.(index);
    },
    [onViewChange]
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <MobileSwipeStrip
        views={views}
        activeIndex={activeIndex}
        onViewChange={handleViewChange}
        rightAction={rightAction}
      />

      <div
        data-testid="mobile-view-container"
        style={{
          flex: 1,
          display: 'flex',
          transform: `translateX(-${activeIndex * 100}vw)`,
          transition: 'transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
          minHeight: 0,
        }}
      >
        {views.map((view, index) => (
          <MobileView
            key={view.label}
            isActive={index === activeIndex}
            isTerminal={view.isTerminal}
          >
            {activatedViews.has(index) ? view.content : null}
          </MobileView>
        ))}
      </div>
    </div>
  );
}
