/**
 * Plan 088 Phase 2 — T007: useRemoteViewSession reconnect hook (Workshop 002 races).
 *
 * Drives the hook against the live T005 fake socket. The hook owns a REAL
 * WebSocket, so we use real timers with INJECTED SHORT durations (stallMs /
 * backoffMs) rather than vi.useFakeTimers() — fake timers + real socket I/O
 * deadlock (faked setTimeout can't co-advance with un-faked network callbacks).
 * The dossier's intent (fast suite, no 30s waits) is preserved via the short
 * injected durations. Deviation logged in execution.log.md.
 *
 * jsdom has no WebSocket, so we polyfill globalThis.WebSocket with the `ws`
 * client for the duration of the suite.
 */
import { useRemoteViewSession } from '@/features/088-remote-view/hooks/use-remote-view-session';
import type { DecodedFrame } from '@/features/088-remote-view/protocol/binary';
import type {
  StatsMessage,
  VideoConfigMessage,
} from '@/features/088-remote-view/protocol/messages';
import {
  type FakeStreamd,
  startFakeStreamd,
} from '@/features/088-remote-view/testing/fake-streamd';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket as NodeWebSocket } from 'ws';

const realWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
beforeAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = NodeWebSocket as unknown;
});
afterAll(() => {
  (globalThis as { WebSocket?: unknown }).WebSocket = realWebSocket;
});

let fake: FakeStreamd;
beforeEach(async () => {
  fake = await startFakeStreamd();
});
afterEach(async () => {
  await fake.close();
});

const tok = async () => 'test-token';

function render(opts: Partial<Parameters<typeof useRemoteViewSession>[0]> = {}) {
  return renderHook(() =>
    useRemoteViewSession({
      url: fake.url,
      session: 'ses_h',
      windowId: 34202,
      getToken: tok,
      stallMs: 5000,
      backoffMs: [20, 40, 80],
      ...opts,
    })
  );
}

