/**
 * Plan 045: Live File Events
 *
 * React context provider that manages the SSE connection lifecycle
 * and feeds a FileChangeHub scoped to a single worktree.
 *
 * Per Workshop 01: Single SSE connection per worktree, client-side fan-out.
 * Per DYK #1: MUST filter SSE messages by worktreePath before dispatching.
 * Per DYK #3: SSEManager injects `type` at top level of payload.
 *
 * Uses raw EventSource (browser auto-reconnect per SSE spec).
 */
'use client';

import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { createContext, useContext, useEffect, useMemo } from 'react';
import { FileChangeHub } from './file-change-hub';
import type { FileChange, FileChangeSSEMessage } from './file-change.types';

const FileChangeHubContext = createContext<FileChangeHub | null>(null);

interface FileChangeProviderProps {
  worktreePath: string;
  children: React.ReactNode;
  /** Override EventSource constructor for testing */
  eventSourceFactory?: (url: string) => EventSource;
}

/**
 * Provides a FileChangeHub scoped to a worktree.
 * Manages the single SSE connection lifecycle.
 *
 * Mount inside BrowserClient — one per worktree view.
 */
export function FileChangeProvider({
  worktreePath,
  children,
  eventSourceFactory,
}: FileChangeProviderProps) {
  // New hub when worktreePath changes — the `worktreePath` dependency is intentional:
  // navigating to a different worktree must create a fresh hub with no stale subscriptions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: worktreePath change = new hub by design
  const hub = useMemo(() => new FileChangeHub(), [worktreePath]);

  useEffect(() => {
    const factory = eventSourceFactory ?? ((url: string) => new EventSource(url));
    const eventSource = factory(`/api/events/${WorkspaceDomain.FileChanges}`);

    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as FileChangeSSEMessage;
        if (data.type !== 'file-changed' || !Array.isArray(data.changes)) {
          return;
        }

        // DYK #1: Filter to only changes matching this worktree
        const relevantChanges: FileChange[] = data.changes
          .filter((c) => c.worktreePath === worktreePath)
          .map((c) => ({
            path: c.path,
            eventType: c.eventType as FileChange['eventType'],
            timestamp: c.timestamp,
          }));

        if (relevantChanges.length > 0) {
          hub.dispatch(relevantChanges);
        }
      } catch {
        // Malformed SSE message — ignore (heartbeats, etc.)
      }
    };

    return () => {
      eventSource.close();
    };
  }, [hub, worktreePath, eventSourceFactory]);

  return <FileChangeHubContext.Provider value={hub}>{children}</FileChangeHubContext.Provider>;
}

/**
 * Access the FileChangeHub from context.
 * Throws if used outside a FileChangeProvider.
 */
export function useFileChangeHub(): FileChangeHub {
  const hub = useContext(FileChangeHubContext);
  if (!hub) {
    throw new Error('useFileChangeHub must be used within a FileChangeProvider');
  }
  return hub;
}
