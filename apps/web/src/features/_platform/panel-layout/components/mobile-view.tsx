'use client';

import type { ReactNode } from 'react';

export interface MobileViewProps {
  /** Whether this view is currently visible */
  isActive: boolean;
  /** Whether to add data-terminal-overlay-anchor (for terminal view) */
  isTerminal?: boolean;
  children: ReactNode;
}

/**
 * MobileView — wrapper for a single view in the mobile panel shell.
 *
 * Keeps children mounted at all times (preserving terminal WebSocket,
 * scroll positions, expanded tree nodes). Uses visibility + pointer-events
 * to hide inactive views without unmounting.
 *
 * Internal component — not exported from barrel.
 *
 * Plan 078: Mobile Experience — Phase 1
 */
export function MobileView({ isActive, isTerminal, children }: MobileViewProps) {
  return (
    <div
      style={{
        width: '100vw',
        height: '100%',
        flexShrink: 0,
        visibility: isActive ? 'visible' : 'hidden',
        pointerEvents: isActive ? 'auto' : 'none',
        overflow: 'hidden',
      }}
      {...(isTerminal ? { 'data-terminal-overlay-anchor': '' } : {})}
    >
      {children}
    </div>
  );
}
