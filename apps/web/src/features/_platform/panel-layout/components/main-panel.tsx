'use client';

/**
 * MainPanel — Content area wrapper.
 *
 * Simple flex-1 wrapper with overflow handling for the primary content area.
 *
 * Phase 1: Panel Infrastructure — Plan 043
 */

import type { ReactNode } from 'react';

export interface MainPanelProps {
  children: ReactNode;
}

export function MainPanel({ children }: MainPanelProps) {
  return <div className="flex-1 flex flex-col overflow-hidden">{children}</div>;
}
