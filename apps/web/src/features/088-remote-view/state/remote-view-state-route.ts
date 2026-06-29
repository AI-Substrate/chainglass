import type {
  ServerEvent,
  ServerEventRouteDescriptor,
  StateUpdate,
} from '@/lib/state/server-event-router';
/**
 * Server→state route for remote-view session `status` (Plan 088 Phase 5 — T007).
 *
 * Bridges the `remote-view` SSE channel (emitted by the real adapter in T006) onto
 * GlobalState `remote-view:<sessionId>:status`, so agents/UI see live lifecycle
 * without a REST round-trip. `attached`/`detached` carry a `sessionId`; the
 * `daemon-state` envelope is daemon-wide (no session) and is ignored.
 *
 * Latency/fps are NOT on this channel — they ride the WS HUD plane and are published
 * client-side by `remote-view-stats-publisher.ts`. `domain name = SSE channel id`
 * (Finding 05 / ADR-0007), so `channel` is the `WorkspaceDomain.RemoteView` value.
 *
 * Pattern: `lib/state/workflow-execution-route.ts`.
 */
import { WorkspaceDomain } from '@chainglass/shared/features/027-central-notify-events/workspace-domain';

export const remoteViewStateRoute: ServerEventRouteDescriptor = {
  channel: WorkspaceDomain.RemoteView,
  stateDomain: 'remote-view',
  multiInstance: true,
  properties: [
    {
      key: 'status',
      description: 'Session lifecycle status (streaming/idle/unwatched/closed)',
      typeHint: 'string',
    },
    {
      key: 'latency-ms',
      description: 'Ping/pong round-trip latency in ms (5s-throttled quality copy)',
      typeHint: 'number',
    },
    {
      key: 'fps',
      description: 'Rendered frames per second (5s-throttled quality copy)',
      typeHint: 'number',
    },
  ],
  mapEvent(event: ServerEvent): StateUpdate[] | null {
    switch (event.type) {
      case 'attached': {
        const sessionId = event.sessionId as string | undefined;
        if (!sessionId) return [];
        return [
          {
            instanceId: sessionId,
            property: 'status',
            value: (event.state as string) ?? 'streaming',
          },
        ];
      }
      case 'detached': {
        const sessionId = event.sessionId as string | undefined;
        if (!sessionId) return [];
        return [{ instanceId: sessionId, property: 'status', value: 'closed' }];
      }
      default:
        // daemon-state (daemon-wide, no session) + unknown types → ignore (forward-compatible).
        return null;
    }
  },
};
