/**
 * Plan 053: GlobalStateSystem — App-Side Barrel Exports
 *
 * Public API surface for apps/web consumers.
 * Re-exports hooks, provider, context, and the system class.
 */

// Provider + context
export { GlobalStateProvider, StateContext, useStateSystem } from './state-provider';

// Hooks
export { useGlobalState } from './use-global-state';
export { useGlobalStateList } from './use-global-state-list';

// System class (for direct instantiation if needed)
export { GlobalStateSystem } from './global-state-system';
