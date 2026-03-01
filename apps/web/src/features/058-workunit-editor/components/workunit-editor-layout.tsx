'use client';

import type { ReactNode } from 'react';

export interface WorkUnitEditorLayoutProps {
  /** Left sidebar — unit catalog browser */
  left: ReactNode;
  /** Main content — type-specific editor */
  main: ReactNode;
  /** Right panel — metadata editing */
  right: ReactNode;
}

/**
 * 3-panel layout for the work unit editor page.
 * Left catalog sidebar + main editor + right metadata panel.
 *
 * Plan 058, Phase 2, DYK #1: PanelShell has no right panel,
 * so this follows the WorkflowEditorLayout pattern instead.
 */
export function WorkUnitEditorLayout({ left, main, right }: WorkUnitEditorLayoutProps) {
  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Left sidebar — unit catalog */}
      <div
        className="shrink-0 overflow-y-auto border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        style={{ width: 240, minWidth: 180, maxWidth: '30%', resize: 'horizontal' }}
      >
        {left}
      </div>

      {/* Main editor area */}
      <div className="flex-1 flex flex-col overflow-y-auto">{main}</div>

      {/* Right metadata panel */}
      <div
        className="shrink-0 overflow-y-auto border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
        style={{ width: 280, minWidth: 200, maxWidth: '35%', resize: 'horizontal' }}
      >
        {right}
      </div>
    </div>
  );
}
