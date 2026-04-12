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
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture not supported in test env (jsdom)
    }
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
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(24,24,27,0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        flexShrink: 0,
        padding: '0 6px',
        zIndex: 20,
      }}
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
          background: 'var(--primary, #3b82f6)',
          borderRadius: '1px 1px 0 0',
        }}
      />

      {/* Tab buttons */}
      {views.map((view, index) => (
        <button
          key={view.label}
          type="button"
          onClick={() => handleTabClick(index)}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            height: '100%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: index === activeIndex ? 600 : 400,
            color:
              index === activeIndex
                ? 'var(--foreground, #fafafa)'
                : 'var(--muted-foreground, #a1a1aa)',
            transition: 'color 150ms, font-weight 150ms',
            padding: 0,
          }}
        >
          {view.icon}
          {view.label}
        </button>
      ))}

      {/* Optional right action (e.g. search icon) */}
      {rightAction && (
        <div
          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)' }}
        >
          {rightAction}
        </div>
      )}
    </div>
  );
}
