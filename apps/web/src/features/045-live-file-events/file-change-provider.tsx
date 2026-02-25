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
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FileChangeHub } from './file-change-hub';
import type { FileChange, FileChangeSSEMessage } from './file-change.types';

const FileChangeHubContext = createContext<FileChangeHub | null>(null);

/** SSE connection state exposed to consumers */
export type SSEConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

const SSEConnectionStateContext = createContext<SSEConnectionState>('connecting');

interface FileChangeProviderProps {
  worktreePath: string;
  children: React.ReactNode;
  /** Override EventSource constructor for testing */
  eventSourceFactory?: (url: string) => EventSource;
}

/** Max reconnect attempts before giving up (resets on successful connection) */
const MAX_RECONNECT_ATTEMPTS = 50;
/** Base delay for manual reconnect backoff (ms) */
const RECONNECT_BASE_DELAY = 2000;
/** Max delay cap for backoff (ms) */
const RECONNECT_MAX_DELAY = 30000;

/**
 * Provides a FileChangeHub scoped to a worktree.
 * Manages the single SSE connection lifecycle with reconnection and logging.
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
  const [connectionState, setConnectionState] = useState<SSEConnectionState>('connecting');
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(
    (factory: (url: string) => EventSource): EventSource => {
      const url = `/api/events/${WorkspaceDomain.FileChanges}`;
      const eventSource = factory(url);

      eventSource.onopen = () => {
        if (reconnectAttemptsRef.current > 0) {
          console.info(
            `[FileChangeProvider] SSE reconnected after ${reconnectAttemptsRef.current} attempt(s)`
          );
        }
        reconnectAttemptsRef.current = 0;
        setConnectionState('connected');
      };

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

      eventSource.onerror = () => {
        // EventSource.readyState: 0=CONNECTING, 1=OPEN, 2=CLOSED
        const state = eventSource.readyState;

        if (state === EventSource.CLOSED) {
          // Browser gave up on native reconnect — manually reconnect with backoff
          reconnectAttemptsRef.current++;
          console.warn(
            `[FileChangeProvider] SSE connection closed (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`
          );

          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            console.error(
              '[FileChangeProvider] SSE max reconnect attempts reached — giving up. Refresh the page to restore live events.'
            );
            setConnectionState('disconnected');
            return;
          }

          setConnectionState('reconnecting');
          const delay = Math.min(
            RECONNECT_BASE_DELAY * 2 ** (reconnectAttemptsRef.current - 1),
            RECONNECT_MAX_DELAY
          );
          reconnectTimerRef.current = setTimeout(() => {
            console.info(
              `[FileChangeProvider] SSE manual reconnect attempt ${reconnectAttemptsRef.current}...`
            );
            eventSourceRef.current = connect(factory);
          }, delay);
        } else if (state === EventSource.CONNECTING) {
          // Browser is auto-reconnecting (native SSE behavior) — just log
          setConnectionState('reconnecting');
          console.debug('[FileChangeProvider] SSE auto-reconnecting...');
        }
      };

      return eventSource;
    },
    [hub, worktreePath]
  );

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const factory = eventSourceFactory ?? ((url: string) => new EventSource(url));
    setConnectionState('connecting');
    reconnectAttemptsRef.current = 0;
    eventSourceRef.current = connect(factory);

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect, eventSourceFactory]);

  return (
    <SSEConnectionStateContext.Provider value={connectionState}>
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
