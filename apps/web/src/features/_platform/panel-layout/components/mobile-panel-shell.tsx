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
}

export interface MobilePanelShellProps {
  views: MobilePanelShellView[];
  /** Called when the active view changes */
  onViewChange?: (index: number) => void;
  /** Optional action slot for the swipe strip (e.g. search icon) */
  rightAction?: ReactNode;
}

/**
 * MobilePanelShell — swipeable full-screen view container for phone viewports.
 *
 * Composes MobileSwipeStrip (segmented control) with MobileView wrappers.
 * Views are positioned via CSS transform: translateX and animated with a
 * 350ms cubic-bezier transition. Off-screen views remain mounted but are
 * hidden with visibility: hidden + pointer-events: none.
 *
 * Plan 078: Mobile Experience — Phase 1
 */
export function MobilePanelShell({ views, onViewChange, rightAction }: MobilePanelShellProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handleViewChange = useCallback(
    (index: number) => {
      setActiveIndex(index);
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
          transform: `translateX(-${activeIndex * 100}%)`,
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
            {view.content}
          </MobileView>
        ))}
      </div>
    </div>
  );
}