describe('useRemoteViewSession', () => {
  it('R1: connects/reattaches and reaches live on the first keyframe', async () => {
    /*
    Test Doc:
    - Why: refresh/deep-link must resume the session and show video fast — live is only reached via a keyframe (AC-6).
    - Contract: with an rv session, the hook handshakes the fake and state → live.
    - Usage Notes: reaching live PROVES first-frame-is-keyframe (the reducer only promotes attaching→live on a keyframe).
    - Quality Contribution: covers R1 client-side end to end against the real fake socket.
    - Worked Example: mount with session ses_h → hello → keyframe → live.
    */
    const { result } = render();
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    expect(result.current.state.sessionId).toBe('ses_h');
  });

  it('degrades after a frame stall and recovers on the next frame', async () => {
    /*
    Test Doc:
    - Why: a stalled stream must surface a badge, not freeze, and recover automatically (AC-10).
    - Contract: live + no frame for stallMs → degraded; a subsequent frame → live.
    - Usage Notes: stallMs injected at 60ms for speed.
    - Quality Contribution: covers the live↔degraded socket-timer path.
    - Worked Example: live → (60ms quiet) degraded → pushFrames(1) → live.
    */
    const { result } = render({ stallMs: 60 });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    await waitFor(() => expect(result.current.state.name).toBe('degraded'));
    act(() => {
      fake.pushFrames(1);
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
  });

  it('R2/R3: a displaced message → displaced; reclaim() re-attaches (no auto-reconnect)', async () => {
    /*
    Test Doc:
    - Why: a second viewer displaces the first; the displaced tab must NOT auto-reconnect (R3) — reclaim is an explicit click.
    - Contract: fake.sendDisplaced → state displaced; the following clean close does not move it; reclaim() → live again.
    - Usage Notes: sendDisplaced both messages `displaced` and closes the socket (4002).
    - Quality Contribution: covers R2 + the R3 no-ping-pong invariant through the real socket.
    - Worked Example: live → displaced → reclaim() → live.
    */
    const { result } = render();
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    act(() => {
      fake.sendDisplaced('ses_h');
    });
    await waitFor(() => expect(result.current.state.name).toBe('displaced'));
    // stays displaced (no auto-reconnect) even after a tick
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.state.name).toBe('displaced');
    act(() => {
      result.current.reclaim();
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
  });

  it('recovers from an unexpected drop via backoff reconnect', async () => {
    /*
    Test Doc:
    - Why: a transient socket drop must auto-recover without user action (Workshop 002 reconnecting path).
    - Contract: an unexpected server-side close → reconnecting → backoff reconnect → live.
    - Usage Notes: fake.dropViewer closes with 1011 (unexpected); backoff injected small.
    - Quality Contribution: covers the live→reconnecting→live happy reconnect.
    - Worked Example: live → drop → (≤20ms) reconnect → live.
    */
    const { result } = render({ backoffMs: [150, 300, 600] });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    act(() => {
      fake.dropViewer('ses_h');
    });
    // observe it actually leave live (reconnecting) before recovering — proves a real reconnect
    await waitFor(() => expect(result.current.state.name).toBe('reconnecting'));
    await waitFor(() => expect(result.current.state.name).toBe('live'), { timeout: 2000 });
  });

  it('R6: exhausted reconnects + healthy daemon → sessionLost → auto-recreate once → live', async () => {
    /*
    Test Doc:
    - Why: a daemon restart invalidates sessions; the client must detect (health ok), then recreate ONE session by windowId (R6).
    - Contract: dropping + failing connections → 3 failed reconnects → health true → sessionLost → createSession(windowId) → live on the new session.
    - Usage Notes: createSession toggles the fake back online and returns ses_new; called exactly once.
    - Quality Contribution: covers the full R6 chain incl. the reconnecting→sessionLost fork + auto-recreate wiring.
    - Worked Example: live → daemon-down 3× → sessionLost → recreate ses_new → live.
    */
    let createCalls = 0;
    const { result } = render({
      backoffMs: [5, 10, 20],
      healthCheck: async () => true,
      createSession: async (windowId) => {
        createCalls += 1;
        expect(windowId).toBe(34202);
        fake.failConnections(false);
        return 'ses_new';
      },
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    act(() => {
      fake.failConnections(true);
      fake.dropViewer('ses_h');
    });
    // wait for BOTH the new session id AND live — guards against matching the
    // stale pre-drop `live` (sessionId would still be ses_h then).
    await waitFor(
      () => {
        expect(result.current.state.name).toBe('live');
        expect(result.current.state.sessionId).toBe('ses_new');
      },
      { timeout: 3000 }
    );
    expect(createCalls).toBe(1);
  });

  it('R6: exhausted reconnects + healthy daemon + createSession fails (null) → picker, not daemonDown [T005]', async () => {
    /*
    Test Doc:
    - Why: T005 wires the real createSession to POST /sessions; a route failure (e.g. 500) returns null. The daemon was just health-checked HEALTHY, so a recreate failure must land in `picker` (re-pick a window) — NOT daemonDown (which means the daemon is dead) — and never as an unhandled rejection. Closes the companion's T005 F001 gap (the healthy-daemon recreate-failure path had no end-to-end hook test).
    - Contract: failing connections → 3 reconnects → health true → sessionLost → createSession→null → SESSION_RECREATE_FAIL → picker.
    - Usage Notes: createSession returns null (the route failed) and is called exactly once; failConnections stays true so no live race masks the picker landing.
    - Quality Contribution: pins the R6 recreate-failure UX so it can never silently regress to daemonDown or throw.
    - Worked Example: live → daemon-down 3× → sessionLost → createSession null → picker.
    */
    let createCalls = 0;
    const { result } = render({
      backoffMs: [5, 10, 20],
      healthCheck: async () => true,
      createSession: async () => {
        createCalls += 1;
        return null; // route failure → null, never throws (matches defaultCreateSession)
      },
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    act(() => {
      fake.failConnections(true);
      fake.dropViewer('ses_h');
    });
    await waitFor(() => expect(result.current.state.name).toBe('picker'), { timeout: 3000 });
    expect(createCalls).toBe(1);
  });

  it('R6 deep-link: windowId learned from hello-ok survives rerender → auto-recreate uses it [F007]', async () => {
    /*
    Test Doc:
    - Why: a deep link may carry only rv/session (windowId optional). The hook learns the target id from hello-ok; if a rerender clobbered it back to the null prop, R6 auto-recreate would fire SESSION_RECREATE_FAIL instead of recreating by the remembered window (companion F007).
    - Contract: with windowId:null, reach live (which dispatches a rerender), then exhaust reconnects with a healthy daemon → createSession is called with the id learned from hello-ok (34202), not null → live on the new session.
    - Usage Notes: windowIdRef is only overwritten from a non-null prop; hello-ok sets it from msg.window.id.
    - Quality Contribution: pins the deep-link R6 path so the learned window id is never lost to a null prop.
    - Worked Example: rv=ses_h (no windowId) → live → daemon-down 3× → createSession(34202) → ses_new → live.
    */
    let recreatedWith: number | null = null;
    const { result } = render({
      windowId: null,
      backoffMs: [5, 10, 20],
      healthCheck: async () => true,
      createSession: async (windowId) => {
        recreatedWith = windowId;
        fake.failConnections(false);
        return 'ses_new';
      },
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    act(() => {
      fake.failConnections(true);
      fake.dropViewer('ses_h');
    });
    await waitFor(
      () => {
        expect(result.current.state.name).toBe('live');
        expect(result.current.state.sessionId).toBe('ses_new');
      },
      { timeout: 3000 }
    );
    expect(recreatedWith).toBe(34202); // learned from hello-ok, not the null prop
  });

  it('two independent drop/recover cycles both reach live — reconnect budget resets after recovery [F008]', async () => {
    /*
    Test Doc:
    - Why: the hook's attemptsRef drives the reconnect budget; if it is never reset after a successful reconnect, a second independent drop starts mid-budget and can exhaust after fewer than 3 tries (companion F008).
    - Contract: live → unexpected drop → reconnecting → live (cycle 1), then a second unexpected drop → reconnecting → live (cycle 2); each recovery lands at reconnectAttempts 0.
    - Usage Notes: hello-ok resets attemptsRef to 0 on every confirmed (re)attach; this test exercises that reset path twice without faulting the daemon.
    - Quality Contribution: regression guard that repeated transient drops keep recovering rather than degrading toward a premature sessionLost/daemonDown.
    - Worked Example: live → drop → live(attempts0) → drop → live(attempts0).
    */
    // Slow-ish backoff (matching the single-drop test) so the transient
    // `reconnecting` window is observable by the poll-based waitFor on BOTH cycles
    // — a fast backoff recovers between polls and the assertion races the already-
    // recovered `live`.
    const { result } = render({ backoffMs: [150, 300, 600] });
    await waitFor(() => expect(result.current.state.name).toBe('live'));

    // cycle 1
    act(() => {
      fake.dropViewer('ses_h');
    });
    await waitFor(() => expect(result.current.state.name).toBe('reconnecting'));
    await waitFor(() => expect(result.current.state.name).toBe('live'), { timeout: 2000 });
    expect(result.current.state.reconnectAttempts).toBe(0);

    // cycle 2 — must get the full budget again and recover
    act(() => {
      fake.dropViewer('ses_h');
    });
    await waitFor(() => expect(result.current.state.name).toBe('reconnecting'));
    await waitFor(() => expect(result.current.state.name).toBe('live'), { timeout: 2000 });
    expect(result.current.state.reconnectAttempts).toBe(0);
  });

  it('R6: exhausted reconnects + unhealthy daemon → daemonDown', async () => {
    /*
    Test Doc:
    - Why: when the daemon is truly down, the client must land in daemonDown (the 10th state, AC-10) not loop forever.
    - Contract: failing connections + health false → after 3 reconnects → daemonDown.
    - Usage Notes: the health fork is the validation-flagged distinction from sessionLost.
    - Quality Contribution: covers the unhealthy branch of the reconnecting fork via the hook.
    - Worked Example: live → daemon-down (health false) → daemonDown.
    */
    const { result } = render({
      backoffMs: [5, 10, 20],
      healthCheck: async () => false,
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));
    act(() => {
      fake.failConnections(true);
      fake.dropViewer('ses_h');
    });
    await waitFor(() => expect(result.current.state.name).toBe('daemonDown'), { timeout: 3000 });
  });

  it('maps server error / window-gone to the right states', async () => {
    /*
    Test Doc:
    - Why: every daemon error must land in a defined state — never a silent black frame (AC-10/AC-14).
    - Contract: window-state gone → windowGone; error E_PERMISSION → error.
    - Usage Notes: sendError carries fatal but does not itself close the socket here.
    - Quality Contribution: covers the hook's error/window-state → state mapping over the real socket.
    - Worked Example: live → window-state gone → windowGone.
    */
    const gone = render();
    await waitFor(() => expect(gone.result.current.state.name).toBe('live'));
    act(() => {
      fake.sendWindowState('gone');
    });
    await waitFor(() => expect(gone.result.current.state.name).toBe('windowGone'));
    gone.unmount();

    const err = render({ session: 'ses_e' });
    await waitFor(() => expect(err.result.current.state.name).toBe('live'));
    act(() => {
      fake.sendError('E_PERMISSION', 'Screen Recording not granted', false, 'ses_e');
    });
    await waitFor(() => expect(err.result.current.state.name).toBe('error'));
    expect(err.result.current.state.errorCode).toBe('E_PERMISSION');
  });

  it('forwards video-config + frames to the video plane; requestKeyframe asks for an IDR [T004]', async () => {
    /*
    Test Doc:
    - Why: Phase 3's viewport decodes off the hook's video plane — the hook must forward the daemon's `video-config` and each binary frame, and let the decoder request an IDR on drop-recovery (Workshop 003). Untested forwarding = a silent black canvas.
    - Contract: on attach the fake sends video-config (manifest 800×656, avc1.*) then a keyframe → onVideoConfig fires with those dims, onFrame fires with header.keyframe true; requestKeyframe() puts a {t:'request-keyframe'} on the wire (fake.received).
    - Usage Notes: data-driven — decoder dims come from the message, never hardcoded (Phase 4 forward-compat). The viewport component is smoke-tested (no WebCodecs in jsdom); this covers the hook seam it relies on.
    - Quality Contribution: regression guard for the T004 hook extension (onVideoConfig/onFrame/requestKeyframe).
    - Worked Example: attach → onVideoConfig({codec:'avc1.640020', width:800, height:656}); requestKeyframe() → fake.received has t:'request-keyframe'.
    */
    const configs: VideoConfigMessage[] = [];
    const frames: DecodedFrame[] = [];
    const { result } = render({
      onVideoConfig: (c) => configs.push(c),
      onFrame: (f) => frames.push(f),
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));

    expect(configs.length).toBeGreaterThanOrEqual(1);
    expect(configs[0].codec).toMatch(/^avc1\./);
    expect(configs[0].width).toBe(800);
    expect(configs[0].height).toBe(656);
    expect(frames.length).toBeGreaterThanOrEqual(1);
    expect(frames[0].header.keyframe).toBe(true);

    act(() => {
      result.current.requestKeyframe();
    });
    await waitFor(() => {
      expect(fake.received.some((m) => m.t === 'request-keyframe')).toBe(true);
    });
  });

  it('telemetry plane: ping() → onPong RTT; sendStats → onStats [T005]', async () => {
    /*
    Test Doc:
    - Why: the HUD reads latency from ping/pong RTT and (Phase 6) daemon stats; without coverage the telemetry plane added in T005 can regress silently until the browser smoke (companion F008).
    - Contract: ping() puts {t:'ping',sentAt} on the wire and the pong's round-trip is delivered to onPong as a non-negative number; a daemon `stats` frame is delivered verbatim to onStats.
    - Usage Notes: the fake answers ping→pong{sentAt,daemonAt}; sendStats is a fake cue added for this test. The viewport (WebCodecs) stays smoke-only; this covers the non-GPU hook contract.
    - Quality Contribution: regression guard for the T005 hook extension (onPong/onStats/ping).
    - Worked Example: ping() → onPong(rtt≥0); fake.sendStats({bitrateKbps:1234}) → onStats({…bitrateKbps:1234}).
    */
    let rtt: number | null = null;
    const stats: StatsMessage[] = [];
    const { result } = render({
      onPong: (ms) => {
        rtt = ms;
      },
      onStats: (s) => stats.push(s),
    });
    await waitFor(() => expect(result.current.state.name).toBe('live'));

    act(() => {
      result.current.ping();
    });
    await waitFor(() => expect(rtt).not.toBeNull());
    expect(rtt ?? -1).toBeGreaterThanOrEqual(0);

    act(() => {
      fake.sendStats({ bitrateKbps: 1234, droppedFrames: 2 });
    });
    await waitFor(() => expect(stats.length).toBeGreaterThanOrEqual(1));
    expect(stats[0].bitrateKbps).toBe(1234);
    expect(stats[0].droppedFrames).toBe(2);
  });
});
