'use client';

import { TerminalSquare } from 'lucide-react';
import type { ConnectionStatus } from '../types';
import { ConnectionStatusBadge } from './connection-status-badge';

interface TerminalPageHeaderProps {
  sessionName: string | null;
  connectionStatus: ConnectionStatus;
  onReconnect?: () => void;
}

export function TerminalPageHeader({
  sessionName,
  connectionStatus,
  onReconnect,
}: TerminalPageHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-2 shrink-0 bg-background">
      <div className="flex items-center gap-2">
        <TerminalSquare className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{sessionName ?? 'No session'}</span>
      </div>
      <div className="flex items-center gap-2">
        <ConnectionStatusBadge status={connectionStatus} onReconnect={onReconnect} />
      </div>
    </div>
  );
}
