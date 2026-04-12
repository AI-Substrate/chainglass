'use client';

import type { ReactNode } from 'react';
import { useCallback, useRef } from 'react';

export interface MobileSwipeStripView {
  label: string;
  icon: ReactNode;
}

export interface MobileSwipeStripProps {
  views: MobileSwipeStripView[];
  activeIndex: number;
  onViewChange: (index: number) => void;
  /** Optional action slot (right-aligned), e.g. search icon for Phase 3 */
  rightAction?: ReactNode;
}

const SWIPE_THRESHOLD_PX = 50;

/**
 * MobileSwipeStrip — segmented control for switching mobile views.
 *
 * Supports both tap (on tab labels) and horizontal swipe gestures
 * via pointer events. A sliding pill indicator shows the active tab.
 *
 * Plan 078: Mobile Experience — Phase 1
 */
export function MobileSwipeStrip({
  views,
  activeIndex,
  onViewChange,
  rightAction,
}: MobileSwipeStripProps) {
  const startXRef = useRef(0);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    startXRef.current = e.clientX;
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const deltaX = e.clientX - startXRef.current;

      if (Math.abs(deltaX) >= SWIPE_THRESHOLD_PX) {
        const direction = deltaX > 0 ? -1 : 1;
        const nextIndex = activeIndex + direction;
        if (nextIndex >= 0 && nextIndex < views.length) {
          onViewChange(nextIndex);
        }
      }
    },
    [activeIndex, views.length, onViewChange]
  );

  const handleTabClick = useCallback(
    (index: number) => {
      if (index !== activeIndex) {
        onViewChange(index);
      }
    },
    [activeIndex, onViewChange]
  );

  const tabWidthPercent = 100 / views.length;

  return (
    <div
      style={{
        height: '42px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        touchAction: 'pan-y',
        userSelect: 'none',
        flexShrink: 0,
        padding: '0 6px',
        zIndex: 20,
      }}
      className="border-b border-border bg-background/85 backdrop-blur-md"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Sliding pill indicator */}
      <div
        data-testid="swipe-strip-pill"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: '2px',
          width: `${tabWidthPercent}%`,
          transform: `translateX(${activeIndex * 100}%)`,
          transition: 'transform 200ms ease-out',
          borderRadius: '1px 1px 0 0',
        }}
        className="bg-primary"
      />

      {/* Tab buttons */}
      {views.map((view, index) => (
        <button
          key={view.label}
          type="button"
          onClick={() => handleTabClick(index)}
          className={`flex-1 flex items-center justify-center gap-1.5 h-full border-none bg-transparent cursor-pointer text-[13px] transition-colors duration-150 p-0 ${
            index === activeIndex
              ? 'text-foreground font-semibold'
              : 'text-muted-foreground font-normal'
          }`}
        >
          {view.icon}
          {view.label}
        </button>
      ))}

      {/* Optional right action (e.g. search icon) */}
      {rightAction && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">{rightAction}</div>
      )}
    </div>
  );
}
