'use client';

/**
 * WorkflowEditorLayout — Standalone flexbox layout for the workflow editor.
 *
 * Temp bar (top) + main area (canvas) + right sidebar (toolbox).
 * No PanelShell dependency — self-contained within workflow-ui domain.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 */

import type { ReactNode } from 'react';

export interface WorkflowEditorLayoutProps {
  topBar: ReactNode;
  main: ReactNode;
  right: ReactNode;
}

export function WorkflowEditorLayout({ topBar, main, right }: WorkflowEditorLayoutProps) {
  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0">{topBar}</div>

      {/* Main + Right split */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">{main}</div>
        <div
          className="shrink-0 overflow-y-auto border-l"
          style={{ width: 260, minWidth: 180, maxWidth: '35%', resize: 'horizontal' }}
        >
          {right}
        </div>
      </div>
    </div>
  );
}
