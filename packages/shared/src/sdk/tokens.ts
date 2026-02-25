/**
 * SDK DI tokens for container registration.
 */
export const SDK_DI_TOKENS = {
  /** IUSDK — top-level SDK facade */
  SDK: 'IUSDK',
  /** ICommandRegistry — command registration and execution */
  COMMAND_REGISTRY: 'ICommandRegistry',
  /** ISDKSettings — settings contribution and access */
  SETTINGS_STORE: 'ISDKSettings',
  /** IContextKeyService — context key evaluation */
  CONTEXT_KEY_SERVICE: 'IContextKeyService',
} as const;
