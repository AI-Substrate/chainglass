'use client';

import type { TerminalSession } from '../types';

interface TerminalSessionListProps {
  sessions: TerminalSession[];
  activeSession: string | null;
  loading: boolean;
  onSelect: (name: string) => void;
  onRefresh: () => void;
}

export function TerminalSessionList({
  sessions,
  activeSession,
  loading,
  onSelect,
  onRefresh,
}: TerminalSessionListProps) {
  if (loading && sessions.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
        Loading sessions…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 text-xs text-muted-foreground">
        <span>No tmux sessions found</span>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col" data-testid="terminal-session-list">
      {sessions.map((session) => (
        <button
          key={session.name}
          type="button"
          onClick={() => onSelect(session.name)}
          className={`flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
            activeSession === session.name ? 'bg-accent font-medium' : ''
          }`}
          data-testid={`session-${session.name}`}
        >
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              session.attached > 0 ? 'bg-green-500' : 'bg-gray-400'
            }`}
            aria-label={session.attached > 0 ? 'attached' : 'detached'}
          />
          <span className="min-w-0 truncate">{session.name}</span>
          {session.isCurrentWorktree && (
            <span className="ml-auto shrink-0 rounded bg-blue-500/10 px-1 text-[10px] text-blue-600 dark:text-blue-400">
              current
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
