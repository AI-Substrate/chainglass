/**
 * Throttled GlobalState publisher for the remote-view quality plane (Plan 088 Phase 5 — T007).
 *
 * The WS HUD plane (Phase 3) delivers `stats`/pong at ~1Hz to drive the on-screen
 * HUD via callbacks. Agents reading GlobalState only want a low-rate copy, so this
 * publishes `remote-view:<sessionId>:latency-ms` and `:fps` at most once per
 * `throttleMs` window **per path** (Workshop 003 Q2: "GlobalState gets a 5s-throttled
 * copy for agents … one source"). The HUD itself is untouched — the viewport's
 * existing sampler simply calls this in addition to `setHud`.
 *
 * Leading-edge, per-path throttle backed by an injectable clock — deterministic and
 * timer-free, so the 5s gate is unit-verifiable. latency-ms and fps throttle
 * independently (they arrive on different beats: onPong vs onStats).
 */
import type { IStateService } from '@chainglass/shared/state';

const DEFAULT_THROTTLE_MS = 5000;

export interface RemoteViewStatsPublisher {
  /** Publish ping/pong RTT for a session (≤ once per throttle window). */
  publishLatencyMs: (sessionId: string, latencyMs: number) => void;
  /** Publish rendered fps for a session (≤ once per throttle window). */
  publishFps: (sessionId: string, fps: number) => void;
}

export function createRemoteViewStatsPublisher(
  state: IStateService,
  opts: { now?: () => number; throttleMs?: number } = {}
): RemoteViewStatsPublisher {
  const now = opts.now ?? Date.now;
  const throttleMs = opts.throttleMs ?? DEFAULT_THROTTLE_MS;
  const lastByPath = new Map<string, number>();

  function publish(sessionId: string, property: 'latency-ms' | 'fps', value: number): void {
    const path = `remote-view:${sessionId}:${property}`;
    const t = now();
    const last = lastByPath.get(path);
    if (last !== undefined && t - last < throttleMs) return; // within the window → drop
    lastByPath.set(path, t);
    state.publish(path, value);
  }

  return {
    publishLatencyMs: (sessionId, latencyMs) => publish(sessionId, 'latency-ms', latencyMs),
    publishFps: (sessionId, fps) => publish(sessionId, 'fps', fps),
  };
}
