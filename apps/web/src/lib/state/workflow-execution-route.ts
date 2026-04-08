/**
 * Plan 074 Phase 3: Workflow Execution — Server Event Route Descriptor
 *
 * Maps workflow-execution SSE events to GlobalStateSystem state paths.
 * Per ServerEventRouteDescriptor pattern (Plan 059 Subtask 001).
 *
 * SSE events arrive as:
 *   { type: 'execution-update', key: 'wt-path:slug', status: '...', iterations: N, ... }
 *   { type: 'execution-removed', key: 'wt-path:slug' }
 *
 * Mapped to state paths:
 *   workflow-execution:{key}:status → 'running'
 *   workflow-execution:{key}:iterations → 5
 *   workflow-execution:{key}:lastEventType → 'iteration'
 *   workflow-execution:{key}:lastMessage → 'Completed iteration 5'
 */

import type { ServerEvent, ServerEventRouteDescriptor, StateUpdate } from './server-event-router';

export const workflowExecutionRoute: ServerEventRouteDescriptor = {
  channel: 'workflow-execution',
  stateDomain: 'workflow-execution',
  multiInstance: true,
  properties: [
    { key: 'status', description: 'Execution status', typeHint: 'ManagerExecutionStatus' },
    { key: 'iterations', description: 'Drive iterations completed', typeHint: 'number' },
    { key: 'lastEventType', description: 'Last DriveEvent type', typeHint: 'string' },
    { key: 'lastMessage', description: 'Status message', typeHint: 'string' },
  ],
  mapEvent(event: ServerEvent): StateUpdate[] | null {
    const type = event.type as string;
    const key = event.key as string | undefined;
    if (!key) return null;

    switch (type) {
      case 'execution-update':
        return [
          { instanceId: key, property: 'status', value: event.status },
          { instanceId: key, property: 'iterations', value: event.iterations },
          { instanceId: key, property: 'lastEventType', value: event.lastEventType },
          { instanceId: key, property: 'lastMessage', value: event.lastMessage },
        ];

      case 'execution-removed':
        return [{ instanceId: key, property: 'status', value: null, remove: true }];

      default:
        return null;
    }
  },
};
