/**
 * Remote-view client-side viewport state machine — pure transitions (Workshop 002).
 *
 * Ten viewport states (the UI states the spec's ACs imply) and the deterministic
 * race rules R1–R9, encoded as a pure reducer `transition(state, event)` with NO
 * I/O. The reconnect hook (`use-remote-view-session.ts`, T007) drives it against a
 * real socket; the daemon-side session machine is authoritative in-memory (Phase 4/5).
 *
 * Key invariants this file guarantees by construction:
 *  - R3: `displaced` NEVER auto-reconnects — only an explicit RECLAIM / PICK_WINDOW /
 *    DETACH moves it; socket/timer events leave it unchanged (grep-checkable).
 *  - R7: attach-while-attaching = last-click-wins (PICK_WINDOW from any state → attaching).
 *  - R9: a CLEAN socket close (switch-away/detach) does NOT enter `reconnecting`;
 *    only an UNEXPECTED close does. Explicit DETACH → picker.
 *  - reconnecting fork: attempts exhausted → `sessionLost` if the daemon is healthy,
 *    else `daemonDown`.
 *  - error-code → landing-state mapping (Workshop 003 table → Workshop 002 states).
 *
 * Plan 088 Phase 2 — T006.
 */
import type { ErrorCode } from '../protocol/messages';

export type ViewportStateName =
  | 'picker'
  | 'attaching'
  | 'live'
  | 'degraded'
  | 'reconnecting'
  | 'displaced'
  | 'windowGone'
  | 'sessionLost'
  | 'daemonDown'
  | 'error';

export interface ViewportState {
  name: ViewportStateName;
  /** Target window id (survives reconnect; needed for R6 auto-recreate). */
  windowId: number | null;
  /** Active session id (from rv param / hello-ok). */
  sessionId: string | null;
  /** Reconnect attempts used so far (0–MAX). */
  reconnectAttempts: number;
  /** Set only when `name === 'error'`. */
  errorCode: ErrorCode | null;
}

/** Max reconnect attempts before the reconnecting-fork (Workshop 002 R6). */
export const MAX_RECONNECT_ATTEMPTS = 3;
/** Reconnect backoff schedule in ms (terminal's shape, PL-03). */
export const RECONNECT_BACKOFF_MS = [250, 1000, 3000] as const;

export type ViewportEvent =
  | { type: 'PICK_WINDOW'; windowId: number }
  | { type: 'RV_PRESENT'; sessionId: string; windowId?: number }
  | { type: 'HELLO_OK'; sessionId: string; windowId: number }
  | { type: 'FRAME'; keyframe: boolean }
  | { type: 'STALL' } // no frame for 2s, socket open
  | { type: 'SOCKET_CLOSED'; clean: boolean }
  | { type: 'RECONNECT_ATTEMPT' }
  | { type: 'RECONNECT_EXHAUSTED'; daemonHealthy: boolean }
  | { type: 'DISPLACED' }
  | { type: 'RECLAIM' }
  | { type: 'WINDOW_GONE' }
  | { type: 'ERROR'; code: ErrorCode }
  | { type: 'SESSION_RECREATE_OK'; sessionId: string }
  | { type: 'SESSION_RECREATE_FAIL' }
  | { type: 'ACK_ERROR' }
  | { type: 'RETURN_TO_PICKER' }
  | { type: 'DETACH' };

/** Map a protocol error code to its viewport landing state (Workshop 003 → 002). */
export function errorCodeToState(code: ErrorCode): ViewportStateName {
  switch (code) {
    case 'E_SESSION_UNKNOWN':
      return 'sessionLost';
    case 'E_WINDOW_GONE':
      return 'windowGone';
    default:
      // E_AUTH, E_ORIGIN, E_VERSION, E_PERMISSION, E_INTERNAL
      return 'error';
  }
}

/** Build the initial viewport state: `attaching` if an rv session is present, else `picker`. */
export function initialState(rv?: { sessionId: string; windowId?: number } | null): ViewportState {
  if (rv) {
    return {
      name: 'attaching',
      windowId: rv.windowId ?? null,
      sessionId: rv.sessionId,
      reconnectAttempts: 0,
      errorCode: null,
    };
  }
  return { name: 'picker', windowId: null, sessionId: null, reconnectAttempts: 0, errorCode: null };
}

