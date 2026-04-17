'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import type { ConnectionStatus } from '../types';
import { TerminalSkeleton } from './terminal-skeleton';

const TerminalInner = dynamic(() => import('./terminal-inner'), {
  ssr: false,
  loading: () => <TerminalSkeleton />,
});

export interface TerminalViewProps {
  sessionName: string;
  cwd: string;
  className?: string;
  onConnectionChange?: (status: ConnectionStatus) => void;
  themeOverride?: 'dark' | 'light' | 'system';
  /** When true, terminal is the active mobile view — triggers refocus via isVisible */
  isActive?: boolean;
}

export function TerminalView({
  sessionName,
  cwd,
  className,
  onConnectionChange,
  themeOverride,
  isActive,
}: TerminalViewProps) {
  return (
    <div className={`h-full w-full ${className ?? ''}`}>
      <Suspense fallback={<TerminalSkeleton />}>
        <TerminalInner
          sessionName={sessionName}
          cwd={cwd}
          onConnectionChange={onConnectionChange}
          themeOverride={themeOverride}
          isVisible={isActive}
        />
      </Suspense>
    </div>
  );
}
