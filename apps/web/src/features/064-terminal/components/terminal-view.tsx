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
}

export function TerminalView({
  sessionName,
  cwd,
  className,
  onConnectionChange,
}: TerminalViewProps) {
  return (
    <div className={`h-full w-full ${className ?? ''}`}>
      <Suspense fallback={<TerminalSkeleton />}>
        <TerminalInner
          sessionName={sessionName}
          cwd={cwd}
          onConnectionChange={onConnectionChange}
        />
      </Suspense>
    </div>
  );
}
