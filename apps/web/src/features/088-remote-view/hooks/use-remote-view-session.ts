'use client';
/**
 * Remote-view reconnect hook — wires the pure session machine (T006) to a real
 * WebSocket against the daemon (or the frame-replay fake in tests).
 *
 * Implements the socket-dependent races from Workshop 002:
 *  - R1: connect/reattach → `live` on the first keyframe.
 *  - R2: a `displaced` message → `displaced`; `reclaim()` re-attaches (R3: only on
 *    the explicit user action — the machine never auto-reconnects from displaced).
 *  - R5: the daemon's WS heartbeat ping is auto-answered by the socket; an
 *    unexpected drop → `reconnecting`.
 *  - R6: backoff reconnect (250/1000/3000ms); attempts exhausted → health check →
 *    healthy ⇒ `sessionLost` + auto-recreate ONCE by windowId; unhealthy ⇒ `daemonDown`.
 *  - R8: window-state `minimized` needs no special handling (the daemon auto-restores);
 *    `gone` → `windowGone`.
 *
 * Reconnect uses the `wsRef.current !== ws` stale-socket guard idiom from
 * `use-terminal-socket.ts:111` (PL-03) so aborted/superseded sockets never mutate state.
 *
 * Plan 088 Phase 2 — T007.
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { decodeFrameHeader } from '../protocol/binary';
import { parseServerMessage } from '../protocol/messages';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BACKOFF_MS,
  type ViewportState,
  initialState,
  transition,
} from '../server/session-machine';

async function defaultGetToken(): Promise<string> {
  const res = await fetch('/api/remote-view/token');
  if (!res.ok) throw new Error('remote-view token fetch failed');
  return (await res.json()).token as string;
}
async function defaultHealthCheck(): Promise<boolean> {
  try {
    return (await fetch('/api/remote-view/health')).ok;
  } catch {
    return false;
  }
}
async function defaultCreateSession(): Promise<string | null> {
  return null; // real daemon recreate lands in Phase 5
}

export interface UseRemoteViewSessionOptions {
  /** WS base url, e.g. `ws://127.0.0.1:<port>` (the fake) or the daemon url. */
  url: string;
  /** rv session id (from the URL param); null → picker. */
  session: string | null;
  /** Target window id — survives reconnect; needed for R6 auto-recreate. */
  windowId?: number | null;
  enabled?: boolean;
  /** Fetch a fresh JWT for the socket query (default: GET /api/remote-view/token). */
  getToken?: () => Promise<string>;
  /** Daemon health probe at reconnect-exhaustion (default: GET /api/remote-view/health). */
  healthCheck?: () => Promise<boolean>;
  /** Recreate a session for the window (R6, once). Returns the new session id or null. */
  createSession?: (windowId: number) => Promise<string | null>;
  /** No-frame stall threshold in ms (default 2000). */
  stallMs?: number;
  /** Reconnect backoff schedule in ms (default 250/1000/3000). */
  backoffMs?: readonly number[];
}

export interface UseRemoteViewSessionResult {
  state: ViewportState;
  /** Explicit reclaim from `displaced` (R3 — the only auto-free path back). */
  reclaim: () => void;
  /** Explicit detach → picker (daemon closes the session). */
  detach: () => void;
  /** From a terminal state (windowGone/daemonDown/error/sessionLost) back to picker. */
  returnToPicker: () => void;
}

