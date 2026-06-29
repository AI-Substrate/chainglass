// @vitest-environment node
/**
 * Plan 088 Phase 5 — T007: GlobalState publishing for remote-view.
 *
 * Three units under test, all CLIENT-side — GlobalState is a client runtime store
 * (`new GlobalStateSystem()` lives only in state-provider.tsx; the server adapter
 * reaches it via SSE → ServerEventRoute, never directly, so T007 publishes on the
 * client, NOT "in the real adapter" as the build sheet's wording implied):
 *   1. registerRemoteViewState(state)  — domain registration (multiInstance; status/latency-ms/fps).
 *   2. createRemoteViewStatsPublisher  — 5s-throttled per-path publisher for the quality plane.
 *   3. remoteViewStateRoute            — SSE 'remote-view' → GlobalState `:status` bridge descriptor.
 */
import { registerRemoteViewState } from '@/features/088-remote-view/state/register';
import { remoteViewStateRoute } from '@/features/088-remote-view/state/remote-view-state-route';
import { createRemoteViewStatsPublisher } from '@/features/088-remote-view/state/remote-view-stats-publisher';
import { GlobalStateSystem } from '@/lib/state/global-state-system';
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';
import { describe, expect, it } from 'vitest';

describe('remote-view GlobalState — domain registration (T007)', () => {
  it('registers a multiInstance domain with status/latency-ms/fps', () => {
    /*
    Test Doc:
    - Why: agents read live session quality via GlobalState (Workshop 003 Q2); the domain must exist before any publish (publish throws on an unregistered domain).
    - Contract: registerRemoteViewState(state) → domain 'remote-view', multiInstance, properties status/latency-ms/fps.
    - Usage Notes: mirrors 041-file-browser/state/register.ts; multiInstance keyed by sessionId.
    - Quality Contribution: pins the registration shape the publisher + route depend on.
    - Worked Example: register → listDomains() has remote-view with the 3 property keys.
    */
    const state = new GlobalStateSystem();
    registerRemoteViewState(state);
    const d = state.listDomains().find((x) => x.domain === 'remote-view');
    expect(d).toBeDefined();
    expect(d?.multiInstance).toBe(true);
    expect(d?.properties.map((p) => p.key).sort()).toEqual(['fps', 'latency-ms', 'status']);
  });

  it('is idempotent (Strict Mode / HMR re-run safe)', () => {
    /*
    Test Doc:
    - Why: React Strict Mode + HMR re-run initializers; a second registerDomain throws "already registered".
    - Contract: registerRemoteViewState called twice → no throw, single domain entry.
    - Usage Notes: guard via listDomains().some (the file-browser idiom).
    - Quality Contribution: prevents a fail-fast crash on re-mount.
    - Worked Example: register; register → still exactly one 'remote-view' domain.
    */
    const state = new GlobalStateSystem();
    registerRemoteViewState(state);
    expect(() => registerRemoteViewState(state)).not.toThrow();
    expect(state.listDomains().filter((x) => x.domain === 'remote-view')).toHaveLength(1);
  });
});

