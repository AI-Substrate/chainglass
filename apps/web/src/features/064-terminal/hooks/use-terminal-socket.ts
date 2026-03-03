'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../types';

/** Known control message types from the sidecar server (DYK-02 whitelist) */
const CONTROL_TYPES = new Set(['status', 'error', 'sessions']);

export interface UseTerminalSocketOptions {
  sessionName: string | null;
  cwd: string;
  enabled?: boolean;
  onData?: (data: string) => void;
  onStatus?: (status: string, tmux: boolean, message?: string) => void;
  onError?: (message: string) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
}

export interface UseTerminalSocketReturn {
  status: ConnectionStatus;
  send: (data: string) => void;
  close: () => void;
  reconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

export function useTerminalSocket(options: UseTerminalSocketOptions): UseTerminalSocketReturn {
  const { sessionName, cwd, enabled = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const disposedRef = useRef(false);

  // Stable refs for values used in connect — prevents useCallback identity changes
  const sessionNameRef = useRef(sessionName);
  const cwdRef = useRef(cwd);
  const enabledRef = useRef(enabled);
  sessionNameRef.current = sessionName;
  cwdRef.current = cwd;
  enabledRef.current = enabled;

  // Callback refs — always fresh, never stale closure (useWorkspaceSSE pattern)
  const onDataRef = useRef(options.onData);
  const onStatusRef = useRef(options.onStatus);
  const onErrorRef = useRef(options.onError);
  const onConnectionChangeRef = useRef(options.onConnectionChange);
  onDataRef.current = options.onData;
  onStatusRef.current = options.onStatus;
  onErrorRef.current = options.onError;
  onConnectionChangeRef.current = options.onConnectionChange;

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    onConnectionChangeRef.current?.(newStatus);
  }, []);

  const connect = useCallback(() => {
    const currentSession = sessionNameRef.current;
    const currentCwd = cwdRef.current;
    const currentEnabled = enabledRef.current;

    if (disposedRef.current || !currentSession || !currentEnabled) return;

    // FT-004: Clear pending reconnect timer before new connection
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }

    const port = Number(window.location.port || '3000') + 1500;
    const host = window.location.hostname;
    const url = `ws://${host}:${port}/terminal?session=${encodeURIComponent(currentSession)}&cwd=${encodeURIComponent(currentCwd)}`;

    updateStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (disposedRef.current || wsRef.current !== ws) {
        ws.close();
        return;
      }
      reconnectAttemptsRef.current = 0;
      updateStatus('connected');
    };

    ws.onmessage = (event: MessageEvent) => {
      if (disposedRef.current || wsRef.current !== ws) return;
      const raw = typeof event.data === 'string' ? event.data : '';

      // DYK-02: Whitelist known control types, treat everything else as terminal data
      try {
        const msg = JSON.parse(raw);
        if (msg && typeof msg.type === 'string' && CONTROL_TYPES.has(msg.type)) {
          if (msg.type === 'status') {
            onStatusRef.current?.(msg.status, msg.tmux, msg.message);
            if (msg.status === 'connected') {
              updateStatus('connected');
            }
          } else if (msg.type === 'error') {
            onErrorRef.current?.(msg.message);
          }
          return;
        }
      } catch {
        // Not JSON — fall through to terminal data
      }

      // Raw terminal data
      onDataRef.current?.(raw);
    };

    ws.onclose = (event: CloseEvent) => {
      if (disposedRef.current) return;
      // FT-004: Only update state if this is still the current socket
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      updateStatus('disconnected');

      // Reconnect on unexpected close (not clean close code 1000)
      if (
        event.code !== 1000 &&
        enabledRef.current &&
        reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
      ) {
        const delay = Math.min(
          INITIAL_BACKOFF_MS * 2 ** reconnectAttemptsRef.current,
          MAX_BACKOFF_MS
        );
        reconnectAttemptsRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror — reconnection handled there
    };
  }, [updateStatus]);

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const close = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    updateStatus('disconnected');
  }, [updateStatus]);

  const reconnect = useCallback(() => {
    // FT-004: Clear pending auto-reconnect before manual reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  // Auto-connect when enabled and sessionName provided
  useEffect(() => {
    disposedRef.current = false;

    if (enabled && sessionName) {
      connect();
    }

    return () => {
      disposedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [enabled, sessionName, connect]);

  return { status, send, close, reconnect };
}
