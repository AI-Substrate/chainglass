'use client';

/**
 * PanelShell — Root layout compositor with resizable panels.
 *
 * Arranges ExplorerPanel (top, fixed height) + LeftPanel and MainPanel
 * in a horizontal ResizablePanelGroup with a drag handle.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 * DYK-02: autoSaveId persists resize state to localStorage.
 */

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { ReactNode } from 'react';

export interface PanelShellProps {
  /** Top utility bar (ExplorerPanel) — full width, not resizable */
  explorer: ReactNode;
  /** Left sidebar (LeftPanel) — resizable */
  left: ReactNode;
  /** Main content area (MainPanel) — fills remaining space */
  main: ReactNode;
  /** Unique ID for persisting panel sizes (defaults to 'browser-panels') */
  autoSaveId?: string;
}

export function PanelShell({
  explorer,
  left,
  main,
  autoSaveId = 'browser-panels',
}: PanelShellProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Explorer bar — fixed height, not resizable */}
      {explorer}

      {/* Resizable left + main split */}
      <ResizablePanelGroup direction="horizontal" autoSaveId={autoSaveId}>
        <ResizablePanel defaultSize={20} minSize={15} maxSize={40}>
          {left}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={80}>{main}</ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