describe('remote-view GlobalState — stats publisher 5s throttle (T007)', () => {
  function harness() {
    let clock = 0;
    const state = new GlobalStateSystem();
    registerRemoteViewState(state);
    const pub = createRemoteViewStatsPublisher(state, { now: () => clock, throttleMs: 5000 });
    return {
      state,
      pub,
      at: (ms: number) => {
        clock = ms;
      },
    };
  }

  it('publishes latency-ms + fps under remote-view:<ses>:* and enumerates them', () => {
    /*
    Test Doc:
    - Why: agents enumerate live quality via service.list('remote-view:<ses>:*') (Done-When: "enumerates live entries").
    - Contract: publishFps/publishLatencyMs → state.get('remote-view:<ses>:fps'|':latency-ms'); list enumerates.
    - Usage Notes: key format domain:instance:property (sessionId is the instance).
    - Quality Contribution: pins the path format + enumeration.
    - Worked Example: publish fps 60 + latency 12 for ses1 → both readable; list('remote-view:ses1:*') has ≥2.
    */
    const { state, pub } = harness();
    pub.publishFps('ses1', 60);
    pub.publishLatencyMs('ses1', 12);
    expect(state.get('remote-view:ses1:fps')).toBe(60);
    expect(state.get('remote-view:ses1:latency-ms')).toBe(12);
    expect(state.list('remote-view:ses1:*').length).toBeGreaterThanOrEqual(2);
  });

  it('drops a second publish on the same path within 5s, allows it after', () => {
    /*
    Test Doc:
    - Why: stats arrive ~1Hz from the WS HUD plane; agents only want a 5s-throttled copy (Workshop 003 Q2) — no GlobalState spam.
    - Contract: publishFps at t=0 stores; within 5s drops; at/after 5s stores again.
    - Usage Notes: leading-edge per-path throttle; deterministic via injected clock (no timers).
    - Quality Contribution: THE throttle the Done-When requires "verified by test".
    - Worked Example: t=0 fps 60 (stored); t=2000 fps 30 (dropped → still 60); t=6000 fps 24 (stored).
    */
    const { state, pub, at } = harness();
    at(0);
    pub.publishFps('ses1', 60);
    expect(state.get('remote-view:ses1:fps')).toBe(60);
    at(2000);
    pub.publishFps('ses1', 30);
    expect(state.get('remote-view:ses1:fps')).toBe(60); // throttled — unchanged
    at(6000);
    pub.publishFps('ses1', 24);
    expect(state.get('remote-view:ses1:fps')).toBe(24);
  });

  it('throttles each path independently (fps gate does not block latency-ms)', () => {
    /*
    Test Doc:
    - Why: latency (onPong) and fps (onStats) arrive on different beats; one must not starve the other.
    - Contract: a fps publish at t=0 does not block a latency-ms publish at t=100.
    - Usage Notes: throttle keyed by the full path remote-view:<ses>:<prop>.
    - Quality Contribution: prevents the quality plane from coupling two independent metrics' cadence.
    - Worked Example: t=0 fps 60; t=100 latency 9 → both present.
    */
    const { state, pub, at } = harness();
    at(0);
    pub.publishFps('ses1', 60);
    at(100);
    pub.publishLatencyMs('ses1', 9);
    expect(state.get('remote-view:ses1:fps')).toBe(60);
    expect(state.get('remote-view:ses1:latency-ms')).toBe(9);
  });
});

describe('remote-view GlobalState — SSE status route (T007)', () => {
  it('subscribes to the remote-view channel (domain name = channel id)', () => {
    expect(remoteViewStateRoute.channel).toBe(WorkspaceDomain.RemoteView);
    expect(remoteViewStateRoute.stateDomain).toBe('remote-view');
    expect(remoteViewStateRoute.multiInstance).toBe(true);
  });

  it('maps attached → status, detached → status:closed, daemon-state → ignored', () => {
    /*
    Test Doc:
    - Why: the SSE 'remote-view' lifecycle (T006) must surface as remote-view:<ses>:status for agents.
    - Contract: mapEvent(attached{sessionId,state}) → [{instanceId,property:'status',value:state}]; detached → 'closed'; daemon-state (no session) → null.
    - Usage Notes: daemon-state is daemon-wide (no sessionId) → ignored; unknown types → null (forward-compatible).
    - Quality Contribution: pins the SSE→state status bridge.
    - Worked Example: attached ses_a streaming → status streaming; detached ses_a → status closed; daemon-state ready → null.
    */
    expect(
      remoteViewStateRoute.mapEvent({ type: 'attached', sessionId: 'ses_a', state: 'streaming' })
    ).toEqual([{ instanceId: 'ses_a', property: 'status', value: 'streaming' }]);
    expect(remoteViewStateRoute.mapEvent({ type: 'detached', sessionId: 'ses_a' })).toEqual([
      { instanceId: 'ses_a', property: 'status', value: 'closed' },
    ]);
    expect(remoteViewStateRoute.mapEvent({ type: 'daemon-state', state: 'ready' })).toBeNull();
  });
});
