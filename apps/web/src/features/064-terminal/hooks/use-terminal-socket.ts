'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../types';

/** Known control message types from the sidecar server (DYK-02 whitelist) */
const CONTROL_TYPES = new Set(['status', 'error', 'sessions', 'clipboard']);

/** Auth close codes from sidecar — don't retry with stale token (DYK-05) */
const AUTH_CLOSE_CODES = new Set([4401, 4403]);

/** Fatal close codes — retrying won't help (bad session name, CWD rejected) */
const FATAL_CLOSE_CODES = new Set([4400]);

const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000; // 4 minutes (token expires in 5)

export interface UseTerminalSocketOptions {
  sessionName: string | null;
  cwd: string;
  enabled?: boolean;
  onData?: (data: string) => void;
  onStatus?: (status: string, tmux: boolean, message?: string) => void;
  onError?: (message: string) => void;
  onClipboard?: (data: string, error?: string) => void;
  onConnectionChange?: (status: ConnectionStatus) => void;
}

export interface UseTerminalSocketReturn {
  status: ConnectionStatus;
  send: (data: string) => void;
  close: () => void;
  reconnect: () => void;
  copyBuffer: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 8000;

export function useTerminalSocket(options: UseTerminalSocketOptions): UseTerminalSocketReturn {
  const { sessionName, cwd, enabled = true } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const disposedRef = useRef(false);
  // DYK-01: Token stored in ref — connect() stays synchronous, effect fetches async
  const tokenRef = useRef<string | null>(null);

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
  const onClipboardRef = useRef(options.onClipboard);
  const onConnectionChangeRef = useRef(options.onConnectionChange);
  onDataRef.current = options.onData;
  onStatusRef.current = options.onStatus;
  onErrorRef.current = options.onError;
  onClipboardRef.current = options.onClipboard;
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
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    let url = `${protocol}://${host}:${port}/terminal?session=${encodeURIComponent(currentSession)}&cwd=${encodeURIComponent(currentCwd)}`;
    // Append auth token if available (fetched by effect before connect)
    if (tokenRef.current) {
      url += `&token=${encodeURIComponent(tokenRef.current)}`;
    }

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
          } else if (msg.type === 'clipboard') {
            onClipboardRef.current?.(msg.data, msg.error);
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

      // Fatal close codes — no point retrying (bad CWD, bad session name)
      if (FATAL_CLOSE_CODES.has(event.code)) {
        return;
      }

      // DYK-05: Auth close codes — fetch new token before reconnecting
      if (AUTH_CLOSE_CODES.has(event.code)) {
        if (enabledRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          // Re-fetch token then reconnect
          fetch('/api/terminal/token')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (disposedRef.current) return;
              tokenRef.current = data?.token ?? null;
              if (tokenRef.current) connect();
            })
            .catch(() => {});
        }
        return;
      }

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

  const copyBuffer = useCallback(() => {
    send(JSON.stringify({ type: 'copy-buffer' }));
  }, [send]);

  // Auto-connect: fetch token first (DYK-01), then connect synchronously
  useEffect(() => {
    disposedRef.current = false;
    const abortController = new AbortController();

    if (enabled && sessionName) {
      // Fetch auth token, then connect. If fetch fails (no auth), connect without token.
      fetch('/api/terminal/token', { signal: abortController.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (disposedRef.current || abortController.signal.aborted) return;
          tokenRef.current = data?.token ?? null;
          connect();
        })
        .catch(() => {
          if (disposedRef.current || abortController.signal.aborted) return;
          // Auth not available — connect without token (graceful fallback)
          tokenRef.current = null;
          connect();
        });
    }

    return () => {
      disposedRef.current = true;
      abortController.abort();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [enabled, sessionName, connect]);

  // Token refresh interval — send new token over existing WS every 4 minutes
  useEffect(() => {
    if (status !== 'connected') return;

    tokenRefreshRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/terminal/token');
        if (!res.ok) return;
        const { token } = await res.json();
        tokenRef.current = token;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'auth', token }));
        }
      } catch {
        // Refresh failed — will be caught on next server-side expiry check
      }
    }, TOKEN_REFRESH_INTERVAL_MS);

    return () => {
      if (tokenRefreshRef.current) {
        clearInterval(tokenRefreshRef.current);
        tokenRefreshRef.current = null;
      }
    };
  }, [status]);

  return { status, send, close, reconnect, copyBuffer };
}
