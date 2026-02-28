'use client';

/**
 * PanelShell — Root layout compositor with resizable panels.
 *
 * Uses CSS resize for the left panel — simple, reliable, no library issues.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 */

import type { ReactNode } from 'react';

export interface PanelShellProps {
  /** Top utility bar (ExplorerPanel) — full width, not resizable */
  explorer: ReactNode;
  /** Left sidebar (LeftPanel) — resizable via CSS */
  left: ReactNode;
  /** Main content area (MainPanel) — fills remaining space */
  main: ReactNode;
  /** Unique ID for persisting panel sizes */
  autoSaveId?: string;
}

export function PanelShell({ explorer, left, main }: PanelShellProps) {
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
        <div className="flex-1 flex flex-col overflow-hidden">{main}</div>
      </div>
    </div>
  );
}
