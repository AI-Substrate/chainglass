/**
 * GlobalState domain registration for remote-view (Plan 088 Phase 5 — T007).
 *
 * `remote-view` is a multi-instance state domain keyed by `sessionId`; values are
 * published under `remote-view:<sessionId>:<property>`:
 *   - `status`     — session lifecycle (streaming/idle/unwatched/closed), bridged
 *                    from the SSE channel by `remote-view-state-route.ts`.
 *   - `latency-ms` — ping/pong RTT, a 5s-throttled copy of the HUD plane (Workshop 003 Q2).
 *   - `fps`        — rendered frames/sec, same throttled quality copy.
 *
 * GlobalState is a CLIENT runtime store (`new GlobalStateSystem()` lives only in
 * `state-provider.tsx`), so this registers on the client at connector mount — the
 * server adapter never touches GlobalState directly (it emits over SSE, T006).
 *
 * Idempotent: React Strict Mode / HMR re-run initializers, and `registerDomain`
 * is fail-fast on a duplicate. Pattern: `041-file-browser/state/register.ts`.
 */
import type { IStateService } from '@chainglass/shared/state';

export function registerRemoteViewState(state: IStateService): void {
  if (state.listDomains().some((d) => d.domain === 'remote-view')) return;

  state.registerDomain({
    domain: 'remote-view',
    description:
      'Remote-view session runtime state — lifecycle status + quality telemetry per session',
    multiInstance: true,
    properties: [
      {
        key: 'status',
        description: 'Session lifecycle status (streaming/idle/unwatched/closed)',
        typeHint: 'string',
      },
      {
        key: 'latency-ms',
        description: 'Ping/pong round-trip latency in ms (5s-throttled copy of the HUD plane)',
        typeHint: 'number',
      },
      {
        key: 'fps',
        description: 'Rendered frames per second (5s-throttled copy of the HUD plane)',
        typeHint: 'number',
      },
    ],
  });
}
