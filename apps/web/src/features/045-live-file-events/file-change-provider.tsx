/**
 * Plan 045: Live File Events
 *
 * React context provider that feeds a FileChangeHub scoped to a single worktree.
 * SSE connection lifecycle managed by MultiplexedSSEProvider (Plan 072).
 *
 * Per Workshop 01: Single SSE connection per worktree, client-side fan-out.
 * Per DYK #1: MUST filter SSE messages by worktreePath before dispatching.
 * Per DYK #3: SSEManager injects `type` at top level of payload.
 */
'use client';

import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { createContext, useContext, useMemo } from 'react';
import { useChannelCallback } from '../../lib/sse';
import { FileChangeHub } from './file-change-hub';
import type { FileChange, FileChangeSSEMessage } from './file-change.types';

const FileChangeHubContext = createContext<FileChangeHub | null>(null);

/** SSE connection state exposed to consumers */
export type SSEConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const SSEConnectionStateContext = createContext<SSEConnectionState>('connecting');

interface FileChangeProviderProps {
  worktreePath: string;
  children: React.ReactNode;
}

/**
 * Provides a FileChangeHub scoped to a worktree.
 * SSE connection lifecycle is centralized in MultiplexedSSEProvider (Plan 072).
 * This provider subscribes to file-change events and dispatches to the hub.
 *
 * Mount inside BrowserClient — one per worktree view.
 */
export function FileChangeProvider({ worktreePath, children }: FileChangeProviderProps) {
  // New hub when worktreePath changes — the `worktreePath` dependency is intentional:
  // navigating to a different worktree must create a fresh hub with no stale subscriptions.
  // biome-ignore lint/correctness/useExhaustiveDependencies: worktreePath change = new hub by design
  const hub = useMemo(() => new FileChangeHub(), [worktreePath]);

  // Subscribe to file-changes channel via multiplexed SSE (Plan 072)
  const { isConnected } = useChannelCallback(WorkspaceDomain.FileChanges, (msg) => {
    // Cast from MultiplexedSSEMessage to domain type (DYK #2: loose typing)
    const data = msg as unknown as FileChangeSSEMessage;
    try {
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
      // Malformed SSE message — ignore
    }
  });

  // Map boolean isConnected to SSEConnectionState (DYK #3: zero consumers, simplified mapping)
  const effectiveState: SSEConnectionState = isConnected ? 'connected' : 'disconnected';

  return (
    <SSEConnectionStateContext.Provider value={effectiveState}>
      <FileChangeHubContext.Provider value={hub}>{children}</FileChangeHubContext.Provider>
    </SSEConnectionStateContext.Provider>
  );
}

/** Access SSE connection state (for debug indicators). */
export function useSSEConnectionState(): SSEConnectionState {
  return useContext(SSEConnectionStateContext);
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
