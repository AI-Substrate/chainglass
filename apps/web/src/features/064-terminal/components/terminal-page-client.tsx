'use client';

import { useWorkspaceContext } from '@/features/041-file-browser/hooks/use-workspace-context';
import { LeftPanel, MainPanel, PanelShell } from '@/features/_platform/panel-layout';
import type { PanelMode } from '@/features/_platform/panel-layout';
import type { LeftPanelMode } from '@/features/_platform/panel-layout';
import { List, TerminalSquare } from 'lucide-react';
import { useState } from 'react';
import { useTerminalSessions } from '../hooks/use-terminal-sessions';
import type { ConnectionStatus } from '../types';
import { TerminalPageHeader } from './terminal-page-header';
import { TerminalSessionList } from './terminal-session-list';
import { TerminalView } from './terminal-view';

const TERMINAL_MODES: LeftPanelMode[] = [
  { key: 'sessions' as PanelMode, icon: <List className="h-3.5 w-3.5" />, label: 'Sessions' },
];

interface TerminalPageClientProps {
  slug: string;
  worktreePath: string;
  worktreeBranch: string;
}

export function TerminalPageClient({
  slug,
  worktreePath,
  worktreeBranch,
}: TerminalPageClientProps) {
  const { sessions, loading, selectedSession, setSelectedSession, refresh } = useTerminalSessions({
    currentBranch: worktreeBranch,
  });

  const wsCtx = useWorkspaceContext();
  const terminalTheme = wsCtx?.worktreeIdentity?.terminalTheme || 'dark';
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  return (
    <PanelShell
      mobileViews={[
        {
          label: 'Terminal',
          icon: <TerminalSquare className="h-4 w-4" />,
          content: (
            <MainPanel>
              {selectedSession ? (
                <TerminalView
                  sessionName={selectedSession}
                  cwd={worktreePath}
                  onConnectionChange={setConnectionStatus}
                  themeOverride={terminalTheme}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {loading ? 'Loading sessions…' : 'Select a session to connect'}
                </div>
              )}
            </MainPanel>
          ),
          isTerminal: true,
        },
      ]}
      explorer={
        <TerminalPageHeader sessionName={selectedSession} connectionStatus={connectionStatus} />
      }
      left={
        <LeftPanel
          mode={'sessions' as PanelMode}
          onModeChange={() => {}}
          modes={TERMINAL_MODES}
          onRefresh={refresh}
          subtitle={
            <span className="text-xs text-muted-foreground">
              {sessions.length} session{sessions.length !== 1 ? 's' : ''}
            </span>
          }
        >
          {{
            sessions: (
              <TerminalSessionList
                sessions={sessions}
                activeSession={selectedSession}
                loading={loading}
                onSelect={setSelectedSession}
                onRefresh={refresh}
              />
            ),
          }}
        </LeftPanel>
      }
      main={
        <MainPanel>
          {selectedSession ? (
            <TerminalView
              sessionName={selectedSession}
              cwd={worktreePath}
              onConnectionChange={setConnectionStatus}
              themeOverride={terminalTheme}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? 'Loading sessions…' : 'Select a session to connect'}
            </div>
          )}
        </MainPanel>
      }
    />
  );
}