function picker(): ViewportState {
  return { name: 'picker', windowId: null, sessionId: null, reconnectAttempts: 0, errorCode: null };
}

/**
 * Pure transition. Unhandled (state, event) pairs return the state unchanged —
 * this is load-bearing for R3 (`displaced` ignores socket/timer events).
 */
export function transition(state: ViewportState, event: ViewportEvent): ViewportState {
  switch (event.type) {
    // ── explicit user actions — allowed from any state ──
    case 'PICK_WINDOW': // R7: last-click-wins (also the picker → attaching entry)
      return {
        name: 'attaching',
        windowId: event.windowId,
        sessionId: null,
        reconnectAttempts: 0,
        errorCode: null,
      };
    case 'DETACH': // R9: explicit detach → picker (daemon closes the session)
      return picker();

    // ── displaced is a special trap: R3, no auto-reconnect ──
    // Handled by falling through — only RECLAIM (below) and the two explicit
    // actions above move it; every other event returns state unchanged.
    case 'RECLAIM':
      return state.name === 'displaced'
        ? { ...state, name: 'attaching', reconnectAttempts: 0, errorCode: null }
        : state;

    case 'RV_PRESENT':
      return {
        name: 'attaching',
        windowId: event.windowId ?? state.windowId,
        sessionId: event.sessionId,
        reconnectAttempts: 0,
        errorCode: null,
      };

    case 'HELLO_OK':
      // Acknowledged but not live until the first keyframe.
      return state.name === 'attaching'
        ? { ...state, sessionId: event.sessionId, windowId: event.windowId }
        : state;

    case 'FRAME':
      if (state.name === 'attaching') {
        // Must decode from a keyframe cold — a delta keeps us waiting.
        return event.keyframe ? { ...state, name: 'live', reconnectAttempts: 0 } : state;
      }
      if (state.name === 'degraded' || state.name === 'live') {
        return { ...state, name: 'live' };
      }
      return state;

    case 'STALL':
      return state.name === 'live' ? { ...state, name: 'degraded' } : state;

    case 'SOCKET_CLOSED':
      if (event.clean) {
        // R9: intentional close (switch-away/detach) never auto-reconnects.
        return state;
      }
      // Unexpected drop → reconnecting (preserve attempts; displaced is immune, R3).
      if (state.name === 'live' || state.name === 'degraded' || state.name === 'attaching') {
        return { ...state, name: 'reconnecting' };
      }
      return state;

    case 'RECONNECT_ATTEMPT':
      if (state.name !== 'reconnecting') return state;
      return state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        ? { ...state, name: 'attaching', reconnectAttempts: state.reconnectAttempts + 1 }
        : state; // exhausted — caller dispatches RECONNECT_EXHAUSTED

    case 'RECONNECT_EXHAUSTED':
      if (state.name !== 'reconnecting') return state;
      return { ...state, name: event.daemonHealthy ? 'sessionLost' : 'daemonDown' };

    case 'DISPLACED':
      return state.name === 'live' || state.name === 'degraded'
        ? { ...state, name: 'displaced' }
        : state;

    case 'WINDOW_GONE':
      return state.name === 'live' || state.name === 'degraded' || state.name === 'attaching'
        ? { ...state, name: 'windowGone' }
        : state;

    case 'ERROR': {
      const name = errorCodeToState(event.code);
      return { ...state, name, errorCode: name === 'error' ? event.code : null };
    }

    case 'SESSION_RECREATE_OK':
      return state.name === 'sessionLost'
        ? { name: 'attaching', windowId: state.windowId, sessionId: event.sessionId, reconnectAttempts: 0, errorCode: null }
        : state;

    case 'SESSION_RECREATE_FAIL':
      return state.name === 'sessionLost' ? picker() : state;

    case 'ACK_ERROR':
      return state.name === 'error' ? picker() : state;

    case 'RETURN_TO_PICKER':
      return state.name === 'windowGone' ||
        state.name === 'daemonDown' ||
        state.name === 'sessionLost' ||
        state.name === 'error'
        ? picker()
        : state;

    default:
      return state;
  }
}
