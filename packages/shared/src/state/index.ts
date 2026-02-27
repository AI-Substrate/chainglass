/**
 * Plan 053: GlobalStateSystem — Barrel Exports
 *
 * Public API surface for @chainglass/shared/state.
 */

// Types
export type {
  ParsedPath,
  StateChange,
  StateChangeCallback,
  StateDomainDescriptor,
  StateEntry,
  StateMatcher,
  StatePropertyDescriptor,
} from './types.js';

// Interface
export type { IStateService } from '../interfaces/state.interface.js';

// Pure functions
export { parsePath } from './path-parser.js';
export { createStateMatcher } from './path-matcher.js';

// DI tokens
export { STATE_DI_TOKENS } from './tokens.js';
