// @vitest-environment node
/**
 * Plan 088 Phase 2 — T006: client-side viewport state machine (Workshop 002).
 *
 * Pure-transition tests for all ten viewport states and the deterministic race
 * rules (R3/R7/R9, reconnecting-fork, error-code mapping). No fake needed — this
 * is the I/O-free half of plan task 2.5; the socket-dependent races are T007.
 */
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_BACKOFF_MS,
  type ViewportEvent,
  type ViewportState,
  type ViewportStateName,
  errorCodeToState,
  initialState,
  transition,
} from '@/features/088-remote-view/server/session-machine';
import { describe, expect, it } from 'vitest';

const live: ViewportState = {
  name: 'live',
  windowId: 34202,
  sessionId: 'ses_abc',
  reconnectAttempts: 0,
  errorCode: null,
};
const displaced: ViewportState = { ...live, name: 'displaced' };

function drive(start: ViewportState, events: ViewportEvent[]): ViewportState {
  return events.reduce(transition, start);
}

describe('remote-view viewport state machine', () => {
  it('starts at picker, or attaching when an rv session is present', () => {
    /*
    Test Doc:
    - Why: the viewport is rebuilt from the rv URL param on every load (Workshop 002 ownership model).
    - Contract: initialState(null) → picker; initialState({sessionId}) → attaching carrying the session.
    - Usage Notes: rv windowId is optional (a deep-link may know only the session).
    - Quality Contribution: pins the entry transitions the hook relies on for R1 reattach.
    - Worked Example: load with rv=ses_abc → attaching, sessionId=ses_abc.
    */
    expect(initialState(null).name).toBe('picker');
    const s = initialState({ sessionId: 'ses_abc', windowId: 34202 });
    expect(s.name).toBe('attaching');
    expect(s.sessionId).toBe('ses_abc');
    expect(s.windowId).toBe(34202);
  });

  it('attaching → live only on the first keyframe (a delta keeps waiting)', () => {
    /*
    Test Doc:
    - Why: the client must never decode from a delta cold (Workshop 003 keyframe rule).
    - Contract: attaching + FRAME{keyframe:true} → live; attaching + FRAME{keyframe:false} stays attaching.
    - Usage Notes: hello-ok/video-config are acknowledged but do not promote to live.
    - Quality Contribution: enforces the keyframe-first invariant at the state layer.
    - Worked Example: attaching → (delta) attaching → (keyframe) live.
    */
    const attaching = initialState({ sessionId: 'ses_abc', windowId: 34202 });
    expect(transition(attaching, { type: 'FRAME', keyframe: false }).name).toBe('attaching');
    expect(transition(attaching, { type: 'FRAME', keyframe: true }).name).toBe('live');
  });

  it('live ⇄ degraded on stall / frame', () => {
    /*
    Test Doc:
    - Why: a stalled stream must show a badge, not a frozen frame (AC-10), and recover on the next frame.
    - Contract: live + STALL → degraded; degraded + FRAME → live.
    - Usage Notes: STALL models "no frame for 2s, socket still open".
    - Quality Contribution: covers the live/degraded oscillation the stats HUD reflects.
    - Worked Example: live → (2s no frame) degraded → (frame) live.
    */
    const degraded = transition(live, { type: 'STALL' });
    expect(degraded.name).toBe('degraded');
    expect(transition(degraded, { type: 'FRAME', keyframe: false }).name).toBe('live');
  });

  it('R9: unexpected close → reconnecting, but a CLEAN close does not', () => {
    /*
    Test Doc:
    - Why: switch-away/detach close the socket cleanly (1000) and must resume via reattach, not thrash reconnect (Workshop 002 R9).
    - Contract: live + SOCKET_CLOSED{clean:false} → reconnecting; live + SOCKET_CLOSED{clean:true} → unchanged.
    - Usage Notes: clean closes are intentional teardown; the component unmounts/reattaches separately.
    - Quality Contribution: prevents reconnect storms on every panel switch.
    - Worked Example: user opens a file → clean close → viewport stays live (then unmounts), no reconnecting.
    */
    expect(transition(live, { type: 'SOCKET_CLOSED', clean: false }).name).toBe('reconnecting');
    expect(transition(live, { type: 'SOCKET_CLOSED', clean: true }).name).toBe('live');
  });

  it('reconnecting backoff increments attempts up to MAX, then holds', () => {
    /*
    Test Doc:
    - Why: reconnect must be bounded (max 3) so a dead daemon doesn't loop forever (Workshop 002 R6).
    - Contract: RECONNECT_ATTEMPT in reconnecting → attaching with attempts+1 while < MAX; at MAX it holds in reconnecting.
    - Usage Notes: a failed reconnect (unexpected close in attaching) returns to reconnecting preserving attempts.
    - Quality Contribution: enforces the 3-attempt cap before the fork.
    - Worked Example: live→reconnecting→(×3 attempt/fail)→reconnecting held at attempts=3.
    */
    let s = transition(live, { type: 'SOCKET_CLOSED', clean: false });
    for (let i = 1; i <= MAX_RECONNECT_ATTEMPTS; i++) {
      s = transition(s, { type: 'RECONNECT_ATTEMPT' });
      expect(s.name).toBe('attaching');
      expect(s.reconnectAttempts).toBe(i);
      s = transition(s, { type: 'SOCKET_CLOSED', clean: false }); // reconnect failed
      expect(s.name).toBe('reconnecting');
    }
    // exhausted: another attempt holds in reconnecting (caller forks via EXHAUSTED)
    const held = transition(s, { type: 'RECONNECT_ATTEMPT' });
    expect(held.name).toBe('reconnecting');
    expect(RECONNECT_BACKOFF_MS).toEqual([250, 1000, 3000]);
  });

  it('reconnecting fork: exhausted + healthy → sessionLost; exhausted + unhealthy → daemonDown', () => {
    /*
    Test Doc:
    - Why: distinguishing "daemon alive, session gone" from "daemon dead" drives different recovery (R6) and UX (daemonDown card).
    - Contract: reconnecting + RECONNECT_EXHAUSTED{daemonHealthy:true} → sessionLost; {false} → daemonDown.
    - Usage Notes: the hook runs the /api/remote-view/health check to set daemonHealthy.
    - Quality Contribution: encodes the 10th state (daemonDown) + the health fork the validation flagged.
    - Worked Example: 3 failed reconnects, health 200 → sessionLost (auto-recreate next); health fail → daemonDown.
    */
    const reconnecting: ViewportState = { ...live, name: 'reconnecting', reconnectAttempts: 3 };
    expect(
      transition(reconnecting, { type: 'RECONNECT_EXHAUSTED', daemonHealthy: true }).name
    ).toBe('sessionLost');
    expect(
      transition(reconnecting, { type: 'RECONNECT_EXHAUSTED', daemonHealthy: false }).name
    ).toBe('daemonDown');
  });

  it('R2/R3: live → displaced, and displaced NEVER auto-reconnects (only explicit RECLAIM/PICK/DETACH)', () => {
    /*
    Test Doc:
    - Why: two tabs must not ping-pong automatically — reclaim is a deliberate human click (Workshop 002 R3).
    - Contract: live + DISPLACED → displaced; from displaced, every socket/timer/reconnect event leaves it displaced; only RECLAIM/PICK_WINDOW/DETACH move it.
    - Usage Notes: this is the grep-checkable "no auto-reconnect from displaced" invariant.
    - Quality Contribution: forecloses the R3 ping-pong failure class structurally.
    - Worked Example: displaced + SOCKET_CLOSED/STALL/RECONNECT_ATTEMPT → still displaced; displaced + RECLAIM → attaching.
    */
    expect(transition(live, { type: 'DISPLACED' }).name).toBe('displaced');
    const inertEvents: ViewportEvent[] = [
      { type: 'SOCKET_CLOSED', clean: false },
      { type: 'SOCKET_CLOSED', clean: true },
      { type: 'STALL' },
      { type: 'RECONNECT_ATTEMPT' },
      { type: 'RECONNECT_EXHAUSTED', daemonHealthy: true },
      { type: 'FRAME', keyframe: true },
      { type: 'DISPLACED' },
      // [F004] RV_PRESENT (stale/duplicate rv-param dispatch) and ERROR (a late
      // socket error) are handled generically from any state and would otherwise
      // auto-leave displaced without a reclaim click — the exact R3 trap escape.
      { type: 'RV_PRESENT', sessionId: 'ses_stale', windowId: 7 },
      { type: 'ERROR', code: 'E_INTERNAL' },
      { type: 'ERROR', code: 'E_SESSION_UNKNOWN' },
      { type: 'ERROR', code: 'E_WINDOW_GONE' },
    ];
    for (const ev of inertEvents) {
      expect(transition(displaced, ev).name).toBe('displaced');
    }
    expect(transition(displaced, { type: 'RECLAIM' }).name).toBe('attaching');
    expect(transition(displaced, { type: 'PICK_WINDOW', windowId: 99 }).name).toBe('attaching');
    expect(transition(displaced, { type: 'DETACH' }).name).toBe('picker');
  });

  it('R7: attach-while-attaching is last-click-wins (new windowId, attempts reset)', () => {
    /*
    Test Doc:
    - Why: clicking a second window before the first settles must abort + restart, not deadlock (Workshop 002 R7).
    - Contract: PICK_WINDOW from attaching → attaching with the new windowId and reconnectAttempts 0.
    - Usage Notes: the hook aborts the in-flight socket (code 4001); the reducer just retargets.
    - Quality Contribution: mirrors the wsRef stale-socket guard idiom at the state layer.
    - Worked Example: attaching(win A) + PICK_WINDOW(B) → attaching(win B).
    */
    const attachingA = transition(initialState(null), { type: 'PICK_WINDOW', windowId: 1 });
    const attachingB = transition(attachingA, { type: 'PICK_WINDOW', windowId: 2 });
    expect(attachingB.name).toBe('attaching');
    expect(attachingB.windowId).toBe(2);
    expect(attachingB.reconnectAttempts).toBe(0);
  });

  it('maps every error code to its landing state (Workshop 003 → 002)', () => {
    /*
    Test Doc:
    - Why: each protocol error must land in a defined state — never a silent black frame (AC-10/AC-14).
    - Contract: E_SESSION_UNKNOWN→sessionLost, E_WINDOW_GONE→windowGone, all others→error (carrying the code).
    - Usage Notes: errorCode is set only for the generic `error` landing (drives the AC-14 cause card).
    - Quality Contribution: pins the full error-code→state table.
    - Worked Example: ERROR{E_PERMISSION} → error with errorCode E_PERMISSION.
    */
    expect(errorCodeToState('E_SESSION_UNKNOWN')).toBe('sessionLost');
    expect(errorCodeToState('E_WINDOW_GONE')).toBe('windowGone');
    for (const c of ['E_AUTH', 'E_ORIGIN', 'E_VERSION', 'E_PERMISSION', 'E_INTERNAL'] as const) {
      expect(errorCodeToState(c)).toBe('error');
    }
    const attaching = initialState({ sessionId: 'ses_abc' });
    const err = transition(attaching, { type: 'ERROR', code: 'E_PERMISSION' });
    expect(err.name).toBe('error');
    expect(err.errorCode).toBe('E_PERMISSION');
    expect(transition(attaching, { type: 'ERROR', code: 'E_SESSION_UNKNOWN' }).name).toBe(
      'sessionLost'
    );
  });

  it('recovery paths: sessionLost↦attaching/picker, windowGone↦picker, error↦picker', () => {
    /*
    Test Doc:
    - Why: every terminal-ish state must offer a way back (Workshop 002 chart edges).
    - Contract: sessionLost + RECREATE_OK → attaching; sessionLost + RECREATE_FAIL → picker; windowGone + RETURN_TO_PICKER → picker; error + ACK_ERROR → picker.
    - Usage Notes: RECREATE_OK is the R6 auto-recreate-by-windowId success edge.
    - Quality Contribution: ensures no dead-end states.
    - Worked Example: sessionLost → (recreate ok) attaching with the new session id.
    */
    const sessionLost: ViewportState = { ...live, name: 'sessionLost' };
    const ok = transition(sessionLost, { type: 'SESSION_RECREATE_OK', sessionId: 'ses_new' });
    expect(ok.name).toBe('attaching');
    expect(ok.sessionId).toBe('ses_new');
    expect(transition(sessionLost, { type: 'SESSION_RECREATE_FAIL' }).name).toBe('picker');
    expect(transition({ ...live, name: 'windowGone' }, { type: 'RETURN_TO_PICKER' }).name).toBe(
      'picker'
    );
    expect(transition({ ...live, name: 'error' }, { type: 'ACK_ERROR' }).name).toBe('picker');
  });

  it('all ten viewport states are reachable through transitions', () => {
    /*
    Test Doc:
    - Why: a state no transition reaches is dead code or a missing edge — both are bugs.
    - Contract: driving representative event sequences reaches every ViewportStateName.
    - Usage Notes: collects the set of reached state names and compares to the canonical 10.
    - Quality Contribution: guards the chart's completeness as it evolves.
    - Worked Example: the daemonDown branch is reached via reconnecting + EXHAUSTED{unhealthy}.
    */
    const reached = new Set<ViewportStateName>();
    const record = (s: ViewportState) => {
      reached.add(s.name);
      return s;
    };
    record(initialState(null)); // picker
    const attaching = record(transition(initialState(null), { type: 'PICK_WINDOW', windowId: 1 }));
    const liveS = record(transition(attaching, { type: 'FRAME', keyframe: true }));
    const degraded = record(transition(liveS, { type: 'STALL' }));
    const reconnecting = record(transition(degraded, { type: 'SOCKET_CLOSED', clean: false }));
    record(transition(liveS, { type: 'DISPLACED' })); // displaced
    record(transition(liveS, { type: 'WINDOW_GONE' })); // windowGone
    record(transition(reconnecting, { type: 'RECONNECT_EXHAUSTED', daemonHealthy: true })); // sessionLost
    record(transition(reconnecting, { type: 'RECONNECT_EXHAUSTED', daemonHealthy: false })); // daemonDown
    record(transition(attaching, { type: 'ERROR', code: 'E_AUTH' })); // error

    const ALL: ViewportStateName[] = [
      'picker',
      'attaching',
      'live',
      'degraded',
      'reconnecting',
      'displaced',
      'windowGone',
      'sessionLost',
      'daemonDown',
      'error',
    ];
    expect([...reached].sort()).toEqual([...ALL].sort());
  });
});
