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
 * Plan 084 split-terminal-view: optional rightPane slot. When present
 *   (desktop only), wraps left+main and rightPane in a horizontal
 *   ResizablePanelGroup. `data-terminal-overlay-anchor` stays on the
 *   `main` slot wrapper in both branches so the right-edge terminal
 *   overlay continues to size to the file-viewer column.
 */

import { useResponsive } from '@/hooks/useResponsive';
import type { ReactNode } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { MobilePanelShell } from './mobile-panel-shell';
import type { MobilePanelShellView } from './mobile-panel-shell';

export interface PanelShellProps {
  /** Top utility bar (ExplorerPanel) — full width, not resizable */
  explorer: ReactNode;
  /** Left sidebar (LeftPanel) — resizable via CSS */
  left: ReactNode;
  /** Main content area (MainPanel) — fills remaining space */
  main: ReactNode;
  /**
   * Optional right-docked pane. When set (desktop only), the layout wraps
   * `left + main` and `rightPane` in a horizontal `ResizablePanelGroup`.
   * Generic — not reserved for terminal use. Plan 084 split-terminal-view.
   */
  rightPane?: ReactNode;
  /** Unique ID for persisting panel sizes */
  autoSaveId?: string;
  /** Mobile view configuration. When provided + phone viewport, renders MobilePanelShell. */
  mobileViews?: MobilePanelShellView[];
  /** Initial active mobile view index (e.g. 2 for Terminal). Clamped to valid range. */
  initialMobileActiveIndex?: number;
  /** Controlled mobile active index — drives MobilePanelShell externally. */
  mobileActiveIndex?: number;
  /** Called when mobile view changes (for tracking active index in parent). */
  onMobileViewChange?: (index: number) => void;
  /** Optional action slot for mobile swipe strip right side (e.g. search icon). */
  mobileRightAction?: ReactNode;
}

export function PanelShell({
  explorer,
  left,
  main,
  rightPane,
  mobileViews,
  initialMobileActiveIndex,
  mobileActiveIndex,
  onMobileViewChange,
  mobileRightAction,
}: PanelShellProps) {
  const { useMobilePatterns } = useResponsive();

  if (useMobilePatterns && mobileViews && mobileViews.length > 0) {
    return (
      <MobilePanelShell
        views={mobileViews}
        initialActiveIndex={initialMobileActiveIndex}
        activeIndex={mobileActiveIndex}
        onViewChange={onMobileViewChange}
        rightAction={mobileRightAction}
      />
    );
  }

  // Inner left+main composition. The wrapper className differs by branch:
  // - no-slot: `flex flex-1 overflow-hidden` (today's exact DOM, preserves AC-01/AC-15)
  // - with-slot: `flex h-full w-full overflow-hidden` (fills the parent ResizablePanel)
  const leftMainColumns = (wrapperClass: string) => (
    <div className={wrapperClass}>
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
  );

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Explorer bar — fixed height, spans full width above any split */}
      <div className="shrink-0">{explorer}</div>

      {rightPane ? (
        // KF-08: deliberately no autoSaveId — toggle/ratio is session-only React state (C-07).
        // Explicit panel ids pin identity across remounts so the library
        // applies defaultSize on every fresh mount instead of attempting to
        // restore from a stale layout.
        <ResizablePanelGroup
          id="panel-shell-split"
          orientation="horizontal"
          defaultLayout={{
            'panel-shell-split-left': 66.66,
            'panel-shell-split-right': 33.33,
          }}
          className="flex-1 overflow-hidden"
        >
          <ResizablePanel id="panel-shell-split-left" minSize={30}>
            {leftMainColumns('flex h-full w-full overflow-hidden')}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="panel-shell-split-right" minSize={15} maxSize={70}>
            {rightPane}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        leftMainColumns('flex flex-1 overflow-hidden')
      )}
    </div>
  );
}
