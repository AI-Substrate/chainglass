'use client';

/**
 * PanelShell — Root layout compositor with resizable panels.
 *
 * On phone viewports (<768px), renders MobilePanelShell with swipeable
 * full-screen views when mobileViews is provided. On tablet/desktop,
 * renders the standard three-panel layout.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * Phase 1: Mobile Panel Shell — Plan 078
 */

import { useResponsive } from '@/hooks/useResponsive';
import type { ReactNode } from 'react';
import { MobilePanelShell } from './mobile-panel-shell';
import type { MobilePanelShellView } from './mobile-panel-shell';

export interface PanelShellProps {
  /** Top utility bar (ExplorerPanel) — full width, not resizable */
  explorer: ReactNode;
  /** Left sidebar (LeftPanel) — resizable via CSS */
  left: ReactNode;
  /** Main content area (MainPanel) — fills remaining space */
  main: ReactNode;
  /** Unique ID for persisting panel sizes */
  autoSaveId?: string;
  /** Mobile view configuration. When provided + phone viewport, renders MobilePanelShell. */
  mobileViews?: MobilePanelShellView[];
}

export function PanelShell({ explorer, left, main, mobileViews }: PanelShellProps) {
  const { useMobilePatterns } = useResponsive();

  if (useMobilePatterns && mobileViews && mobileViews.length > 0) {
    return <MobilePanelShell views={mobileViews} />;
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Explorer bar — fixed height */}
      <div className="shrink-0">{explorer}</div>

      {/* Left + Main split */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="shrink-0 overflow-hidden border-r"
          style={{ width: 280, minWidth: 150, maxWidth: '50%', resize: 'horizontal' }}
        >
          {left}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden" data-terminal-overlay-anchor>
          {main}
        </div>
      </div>
    </div>
  );
}
