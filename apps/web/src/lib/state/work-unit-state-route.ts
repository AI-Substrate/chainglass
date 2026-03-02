/**
 * Plan 059 Phase 2: WorkUnit State — Server Event Route Descriptor
 *
 * Maps work-unit-state SSE events to GlobalStateSystem state paths.
 * Per ServerEventRouteDescriptor pattern (Subtask 001).
 *
 * SSE events arrive as:
 *   { type: 'registered', id: 'agent-abc', name: '...', status: '...', creatorType: '...', creatorLabel: '...' }
 *   { type: 'status-changed', id: 'agent-abc', status: '...', intent: '...', name: '...' }
 *   { type: 'removed', id: 'agent-abc' }
 *
 * Mapped to state paths:
 *   work-unit-state:agent-abc:status → 'working'
 *   work-unit-state:agent-abc:intent → 'Building'
 *   work-unit-state:agent-abc:name → 'Code Review Agent'
 */

import type { ServerEvent, ServerEventRouteDescriptor, StateUpdate } from './server-event-router';

export const workUnitStateRoute: ServerEventRouteDescriptor = {
  channel: 'work-unit-state',
  stateDomain: 'work-unit-state',
  multiInstance: true,
  properties: [
    { key: 'status', description: 'Work unit status', typeHint: 'WorkUnitStatus' },
    { key: 'intent', description: 'Current activity description', typeHint: 'string | undefined' },
    { key: 'name', description: 'Work unit display name', typeHint: 'string' },
  ],
  mapEvent(event: ServerEvent): StateUpdate[] | null {
    const type = event.type as string;
    const id = event.id as string | undefined;
    if (!id) return null;

    switch (type) {
      case 'registered':
        return [
          { instanceId: id, property: 'status', value: event.status },
          { instanceId: id, property: 'name', value: event.name },
          { instanceId: id, property: 'intent', value: event.intent ?? null },
        ];

      case 'status-changed':
        return [
          { instanceId: id, property: 'status', value: event.status },
          { instanceId: id, property: 'name', value: event.name },
          { instanceId: id, property: 'intent', value: event.intent ?? null },
        ];

      case 'removed':
        return [{ instanceId: id, property: 'status', value: null, remove: true }];

      default:
        return null;
    }
  },
};