export function useRemoteViewSession(
  opts: UseRemoteViewSessionOptions
): UseRemoteViewSessionResult {
  const {
    url,
    session,
    windowId = null,
    enabled = true,
    getToken = defaultGetToken,
    healthCheck = defaultHealthCheck,
    createSession = defaultCreateSession,
    stallMs = 2000,
    backoffMs = RECONNECT_BACKOFF_MS,
  } = opts;

  const [state, dispatch] = useReducer(transition, undefined, () =>
    initialState(session ? { sessionId: session, windowId: windowId ?? undefined } : null)
  );

  const wsRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<string | null>(session);
  const windowIdRef = useRef<number | null>(windowId);
  const attemptsRef = useRef(0);
  const recreatedRef = useRef(false);
  const disposedRef = useRef(false);
  const intentionalRef = useRef(false);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectRef = useRef<() => void>(() => {});

  windowIdRef.current = windowId;

  // Keep the latest callbacks/options in refs so the long-lived socket closures
  // never go stale without re-subscribing the socket on every render.
  const cbRef = useRef({ getToken, healthCheck, createSession, stallMs, backoffMs });
  cbRef.current = { getToken, healthCheck, createSession, stallMs, backoffMs };

  useEffect(() => {
    disposedRef.current = false;
    if (!enabled || !session) return;
    sessionRef.current = session;
    attemptsRef.current = 0;
    recreatedRef.current = false;

    const clearStall = () => {
      if (stallTimer.current) {
        clearTimeout(stallTimer.current);
        stallTimer.current = null;
      }
    };
    const clearReconnect = () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    };
    const armStall = () => {
      clearStall();
      stallTimer.current = setTimeout(() => dispatch({ type: 'STALL' }), cbRef.current.stallMs);
    };

    function handleMessage(ev: MessageEvent) {
      const data = ev.data;
      if (typeof data !== 'string') {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : (data as Uint8Array);
        const header = decodeFrameHeader(bytes);
        if (header) {
          dispatch({ type: 'FRAME', keyframe: header.keyframe });
          armStall();
        }
        return;
      }
      const msg = parseServerMessage(data);
      if (!msg) return;
      switch (msg.t) {
        case 'hello-ok':
          windowIdRef.current = msg.window.id;
          dispatch({ type: 'HELLO_OK', sessionId: msg.session, windowId: msg.window.id });
          break;
        case 'displaced':
          intentionalRef.current = true; // the server closes after this; not a reconnect trigger
          dispatch({ type: 'DISPLACED' });
          break;
        case 'window-state':
          if (msg.state === 'gone') dispatch({ type: 'WINDOW_GONE' });
          // minimized/restored/resized/moved (R8): daemon auto-restores; no special handling
          break;
        case 'error':
          intentionalRef.current = msg.fatal; // a fatal error close shouldn't trigger reconnect
          dispatch({ type: 'ERROR', code: msg.code });
          break;
        default:
          break; // pong/stats/video-config/bye — no state change here
      }
    }

    function scheduleReconnect() {
      if (disposedRef.current) return;
      const backoff = cbRef.current.backoffMs;
      if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = backoff[Math.min(attemptsRef.current, backoff.length - 1)];
        reconnectTimer.current = setTimeout(() => {
          attemptsRef.current += 1;
          dispatch({ type: 'RECONNECT_ATTEMPT' });
          connect();
        }, delay);
      } else {
        Promise.resolve(cbRef.current.healthCheck()).then((healthy) => {
          if (disposedRef.current) return;
          dispatch({ type: 'RECONNECT_EXHAUSTED', daemonHealthy: healthy });
          if (healthy) recreateOnce();
        });
      }
    }

    function recreateOnce() {
      if (recreatedRef.current || windowIdRef.current == null) {
        dispatch({ type: 'SESSION_RECREATE_FAIL' });
        return;
      }
      recreatedRef.current = true;
      Promise.resolve(cbRef.current.createSession(windowIdRef.current)).then((newSid) => {
        if (disposedRef.current) return;
        if (newSid) {
          sessionRef.current = newSid;
          attemptsRef.current = 0;
          dispatch({ type: 'SESSION_RECREATE_OK', sessionId: newSid });
          connect();
        } else {
          dispatch({ type: 'SESSION_RECREATE_FAIL' });
        }
      });
    }

    function connect() {
      if (disposedRef.current || !sessionRef.current) return;
      clearReconnect();
      if (wsRef.current) {
        intentionalRef.current = true;
        try {
          wsRef.current.close(4001); // abort superseded socket (R7)
        } catch {
          /* noop */
        }
        wsRef.current = null;
      }
      Promise.resolve(cbRef.current.getToken())
        .then((token) => {
          if (disposedRef.current || !sessionRef.current) return;
          const sid = sessionRef.current;
          const ws = new WebSocket(
            `${url}/stream?session=${encodeURIComponent(sid)}&token=${encodeURIComponent(token)}`
          );
          ws.binaryType = 'arraybuffer';
          wsRef.current = ws;
          intentionalRef.current = false;
          ws.onopen = () => {
            if (disposedRef.current || wsRef.current !== ws) {
              try {
                ws.close();
              } catch {
                /* noop */
              }
              return;
            }
            ws.send(JSON.stringify({ t: 'hello', v: 1, session: sid }));
          };
          ws.onmessage = (ev) => {
            if (wsRef.current !== ws) return; // stale-socket guard (PL-03)
            handleMessage(ev as MessageEvent);
          };
          ws.onerror = () => {
            /* recovery handled in onclose */
          };
          ws.onclose = (ev: CloseEvent) => {
            if (wsRef.current !== ws) return; // stale-socket guard (PL-03)
            wsRef.current = null;
            clearStall();
            const clean = intentionalRef.current || ev.code === 1000;
            intentionalRef.current = false;
            dispatch({ type: 'SOCKET_CLOSED', clean });
            if (!clean) scheduleReconnect();
          };
        })
        .catch(() => {
          if (disposedRef.current) return;
          dispatch({ type: 'SOCKET_CLOSED', clean: false });
          scheduleReconnect();
        });
    }

    connectRef.current = connect;
    connect();

    return () => {
      disposedRef.current = true;
      intentionalRef.current = true;
      clearStall();
      clearReconnect();
      if (wsRef.current) {
        try {
          wsRef.current.close(1000);
        } catch {
          /* noop */
        }
        wsRef.current = null;
      }
    };
  }, [enabled, session, url]);

  const reclaim = useCallback(() => {
    attemptsRef.current = 0;
    recreatedRef.current = false;
    dispatch({ type: 'RECLAIM' });
    connectRef.current();
  }, []);

  const detach = useCallback(() => {
    intentionalRef.current = true;
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.send(JSON.stringify({ t: 'detach' }));
        ws.close(1000);
      } catch {
        /* noop */
      }
    }
    dispatch({ type: 'DETACH' });
  }, []);

  const returnToPicker = useCallback(() => dispatch({ type: 'RETURN_TO_PICKER' }), []);

  return { state, reclaim, detach, returnToPicker };
}
