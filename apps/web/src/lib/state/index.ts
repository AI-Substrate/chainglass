/**
 * Plan 053: GlobalStateSystem — App-Side Barrel Exports
 *
 * Public API surface for apps/web consumers.
 * Re-exports hooks, provider, context, and the system class.
 */

// Provider + context
export {
  GlobalStateProvider,
  StateChangeLogContext,
  StateContext,
  useStateSystem,
} from './state-provider';

// Hooks
export { useGlobalState } from './use-global-state';
export { useGlobalStateList } from './use-global-state-list';

// Connectors
export { GlobalStateConnector } from './state-connector';

// Server Event Router (Plan 059 Subtask 001)
export { ServerEventRoute } from './server-event-route';
export type {
  ServerEvent,
  ServerEventRouteDescriptor,
  StateUpdate,
} from './server-event-router';

// State change log
export { StateChangeLog } from './state-change-log';

// System class (for direct instantiation if needed)
export { GlobalStateSystem } from './global-state-system';
