/**
 * Plan 053: GlobalStateSystem — DI Tokens
 *
 * Token constants for dependency injection container registration.
 * Follows SDK_DI_TOKENS pattern from packages/shared/src/sdk/tokens.ts.
 */
export const STATE_DI_TOKENS = {
  /** IStateService — centralized runtime state facade */
  STATE_SERVICE: 'IStateService',
} as const;
